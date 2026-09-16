import {
  ALL_FORMATS,
  BlobSource,
  Input,
} from "mediabunny";
import { compatibilityErrorFromUnknown, MAX_RECOGNITION_PCM_BYTES, MediaCompatibilityError, recognitionPcmBytes, routeMediaCompatibility, type MediaCompatibilityRoute, type MediaInspection } from "../media-compatibility.ts";
import type { MediaKind } from "../editor/media.ts";
import type { DecodedAudioChannels } from "./local-audio-decode.ts";
import { mediaDebug, mediaDebugEnabled, visibleFileExtension } from "./media-debug.ts";

type PreparedEditorMedia = {
  file: File;
  kind: MediaKind;
  route: MediaCompatibilityRoute;
  inspection: MediaInspection;
  original: Pick<File, "name" | "type" | "size">;
};

/** The only PCM representation passed into Quran identification and timing. */
export type PreparedRecognitionAudio = {
  pcm: DecodedAudioChannels;
  decodePath: "native" | "ffmpeg";
  reason: "native-safe" | "native-decode-unavailable" | "native-pcm-unusable" | "media-audio-fallback";
  inspection: MediaInspection;
};

export type LocalMediaPreparationEvent = {
  stage: "preparing-converter" | "inspecting-recording" | "converting-recording" | "preparing-audio" | "preparing-editor";
  inspection?: MediaInspection;
  processedTimeMs?: number;
  sourceDurationMs?: number;
  complete?: boolean;
};

type FfmpegRuntime = {
  exec(args: string[], timeout?: number, options?: { signal?: AbortSignal }): Promise<number>;
  readFile(path: string, encoding?: "utf8", options?: { signal?: AbortSignal }): Promise<Uint8Array | string>;
  deleteFile(path: string, options?: { signal?: AbortSignal }): Promise<boolean>;
  createDir(path: string): Promise<boolean>;
  deleteDir(path: string): Promise<boolean>;
  mount(fsType: "WORKERFS", options: { files: File[] }, mountPoint: string): Promise<boolean>;
  unmount(mountPoint: string): Promise<boolean>;
  on(event: "log", callback: (event: { type: string; message: string }) => void): void;
  on(event: "progress", callback: (event: { progress: number; time: number }) => void): void;
  off(event: "log", callback: (event: { type: string; message: string }) => void): void;
  off(event: "progress", callback: (event: { progress: number; time: number }) => void): void;
  terminate(): void;
  load(config?: { classWorkerURL?: string; coreURL?: string; wasmURL?: string; workerURL?: string }, options?: { signal?: AbortSignal }): Promise<boolean>;
};

let runtimePromise: Promise<FfmpegRuntime> | null = null;
/**
 * FFmpeg has one virtual filesystem and one pair of event listener sets. Keep
 * a complete mount/probe/command/read/cleanup operation exclusive so media
 * normalization and recognition extraction cannot interleave their state.
 */
let ffmpegJobQueue: Promise<void> = Promise.resolve();

/** Pinned, same-origin single-thread core files copied from @ffmpeg/core/dist/umd. */
export const FFMPEG_RUNTIME_ASSETS = {
  core: "/ffmpeg/ffmpeg-core.js",
  wasm: "/ffmpeg/ffmpeg-core.wasm",
} as const;

export function resolveFfmpegRuntimeAssetUrl(asset: keyof typeof FFMPEG_RUNTIME_ASSETS, baseUrl: string): string {
  return new URL(FFMPEG_RUNTIME_ASSETS[asset], baseUrl).toString();
}

function abortError() { return new DOMException("Media preparation cancelled.", "AbortError"); }
function assertNotAborted(signal?: AbortSignal) { if (signal?.aborted) throw abortError(); }
function isAbort(error: unknown): boolean { return error instanceof DOMException && error.name === "AbortError"; }

async function browserCanPlay(file: File, mimeType: string, hasVideo: boolean): Promise<boolean> {
  if (!hasVideo) return true;
  const element = document.createElement("video");
  const candidate = mimeType || file.type;
  // An empty answer is deliberately not treated as support: the local route will probe before expensive work.
  return Boolean(candidate && element.canPlayType(candidate));
}

async function inspectTracks(file: File): Promise<MediaInspection> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    if (!await input.canRead()) throw new MediaCompatibilityError("unreadable");
    const [audioTracks, audioTrack, videoTrack, duration, mimeType] = await Promise.all([
      input.getAudioTracks(),
      input.getPrimaryAudioTrack(),
      input.getPrimaryVideoTrack(),
      input.getDurationFromMetadata(),
      input.getMimeType(),
    ]);
    const [audioCodec, videoCodec, nativeRecognitionAudio, browserPlayback, width, height, audioSampleRate, audioChannels] = await Promise.all([
      audioTrack?.getCodec() ?? null,
      videoTrack?.getCodec() ?? null,
      audioTrack?.canDecode() ?? false,
      browserCanPlay(file, mimeType, Boolean(videoTrack)),
      videoTrack?.getCodedWidth(),
      videoTrack?.getCodedHeight(),
      audioTrack?.getSampleRate(),
      audioTrack?.getNumberOfChannels(),
    ]);
    const kind = videoTrack ? "video" : "audio";
    return {
      readable: true,
      kind,
      hasVideo: Boolean(videoTrack),
      hasAudio: Boolean(audioTrack),
      browserPlayback,
      nativeRecognitionAudio,
      durationMs: duration == null ? undefined : Math.round(duration * 1_000),
      width,
      height,
      videoCodec,
      audioCodec,
      audioStreamCount: audioTracks.length,
      audioSampleRate,
      audioChannels,
    };
  } catch (error) {
    if (error instanceof MediaCompatibilityError) throw error;
    throw compatibilityErrorFromUnknown(error, "unreadable");
  } finally {
    input.dispose();
  }
}

/** Fast, lazy local preflight. It reads container metadata before FFmpeg work. */
export async function inspectLocalMedia(file: File): Promise<MediaInspection> {
  const inspection = await inspectTracks(file);
  mediaDebug("source-inspection", {
    container: visibleFileExtension(file.name), fileSize: file.size,
    browserPlayback: inspection.browserPlayback, nativeRecognitionAudio: inspection.nativeRecognitionAudio,
    audioStreams: inspection.audioStreamCount ?? 0, audioCodec: inspection.audioCodec ?? null,
    sourceSampleRate: inspection.audioSampleRate ?? null, channels: inspection.audioChannels ?? null,
    durationMs: inspection.durationMs ?? null,
  });
  return inspection;
}

export function selectRecognitionAudioPath(inspection: MediaInspection): Pick<PreparedRecognitionAudio, "decodePath" | "reason"> {
  return inspection.nativeRecognitionAudio
    ? { decodePath: "native", reason: "native-safe" }
    : { decodePath: "ffmpeg", reason: "media-audio-fallback" };
}

export function isUsableCanonicalRecognitionPcm(pcm: DecodedAudioChannels): boolean {
  if (pcm.sampleRate !== 16_000 || !Number.isSafeInteger(pcm.frameCount) || pcm.frameCount <= 0 || pcm.channelBuffers.length !== 1) return false;
  const buffer = pcm.channelBuffers[0]!;
  if (buffer.byteLength !== pcm.frameCount * Float32Array.BYTES_PER_ELEMENT) return false;
  for (const sample of new Float32Array(buffer)) {
    if (!Number.isFinite(sample)) return false;
  }
  return true;
}

function runtimeFailure(code: "ffmpeg-wrapper-import-failed" | "ffmpeg-worker-create-failed" | "ffmpeg-core-load-failed" | "ffmpeg-wasm-load-failed" | "ffmpeg-initialize-failed") {
  return new MediaCompatibilityError(code);
}

function isJavaScriptContentType(contentType: string | null): boolean {
  return Boolean(contentType && /(?:java|ecma)script/iu.test(contentType));
}

function sanitizeInitializationMessage(value: string): string {
  const redacted = value
    .replace(/(?:blob:|file:|https?:\/\/)[^\s)'"`]+/giu, "[redacted-url]")
    .replace(/(?:[A-Za-z]:)?(?:\\|\/)[^\s)'"`]+(?:\\|\/)[^\s)'"`]*/gu, "[redacted-path]")
    .replace(/\s+/gu, " ")
    .trim();
  return (redacted || "No error message was provided.").slice(0, 320);
}

function initializationSubstage(error: unknown, rawMessage: string): "main-thread" | "wrapper-worker" | "ffmpeg-core-factory" | "wasm-instantiation" | "worker-message-protocol" {
  if (/webassembly|\bwasm\b|instantiate|compile|memory/iu.test(rawMessage)) return "wasm-instantiation";
  if (/createffmpegcore|ffmpeg-core|\bimport\b/iu.test(rawMessage)) return "ffmpeg-core-factory";
  if (typeof error === "string") return "worker-message-protocol";
  if (/worker/iu.test(rawMessage)) return "wrapper-worker";
  return "main-thread";
}

function safeSourceLocation(error: unknown): string | null {
  if (!(error instanceof Error) || !error.stack) return null;
  const match = /(?:^|[/\\])(ffmpeg-(?:core|worker)\.js):(\d+)(?::\d+)?/u.exec(error.stack);
  return match ? `${match[1]}:${match[2]}` : null;
}

/** Safe details for ?debugMedia=1; the wrapper reports worker ERROR payloads as strings. */
export function ffmpegInitializationDebugFacts(error: unknown): {
  errorName: string;
  errorMessage: string;
  initializationSubstage: ReturnType<typeof initializationSubstage>;
  failureOrigin: "main-thread" | "wrapper-worker";
  workerMessageProtocol: boolean;
  sourceLocation: string | null;
} {
  const rawMessage = error instanceof Error ? error.message : typeof error === "string" ? error : "Unknown FFmpeg initialization failure.";
  const workerMessageProtocol = typeof error === "string";
  return {
    errorName: error instanceof Error ? error.name || "Error" : workerMessageProtocol ? "WorkerMessageError" : "UnknownError",
    errorMessage: sanitizeInitializationMessage(rawMessage),
    initializationSubstage: initializationSubstage(error, rawMessage),
    failureOrigin: workerMessageProtocol ? "wrapper-worker" : "main-thread",
    workerMessageProtocol,
    sourceLocation: safeSourceLocation(error),
  };
}

async function verifyRuntimeAsset(asset: "core" | "wasm", signal?: AbortSignal): Promise<void> {
  const stage = asset === "core" ? "ffmpeg-core-load-failed" : "ffmpeg-wasm-load-failed";
  const event = asset === "core" ? "core-load" : "wasm-load";
  mediaDebug(`${event}-start`, {});
  try {
    const response = await fetch(FFMPEG_RUNTIME_ASSETS[asset], { signal, headers: { Range: "bytes=0-15" } });
    const contentType = response.headers.get("content-type");
    if (!response.ok || (asset === "core" ? !isJavaScriptContentType(contentType) : contentType?.split(";", 1)[0]?.trim().toLowerCase() !== "application/wasm")) {
      throw runtimeFailure(stage);
    }
    if (asset === "wasm") {
      const reader = response.body?.getReader();
      if (!reader) throw runtimeFailure(stage);
      try {
        const { value } = await reader.read();
        if (!value || value.length < 4 || value[0] !== 0 || value[1] !== 0x61 || value[2] !== 0x73 || value[3] !== 0x6d) throw runtimeFailure(stage);
      } finally {
        await reader.cancel();
      }
    }
    mediaDebug(`${event}-ok`, {});
  } catch (error) {
    if (isAbort(error)) throw error;
    mediaDebug(`${event}-failed`, { errorCode: stage });
    throw error instanceof MediaCompatibilityError ? error : runtimeFailure(stage);
  }
}

async function createFfmpegRuntime(signal?: AbortSignal): Promise<FfmpegRuntime> {
  let FFmpeg: (new () => FfmpegRuntime);
  mediaDebug("runtime-wrapper-import-start", {});
  try {
    ({ FFmpeg } = await import("@ffmpeg/ffmpeg") as { FFmpeg: new () => FfmpegRuntime });
    mediaDebug("runtime-wrapper-import-ok", {});
  } catch (error) {
    if (isAbort(error)) throw error;
    mediaDebug("runtime-wrapper-import-failed", { errorCode: "ffmpeg-wrapper-import-failed" });
    throw runtimeFailure("ffmpeg-wrapper-import-failed");
  }
  await verifyRuntimeAsset("core", signal);
  await verifyRuntimeAsset("wasm", signal);
  const runtime = new FFmpeg();
  mediaDebug("ffmpeg-initialize-start", {});
  try {
    // The default @ffmpeg/core package is single-threaded and therefore does not require SharedArrayBuffer/COOP/COEP.
    // Leave the @ffmpeg/ffmpeg wrapper worker to Next/Webpack, as its API intends.
    mediaDebug("ffmpeg-initialize-config", { wrapperWorker: "next-webpack-bundled-classic", core: "self-hosted-umd", wasm: "self-hosted-umd-pair", coreWorker: "not-supplied-single-thread" });
    await runtime.load({ coreURL: FFMPEG_RUNTIME_ASSETS.core, wasmURL: FFMPEG_RUNTIME_ASSETS.wasm }, { signal });
    mediaDebug("ffmpeg-initialize-ok", {});
    return runtime;
  } catch (error) {
    runtime.terminate();
    if (isAbort(error)) throw error;
    mediaDebug("ffmpeg-initialize-failed", { errorCode: "ffmpeg-initialize-failed", ...ffmpegInitializationDebugFacts(error) });
    throw runtimeFailure("ffmpeg-initialize-failed");
  }
}

async function getFfmpeg(signal?: AbortSignal): Promise<FfmpegRuntime> {
  runtimePromise ??= createFfmpegRuntime(signal);
  try {
    return await runtimePromise;
  } catch (error) {
    runtimePromise = null;
    throw error;
  }
}

async function loadFfmpeg(signal?: AbortSignal): Promise<FfmpegRuntime> {
  try {
    const runtime = await getFfmpeg(signal);
    mediaDebug("runtime", { loaded: true });
    return runtime;
  } catch (error) {
    if (isAbort(error)) throw error;
    const compatible = error instanceof MediaCompatibilityError ? error : compatibilityErrorFromUnknown(error, "runtimeLoad");
    mediaDebug("runtime", { loaded: false, errorCode: compatible.code });
    throw compatible;
  }
}

async function runFfmpegJob<T>(signal: AbortSignal | undefined, work: (runtime: FfmpegRuntime) => Promise<T>): Promise<T> {
  const execute = async () => {
    assertNotAborted(signal);
    const runtime = await loadFfmpeg(signal);
    assertNotAborted(signal);
    return work(runtime);
  };
  const scheduled = ffmpegJobQueue.then(execute, execute);
  // A failed or cancelled operation must release the next operation without
  // exposing the previous job's rejection or listeners to it.
  ffmpegJobQueue = scheduled.then(() => undefined, () => undefined);
  return scheduled;
}

/**
 * WORKERFS gives FFmpeg a File-backed input. Unlike MEMFS writeFile(), it does
 * not first materialize the whole source as an ArrayBuffer or a second source
 * file in WASM; FFmpeg reads the required file ranges as it demuxes them.
 */
async function mountSource(runtime: FfmpegRuntime, file: File, signal?: AbortSignal) {
  assertNotAborted(signal);
  const mountPoint = `/quran-source-${crypto.randomUUID()}`;
  try {
    if (!await runtime.createDir(mountPoint)) throw new MediaCompatibilityError("workerfsMount");
    if (!await runtime.mount("WORKERFS", { files: [file] }, mountPoint)) throw new MediaCompatibilityError("workerfsMount");
    mediaDebug("workerfs", { mounted: true });
  } catch (error) {
    await Promise.allSettled([runtime.deleteDir(mountPoint)]);
    if (error instanceof MediaCompatibilityError || isAbort(error)) {
      if (error instanceof MediaCompatibilityError) mediaDebug("workerfs", { mounted: false, errorCode: error.code });
      throw error;
    }
    mediaDebug("workerfs", { mounted: false, errorCode: "workerfsMount" });
    throw compatibilityErrorFromUnknown(error, "workerfsMount");
  }
  return { mountPoint, inputName: `${mountPoint}/${file.name}` };
}

/** Maps FFmpeg diagnostics to an internal stage without ever exposing raw command output. */
export function mediaFailureFromFfmpegLog(lines: readonly string[], fallback: "audioDecodeFailed" | "pcmExtractionFailed" = "audioDecodeFailed"): MediaCompatibilityError {
  const message = lines.join("\n").toLowerCase();
  if (/drm|encrypt(?:ed|ion)?|protected|cenc|cbcs/u.test(message)) return new MediaCompatibilityError("protected");
  if (/matches no streams|does not contain any stream|stream map.*not found/u.test(message)) return new MediaCompatibilityError("noAudio");
  if (/could not open input|failed to open input|error opening input/u.test(message)) return new MediaCompatibilityError("containerOpen");
  if (/invalid data|moov atom not found|could not find codec parameters|end of file/u.test(message)) return new MediaCompatibilityError("unreadable");
  if (/decoder .* not found|unknown decoder|unsupported codec|could not find decoder/u.test(message)) return new MediaCompatibilityError("audioDecoderUnavailable");
  if (/out of memory|cannot enlarge memory|memory allocation|bad alloc/u.test(message)) return new MediaCompatibilityError("resource");
  return new MediaCompatibilityError(fallback);
}

async function runFfmpeg(
  runtime: FfmpegRuntime,
  args: string[],
  fallback: "audioDecodeFailed" | "pcmExtractionFailed",
  signal?: AbortSignal,
  onProgress?: (processedTimeMs: number) => void,
) {
  const lines: string[] = [];
  const onLog = ({ message }: { type: string; message: string }) => lines.push(message);
  // @ffmpeg/ffmpeg 0.12.15 forwards FFmpeg's media timestamp in microseconds.
  // Derive the visible value from it and the inspected source duration rather
  // than trusting the wrapper's generic `progress` fraction.
  const onFfmpegProgress = ({ time }: { progress: number; time: number }) => {
    if (Number.isFinite(time) && time >= 0) onProgress?.(time / 1_000);
  };
  runtime.on("log", onLog);
  if (onProgress) runtime.on("progress", onFfmpegProgress);
  try {
    mediaDebug("ffmpeg-exec-start", {});
    const exitCode = await runtime.exec(args, undefined, { signal });
    mediaDebug("ffmpeg-exec-resolved", { exitCode });
    if (exitCode !== 0) throw mediaFailureFromFfmpegLog(lines, fallback);
  } catch (error) {
    if (error instanceof MediaCompatibilityError || isAbort(error)) throw error;
    throw mediaFailureFromFfmpegLog(lines, fallback);
  } finally {
    runtime.off("log", onLog);
    if (onProgress) runtime.off("progress", onFfmpegProgress);
  }
}

async function probeFfmpeg(runtime: FfmpegRuntime, inputName: string, stream: "audio" | "media", signal?: AbortSignal) {
  const args = stream === "audio"
    ? ["-i", inputName, "-map", "0:a:0", "-vn", "-t", "1", "-f", "null", "-"]
    : ["-t", "1", "-i", inputName, "-map", "0:v:0", "-map", "0:a?", "-f", "null", "-"];
  await runFfmpeg(runtime, args, "audioDecodeFailed", signal);
  mediaDebug("probe", { stream, containerDemux: true, audioDecode: stream === "audio" ? true : undefined });
}

function temporaryName(file: File, suffix: string) {
  return `quran-source-${crypto.randomUUID()}${suffix}`;
}

export async function prepareLocalMedia(file: File, signal?: AbortSignal, onPreparation?: (event: LocalMediaPreparationEvent) => void): Promise<PreparedEditorMedia> {
  const inspection = await inspectLocalMedia(file);
  onPreparation?.({ stage: "inspecting-recording", inspection });
  const route = routeMediaCompatibility(file.size, inspection);
  mediaDebug("route", { selected: route });
  assertNotAborted(signal);
  if (route !== "full-normalization") {
    return { file, kind: inspection.kind, route, inspection, original: file };
  }

  onPreparation?.({ stage: "preparing-converter" });
  const audioOnly = inspection.kind === "audio";
  const outputName = temporaryName(file, audioOnly ? ".m4a" : ".mp4");
  return runFfmpegJob(signal, async (runtime) => {
    let mountPoint: string | null = null;
    try {
      const mounted = await mountSource(runtime, file, signal);
      mountPoint = mounted.mountPoint;
      const { inputName } = mounted;
      onPreparation?.({ stage: "inspecting-recording" });
      await probeFfmpeg(runtime, inputName, audioOnly ? "audio" : "media", signal);
      assertNotAborted(signal);
      const command = audioOnly
        ? ["-i", inputName, "-map", "0:a:0", "-c:a", "aac", "-movflags", "+faststart", outputName]
        : ["-i", inputName, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", outputName];
      const progressStage = "converting-recording" as const;
      let lastDebugPercentage = -1;
      mediaDebug("conversion-start", { route, sourceDurationMs: inspection.durationMs ?? null });
      onPreparation?.({ stage: progressStage, sourceDurationMs: inspection.durationMs });
      await runFfmpeg(runtime, command, "pcmExtractionFailed", signal, (processedTimeMs) => {
        onPreparation?.({ stage: progressStage, processedTimeMs, sourceDurationMs: inspection.durationMs });
        const percentage = inspection.durationMs && inspection.durationMs > 0 ? Math.min(100, Math.max(0, Math.round((processedTimeMs / inspection.durationMs) * 100))) : null;
        if (percentage !== null && percentage >= lastDebugPercentage + 10) {
          lastDebugPercentage = percentage;
          mediaDebug("conversion-progress", { route, percentage });
        }
      });
      onPreparation?.({ stage: progressStage, sourceDurationMs: inspection.durationMs, complete: true });
      onPreparation?.({ stage: "preparing-editor" });
      mediaDebug("output-read-start", {});
      const data = await runtime.readFile(outputName, undefined, { signal }) as Uint8Array;
      mediaDebug("output-read-complete", { byteLength: data.byteLength });
      const normalizedBytes = new Uint8Array(data.byteLength);
      normalizedBytes.set(data);
      mediaDebug("working-media-create-start", {});
      const normalized = new File([normalizedBytes.buffer], `${file.name.replace(/\.[^.]+$/u, "") || "recitation"}.${audioOnly ? "m4a" : "mp4"}`, { type: audioOnly ? "audio/mp4" : "video/mp4", lastModified: file.lastModified });
      mediaDebug("working-media-create-complete", { byteLength: normalized.size });
      mediaDebug("conversion-complete", { route });
      return { file: normalized, kind: audioOnly ? "audio" : "video", route, inspection, original: file };
    } catch (error) {
      if (error instanceof MediaCompatibilityError || isAbort(error)) throw error;
      throw compatibilityErrorFromUnknown(error, "pcmExtractionFailed");
    } finally {
      await Promise.allSettled([runtime.deleteFile(outputName, { signal })]);
      if (mountPoint) {
        mediaDebug("workerfs-unmount-start", {});
        await Promise.allSettled([runtime.unmount(mountPoint)]);
        mediaDebug("workerfs-unmount-complete", {});
        await Promise.allSettled([runtime.deleteDir(mountPoint)]);
      }
    }
  });
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  // Copying this derived output is intentional: Web Crypto's strict browser
  // type accepts ArrayBuffer, while FFmpeg's view may be backed differently.
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function recognitionPcmDiagnostics(pcm: DecodedAudioChannels) {
  const buffer = pcm.channelBuffers[0] ?? new ArrayBuffer(0);
  const bytes = new Uint8Array(buffer);
  const samples = new Float32Array(buffer, 0, pcm.frameCount);
  let squaredTotal = 0;
  for (let index = 0; index < samples.length; index += 1) {
    squaredTotal += samples[index]! ** 2;
  }
  return {
    canonicalSampleRate: pcm.sampleRate,
    sampleCount: pcm.frameCount,
    pcmDurationMs: Math.round(pcm.frameCount * 1_000 / pcm.sampleRate),
    rms: Math.sqrt(squaredTotal / Math.max(1, samples.length)),
    pcmSha256: await sha256Hex(bytes),
  };
}

async function reportRecognitionPreparation(
  file: File,
  inspection: MediaInspection,
  path: PreparedRecognitionAudio["decodePath"],
  reason: PreparedRecognitionAudio["reason"],
  pcm: DecodedAudioChannels,
) {
  if (!mediaDebugEnabled()) return;
  let diagnostics: Awaited<ReturnType<typeof recognitionPcmDiagnostics>> | null = null;
  try {
    diagnostics = await recognitionPcmDiagnostics(pcm);
  } catch {
    // Diagnostics must never affect decoder selection or recognition input.
  }
  mediaDebug("recognition-preparation", {
    path,
    reason,
    container: visibleFileExtension(file.name),
    audioCodec: inspection.audioCodec ?? null,
    sourceSampleRate: inspection.audioSampleRate ?? null,
    channels: inspection.audioChannels ?? null,
    sourceDurationMs: inspection.durationMs ?? null,
    canonicalSampleRate: diagnostics?.canonicalSampleRate ?? pcm.sampleRate,
    sampleCount: diagnostics?.sampleCount ?? pcm.frameCount,
    pcmDurationMs: diagnostics?.pcmDurationMs ?? Math.round(pcm.frameCount * 1_000 / pcm.sampleRate),
    rms: diagnostics?.rms ?? null,
    pcmSha256: diagnostics?.pcmSha256 ?? null,
  });
}

/**
 * Extracts one independent recognition representation from the exact File the
 * user selected. Every recognition-audio compatibility fallback shares this
 * sole FFmpeg path and its UMD runtime lifecycle.
 */
export async function extractRecognitionPcm(file: File, signal?: AbortSignal, onPreparation?: (event: LocalMediaPreparationEvent) => void): Promise<DecodedAudioChannels> {
  const inspection = await inspectLocalMedia(file);
  // This is an explicitly requested alternate representation, not a second
  // compatibility-routing decision. Its safety envelope is the audio fallback
  // envelope, regardless of whether the native decoder also says it can play.
  if (!inspection.readable) throw new MediaCompatibilityError("unreadable");
  if (!inspection.hasAudio) throw new MediaCompatibilityError("noAudio");
  if (recognitionPcmBytes(inspection.durationMs) > MAX_RECOGNITION_PCM_BYTES) throw new MediaCompatibilityError("recognitionAudioTooLarge");
  const route = "audio-fallback" as const;
  mediaDebug("route", { selected: route });
  if (route !== "audio-fallback") throw new MediaCompatibilityError("audioDecodeFailed");
  onPreparation?.({ stage: "preparing-converter" });
  const outputName = temporaryName(file, ".f32");
  return runFfmpegJob(signal, async (runtime) => {
    let mountPoint: string | null = null;
    try {
      const mounted = await mountSource(runtime, file, signal);
      mountPoint = mounted.mountPoint;
      const { inputName } = mounted;
      onPreparation?.({ stage: "inspecting-recording" });
      await probeFfmpeg(runtime, inputName, "audio", signal);
      const progressStage = "preparing-audio" as const;
      let lastDebugPercentage = -1;
      mediaDebug("conversion-start", { route, sourceDurationMs: inspection.durationMs ?? null });
      onPreparation?.({ stage: progressStage, sourceDurationMs: inspection.durationMs });
      await runFfmpeg(runtime, [
        "-i", inputName, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-acodec", "pcm_f32le", outputName,
      ], "pcmExtractionFailed", signal, (processedTimeMs) => {
        onPreparation?.({ stage: progressStage, processedTimeMs, sourceDurationMs: inspection.durationMs });
        const percentage = inspection.durationMs && inspection.durationMs > 0 ? Math.min(100, Math.max(0, Math.round((processedTimeMs / inspection.durationMs) * 100))) : null;
        if (percentage !== null && percentage >= lastDebugPercentage + 10) {
          lastDebugPercentage = percentage;
          mediaDebug("conversion-progress", { route, percentage });
        }
      });
      onPreparation?.({ stage: progressStage, sourceDurationMs: inspection.durationMs, complete: true });
      mediaDebug("output-read-start", {});
      const bytes = await runtime.readFile(outputName, undefined, { signal }) as Uint8Array;
      mediaDebug("output-read-complete", { byteLength: bytes.byteLength });
      if (bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0) throw new MediaCompatibilityError("pcmExtractionFailed");
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      const frameCount = copy.byteLength / Float32Array.BYTES_PER_ELEMENT;
      mediaDebug("pcm", { audioDecode: true, pcmDurationMs: Math.round(frameCount / 16), errorCode: null });
      mediaDebug("conversion-complete", { route });
      const pcm = { sampleRate: 16_000, frameCount, channelBuffers: [copy.buffer] };
      if (!isUsableCanonicalRecognitionPcm(pcm)) throw new MediaCompatibilityError("pcmExtractionFailed");
      return pcm;
    } catch (error) {
      if (error instanceof MediaCompatibilityError || isAbort(error)) {
        if (error instanceof MediaCompatibilityError) mediaDebug("failure", { audioDecode: false, errorCode: error.code });
        throw error;
      }
      const compatible = compatibilityErrorFromUnknown(error, "pcmExtractionFailed");
      mediaDebug("failure", { audioDecode: false, errorCode: compatible.code });
      throw compatible;
    } finally {
      await Promise.allSettled([runtime.deleteFile(outputName, { signal })]);
      if (mountPoint) {
        mediaDebug("workerfs-unmount-start", {});
        await Promise.allSettled([runtime.unmount(mountPoint)]);
        mediaDebug("workerfs-unmount-complete", {});
        await Promise.allSettled([runtime.deleteDir(mountPoint)]);
      }
    }
  });
}

/**
 * Select and create one canonical PCM representation before Quran recognition.
 * Decoder choice is based solely on inspected media and native decoder
 * availability; no Quran candidate, confidence, or passage decision reaches
 * this boundary.
 */
export async function prepareRecognitionAudio(
  file: File,
  signal?: AbortSignal,
  onPreparation?: (event: LocalMediaPreparationEvent) => void,
): Promise<PreparedRecognitionAudio> {
  const inspection = await inspectLocalMedia(file);
  assertNotAborted(signal);
  const selection = selectRecognitionAudioPath(inspection);
  if (selection.decodePath === "ffmpeg") {
    const pcm = await extractRecognitionPcm(file, signal, onPreparation);
    await reportRecognitionPreparation(file, inspection, "ffmpeg", selection.reason, pcm);
    return { pcm, decodePath: "ffmpeg", reason: selection.reason, inspection };
  }
  const { canonicalizeNativeRecognitionPcm, decodeAudioChannels } = await import("./local-audio-decode.ts");
  let decoded: DecodedAudioChannels;
  try {
    decoded = await decodeAudioChannels(file);
  } catch {
    assertNotAborted(signal);
    const pcm = await extractRecognitionPcm(file, signal, onPreparation);
    await reportRecognitionPreparation(file, inspection, "ffmpeg", "native-decode-unavailable", pcm);
    return { pcm, decodePath: "ffmpeg", reason: "native-decode-unavailable", inspection };
  }
  try {
    const pcm = canonicalizeNativeRecognitionPcm(decoded);
    if (!isUsableCanonicalRecognitionPcm(pcm)) throw new Error("Native canonical PCM is unusable.");
    await reportRecognitionPreparation(file, inspection, "native", "native-safe", pcm);
    return { pcm, decodePath: "native", reason: "native-safe", inspection };
  } catch {
    assertNotAborted(signal);
    const pcm = await extractRecognitionPcm(file, signal, onPreparation);
    await reportRecognitionPreparation(file, inspection, "ffmpeg", "native-pcm-unusable", pcm);
    return { pcm, decodePath: "ffmpeg", reason: "native-pcm-unusable", inspection };
  }
}

export function releaseLocalMediaRuntime() {
  void runtimePromise?.then((runtime) => runtime.terminate());
  runtimePromise = null;
}
