import {
  ALL_FORMATS,
  BlobSource,
  Input,
} from "mediabunny";
import { compatibilityErrorFromUnknown, MediaCompatibilityError, routeMediaCompatibility, type MediaCompatibilityRoute, type MediaInspection } from "../media-compatibility.ts";
import type { MediaKind } from "../editor/media.ts";
import type { DecodedAudioChannels } from "./local-audio-decode.ts";

type PreparedEditorMedia = {
  file: File;
  kind: MediaKind;
  route: MediaCompatibilityRoute;
  inspection: MediaInspection;
  original: Pick<File, "name" | "type" | "size">;
};

type FfmpegRuntime = {
  exec(args: string[], timeout?: number, options?: { signal?: AbortSignal }): Promise<number>;
  writeFile(path: string, data: Uint8Array, options?: { signal?: AbortSignal }): Promise<boolean>;
  readFile(path: string, encoding?: "utf8", options?: { signal?: AbortSignal }): Promise<Uint8Array | string>;
  deleteFile(path: string, options?: { signal?: AbortSignal }): Promise<boolean>;
  terminate(): void;
  load(config?: { coreURL?: string; wasmURL?: string; workerURL?: string }, options?: { signal?: AbortSignal }): Promise<boolean>;
};

let runtimePromise: Promise<FfmpegRuntime> | null = null;

function abortError() { return new DOMException("Media preparation cancelled.", "AbortError"); }
function assertNotAborted(signal?: AbortSignal) { if (signal?.aborted) throw abortError(); }

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
    const [audioTrack, videoTrack, duration, mimeType] = await Promise.all([
      input.getPrimaryAudioTrack(),
      input.getPrimaryVideoTrack(),
      input.getDurationFromMetadata(),
      input.getMimeType(),
    ]);
    const [audioCodec, videoCodec, nativeRecognitionAudio, browserPlayback] = await Promise.all([
      audioTrack?.getCodec() ?? null,
      videoTrack?.getCodec() ?? null,
      audioTrack?.canDecode() ?? false,
      browserCanPlay(file, mimeType, Boolean(videoTrack)),
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
      videoCodec,
      audioCodec,
    };
  } catch (error) {
    if (error instanceof MediaCompatibilityError) throw error;
    throw compatibilityErrorFromUnknown(error, "unreadable");
  } finally {
    input.dispose();
  }
}

/** Fast, lazy local preflight. It reads container metadata before any FFmpeg input copy or conversion. */
export async function inspectLocalMedia(file: File): Promise<MediaInspection> {
  return inspectTracks(file);
}

async function getFfmpeg(signal?: AbortSignal): Promise<FfmpegRuntime> {
  runtimePromise ??= (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([import("@ffmpeg/ffmpeg"), import("@ffmpeg/util")]);
    const runtime = new FFmpeg() as unknown as FfmpegRuntime;
    // The default @ffmpeg/core package is single-threaded and therefore does not require SharedArrayBuffer/COOP/COEP.
    const coreBaseUrl = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";
    const [coreURL, wasmURL] = await Promise.all([
      toBlobURL(`${coreBaseUrl}/ffmpeg-core.js`, "text/javascript"),
      toBlobURL(`${coreBaseUrl}/ffmpeg-core.wasm`, "application/wasm"),
    ]);
    await runtime.load({
      coreURL,
      wasmURL,
    }, { signal });
    return runtime;
  })();
  try {
    return await runtimePromise;
  } catch (error) {
    runtimePromise = null;
    throw error;
  }
}

async function writeSource(runtime: FfmpegRuntime, file: File, inputName: string, signal?: AbortSignal) {
  assertNotAborted(signal);
  await runtime.writeFile(inputName, new Uint8Array(await file.arrayBuffer()), { signal });
}

async function probeFfmpeg(runtime: FfmpegRuntime, inputName: string, stream: "audio" | "media", signal?: AbortSignal) {
  const args = stream === "audio"
    ? ["-t", "1", "-i", inputName, "-map", "0:a:0", "-f", "null", "-"]
    : ["-t", "1", "-i", inputName, "-map", "0:v:0", "-map", "0:a?", "-f", "null", "-"];
  if (await runtime.exec(args, undefined, { signal }) !== 0) throw new MediaCompatibilityError("unsupported");
}

function temporaryName(file: File, suffix: string) {
  return `quran-source-${crypto.randomUUID()}${suffix}`;
}

export async function prepareLocalMedia(file: File, signal?: AbortSignal, onPreparing?: (state: "converting") => void): Promise<PreparedEditorMedia> {
  const inspection = await inspectLocalMedia(file);
  const route = routeMediaCompatibility(file.size, inspection);
  assertNotAborted(signal);
  if (route !== "full-normalization") {
    return { file, kind: inspection.kind, route, inspection, original: file };
  }

  onPreparing?.("converting");
  const runtime = await getFfmpeg(signal);
  const inputName = temporaryName(file, ".input");
  const audioOnly = inspection.kind === "audio";
  const outputName = temporaryName(file, audioOnly ? ".m4a" : ".mp4");
  try {
    await writeSource(runtime, file, inputName, signal);
    await probeFfmpeg(runtime, inputName, audioOnly ? "audio" : "media", signal);
    assertNotAborted(signal);
    const exitCode = await runtime.exec(audioOnly
      ? ["-i", inputName, "-map", "0:a:0", "-c:a", "aac", "-movflags", "+faststart", outputName]
      : ["-i", inputName, "-map", "0:v:0", "-map", "0:a?", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", outputName],
    undefined, { signal });
    if (exitCode !== 0) throw new MediaCompatibilityError("unsupported");
    const data = await runtime.readFile(outputName, undefined, { signal }) as Uint8Array;
    const normalizedBytes = new Uint8Array(data.byteLength);
    normalizedBytes.set(data);
    const normalized = new File([normalizedBytes.buffer], `${file.name.replace(/\.[^.]+$/u, "") || "recitation"}.${audioOnly ? "m4a" : "mp4"}`, { type: audioOnly ? "audio/mp4" : "video/mp4", lastModified: file.lastModified });
    return { file: normalized, kind: audioOnly ? "audio" : "video", route, inspection, original: file };
  } catch (error) {
    if (error instanceof MediaCompatibilityError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw compatibilityErrorFromUnknown(error, "unsupported");
  } finally {
    await Promise.allSettled([runtime.deleteFile(inputName, { signal }), runtime.deleteFile(outputName, { signal })]);
  }
}

/** Called only after Web Audio fails; the original playable video remains the editor source. */
export async function decodeRecognitionAudioFallback(file: File, signal?: AbortSignal): Promise<DecodedAudioChannels> {
  const inspection = await inspectLocalMedia(file);
  const route = routeMediaCompatibility(file.size, { ...inspection, nativeRecognitionAudio: false, browserPlayback: true });
  if (route !== "audio-fallback") throw new MediaCompatibilityError("unsupported");
  const runtime = await getFfmpeg(signal);
  const inputName = temporaryName(file, ".input");
  const outputName = temporaryName(file, ".f32");
  try {
    await writeSource(runtime, file, inputName, signal);
    await probeFfmpeg(runtime, inputName, "audio", signal);
    const exitCode = await runtime.exec([
      "-i", inputName, "-map", "0:a:0", "-ac", "1", "-ar", "16000", "-f", "f32le", "-acodec", "pcm_f32le", outputName,
    ], undefined, { signal });
    if (exitCode !== 0) throw new MediaCompatibilityError("unsupported");
    const bytes = await runtime.readFile(outputName, undefined, { signal }) as Uint8Array;
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return { sampleRate: 16_000, frameCount: bytes.byteLength / Float32Array.BYTES_PER_ELEMENT, channelBuffers: [copy.buffer] };
  } catch (error) {
    if (error instanceof MediaCompatibilityError || (error instanceof DOMException && error.name === "AbortError")) throw error;
    throw compatibilityErrorFromUnknown(error, "unsupported");
  } finally {
    await Promise.allSettled([runtime.deleteFile(inputName, { signal }), runtime.deleteFile(outputName, { signal })]);
  }
}

export function releaseLocalMediaRuntime() {
  void runtimePromise?.then((runtime) => runtime.terminate());
  runtimePromise = null;
}
