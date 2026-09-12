import type { MediaKind } from "./editor/media.ts";

/**
 * Full H.264 normalization keeps an encoded output in WASM memory before it
 * becomes a browser File. These limits protect that operation only; they do
 * not apply to native playback or recognition-only audio extraction.
 */
export const MAX_FULL_NORMALIZATION_BYTES = 250 * 1024 * 1024;
export const MAX_FULL_NORMALIZATION_DURATION_MS = 15 * 60 * 1_000;
export const MAX_FULL_NORMALIZATION_PIXELS = 3_840 * 2_160;

/** 16 kHz mono f32 recognition PCM uses 64 bytes per millisecond. */
export const MAX_RECOGNITION_PCM_BYTES = 256 * 1024 * 1024;

export const MEDIA_COMPATIBILITY_ERRORS = {
  noAudio: "This video doesn't contain an audio track. Choose a recording where the recitation can be heard.",
  unreadable: "We couldn't read this recording. It may be damaged or incomplete. Try selecting the original file again.",
  containerOpen: "We couldn't read this recording. It may be damaged or incomplete. Try selecting the original file again.",
  protected: "This recording is protected and can't be processed in the browser. Try the original unprotected video from your Photos library.",
  runtimeLoad: "We couldn't prepare this recording on this device. Try refreshing the page and selecting it again.",
  workerfsMount: "We couldn't prepare this recording on this device. Try refreshing the page and selecting it again.",
  audioDecoderUnavailable: "We found audio in this recording, but this device can't decode its audio format yet. Try exporting another copy of the recording and selecting it again.",
  audioDecodeFailed: "We found audio in this recording, but this device couldn't decode it locally. Try exporting another copy of the recording and selecting it again.",
  pcmExtractionFailed: "We couldn't prepare this recording's audio on this device. Try refreshing the page and selecting it again.",
  resource: "This device ran out of resources while preparing the recording. Try trimming it and selecting it again.",
  fullNormalizationTooLarge: "This recording needs more conversion than this browser can safely handle. Try trimming it to the part you want to caption, or choose a smaller copy.",
  recognitionAudioTooLarge: "This recording's audio is too long for this browser to prepare safely. Try trimming it to the part you want to caption, or choose a shorter copy.",
} as const;

export type MediaCompatibilityErrorCode = keyof typeof MEDIA_COMPATIBILITY_ERRORS;

export class MediaCompatibilityError extends Error {
  readonly code: MediaCompatibilityErrorCode;

  constructor(code: MediaCompatibilityErrorCode) {
    super(MEDIA_COMPATIBILITY_ERRORS[code]);
    this.name = "MediaCompatibilityError";
    this.code = code;
  }
}

export type MediaInspection = {
  readable: boolean;
  kind: MediaKind;
  hasVideo: boolean;
  hasAudio: boolean;
  browserPlayback: boolean;
  nativeRecognitionAudio: boolean;
  durationMs?: number;
  width?: number;
  height?: number;
  videoCodec?: string | null;
  audioCodec?: string | null;
  audioStreamCount?: number;
  audioSampleRate?: number;
  audioChannels?: number;
};

export type MediaCompatibilityRoute = "native" | "audio-fallback" | "full-normalization";

export function recognitionPcmBytes(durationMs?: number): number {
  return Math.max(0, Math.round(durationMs ?? 0)) * 16_000 * Float32Array.BYTES_PER_ELEMENT / 1_000;
}

export function canSafelyNormalizeFullVideo(fileSize: number, inspection: MediaInspection): boolean {
  const pixels = Math.max(0, inspection.width ?? 0) * Math.max(0, inspection.height ?? 0);
  return fileSize <= MAX_FULL_NORMALIZATION_BYTES
    && (inspection.durationMs == null || inspection.durationMs <= MAX_FULL_NORMALIZATION_DURATION_MS)
    && pixels <= MAX_FULL_NORMALIZATION_PIXELS;
}

/** Pure route selection keeps the safety and first-class Camera Roll policy testable without browser APIs. */
export function routeMediaCompatibility(fileSize: number, inspection: MediaInspection): MediaCompatibilityRoute {
  if (!inspection.readable) throw new MediaCompatibilityError("unreadable");
  if (!inspection.hasAudio) throw new MediaCompatibilityError("noAudio");
  if (inspection.browserPlayback && inspection.nativeRecognitionAudio) return "native";
  if (inspection.browserPlayback) {
    if (recognitionPcmBytes(inspection.durationMs) > MAX_RECOGNITION_PCM_BYTES) throw new MediaCompatibilityError("recognitionAudioTooLarge");
    return "audio-fallback";
  }
  if (!canSafelyNormalizeFullVideo(fileSize, inspection)) throw new MediaCompatibilityError("fullNormalizationTooLarge");
  return "full-normalization";
}

export function mediaCompatibilityErrorMessage(error: unknown): string {
  if (error instanceof MediaCompatibilityError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") return "";
  return MEDIA_COMPATIBILITY_ERRORS.runtimeLoad;
}

export function compatibilityErrorFromUnknown(error: unknown, fallback: MediaCompatibilityErrorCode): MediaCompatibilityError {
  const message = error instanceof Error ? error.message : "";
  return new MediaCompatibilityError(/\b(drm|encrypt(?:ed|ion)?|protected|cenc|cbcs)\b/iu.test(message) ? "protected" : fallback);
}
