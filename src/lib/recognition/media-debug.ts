/** Production-safe local media compatibility trace, enabled only by ?debugMedia=1. */
export type MediaDebugFacts = Record<string, boolean | number | string | null | undefined>;

export function mediaDebugEnabled(search = typeof window === "undefined" ? "" : window.location.search): boolean {
  return new URLSearchParams(search).get("debugMedia") === "1";
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
