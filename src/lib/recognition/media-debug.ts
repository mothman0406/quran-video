/** Production-safe local media compatibility trace, enabled only by ?debugMedia=1. */
export type MediaDebugFacts = Record<string, boolean | number | string | null | undefined>;

const MEDIA_DEBUG_SESSION_KEY = "quran-autocaption-debug-media";

export function mediaDebugEnabled(search?: string): boolean {
  const explicitSearch = search !== undefined;
  const candidate = search ?? (typeof window === "undefined" ? "" : window.location.search);
  const enabled = new URLSearchParams(candidate).get("debugMedia") === "1";
  if (explicitSearch || typeof window === "undefined") return enabled;
  try {
    if (enabled) sessionStorage.setItem(MEDIA_DEBUG_SESSION_KEY, "1");
    return enabled || sessionStorage.getItem(MEDIA_DEBUG_SESSION_KEY) === "1";
  } catch {
    return enabled;
  }
}

/** Do not add names, URLs, samples, identities, tokens, or raw FFmpeg messages here. */
export function mediaDebug(event: string, facts: MediaDebugFacts): void {
  if (!mediaDebugEnabled()) return;
  console.info("[Quran AutoCaption media]", { event, ...facts });
}

export function visibleFileExtension(name: string): string | null {
  const match = /\.([a-z0-9]{1,12})$/iu.exec(name);
  return match ? match[1]!.toLowerCase() : null;
}
