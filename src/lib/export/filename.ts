import type { CaptionSegment } from "../editor/captions.ts";
import { getSurah } from "../quran/local.ts";
import type { OutputProfile } from "./output.ts";
import { exportQualityPreset, type ExportQuality } from "./quality.ts";

function safePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "project";
}

export function generateExportFileName(segments: readonly Pick<CaptionSegment, "verseKeys">[], profile: Pick<OutputProfile, "extension">, quality: ExportQuality): string {
  const keys = segments.flatMap((segment) => segment.verseKeys).filter((key) => /^\d{1,3}:\d{1,3}$/u.test(key));
  const first = keys[0]?.split(":").map(Number);
  const last = keys.at(-1)?.split(":").map(Number);
  if (!first || !last) return `quran-video${profile.extension}`;
  const firstSurah = getSurah(first[0]);
  const lastSurah = getSurah(last[0]);
  if (!firstSurah || !lastSurah) return `quran-video${profile.extension}`;
  const range = first[0] === last[0]
    ? `${firstSurah.transliteration}-${first[1]}${first[1] === last[1] ? "" : `-${last[1]}`}`
    : `${firstSurah.transliteration}-${first[1]}-${lastSurah.transliteration}-${last[1]}`;
  return `${safePart(`${range}-${exportQualityPreset(quality).resolutionLabel}`)}${profile.extension}`;
}
