import { isEphemeralOpfsName } from "./ephemeral-opfs-file.ts";

const SERVICE_WORKER_URL = "/opfs-media-sw.js?v=3";
const SERVICE_WORKER_SCOPE = "/";
const MEDIA_PREFIX = "/_quran-video/opfs-media/";

export function opfsPlaybackUrl(name: string): string {
  if (!isEphemeralOpfsName(name)) {
    throw new Error("Refusing to expose a non-owned temporary media identifier.");
  }
  return `${MEDIA_PREFIX}${encodeURIComponent(name)}`;
}

export function requestOpfsPlaybackDeletion(name: string): void {
  if (!isEphemeralOpfsName(name)) return;
  navigator.serviceWorker?.controller?.postMessage({ type: "delete-opfs-media", name });
}

export function hasOpfsPlaybackFeatures(): boolean {
  return typeof window !== "undefined"
    && window.isSecureContext
    && "serviceWorker" in navigator
    && "storage" in navigator
    && typeof navigator.storage.getDirectory === "function"
    && typeof navigator.storage.estimate === "function"
    && typeof FileSystemFileHandle !== "undefined"
    && typeof FileSystemFileHandle.prototype.createWritable === "function";
}

export async function ensureOpfsPlaybackController(signal?: AbortSignal): Promise<void> {
  if (!hasOpfsPlaybackFeatures()) throw new Error("Temporary range playback is unavailable.");
  if (signal?.aborted) throw new DOMException("Media preparation cancelled.", "AbortError");
  const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
    scope: SERVICE_WORKER_SCOPE,
    updateViaCache: "none",
  });
  if (!registration.active) await navigator.serviceWorker.ready;
  const expectedScriptUrl = new URL(SERVICE_WORKER_URL, window.location.href).href;
  const hasCurrentController = () => navigator.serviceWorker.controller?.scriptURL === expectedScriptUrl;
  if (hasCurrentController()) return;
  registration.active?.postMessage("claim-opfs-media-clients");
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => finish(new Error("Timed out waiting for temporary range playback.")), 10_000);
    const onChange = () => {
      if (hasCurrentController()) finish();
    };
    const onAbort = () => finish(new DOMException("Media preparation cancelled.", "AbortError"));
    const finish = (error?: Error) => {
      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener("controllerchange", onChange);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error); else resolve();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onChange);
    signal?.addEventListener("abort", onAbort, { once: true });
    onChange();
  });
}
