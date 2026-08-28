import { DEFAULT_TRANSLATION_KEY, parseVerseKey, preserveTranslationText } from "./content.ts";
import type { QuranTranslationMetadata } from "./content.ts";
import { getVerse } from "./local.ts";

export type TranslationId = "saheeh-international";
export type QuranTranslation = { text: string; metadata: QuranTranslationMetadata };

const QURANENC_BASE_URL = "https://quranenc.com/api/v1";
const CACHE_TTL_MS = 10 * 60 * 1000;
type CacheEntry<T> = { value: T; expiresAt: number };
type QuranEncAya = { sura?: number; aya?: number; translation?: string };
type QuranEncTranslation = { key?: string; version?: string; title?: string; language_iso_code?: string };

const surahCache = new Map<string, CacheEntry<Map<number, QuranEncAya>>>();
const surahRequests = new Map<string, Promise<Map<number, QuranEncAya>>>();
let metadataCache: CacheEntry<QuranEncTranslation[]> | null = null;
let metadataRequest: Promise<QuranEncTranslation[]> | null = null;

function sourceMetadata(version?: string): QuranTranslationMetadata {
  return { edition: "Saheeh International", source: "quranenc", translationKey: DEFAULT_TRANSLATION_KEY, ...(version ? { version } : {}) };
}

async function getMetadata(fetchImpl: typeof fetch): Promise<QuranEncTranslation[]> {
  if (metadataCache && metadataCache.expiresAt > Date.now()) return metadataCache.value;
  if (metadataRequest) return metadataRequest;
  metadataRequest = fetchImpl(`${QURANENC_BASE_URL}/translations/list/en?localization=en`)
    .then(async (response) => {
      if (!response.ok) throw new Error("QuranEnc translation metadata unavailable.");
      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) throw new Error("Invalid QuranEnc translation metadata.");
      const value = payload as QuranEncTranslation[];
      metadataCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
      return value;
    }).finally(() => { metadataRequest = null; });
  return metadataRequest;
}

async function getSurah(surahNumber: number, fetchImpl: typeof fetch): Promise<Map<number, QuranEncAya>> {
  const key = `${DEFAULT_TRANSLATION_KEY}:${surahNumber}`;
  const cached = surahCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = surahRequests.get(key);
  if (pending) return pending;
  const request = fetchImpl(`${QURANENC_BASE_URL}/translation/sura/${DEFAULT_TRANSLATION_KEY}/${surahNumber}`)
    .then(async (response) => {
      if (!response.ok) throw new Error("QuranEnc translation unavailable.");
      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) throw new Error("Invalid QuranEnc translation response.");
      const value = new Map((payload as QuranEncAya[]).filter((aya) => Number.isInteger(aya.aya)).map((aya) => [aya.aya!, aya]));
      surahCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
      return value;
    }).finally(() => { surahRequests.delete(key); });
  surahRequests.set(key, request);
  return request;
}

export function getVerseArabic(verseKey: string) {
  return getVerse(verseKey);
}

export async function getTranslation(verseKey: string, translationId: TranslationId = "saheeh-international", fetchImpl: typeof fetch = fetch): Promise<QuranTranslation | null> {
  const parsed = parseVerseKey(verseKey);
  if (!parsed || translationId !== "saheeh-international") return null;
  try {
    const [surah, metadata] = await Promise.all([getSurah(parsed.surahNumber, fetchImpl), getMetadata(fetchImpl).catch(() => [])]);
    const aya = surah.get(parsed.ayahNumber);
    const text = preserveTranslationText(aya?.translation);
    if (!text) return null;
    const version = metadata.find((item) => item.key === DEFAULT_TRANSLATION_KEY)?.version;
    return { text, metadata: sourceMetadata(version) };
  } catch {
    return null;
  }
}

export function clearTranslationCacheForTests() {
  surahCache.clear();
  surahRequests.clear();
  metadataCache = null;
  metadataRequest = null;
}
