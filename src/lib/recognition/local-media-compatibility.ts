import {
  ALL_FORMATS,
  BlobSource,
  Input,
} from "mediabunny";
import { compatibilityErrorFromUnknown, MediaCompatibilityError, routeMediaCompatibility, type MediaCompatibilityRoute, type MediaInspection } from "../media-compatibility.ts";
import type { MediaKind } from "../editor/media.ts";
import type { DecodedAudioChannels } from "./local-audio-decode.ts";
import { mediaDebug, visibleFileExtension } from "./media-debug.ts";

type PreparedEditorMedia = {
  file: File;
  kind: MediaKind;
  route: MediaCompatibilityRoute;
  inspection: MediaInspection;
  original: Pick<File, "name" | "type" | "size">;
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
  off(event: "log", callback: (event: { type: string; message: string }) => void): void;
  terminate(): void;
  load(config?: { classWorkerURL?: string; coreURL?: string; wasmURL?: string; workerURL?: string }, options?: { signal?: AbortSignal }): Promise<boolean>;
};

let runtimePromise: Promise<FfmpegRuntime> | null = null;

/** Pinned, same-origin browser runtime files copied from the installed FFmpeg packages. */
export const FFMPEG_RUNTIME_ASSETS = {
  worker: "/ffmpeg/ffmpeg-worker.js",
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
  mediaDebug("inspection", {
    extension: visibleFileExtension(file.name), fileSize: file.size,
    browserPlayback: inspection.browserPlayback, nativeRecognitionAudio: inspection.nativeRecognitionAudio,
    audioStreams: inspection.audioStreamCount ?? 0, audioCodec: inspection.audioCodec ?? null,
    audioSampleRate: inspection.audioSampleRate ?? null, audioChannels: inspection.audioChannels ?? null,
  });
  return inspection;
}

function runtimeFailure(code: "ffmpeg-wrapper-import-failed" | "ffmpeg-worker-create-failed" | "ffmpeg-core-load-failed" | "ffmpeg-wasm-load-failed" | "ffmpeg-initialize-failed") {
  return new MediaCompatibilityError(code);
}

function isJavaScriptContentType(contentType: string | null): boolean {
  return Boolean(contentType && /(?:java|ecma)script/iu.test(contentType));
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

/**
 * FFmpeg creates a module worker internally. Exercise the pinned worker first
 * so a worker-construction/import failure is observable separately from core
 * initialization. Its unknown-message response proves the module ran.
 */
async function verifyFfmpegWorker(signal?: AbortSignal): Promise<void> {
  mediaDebug("worker-create-start", {});
  try {
    await new Promise<void>((resolve, reject) => {
      let worker: Worker | null = null;
      let settled = false;
      let timeout: number | null = null;
      const onAbort = () => fail(abortError());
      const cleanup = () => {
        if (timeout != null) window.clearTimeout(timeout);
        signal?.removeEventListener("abort", onAbort);
        worker?.terminate();
      };
      const fail = (error: unknown = runtimeFailure("ffmpeg-worker-create-failed")) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      };
      try {
        worker = new Worker(FFMPEG_RUNTIME_ASSETS.worker, { type: "module" });
      } catch (error) {
        fail(error);
        return;
      }
      timeout = window.setTimeout(() => fail(), 10_000);
      worker.addEventListener("error", () => fail());
      worker.addEventListener("message", () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      }, { once: true });
      signal?.addEventListener("abort", onAbort, { once: true });
      worker.postMessage({ id: "runtime-check", type: "RUNTIME_CHECK" });
    });
    mediaDebug("worker-create-ok", {});
  } catch (error) {
    if (isAbort(error)) throw error;
    mediaDebug("worker-create-failed", { errorCode: "ffmpeg-worker-create-failed" });
    throw runtimeFailure("ffmpeg-worker-create-failed");
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
  await verifyFfmpegWorker(signal);
  await verifyRuntimeAsset("core", signal);
  await verifyRuntimeAsset("wasm", signal);
  const runtime = new FFmpeg();
  mediaDebug("ffmpeg-initialize-start", {});
  try {
    // The default @ffmpeg/core package is single-threaded and therefore does not require SharedArrayBuffer/COOP/COEP.
    await runtime.load({ classWorkerURL: FFMPEG_RUNTIME_ASSETS.worker, coreURL: FFMPEG_RUNTIME_ASSETS.core, wasmURL: FFMPEG_RUNTIME_ASSETS.wasm }, { signal });
    mediaDebug("ffmpeg-initialize-ok", {});
    return runtime;
  } catch (error) {
    runtime.terminate();
    if (isAbort(error)) throw error;
    mediaDebug("ffmpeg-initialize-failed", { errorCode: "ffmpeg-initialize-failed" });
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

async function runFfmpeg(runtime: FfmpegRuntime, args: string[], fallback: "audioDecodeFailed" | "pcmExtractionFailed", signal?: AbortSignal) {
  const lines: string[] = [];
  const onLog = ({ message }: { type: string; message: string }) => lines.push(message);
  runtime.on("log", onLog);
  try {
    if (await runtime.exec(args, undefined, { signal }) !== 0) throw mediaFailureFromFfmpegLog(lines, fallback);
  } catch (error) {
    if (error instanceof MediaCompatibilityError || isAbort(error)) throw error;
    throw mediaFailureFromFfmpegLog(lines, fallback);
  } finally {
    runtime.off("log", onLog);
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

export async function prepareLocalMedia(file: File, signal?: AbortSignal, onPreparing?: (state: "converting") => void): Promise<PreparedEditorMedia> {
  const inspection = await inspectLocalMedia(file);
  const route = routeMediaCompatibility(file.size, inspection);
  mediaDebug("route", { selected: route });
  assertNotAborted(signal);
  if (route !== "full-normalization") {
    return { file, kind: inspection.kind, route, inspection, original: file };
  }

  onPreparing?.("converting");
  const runtime = await loadFfmpeg(signal);
  let mountPoint: string | null = null;
  const audioOnly = inspection.kind === "audio";
  const outputName = temporaryName(file, audioOnly ? ".m4a" : ".mp4");
  try {
    const mounted = await mountSource(runtime, file, signal);
    mountPoint = mounted.mountPoint;
    const { inputName } = mounted;
    await probeFfmpeg(runtime, inputName, audioOnly ? "audio" : "media", signal);
    assertNotAborted(signal);
    const command = audioOnly
      ? ["-i", inputName, "-map", "0:a:0", "-c:a", "aac", "-movflags", "+faststart", outputName]
      : ["-i", inputName, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", outputName];
    await runFfmpeg(runtime, command, "pcmExtractionFailed", signal);
    const data = await runtime.readFile(outputName, undefined, { signal }) as Uint8Array;
    const normalizedBytes = new Uint8Array(data.byteLength);
    normalizedBytes.set(data);
    const normalized = new File([normalizedBytes.buffer], `${file.name.replace(/\.[^.]+$/u, "") || "recitation"}.${audioOnly ? "m4a" : "mp4"}`, { type: audioOnly ? "audio/mp4" : "video/mp4", lastModified: file.lastModified });
    return { file: normalized, kind: audioOnly ? "audio" : "video", route, inspection, original: file };
  } catch (error) {
    if (error instanceof MediaCompatibilityError || isAbort(error)) throw error;
    throw compatibilityErrorFromUnknown(error, "pcmExtractionFailed");
  } finally {
    await Promise.allSettled([runtime.deleteFile(outputName, { signal })]);
    if (mountPoint) {
      await Promise.allSettled([runtime.unmount(mountPoint)]);
      await Promise.allSettled([runtime.deleteDir(mountPoint)]);
    }
  }
}

/** Called only after Web Audio fails; the original playable video remains the editor source. */
export async function decodeRecognitionAudioFallback(file: File, signal?: AbortSignal): Promise<DecodedAudioChannels> {
  const inspection = await inspectLocalMedia(file);
  const route = routeMediaCompatibility(file.size, { ...inspection, nativeRecognitionAudio: false, browserPlayback: true });
  mediaDebug("route", { selected: route });
  if (route !== "audio-fallback") throw new MediaCompatibilityError("audioDecodeFailed");
  const runtime = await loadFfmpeg(signal);
  let mountPoint: string | null = null;
  const outputName = temporaryName(file, ".f32");
  try {
    const mounted = await mountSource(runtime, file, signal);
    mountPoint = mounted.mountPoint;
    const { inputName } = mounted;
    await probeFfmpeg(runtime, inputName, "audio", signal);
    await runFfmpeg(runtime, [
      "-i", inputName, "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-acodec", "pcm_f32le", outputName,
    ], "pcmExtractionFailed", signal);
    const bytes = await runtime.readFile(outputName, undefined, { signal }) as Uint8Array;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const frameCount = bytes.byteLength / Float32Array.BYTES_PER_ELEMENT;
    mediaDebug("pcm", { audioDecode: true, pcmDurationMs: Math.round(frameCount / 16), errorCode: null });
    return { sampleRate: 16_000, frameCount, channelBuffers: [copy.buffer] };
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
      await Promise.allSettled([runtime.unmount(mountPoint)]);
      await Promise.allSettled([runtime.deleteDir(mountPoint)]);
    }
  }
}

export function releaseLocalMediaRuntime() {
  void runtimePromise?.then((runtime) => runtime.terminate());
  runtimePromise = null;
}
