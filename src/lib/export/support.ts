import type { LocalExportSupport } from "./types.ts";

/** Browser-only capability check that deliberately does not import Mediabunny. */
export function offlineWebCodecsSupport(): LocalExportSupport {
  if (typeof window === "undefined") return { supported: false, path: "Offline WebCodecs", reason: "Local export is available only in a browser." };
  if (typeof VideoEncoder === "undefined" || typeof VideoDecoder === "undefined") return { supported: false, path: "Offline WebCodecs", reason: "This browser needs WebCodecs video decoding and encoding for deterministic local export." };
  return { supported: true, path: "Offline WebCodecs", reason: "Frames and source audio are read directly from the local file; export does not play in real time." };
}
