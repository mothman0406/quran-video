import type { TikTokPublishStatus } from "./types";

/** TikTok allows 30 status calls/minute per user token; this stays comfortably below that limit. */
export const TIKTOK_STATUS_POLL_INTERVAL_MS = 2_500;

export function isTikTokStatusFinal(status: TikTokPublishStatus): boolean {
  return status.status === "PUBLISH_COMPLETE" || status.status === "SEND_TO_USER_INBOX" || status.status === "FAILED";
}

export function tiktokStatusMessage(status: TikTokPublishStatus): string {
  if (status.status === "PUBLISH_COMPLETE") return "Posted to TikTok";
  if (status.status === "SEND_TO_USER_INBOX") return "Sent to TikTok. Open TikTok to finish editing and publish.";
  if (status.status === "FAILED") return status.failureReason ? `TikTok could not process this video (${status.failureReason.replace(/_/gu, " ")}).` : "TikTok could not process this video.";
  return status.status === "PROCESSING_UPLOAD" ? "Uploading to TikTok" : "Processing on TikTok";
}
