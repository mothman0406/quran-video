import {
  ALL_FORMATS,
  AudioSampleSink,
  AudioSampleSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  Output,
  VideoSampleSink,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from "mediabunny";
import { quranFontDefinitions } from "../quran/content.ts";
import { drawExportCaptions } from "./caption-canvas.ts";
import { audioOutputIsValid, selectOutputProfile } from "./output.ts";
import { durationMatches, frameTimeline, onceCleanup, resolveExportFrameRate } from "./timeline.ts";
import type { LocalExportDiagnostics, LocalExportRequest, LocalExportResult, LocalExportSupport, LocalVideoRenderer } from "./types.ts";

export const DEFAULT_LOCAL_RENDERER_ID = "offline-webcodecs";

function abortError() { return new DOMException("Export cancelled.", "AbortError"); }
function ensureNotAborted(signal?: AbortSignal) { if (signal?.aborted) throw abortError(); }

async function loadArabicFont(request: LocalExportRequest): Promise<string> {
  const font = quranFontDefinitions[request.typography.quranStyle];
  if (font.source.includes("{page}")) throw new Error("The selected Madinah/QCF font is page-specific and cannot be safely rendered in an export. Choose Uthmani, IndoPak, or KFGQPC style.");
  const fontSpec = `${request.typography.arabicFontSize}px "${font.family}"`;
  if (!document.fonts.check(fontSpec)) {
    const face = new FontFace(font.family, `url(${font.source}) format('woff2')`);
    document.fonts.add(await face.load());
  }
  await document.fonts.load(fontSpec, "اَلْحَمْدُ لِلَّهِ");
  if (!document.fonts.check(fontSpec, "اَلْحَمْدُ لِلَّهِ")) throw new Error(`The selected Quran font (${font.family}) did not finish loading. Export was not started to prevent fallback glyphs.`);
  return font.family;
}

async function capabilities(width: number, height: number) {
  const [canEncodeAvc, canEncodeAac, canEncodeVp9, canEncodeOpus] = await Promise.all([
    canEncodeVideo("avc", { width, height, bitrate: 8_000_000 }),
    canEncodeAudio("aac", { numberOfChannels: 2, sampleRate: 48_000, bitrate: 160_000 }),
    canEncodeVideo("vp9", { width, height, bitrate: 8_000_000 }),
    canEncodeAudio("opus", { numberOfChannels: 2, sampleRate: 48_000, bitrate: 160_000 }),
  ]);
  return { canEncodeAvc, canEncodeAac, canEncodeVp9, canEncodeOpus };
}

export function offlineWebCodecsSupport(): LocalExportSupport {
  if (typeof window === "undefined") return { supported: false, path: "Offline WebCodecs", reason: "Local export is available only in a browser." };
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") return { supported: false, path: "Offline WebCodecs", reason: "This browser needs WebCodecs video decoding and encoding for deterministic local export." };
  return { supported: true, path: "Offline WebCodecs", reason: "Frames and source audio are read directly from the local file; export does not play in real time." };
}

async function copyOrEncodeAudio(options: {
  audioTrack: NonNullable<Awaited<ReturnType<Input["getPrimaryAudioTrack"]>>>;
  output: Output;
  outputAudioCodec: "aac" | "opus";
  sourceStart: number;
  sourceDuration: number;
  signal?: AbortSignal;
}): Promise<void> {
  const { audioTrack, output, outputAudioCodec, sourceStart, sourceDuration, signal } = options;
  const inputCodec = await audioTrack.getCodec();
  const canCopy = inputCodec === outputAudioCodec;
  if (canCopy) {
    const source = new EncodedAudioPacketSource(inputCodec);
    output.addAudioTrack(source, { decoderConfig: await audioTrack.getDecoderConfig() ?? undefined });
    await output.start();
    let first = true;
    for await (const packet of new EncodedPacketSink(audioTrack).packets()) {
      ensureNotAborted(signal);
      if (packet.timestamp >= sourceStart + sourceDuration) break;
      await source.add(packet.clone({ timestamp: Math.max(0, packet.timestamp - sourceStart) }), first ? { decoderConfig: await audioTrack.getDecoderConfig() ?? undefined } : undefined);
      first = false;
    }
    return;
  }
  const sampleRate = await audioTrack.getSampleRate();
  const numberOfChannels = await audioTrack.getNumberOfChannels();
  const source = new AudioSampleSource({ codec: outputAudioCodec, bitrate: 160_000 });
  output.addAudioTrack(source, { decoderConfig: { codec: outputAudioCodec === "aac" ? "mp4a.40.2" : "opus", sampleRate, numberOfChannels } });
  await output.start();
  for await (const sample of new AudioSampleSink(audioTrack).samples(sourceStart, sourceStart + sourceDuration)) {
    ensureNotAborted(signal);
    try { sample.setTimestamp(Math.max(0, sample.timestamp - sourceStart)); await source.add(sample); } finally { sample.close(); }
  }
}

export const offlineWebCodecsRenderer: LocalVideoRenderer = {
  id: DEFAULT_LOCAL_RENDERER_ID,
  support: offlineWebCodecsSupport,
  async render(request): Promise<LocalExportResult> {
    const support = offlineWebCodecsSupport();
    if (!support.supported) throw new Error(support.reason);
    ensureNotAborted(request.signal);
    const startedAt = performance.now();
    request.onProgress?.({ phase: "preparing", fraction: 0 });
    const arabicFont = await loadArabicFont(request);
    ensureNotAborted(request.signal);
    const input = new Input({ source: new BlobSource(request.source), formats: ALL_FORMATS });
    let output: Output | null = null;
    const cleanup = onceCleanup(() => { input.dispose(); if (output && output.state !== "finalized" && output.state !== "canceled") void output.cancel(); });
    const abort = () => cleanup();
    request.signal?.addEventListener("abort", abort, { once: true });
    try {
      const [videoTrack, audioTrack, sourceFormat] = await Promise.all([input.getPrimaryVideoTrack(), input.getPrimaryAudioTrack(), input.getFormat()]);
      if (!videoTrack) throw new Error("The selected source does not contain a video track.");
      const sourceHasAudio = Boolean(audioTrack);
      const sourceEnd = await input.computeDuration();
      const sourceStart = await input.getFirstTimestamp(audioTrack ? [videoTrack, audioTrack] : [videoTrack]);
      const [sourceVideoCodec, sourceAudioCodec, frameRateMetrics, outputCapabilities] = await Promise.all([videoTrack.getCodec(), audioTrack?.getCodec() ?? null, videoTrack.computeFrameRateMetrics(), capabilities(request.format.width, request.format.height)]);
      const profile = selectOutputProfile(outputCapabilities, sourceHasAudio);
      if (!profile) throw new Error(sourceHasAudio ? "This browser cannot encode an audio/video combination for a local export. H.264/AAC and VP9/Opus were both unavailable." : "This browser cannot encode H.264 or VP9 for local export.");
      const sourceDuration = sourceEnd - sourceStart;
      const targetFps = resolveExportFrameRate(frameRateMetrics.underlyingFrameRate);
      const timeline = frameTimeline(sourceDuration, targetFps);
      if (!timeline.length) throw new Error("The source duration could not be determined for deterministic export.");
      request.onProgress?.({ phase: "decoding", fraction: 0 });
      const canvas = document.createElement("canvas"); canvas.width = request.format.width; canvas.height = request.format.height;
      const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas 2D compositing is unavailable.");
      const target = new BufferTarget();
      output = new Output({ format: profile.container === "mp4" ? new Mp4OutputFormat() : new WebMOutputFormat(), target });
      const videoSource = new CanvasSource(canvas, { codec: profile.videoCodec, bitrate: 8_000_000, keyFrameInterval: 2, transform: { width: request.format.width, height: request.format.height } });
      output.addVideoTrack(videoSource, { frameRate: targetFps });
      if (audioTrack && profile.audioCodec) {
        // Audio is appended from file packets/samples, never from an HTMLMediaElement stream.
        await copyOrEncodeAudio({ audioTrack, output, outputAudioCodec: profile.audioCodec, sourceStart, sourceDuration, signal: request.signal });
      } else await output.start();
      const sink = new VideoSampleSink(videoTrack);
      let renderedFrameCount = 0;
      for await (const sample of sink.samplesAtTimestamps(timeline.map(({ timestamp }) => sourceStart + timestamp))) {
        ensureNotAborted(request.signal);
        const frame = timeline[renderedFrameCount]; if (!frame) break;
        try {
          context.clearRect(0, 0, canvas.width, canvas.height);
          if (sample) sample.drawWithFit(context, { fit: "cover" });
          drawExportCaptions(context, request, frame.timestamp * 1_000, arabicFont);
          request.onProgress?.({ phase: "rendering", fraction: renderedFrameCount / timeline.length });
          request.onProgress?.({ phase: "encoding", fraction: renderedFrameCount / timeline.length });
          await videoSource.add(frame.timestamp, frame.duration);
          renderedFrameCount += 1;
        } finally { sample?.close(); }
      }
      if (renderedFrameCount !== timeline.length) throw new Error("The local video decoder stopped before the source timeline completed.");
      request.onProgress?.({ phase: "muxing", fraction: 1 });
      await output.finalize();
      ensureNotAborted(request.signal);
      if (!target.buffer) throw new Error("Local muxing completed without an output buffer.");
      const blob = new Blob([target.buffer], { type: profile.mimeType });
      request.onProgress?.({ phase: "finalizing", fraction: 1 });
      const verification = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
      try {
        const [outputDurationSeconds, outputAudioTrack] = await Promise.all([verification.computeDuration(), verification.getPrimaryAudioTrack()]);
        const outputHasAudio = Boolean(outputAudioTrack);
        if (!durationMatches(sourceDuration, outputDurationSeconds)) throw new Error(`The locally muxed duration (${outputDurationSeconds.toFixed(3)}s) did not match the source timeline (${sourceDuration.toFixed(3)}s). The export was not downloaded.`);
        if (!audioOutputIsValid(sourceHasAudio, outputHasAudio)) throw new Error("The source contained audio, but the locally muxed file did not. The export was not downloaded.");
        const elapsedSeconds = (performance.now() - startedAt) / 1_000;
        const diagnostics: LocalExportDiagnostics = {
          sourceContainer: sourceFormat.name,
          sourceVideoCodec,
          sourceAudioCodec,
          sourceDurationSeconds: sourceDuration,
          sourceFps: frameRateMetrics.bestGuessFrameRate,
          targetFps,
          sourceHasAudio,
          outputContainer: profile.container,
          outputVideoCodec: profile.videoCodec,
          outputAudioCodec: profile.audioCodec,
          renderedFrameCount,
          expectedFrameCount: timeline.length,
          outputDurationSeconds,
          outputHasAudio,
          elapsedSeconds,
          effectiveRenderingFps: renderedFrameCount / Math.max(elapsedSeconds, 0.001),
        };
        return { blob, fileName: `${request.source.name.replace(/\.[^.]+$/u, "")}-captions${profile.extension}`, mimeType: profile.mimeType, diagnostics };
      } finally { verification.dispose(); }
    } finally {
      request.signal?.removeEventListener("abort", abort);
      cleanup();
    }
  },
};
