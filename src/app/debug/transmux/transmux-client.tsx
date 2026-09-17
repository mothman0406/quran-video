"use client";

import { useEffect, useRef, useState } from "react";
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  type InputAudioTrack,
  type InputTrack,
  type InputVideoTrack,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  type StreamTargetChunk,
  type Target,
} from "mediabunny";
import {
  createEphemeralOpfsFile,
  removeEphemeralOpfsFile,
  removeStaleEphemeralOpfsFiles,
  type EphemeralOpfsFile,
} from "@/lib/media/ephemeral-opfs-file";
import { isTransmuxDurationAccepted } from "@/lib/media/transmux-timeline-validation";

type OutputMode = "buffer-fast-start" | "opfs-reserve" | "opfs-moov-end" | "opfs-fragmented";
type JsonRecord = Record<string, unknown>;
type ChromePerformance = Performance & {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
};

const COPY_POLICY = { mode: "forced", shiftTolerance: 0, boundaryPolicy: "expand" } as const;
const OUTPUT_CODEC = 'video/mp4; codecs="avc1.4d0033, mp4a.40.2"';

async function trackSummary(track: InputTrack) {
  const packetStats = await track.computePacketStats();
  const common = {
    type: track.type,
    codec: await track.getCodec(),
    codecParameterString: await track.getCodecParameterString(),
    firstTimestamp: await track.getFirstTimestamp(),
    finalTimestamp: await track.computeDuration(),
    metadataDuration: await track.getDurationFromMetadata(),
    timeResolution: await track.getTimeResolution(),
    packetStats,
  };
  if (track.isVideoTrack()) {
    const video = track as InputVideoTrack;
    return {
      ...common,
      codedWidth: await video.getCodedWidth(),
      codedHeight: await video.getCodedHeight(),
      squarePixelWidth: await video.getSquarePixelWidth(),
      squarePixelHeight: await video.getSquarePixelHeight(),
      rotation: await video.getRotation(),
      flip: await video.getFlip(),
      transformationMatrix: await video.getTransformationMatrix(),
      colorSpace: await video.getColorSpace(),
      frameRate: await video.computeFrameRateMetrics({ targetPacketCount: Infinity }),
    };
  }
  if (!track.isAudioTrack()) throw new Error(`Unsupported track type: ${track.type}`);
  const audio = track as InputAudioTrack;
  return {
    ...common,
    sampleRate: await audio.getSampleRate(),
    numberOfChannels: await audio.getNumberOfChannels(),
  };
}

async function inspectBlob(blob: Blob) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  try {
    const [video, audio] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack()]);
    return {
      size: blob.size,
      type: blob.type,
      format: (await input.getFormat()).name,
      mimeType: await input.getMimeType(),
      duration: await input.computeDuration(),
      video: video ? await trackSummary(video) : null,
      audio: audio ? await trackSummary(audio) : null,
    };
  } finally {
    input.dispose();
  }
}

function heapSnapshot() {
  const memory = (performance as ChromePerformance).memory;
  return memory ? {
    usedJSHeapSize: memory.usedJSHeapSize,
    totalJSHeapSize: memory.totalJSHeapSize,
    jsHeapSizeLimit: memory.jsHeapSizeLimit,
  } : null;
}

async function userAgentMemory() {
  const measure = (performance as ChromePerformance).measureUserAgentSpecificMemory;
  if (!measure) return null;
  try {
    return (await measure.call(performance)).bytes;
  } catch {
    return null;
  }
}

async function ensureOpfsPlaybackController() {
  if (!("serviceWorker" in navigator)) throw new Error("Service workers are unavailable for OPFS playback.");
  const registration = await navigator.serviceWorker.register("/debug-transmux-opfs-sw.js?v=3", {
    scope: "/debug/",
  });
  await registration.update();
  if (navigator.serviceWorker.controller) return;
  registration.active?.postMessage("claim-debug-clients");
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      reject(new Error("Timed out waiting for the OPFS playback service worker."));
    }, 10_000);
    const onControllerChange = () => {
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      resolve();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
  });
}

function waitForMediaEvent(media: HTMLMediaElement, event: string, timeoutMs = 10_000) {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${event}.`));
    }, timeoutMs);
    const onEvent = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(media.error ?? new Error(`Media error before ${event}.`)); };
    const cleanup = () => {
      window.clearTimeout(timeout);
      media.removeEventListener(event, onEvent);
      media.removeEventListener("error", onError);
    };
    media.addEventListener(event, onEvent, { once: true });
    media.addEventListener("error", onError, { once: true });
  });
}

async function seekAndDecode(video: HTMLVideoElement, requestedTime: number) {
  const target = Math.min(requestedTime, Math.max(0, video.duration - 0.05));
  video.pause();
  const before = video.getVideoPlaybackQuality?.();
  const seeked = waitForMediaEvent(video, "seeked");
  video.currentTime = target;
  let frameMediaTime: number | null = null;
  const frame = new Promise<void>((resolve) => {
    video.requestVideoFrameCallback((_now, metadata) => {
      frameMediaTime = metadata.mediaTime;
      resolve();
    });
  });
  await seeked;
  await video.play();
  await frame;
  video.pause();
  const after = video.getVideoPlaybackQuality?.();
  return {
    requestedTime,
    resolvedTime: video.currentTime,
    frameMediaTime,
    readyState: video.readyState,
    networkState: video.networkState,
    decodedFramesBefore: before?.totalVideoFrames ?? null,
    decodedFramesAfter: after?.totalVideoFrames ?? null,
    droppedFrames: after?.droppedVideoFrames ?? null,
  };
}

export default function TransmuxClient() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const objectUrlRef = useRef<string | null>(null);
  const conversionRef = useRef<Conversion | null>(null);
  const inputRef = useRef<Input | null>(null);
  const workingFileRef = useRef<EphemeralOpfsFile | null>(null);
  const jobGenerationRef = useRef(0);
  const [source, setSource] = useState<File | null>(null);
  const [mode, setMode] = useState<OutputMode>("buffer-fast-start");
  const [busy, setBusy] = useState(false);
  const [outputReady, setOutputReady] = useState(false);
  const [status, setStatus] = useState("Choose the audited MOV fixture.");
  const [report, setReport] = useState<JsonRecord>({});
  const [events, setEvents] = useState<Array<{ event: string; currentTime: number; readyState: number }>>([]);

  async function releaseWorkingMedia() {
    const video = videoRef.current;
    if (video) {
      video.pause();
      const emptied = video.networkState !== HTMLMediaElement.NETWORK_EMPTY
        ? waitForMediaEvent(video, "emptied", 5_000).catch(() => {})
        : Promise.resolve();
      video.removeAttribute("src");
      video.load();
      await emptied;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    const workingFile = workingFileRef.current;
    workingFileRef.current = null;
    await removeEphemeralOpfsFile(workingFile);
  }

  async function cancelActiveJob(statusMessage?: string) {
    jobGenerationRef.current += 1;
    const conversion = conversionRef.current;
    conversionRef.current = null;
    if (conversion) await conversion.cancel();
    inputRef.current?.dispose();
    inputRef.current = null;
    await releaseWorkingMedia();
    setOutputReady(false);
    setBusy(false);
    if (statusMessage) setStatus(statusMessage);
  }

  useEffect(() => () => {
    jobGenerationRef.current += 1;
    void conversionRef.current?.cancel();
    inputRef.current?.dispose();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    void removeEphemeralOpfsFile(workingFileRef.current);
  }, []);

  function selectSource(nextSource: File | null) {
    setBusy(true);
    setSource(null);
    void cancelActiveJob(nextSource ? "Source replaced; prior working media removed." : "Source cleared.")
      .finally(() => setSource(nextSource));
  }

  async function generate() {
    if (!source || busy) return;
    const jobGeneration = ++jobGenerationRef.current;
    setBusy(true);
    setOutputReady(false);
    setStatus("Inspecting source and initializing forced packet copy…");
    setEvents([]);
    let workingFile: EphemeralOpfsFile | null = null;
    let input: Input | null = null;
    try {
      await releaseWorkingMedia();
      if (jobGeneration !== jobGenerationRef.current) return;
      const sourceMetadata = await inspectBlob(source);
      const heapBefore = heapSnapshot();
      const measuredMemoryBefore = await userAgentMemory();
      const heapMilestones: Record<string, ReturnType<typeof heapSnapshot>> = {
        afterSourceInspection: heapSnapshot(),
      };
      input = new Input({ formats: ALL_FORMATS, source: new BlobSource(source) });
      inputRef.current = input;
      const fastStart = mode === "buffer-fast-start"
        ? "in-memory"
        : mode === "opfs-fragmented"
          ? "fragmented"
          : mode === "opfs-reserve"
            ? "reserve"
            : false;
      const format = new Mp4OutputFormat({ fastStart });
      let target: Target;
      let bufferTarget: BufferTarget | null = null;
      if (mode === "buffer-fast-start") {
        bufferTarget = new BufferTarget();
        target = bufferTarget;
      } else {
        const root = await navigator.storage.getDirectory();
        await removeStaleEphemeralOpfsFiles(root);
        workingFile = await createEphemeralOpfsFile(root);
        workingFileRef.current = workingFile;
        const writable = await workingFile.handle.createWritable();
        target = new StreamTarget(writable as unknown as WritableStream<StreamTargetChunk>, { chunked: true });
      }
      heapMilestones.afterTargetCreation = heapSnapshot();
      const output = new Output({ format, target });
      const startedAt = performance.now();
      const conversion = await Conversion.init({
        input,
        output,
        tracks: "primary",
        trim: { start: 0 },
        video: { codec: "avc", allowTransformationMetadata: true },
        audio: { codec: "aac" },
        copy: COPY_POLICY,
        showWarnings: false,
      });
      conversionRef.current = conversion;
      if (mode === "opfs-reserve") {
        for (const track of output.tracks) {
          const packetCount = track.isVideoTrack()
            ? sourceMetadata.video?.packetStats.packetCount
            : track.isAudioTrack()
              ? sourceMetadata.audio?.packetStats.packetCount
              : null;
          if (packetCount === null || packetCount === undefined) {
            throw new Error(`Cannot reserve MP4 sample tables for ${track.type}: packet count unavailable.`);
          }
          track.metadata.maximumPacketCount = Math.ceil(packetCount * 4 / 3);
        }
      }
      heapMilestones.afterConversionInit = heapSnapshot();
      const plan = {
        isValid: conversion.isValid,
        utilizedTrackTypes: conversion.utilizedTracks.map((track) => track.type),
        discardedTracks: conversion.discardedTracks.map((item) => ({ type: item.track.type, reason: item.reason })),
      };
      if (!conversion.isValid || conversion.discardedTracks.length > 0 || conversion.utilizedTracks.length !== 2) {
        await conversion.cancel();
        throw new Error(`Forced-copy plan failed: ${JSON.stringify(plan)}`);
      }
      setStatus("Copying encoded AVC and AAC packets…");
      await conversion.execute();
      conversionRef.current = null;
      const wallClockMilliseconds = performance.now() - startedAt;
      heapMilestones.afterConversionExecute = heapSnapshot();
      input.dispose();
      inputRef.current = null;
      input = null;
      if (jobGeneration !== jobGenerationRef.current) return;
      let result: Blob;
      if (bufferTarget) {
        if (!bufferTarget.buffer) throw new Error("Mediabunny did not produce an output buffer.");
        result = new Blob([bufferTarget.buffer], { type: "video/mp4" });
      } else {
        if (!workingFile) throw new Error("OPFS output handle was not created.");
        result = await workingFile.handle.getFile();
      }
      heapMilestones.afterResultReference = heapSnapshot();
      const outputMetadata = await inspectBlob(result);
      heapMilestones.afterOutputInspection = heapSnapshot();
      const heapAfter = heapSnapshot();
      const measuredMemoryAfter = await userAgentMemory();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const video = videoRef.current;
      if (!video) throw new Error("Output video element is unavailable.");
      const playbackLoadStartedAt = performance.now();
      if (workingFile) {
        await ensureOpfsPlaybackController();
        video.src = `/debug/transmux/opfs-media?name=${encodeURIComponent(workingFile.name)}`;
      } else {
        objectUrlRef.current = URL.createObjectURL(result);
        video.src = objectUrlRef.current;
      }
      video.load();
      await waitForMediaEvent(video, "loadedmetadata", 60_000);
      const playbackLoadMilliseconds = performance.now() - playbackLoadStartedAt;
      const chromeDurationDifference = Math.abs(video.duration - outputMetadata.duration);
      const chromeTimelineAccepted = isTransmuxDurationAccepted(video.duration, outputMetadata.duration);
      setOutputReady(true);
      setReport({
        mediabunnyVersion: "1.57.0",
        source: sourceMetadata,
        conversion: {
          wallClockMilliseconds,
          outputMode: mode,
          outputDestination: workingFile ? `opfs:/${workingFile.name}` : "in-memory ArrayBuffer/Blob",
          playbackObject: workingFile ? "same-origin service-worker byte-range URL backed by OPFS" : "in-memory Blob URL",
          fragmented: mode === "opfs-fragmented",
          moovPlacement: mode === "opfs-moov-end" ? "end" : "front",
          copyPolicy: COPY_POLICY,
          ...plan,
          videoStrategy: "copy",
          audioStrategy: "copy",
          decoderOrEncoderUsed: false,
          proof: "Mediabunny forced-copy mode accepted both tracks; a track that needs decoding/encoding is discarded with cannot_copy.",
        },
        output: outputMetadata,
        chrome: {
          userAgent: navigator.userAgent,
          canPlaySource: video.canPlayType(sourceMetadata.mimeType),
          canPlayMp4: video.canPlayType(OUTPUT_CODEC),
          duration: video.duration,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          readyState: video.readyState,
          playbackLoadMilliseconds,
          durationDifference: chromeDurationDifference,
          timelineAccepted: chromeTimelineAccepted,
        },
        memory: {
          heapBefore,
          heapAfter,
          measuredMemoryBefore,
          measuredMemoryAfter,
          heapMilestones,
          architecture: mode === "buffer-fast-start"
            ? "BlobSource reads ranges, but MP4 fastStart=in-memory retains encoded packets and BufferTarget retains both its capacity buffer and finalized output buffer."
            : mode === "opfs-fragmented"
              ? "BlobSource reads ranges and StreamTarget writes fragmented MP4 directly to an ephemeral OPFS file with backpressure."
              : mode === "opfs-reserve"
                ? "A metadata-only packet-count pass sizes a front-of-file moov reservation; BlobSource then reads ranges while StreamTarget writes non-fragmented media directly to ephemeral OPFS and backpatches the reserved region."
                : "BlobSource reads ranges and StreamTarget writes non-fragmented MP4 media directly to an ephemeral OPFS file; moov is appended at finalization.",
        },
      });
      setStatus(chromeTimelineAccepted
        ? "Generated and loaded. Run the Chrome seek/play suite, then inspect sync manually with sound on."
        : `REJECTED: Chrome duration ${video.duration.toFixed(6)} s differs from the packet timeline by ${chromeDurationDifference.toFixed(6)} s.`);
    } catch (error) {
      if (conversionRef.current) {
        await conversionRef.current.cancel().catch(() => {});
        conversionRef.current = null;
      }
      if (workingFile && workingFileRef.current === workingFile) {
        workingFileRef.current = null;
        await removeEphemeralOpfsFile(workingFile).catch(() => {});
      }
      if (jobGeneration === jobGenerationRef.current) {
        setStatus(error instanceof Error ? error.message : String(error));
      }
    } finally {
      input?.dispose();
      if (inputRef.current === input) inputRef.current = null;
      if (jobGeneration === jobGenerationRef.current) setBusy(false);
    }
  }

  async function runChromeSuite() {
    const video = videoRef.current;
    if (!video?.src || busy) return;
    setBusy(true);
    setStatus("Running headed Chrome play and seek checks…");
    try {
      const seeks: Awaited<ReturnType<typeof seekAndDecode>>[] = [];
      for (const time of [1, 10, 20, 30]) seeks.push(await seekAndDecode(video, time));
      const ended = waitForMediaEvent(video, "ended");
      video.currentTime = Math.max(0, video.duration - 0.2);
      video.playbackRate = 1;
      await video.play();
      await ended;
      video.pause();
      const quality = video.getVideoPlaybackQuality?.();
      setReport((current) => ({
        ...current,
        chromeValidation: {
          load: true,
          play: true,
          ended: video.ended,
          finalCurrentTime: video.currentTime,
          seeks,
          decodedFrames: quality?.totalVideoFrames ?? null,
          droppedFrames: quality?.droppedVideoFrames ?? null,
        },
      }));
      setStatus("Chrome load/play/seek/ended checks passed. Perceptual A/V sync still requires listening to the output below.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function logEvent(event: string) {
    const video = videoRef.current;
    if (!video) return;
    setEvents((current) => [...current.slice(-39), { event, currentTime: video.currentTime, readyState: video.readyState }]);
  }

  return (
    <main style={{ maxWidth: 1120, margin: "0 auto", padding: 28, fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ marginBottom: 8 }}>Mediabunny MOV → MP4 packet-copy benchmark</h1>
      <p style={{ color: "#aeb8c5", lineHeight: 1.5 }}>
        Development-only. This never imports FFmpeg and never changes editor routing. Use the exact audited ReplayKit MOV.
      </p>
      <section style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "end", margin: "24px 0" }}>
        <label>Source MOV<br /><input data-testid="transmux-source" type="file" accept=".mov,video/quicktime" onChange={(event) => selectSource(event.target.files?.[0] ?? null)} /></label>
        <label>Output strategy<br />
          <select value={mode} onChange={(event) => setMode(event.target.value as OutputMode)}>
            <option value="buffer-fast-start">Non-fragmented fast-start (RAM)</option>
            <option value="opfs-reserve">Non-fragmented reserved fast-start (OPFS bounded memory)</option>
            <option value="opfs-moov-end">Non-fragmented moov-at-end (OPFS bounded memory)</option>
            <option value="opfs-fragmented">Fragmented fast-start (OPFS diagnostic; rejected on fixture)</option>
          </select>
        </label>
        <button data-testid="generate-transmux" type="button" disabled={!source || busy} onClick={() => void generate()}>Generate MP4</button>
        <button data-testid="cancel-transmux" type="button" disabled={!busy} onClick={() => void cancelActiveJob("Canceled; temporary output removed.")}>Cancel</button>
        <button data-testid="run-chrome-suite" type="button" disabled={!outputReady || busy} onClick={() => void runChromeSuite()}>Run Chrome suite</button>
      </section>
      <p data-testid="transmux-status" style={{ padding: 12, background: "#20262d", borderRadius: 6 }}>{status}</p>
      <video
        ref={videoRef}
        controls
        playsInline
        style={{ width: "100%", maxHeight: 520, background: "#050607", marginTop: 18 }}
        onLoadStart={() => logEvent("loadstart")}
        onLoadedMetadata={() => logEvent("loadedmetadata")}
        onCanPlay={() => logEvent("canplay")}
        onPlay={() => logEvent("play")}
        onPlaying={() => logEvent("playing")}
        onSeeked={() => logEvent("seeked")}
        onEnded={() => logEvent("ended")}
        onError={() => logEvent("error")}
      />
      <p style={{ color: "#d5b783", lineHeight: 1.5 }}>
        Manual sync check: turn sound on, play the output, and seek around the clearest visible tap/click or UI transition. Record what you hear and see; this page does not claim perceptual sync automatically.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 16 }}>
        <section><h2>Structured report</h2><pre data-testid="transmux-report" style={{ overflow: "auto", maxHeight: 720, padding: 14, background: "#0b0e11", fontSize: 11 }}>{JSON.stringify(report, null, 2)}</pre></section>
        <section><h2>HTMLVideoElement events</h2><pre data-testid="transmux-events" style={{ overflow: "auto", maxHeight: 720, padding: 14, background: "#0b0e11", fontSize: 11 }}>{JSON.stringify(events, null, 2)}</pre></section>
      </div>
    </main>
  );
}
