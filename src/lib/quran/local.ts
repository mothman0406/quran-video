import corpus from "./hafs-corpus.json" with { type: "json" };
import { buildVerseContent, parseVerseKey } from "./content.ts";
import type { QuranScript, QuranVerseContent } from "./content.ts";

type CorpusSurah = {
  id: number;
  name: string;
  transliteration: string;
  type: string;
  total_verses: number;
  verses: Array<{ id: number; text: string }>;
};

export type QuranSurah = {
  number: number;
  name: string;
  transliteration: string;
  revelationType: string;
  verseCount: number;
};

const surahs = corpus as CorpusSurah[];
const verseIndex = new Map<string, QuranVerseContent>();

for (const surah of surahs) {
  for (const verse of surah.verses) {
    const content = buildVerseContent({ verseKey: `${surah.id}:${verse.id}`, textUthmani: verse.text });
    verseIndex.set(content.verseKey, {
      ...content,
      source: "local-tanzil",
      compatibleScripts: ["uthmani", "kfgqpc"] satisfies readonly QuranScript[],
    });
  }
}

export const LOCAL_SURAH_COUNT = 114;
export const LOCAL_VERSE_COUNT = 6236;

export function getVerse(verseKey: string): QuranVerseContent | null {
  if (!parseVerseKey(verseKey)) return null;
  return verseIndex.get(verseKey) ?? null;
}

export function getVerses(startVerseKey: string, endVerseKey = startVerseKey): QuranVerseContent[] {
  const start = parseVerseKey(startVerseKey);
  const end = parseVerseKey(endVerseKey);
  if (!start || !end || start.surahNumber !== end.surahNumber || start.ayahNumber > end.ayahNumber) return [];
  const verses: QuranVerseContent[] = [];
  for (let ayah = start.ayahNumber; ayah <= end.ayahNumber; ayah += 1) {
    const verse = getVerse(`${start.surahNumber}:${ayah}`);
    if (!verse) return [];
    verses.push(verse);
  }
  return verses;
}

export function getSurah(number: number): QuranSurah | null {
  const surah = surahs.find((item) => item.id === number);
  return surah ? { number: surah.id, name: surah.name, transliteration: surah.transliteration, revelationType: surah.type, verseCount: surah.total_verses } : null;
}

export function getLocalQuranContent(verseKey: string) {
  const verse = getVerse(verseKey);
  return verse ? { status: "ready" as const, verse } : { status: "error" as const, message: "The requested Quran verse was not found." };
}
