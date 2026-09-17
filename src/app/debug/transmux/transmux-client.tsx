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

type OutputMode = "buffer-fast-start" | "opfs-fragmented";
type JsonRecord = Record<string, unknown>;
type ChromePerformance = Performance & {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
  measureUserAgentSpecificMemory?: () => Promise<{ bytes: number }>;
};

const COPY_POLICY = { mode: "forced", shiftTolerance: 0, boundaryPolicy: "expand" } as const;
const OUTPUT_CODEC = 'video/mp4; codecs="avc1.4d0033, mp4a.40.2"';
const OPFS_FILENAME = "mediabunny-transmux-benchmark.mp4";

async function trackSummary(track: InputTrack) {
  const common = {
    type: track.type,
    codec: await track.getCodec(),
    codecParameterString: await track.getCodecParameterString(),
    firstTimestamp: await track.getFirstTimestamp(),
    finalTimestamp: await track.computeDuration(),
    metadataDuration: await track.getDurationFromMetadata(),
    timeResolution: await track.getTimeResolution(),
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
  const seeked = waitForMediaEvent(video, "seeked");
  video.currentTime = target;
  await seeked;
  const before = video.getVideoPlaybackQuality?.();
  let frameMediaTime: number | null = null;
  const frame = new Promise<void>((resolve) => {
    video.requestVideoFrameCallback((_now, metadata) => {
      frameMediaTime = metadata.mediaTime;
      resolve();
    });
  });
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
  const [source, setSource] = useState<File | null>(null);
  const [mode, setMode] = useState<OutputMode>("buffer-fast-start");
  const [busy, setBusy] = useState(false);
  const [outputReady, setOutputReady] = useState(false);
  const [status, setStatus] = useState("Choose the audited MOV fixture.");
  const [report, setReport] = useState<JsonRecord>({});
  const [events, setEvents] = useState<Array<{ event: string; currentTime: number; readyState: number }>>([]);

  useEffect(() => () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);

  async function generate() {
    if (!source || busy) return;
    setBusy(true);
    setOutputReady(false);
    setStatus("Inspecting source and initializing forced packet copy…");
    setEvents([]);
    try {
      const sourceMetadata = await inspectBlob(source);
      const heapBefore = heapSnapshot();
      const measuredMemoryBefore = await userAgentMemory();
      const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(source) });
      const format = new Mp4OutputFormat({ fastStart: mode === "buffer-fast-start" ? "in-memory" : "fragmented" });
      let target: Target;
      let bufferTarget: BufferTarget | null = null;
      let opfsHandle: FileSystemFileHandle | null = null;
      if (mode === "buffer-fast-start") {
        bufferTarget = new BufferTarget();
        target = bufferTarget;
      } else {
        const root = await navigator.storage.getDirectory();
        opfsHandle = await root.getFileHandle(OPFS_FILENAME, { create: true });
        const writable = await opfsHandle.createWritable();
        target = new StreamTarget(writable as unknown as WritableStream<StreamTargetChunk>, { chunked: true });
      }
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
      const wallClockMilliseconds = performance.now() - startedAt;
      input.dispose();
      let result: Blob;
      if (bufferTarget) {
        if (!bufferTarget.buffer) throw new Error("Mediabunny did not produce an output buffer.");
        result = new Blob([bufferTarget.buffer], { type: "video/mp4" });
      } else {
        if (!opfsHandle) throw new Error("OPFS output handle was not created.");
        result = await opfsHandle.getFile();
      }
      const outputMetadata = await inspectBlob(result);
      const heapAfter = heapSnapshot();
      const measuredMemoryAfter = await userAgentMemory();
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = URL.createObjectURL(result);
      const video = videoRef.current;
      if (!video) throw new Error("Output video element is unavailable.");
      video.src = objectUrlRef.current;
      video.load();
      await waitForMediaEvent(video, "loadedmetadata");
      const chromeDurationDifference = Math.abs(video.duration - outputMetadata.duration);
      const chromeTimelineAccepted = chromeDurationDifference <= 0.05;
      setOutputReady(true);
      setReport({
        mediabunnyVersion: "1.57.0",
        source: sourceMetadata,
        conversion: {
          wallClockMilliseconds,
          outputMode: mode,
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
          durationDifference: chromeDurationDifference,
          timelineAccepted: chromeTimelineAccepted,
        },
        memory: {
          heapBefore,
          heapAfter,
          measuredMemoryBefore,
          measuredMemoryAfter,
          architecture: mode === "buffer-fast-start"
            ? "BlobSource reads ranges, but MP4 fastStart=in-memory and BufferTarget retain a complete output in memory."
            : "BlobSource reads ranges and StreamTarget writes fragmented fast-start MP4 directly to OPFS with backpressure.",
        },
      });
      setStatus(chromeTimelineAccepted
        ? "Generated and loaded. Run the Chrome seek/play suite, then inspect sync manually with sound on."
        : `REJECTED: Chrome duration ${video.duration.toFixed(6)} s differs from the packet timeline by ${chromeDurationDifference.toFixed(6)} s.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
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
        <label>Source MOV<br /><input data-testid="transmux-source" type="file" accept=".mov,video/quicktime" onChange={(event) => setSource(event.target.files?.[0] ?? null)} /></label>
        <label>Output strategy<br />
          <select value={mode} onChange={(event) => setMode(event.target.value as OutputMode)}>
            <option value="buffer-fast-start">Non-fragmented fast-start (RAM)</option>
            <option value="opfs-fragmented">Fragmented fast-start (OPFS diagnostic; rejected on fixture)</option>
          </select>
        </label>
        <button data-testid="generate-transmux" type="button" disabled={!source || busy} onClick={() => void generate()}>Generate MP4</button>
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
