import type { CompletedExport } from "../export/types.ts";
import { exportQualityPreset, type ExportQuality } from "../export/quality.ts";
import type { TikTokMediaDescriptor, TikTokUploadPlan } from "./types";

export const TIKTOK_MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024;
export const TIKTOK_MAX_VIDEO_DURATION_SECONDS = 10 * 60;
const MIN_CHUNK_BYTES = 5 * 1024 * 1024;
const DEFAULT_CHUNK_BYTES = 10 * 1024 * 1024;
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

/** TikTok content cannot carry Quran Video's Basic product watermark. */
export function isTikTokExportEligible(quality: ExportQuality): boolean {
  return !exportQualityPreset(quality).watermarkRequired;
}

export function tiktokMediaDescriptor(exported: CompletedExport): TikTokMediaDescriptor {
  const codec = exported.diagnostics.outputVideoCodec === "avc" ? "avc" : exported.diagnostics.outputVideoCodec === "vp9" ? "vp9" : null;
  return {
    mimeType: exported.mimeType.split(";", 1)[0] || "video/mp4",
    fileSizeBytes: exported.fileSizeBytes,
    width: exported.width,
    height: exported.height,
    durationSeconds: exported.outputDurationSeconds,
    fps: exported.diagnostics.targetFps,
    videoCodec: codec,
  };
}

/** Current Content Posting video restrictions, centralized for UI and server validation. */
export function validateTikTokMedia(media: TikTokMediaDescriptor, creatorMaxDurationSeconds?: number): string[] {
  const errors: string[] = [];
  if (!new Set(["video/mp4", "video/quicktime", "video/webm"]).has(media.mimeType)) errors.push("TikTok supports MP4, MOV, and WebM video files.");
  if (media.videoCodec && !new Set(["avc", "hevc", "vp8", "vp9"]).has(media.videoCodec)) errors.push("This video's codec is not supported by TikTok.");
  if (media.fps < 23 || media.fps > 60) errors.push("TikTok requires a frame rate between 23 and 60 FPS.");
  if (media.width < 360 || media.height < 360 || media.width > 4096 || media.height > 4096) errors.push("TikTok requires both video dimensions to be between 360 and 4096 pixels.");
  const maximumDuration = Math.min(TIKTOK_MAX_VIDEO_DURATION_SECONDS, creatorMaxDurationSeconds ?? TIKTOK_MAX_VIDEO_DURATION_SECONDS);
  if (media.durationSeconds > maximumDuration) errors.push(`This video is longer than this TikTok account's ${Math.floor(maximumDuration / 60)} minute posting limit.`);
  if (media.fileSizeBytes > TIKTOK_MAX_VIDEO_BYTES) errors.push("TikTok video uploads cannot exceed 4 GB.");
  return errors;
}

/** Builds the documented sequential FILE_UPLOAD plan without arbitrary single-request assumptions. */
export function createTikTokUploadPlan(fileSizeBytes: number): TikTokUploadPlan {
  if (!Number.isSafeInteger(fileSizeBytes) || fileSizeBytes <= 0) throw new Error("A non-empty completed export is required.");
  if (fileSizeBytes < MIN_CHUNK_BYTES) return { chunkSize: fileSizeBytes, totalChunkCount: 1 };
  if (fileSizeBytes <= MAX_CHUNK_BYTES) return { chunkSize: fileSizeBytes, totalChunkCount: 1 };
  const totalChunkCount = Math.floor(fileSizeBytes / DEFAULT_CHUNK_BYTES);
  return { chunkSize: DEFAULT_CHUNK_BYTES, totalChunkCount: Math.max(1, totalChunkCount) };
}

export function tiktokUploadChunks(blob: Blob, plan: TikTokUploadPlan) {
  const chunks: Array<{ start: number; end: number; blob: Blob }> = [];
  for (let start = 0; start < blob.size;) {
    const remaining = blob.size - start;
    const expectedRemainingChunks = plan.totalChunkCount - chunks.length;
    const size = expectedRemainingChunks <= 1 ? remaining : Math.min(plan.chunkSize, remaining);
    const end = start + size;
    chunks.push({ start, end, blob: blob.slice(start, end) });
    start = end;
  }
  return chunks;
}
