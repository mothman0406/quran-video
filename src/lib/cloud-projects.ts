import { getSurah } from "./quran/local.ts";
import type { SavedProject } from "./schemas/project.ts";

export const PROJECT_MEDIA_BUCKET = "project-media";
export const FREE_CLOUD_PROJECT_LIMIT = 3;

export type QuranProjectMetadata = {
  autoTitle: string;
  passageLabel: string | null;
  surahStart: number | null;
  ayahStart: number | null;
  surahEnd: number | null;
  ayahEnd: number | null;
};

function firstAndLastVerse(project: SavedProject) {
  const keys = project.captionSegments.flatMap((segment) => segment.verseKeys);
  const parse = (key: string) => {
    const match = /^(\d{1,3}):(\d{1,3})$/.exec(key);
    return match ? { surah: Number(match[1]), ayah: Number(match[2]) } : null;
  };
  const verses = keys.map(parse).filter((value): value is { surah: number; ayah: number } => Boolean(value));
  return verses.length ? { start: verses[0], end: verses.at(-1)! } : null;
}

/** Deterministic, canonical Quran metadata—never generated from editable Arabic text. */
export function quranProjectMetadata(project: SavedProject): QuranProjectMetadata {
  const range = firstAndLastVerse(project);
  if (!range) return { autoTitle: "Untitled Quran Project", passageLabel: null, surahStart: null, ayahStart: null, surahEnd: null, ayahEnd: null };
  const startSurah = getSurah(range.start.surah);
  const endSurah = getSurah(range.end.surah);
  if (!startSurah || !endSurah) return { autoTitle: "Untitled Quran Project", passageLabel: null, surahStart: null, ayahStart: null, surahEnd: null, ayahEnd: null };
  const sameSurah = range.start.surah === range.end.surah;
  const rangeText = sameSurah
    ? `${startSurah.transliteration} ${range.start.ayah}${range.start.ayah === range.end.ayah ? "" : `–${range.end.ayah}`}`
    : `${startSurah.transliteration} ${range.start.ayah}–${endSurah.transliteration} ${range.end.ayah}`;
  const passageLabel = sameSurah
    ? `Surah ${startSurah.transliteration} · ${range.start.surah}:${range.start.ayah}${range.start.ayah === range.end.ayah ? "" : `–${range.end.ayah}`}`
    : `Surah ${startSurah.transliteration} ${range.start.surah}:${range.start.ayah} – ${endSurah.transliteration} ${range.end.surah}:${range.end.ayah}`;
  return { autoTitle: rangeText, passageLabel, surahStart: range.start.surah, ayahStart: range.start.ayah, surahEnd: range.end.surah, ayahEnd: range.end.ayah };
}

export function cloudProjectName(project: SavedProject): string {
  const requested = project.title.trim();
  return requested && requested !== "Untitled project" ? requested.slice(0, 200) : quranProjectMetadata(project).autoTitle;
}

export function projectMediaPath(userId: string, projectId: string, kind: "source" | "thumbnail", extension: string, nonce = crypto.randomUUID()): string {
  const safeExtension = extension.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || (kind === "thumbnail" ? "webp" : "bin");
  return `${userId}/${projectId}/${kind}-${nonce}.${safeExtension}`;
}

export function mediaExtension(file: Pick<File, "name" | "type">): string {
  const byName = file.name.split(".").at(-1)?.trim();
  if (byName && /^[a-z0-9]{1,10}$/i.test(byName)) return byName;
  const byMime = file.type.split("/").at(-1)?.replace(/[^a-z0-9]/gi, "");
  return byMime || "bin";
}
