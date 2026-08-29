import type { CaptionSegment } from "../editor/captions.ts";
import type { OutputProfile } from "./output.ts";

function safePart(value: string): string {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "project";
}

export function generateExportFileName(sourceName: string, segments: readonly Pick<CaptionSegment, "verseKeys">[], profile: Pick<OutputProfile, "extension">): string {
  const keys = segments.flatMap((segment) => segment.verseKeys).filter((key) => /^\d{1,3}:\d{1,3}$/u.test(key));
  const first = keys[0]?.replace(":", "-");
  const last = keys.at(-1)?.replace(":", "-");
  const base = first ? `quran-video-${first}${last && last !== first ? `-${last}` : ""}` : safePart(sourceName.replace(/\.[^.]+$/u, ""));
  return `${safePart(base)}${profile.extension}`;
}
