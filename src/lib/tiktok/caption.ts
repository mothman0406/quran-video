import { getSurah } from "../quran/local.ts";
import type { QuranContentResponse } from "../quran/content.ts";
import type { CaptionSegment } from "../editor/captions.ts";

const HASHTAGS = "#quran #quranrecitation #tilawah #islam #muslim";

function excerpt(value: string): string {
  const compact = value.replace(/\s+/gu, " ").trim();
  if (compact.length <= 180) return compact;
  const cut = compact.slice(0, 177).replace(/\s+\S*$/u, "").trim();
  return `${cut}…`;
}

/** Deterministic, local social copy. It reads the selected canonical translation but never writes project content. */
export function createTikTokCaption(segments: readonly CaptionSegment[], content: Readonly<Record<string, QuranContentResponse>>): string {
  const verseKeys = [...new Set(segments.flatMap((segment) => segment.verseKeys))];
  const first = verseKeys[0];
  if (!first) return HASHTAGS;
  const [surahValue, startValue] = first.split(":");
  const last = verseKeys.at(-1) ?? first;
  const [, endValue] = last.split(":");
  const surah = getSurah(Number(surahValue));
  const range = startValue === endValue ? startValue : `${startValue}–${endValue}`;
  const heading = surah ? `Surah ${surah.transliteration} ${range} · ${surah.name} 🤍` : "Quran recitation 🤍";
  const translation = content[first];
  const quote = translation?.status === "ready" && translation.verse.translation ? `\n\n“${excerpt(translation.verse.translation)}”` : "";
  return `${heading}${quote}\n\n${HASHTAGS}`;
}
