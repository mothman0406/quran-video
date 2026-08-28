import type { LocalExportSupport } from "./types.ts";

const MIME_CANDIDATES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"];

export function canvasMediaRecorderSupport(): LocalExportSupport {
  if (typeof window === "undefined") return { supported: false, path: "Canvas + MediaRecorder", reason: "Local export is available only in a browser." };
  if (typeof HTMLCanvasElement === "undefined" || !HTMLCanvasElement.prototype.captureStream) return { supported: false, path: "Canvas + MediaRecorder", reason: "This browser cannot capture rendered canvas frames." };
  if (typeof AudioContext === "undefined") return { supported: false, path: "Canvas + MediaRecorder", reason: "This browser cannot preserve the source audio for local export." };
  if (typeof MediaRecorder === "undefined") return { supported: false, path: "Canvas + MediaRecorder", reason: "This browser has no local media recorder." };
  const mimeType = MIME_CANDIDATES.find((value) => MediaRecorder.isTypeSupported(value));
  return mimeType ? { supported: true, path: "Canvas + MediaRecorder", reason: "Exports locally as WebM with the original audio.", mimeType } : { supported: false, path: "Canvas + MediaRecorder", reason: "This browser has no supported local WebM recorder." };
}
