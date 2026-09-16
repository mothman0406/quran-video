/** Production-safe local diagnostics, enabled only by ?debugMedia=1. */
export type MediaDebugValue = boolean | number | string | null | undefined | readonly MediaDebugValue[] | { readonly [key: string]: MediaDebugValue };
export type MediaDebugFacts = Record<string, MediaDebugValue>;

const MEDIA_DEBUG_SESSION_KEY = "quran-autocaption-debug-media";
const DEBUG_PREFIX = "[Quran AutoCaption debug]";
const BUILD_COMMIT = process.env.NEXT_PUBLIC_QURAN_BUILD_COMMIT || "local-development";
let buildMarkerEmitted = false;

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

function jsonSafe(value: unknown, seen: Set<object>, depth = 0): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value === undefined) return undefined;
  if (ArrayBuffer.isView(value)) return `[omitted typed array: ${value.byteLength} bytes]`;
  if (value instanceof ArrayBuffer) return `[omitted array buffer: ${value.byteLength} bytes]`;
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[omitted circular reference]";
  if (depth >= 8) return "[omitted deep value]";
  seen.add(value);
  if (Array.isArray(value)) {
    const limit = 100;
    const result = value.slice(0, limit).map((item) => jsonSafe(item, seen, depth + 1));
    if (value.length > limit) result.push(`[omitted ${value.length - limit} array items]`);
    seen.delete(value);
    return result;
  }
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const normalized = jsonSafe((value as Record<string, unknown>)[key], seen, depth + 1);
    if (normalized !== undefined) result[key] = normalized;
  }
  seen.delete(value);
  return result;
}

/** Stable, single-line output remains intact when copied from browser DevTools. */
export function serializeMediaDebugLine(event: string, facts: Record<string, unknown>): string {
  return `${DEBUG_PREFIX} ${event} ${JSON.stringify(jsonSafe(facts, new Set()))}`;
}

/** Do not add names, URLs, samples, identities, tokens, or raw runtime messages here. */
export function mediaDebug(event: string, facts: MediaDebugFacts): void {
  if (!mediaDebugEnabled()) return;
  if (!buildMarkerEmitted) {
    buildMarkerEmitted = true;
    console.info(serializeMediaDebugLine("build-marker", { buildCommit: BUILD_COMMIT }));
  }
  console.info(serializeMediaDebugLine(event, facts));
}

export function visibleFileExtension(name: string): string | null {
  const match = /\.([a-z0-9]{1,12})$/iu.exec(name);
  return match ? match[1]!.toLowerCase() : null;
}
