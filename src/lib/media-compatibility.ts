import type { MediaKind } from "./editor/media.ts";

/** The fallback keeps the original 500 MB native-file allowance, but avoids duplicating large files in mobile RAM. */
export const MAX_LOCAL_FALLBACK_BYTES = 100 * 1024 * 1024;

export const MEDIA_COMPATIBILITY_ERRORS = {
  noAudio: "This video doesn't contain an audio track. Choose a recording where the recitation can be heard.",
  unreadable: "We couldn't read this recording. It may be damaged or incomplete. Try selecting the original file again.",
  protected: "This recording is protected and can't be processed in the browser. Try the original unprotected video from your Photos library.",
  unsupported: "We can't process this recording on this device yet. Try another copy of the video or export it from Photos and try again.",
  tooLarge: "This recording is too large to convert safely in your browser. Trim it to the part you want to caption and try again.",
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
  videoCodec?: string | null;
  audioCodec?: string | null;
};

export type MediaCompatibilityRoute = "native" | "audio-fallback" | "full-normalization";

/** Pure route selection keeps the safety and first-class Camera Roll policy testable without browser APIs. */
export function routeMediaCompatibility(fileSize: number, inspection: MediaInspection): MediaCompatibilityRoute {
  if (!inspection.readable) throw new MediaCompatibilityError("unreadable");
  if (!inspection.hasAudio) throw new MediaCompatibilityError("noAudio");
  if (inspection.browserPlayback && inspection.nativeRecognitionAudio) return "native";
  if (inspection.browserPlayback) {
    if (fileSize > MAX_LOCAL_FALLBACK_BYTES) throw new MediaCompatibilityError("tooLarge");
    return "audio-fallback";
  }
  if (fileSize > MAX_LOCAL_FALLBACK_BYTES) throw new MediaCompatibilityError("tooLarge");
  return "full-normalization";
}

export function mediaCompatibilityErrorMessage(error: unknown): string {
  if (error instanceof MediaCompatibilityError) return error.message;
  if (error instanceof DOMException && error.name === "AbortError") return "";
  return MEDIA_COMPATIBILITY_ERRORS.unsupported;
}

export function compatibilityErrorFromUnknown(error: unknown, fallback: MediaCompatibilityErrorCode): MediaCompatibilityError {
  const message = error instanceof Error ? error.message : "";
  return new MediaCompatibilityError(/\b(drm|encrypt(?:ed|ion)?|protected|cenc|cbcs)\b/iu.test(message) ? "protected" : fallback);
}
