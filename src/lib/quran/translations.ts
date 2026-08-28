import { DEFAULT_TRANSLATION_KEY, parseVerseKey, preserveTranslationText } from "./content.ts";
import type { QuranTranslationMetadata } from "./content.ts";
import { getVerse } from "./local.ts";

export type TranslationId = "saheeh-international";
export type QuranTranslation = { text: string; metadata: QuranTranslationMetadata };

const QURANENC_BASE_URL = "https://quranenc.com/api/v1";
const CACHE_TTL_MS = 10 * 60 * 1000;
type CacheEntry<T> = { value: T; expiresAt: number };
type QuranEncAya = { sura?: number | string; aya?: number | string; translation?: string };
type QuranEncTranslation = { key?: string; version?: string; title?: string; language_iso_code?: string };
type QuranEncSurahResponse = { result?: QuranEncAya[] };
type QuranEncMetadataResponse = { translations?: QuranEncTranslation[] };

const surahCache = new Map<string, CacheEntry<Map<number, QuranEncAya>>>();
const surahRequests = new Map<string, Promise<Map<number, QuranEncAya>>>();
let metadataCache: CacheEntry<QuranEncTranslation[]> | null = null;
let metadataRequest: Promise<QuranEncTranslation[]> | null = null;

function sourceMetadata(version?: string): QuranTranslationMetadata {
  return { edition: "Saheeh International", source: "quranenc", translationKey: DEFAULT_TRANSLATION_KEY, ...(version ? { version } : {}) };
}

function translationDebug(event: string, details: Record<string, string | number | boolean | undefined>) {
  if (process.env.QURAN_TRANSLATION_DEBUG === "1") console.debug(`[quran-translation] ${event}`, details);
}

async function getMetadata(fetchImpl: typeof fetch): Promise<QuranEncTranslation[]> {
  if (metadataCache && metadataCache.expiresAt > Date.now()) return metadataCache.value;
  if (metadataRequest) return metadataRequest;
  metadataRequest = fetchImpl(`${QURANENC_BASE_URL}/translations/list/en?localization=en`)
    .then(async (response) => {
      translationDebug("metadata-response", { status: response.status });
      if (!response.ok) throw new Error("QuranEnc translation metadata unavailable.");
      const payload = (await response.json()) as unknown;
      const value = (payload as QuranEncMetadataResponse).translations;
      if (!Array.isArray(value)) throw new Error("Invalid QuranEnc translation metadata.");
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
      translationDebug("surah-response", { surahNumber, status: response.status });
      if (!response.ok) throw new Error("QuranEnc translation unavailable.");
      const payload = (await response.json()) as unknown;
      const rows = (payload as QuranEncSurahResponse).result;
      if (!Array.isArray(rows)) throw new Error("Invalid QuranEnc translation response.");
      const value = new Map(rows.flatMap((aya) => {
        const ayahNumber = Number(aya.aya);
        return Number.isInteger(ayahNumber) ? [[ayahNumber, aya] as const] : [];
      }));
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
    translationDebug("verse-result", { verseKey, provider: "quranenc", parsed: Boolean(text), reason: text ? undefined : "translation text missing" });
    if (!text) return null;
    const version = metadata.find((item) => item.key === DEFAULT_TRANSLATION_KEY)?.version;
    return { text, metadata: sourceMetadata(version) };
  } catch (error) {
    translationDebug("failure", { verseKey, provider: "quranenc", reason: error instanceof Error ? error.message : "unknown error" });
    return null;
  }
}

export function clearTranslationCacheForTests() {
  surahCache.clear();
  surahRequests.clear();
  metadataCache = null;
  metadataRequest = null;
}
