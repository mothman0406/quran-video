export const DEFAULT_TRANSLATION_ID = 20;
export const TRANSLITERATION_ID = 57;

export const quranScriptValues = [
  "uthmani",
  "madinah-qcf",
  "indopak",
  "kfgqpc",
] as const;

export type QuranScript = (typeof quranScriptValues)[number];

export type QuranFontDefinition = {
  label: string;
  family: string;
  source: string;
  mode: "unicode" | "page";
  fallbackFamily: string;
};

const QURAN_FONT_CDN = "https://verses.quran.foundation/fonts/quran/hafs";

export const quranFontDefinitions: Record<QuranScript, QuranFontDefinition> = {
  uthmani: {
    label: "Uthmani / QPC Hafs",
    family: "UthmanicHafs",
    source: `${QURAN_FONT_CDN}/uthmanic_hafs/UthmanicHafs1Ver18.woff2`,
    mode: "unicode",
    fallbackFamily: "serif",
  },
  "madinah-qcf": {
    label: "Madinah / QCF",
    family: "QCFHafs",
    source: `${QURAN_FONT_CDN}/v2/woff2/p{page}.woff2`,
    mode: "page",
    fallbackFamily: "UthmanicHafs, serif",
  },
  indopak: {
    label: "IndoPak",
    family: "IndoPakHafs",
    source: `${QURAN_FONT_CDN}/nastaleeq/indopak/indopak-nastaleeq-waqf-lazim-v4.2.1.woff2`,
    mode: "unicode",
    fallbackFamily: "serif",
  },
  kfgqpc: {
    label: "KFGQPC style",
    family: "KFGQPCHafs",
    source: `${QURAN_FONT_CDN}/uthmanic_hafs/UthmanicHafs1Ver18.woff2`,
    mode: "unicode",
    fallbackFamily: "serif",
  },
};

export type QuranVerseContent = {
  verseKey: string;
  surahNumber: number;
  ayahNumber: number;
  pageNumber: number | null;
  arabic: Record<QuranScript, string>;
  translation: string | null;
  transliteration: string | null;
  font: QuranFontDefinition;
  translationEdition: "Saheeh International";
};

export type QuranContentResponse =
  | { status: "ready"; verse: QuranVerseContent }
  | { status: "setup_required"; message: string }
  | { status: "error"; message: string };

export function isQuranScript(value: string): value is QuranScript {
  return (quranScriptValues as readonly string[]).includes(value);
}

export function parseVerseKey(value: string): { surahNumber: number; ayahNumber: number } | null {
  const match = /^(\d{1,3}):(\d{1,3})$/.exec(value);
  if (!match) return null;

  const surahNumber = Number(match[1]);
  const ayahNumber = Number(match[2]);
  if (surahNumber < 1 || surahNumber > 114 || ayahNumber < 1) return null;
  return { surahNumber, ayahNumber };
}

export function stripTranslationMarkup(value: string | null | undefined): string | null {
  if (!value) return null;
  const withoutTags = value.replace(/<[^>]*>/g, "");
  return withoutTags.replace(/&amp;/g, "&").replace(/&quot;/g, '"').trim() || null;
}

export function buildVerseContent(input: {
  verseKey: string;
  pageNumber?: number | null;
  textUthmani?: string | null;
  textQpcHafs?: string | null;
  textIndopak?: string | null;
  translation?: string | null;
  transliteration?: string | null;
}): QuranVerseContent {
  const parsed = parseVerseKey(input.verseKey);
  if (!parsed) throw new Error("Invalid Quran verse key");

  const fallback = input.textQpcHafs ?? input.textUthmani ?? input.textIndopak ?? "";
  return {
    verseKey: input.verseKey,
    ...parsed,
    pageNumber: input.pageNumber ?? null,
    arabic: {
      uthmani: input.textUthmani ?? fallback,
      "madinah-qcf": input.textQpcHafs ?? fallback,
      indopak: input.textIndopak ?? fallback,
      kfgqpc: input.textQpcHafs ?? fallback,
    },
    translation: stripTranslationMarkup(input.translation),
    transliteration: stripTranslationMarkup(input.transliteration),
    font: quranFontDefinitions.uthmani,
    translationEdition: "Saheeh International",
  };
}
