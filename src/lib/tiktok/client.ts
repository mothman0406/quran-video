import { tiktokUploadChunks } from "./media";
import type { TikTokConnectionState, TikTokCreatorInfo, TikTokInitRequest, TikTokPostInitialization, TikTokPublishStatus, TikTokUploadPlan } from "./types";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, credentials: "same-origin" });
  const body = await response.json().catch(() => ({})) as T & { message?: string };
  if (!response.ok) throw new Error(body.message || "TikTok is unavailable.");
  return body;
}

export const getTikTokConnection = () => api<TikTokConnectionState>("/api/tiktok/connection");
export const getTikTokCreatorInfo = () => api<TikTokCreatorInfo>("/api/tiktok/creator-info", { method: "POST" });
export const initializeTikTokPost = (request: TikTokInitRequest) => api<TikTokPostInitialization>("/api/tiktok/post/init", { method: "POST", body: JSON.stringify(request) });
export const getTikTokPostStatus = (publishId: string) => api<TikTokPublishStatus>("/api/tiktok/post/status", { method: "POST", body: JSON.stringify({ publishId }) });
export const cancelTikTokPost = (publishId: string) => api<{ cancelled: boolean }>("/api/tiktok/post/cancel", { method: "POST", body: JSON.stringify({ publishId }) });

export function connectTikTokOAuth(): Promise<void> {
  return new Promise((resolve, reject) => {
    const popup = window.open("/api/tiktok/oauth/start", "quran-video-tiktok-oauth", "popup,width=540,height=720");
    if (!popup) { reject(new Error("Your browser blocked the TikTok connection window. Allow pop-ups and try again.")); return; }
    const timeout = window.setTimeout(() => finish(new Error("TikTok connection timed out. Please try again.")), 10 * 60 * 1000);
    const poll = window.setInterval(() => { if (popup.closed) finish(new Error("TikTok connection was closed before it completed.")); }, 500);
    function onMessage(event: MessageEvent<unknown>) {
      if (event.origin !== window.location.origin || !event.data || typeof event.data !== "object") return;
      const data = event.data as { type?: string; success?: boolean; message?: string };
      if (data.type !== "quran-video:tiktok-oauth") return;
      finish(data.success ? undefined : new Error(data.message || "TikTok connection failed."));
    }
    function finish(error?: Error) { window.clearTimeout(timeout); window.clearInterval(poll); window.removeEventListener("message", onMessage); if (error) reject(error); else resolve(); }
    window.addEventListener("message", onMessage);
  });
}

/** Direct browser-to-TikTok FILE_UPLOAD transfer; completed video bytes never touch our server. */
export async function uploadTikTokVideo(uploadUrl: string, blob: Blob, mimeType: string, plan: TikTokUploadPlan, onProgress: (uploadedBytes: number) => void, signal?: AbortSignal): Promise<void> {
  let uploaded = 0;
  for (const chunk of tiktokUploadChunks(blob, plan)) {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const abort = () => { xhr.abort(); reject(new DOMException("Upload cancelled", "AbortError")); };
      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Content-Type", mimeType);
      xhr.setRequestHeader("Content-Range", `bytes ${chunk.start}-${chunk.end - 1}/${blob.size}`);
      xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(uploaded + event.loaded); };
      xhr.onload = () => { signal?.removeEventListener("abort", abort); if (xhr.status === 201 || xhr.status === 206) { uploaded = chunk.end; onProgress(uploaded); resolve(); } else reject(new Error(xhr.status === 403 ? "TikTok's upload link expired. Reconfirm the post to start a new upload." : `TikTok rejected this upload chunk (${xhr.status}).`)); };
      xhr.onerror = () => { signal?.removeEventListener("abort", abort); reject(new Error("The connection to TikTok was interrupted. You can retry this export without rerendering.")); };
      xhr.onabort = () => { signal?.removeEventListener("abort", abort); reject(new DOMException("Upload cancelled", "AbortError")); };
      signal?.addEventListener("abort", abort, { once: true });
      xhr.send(chunk.blob);
    });
  }
}
