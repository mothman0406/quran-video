import {
  buildVerseContent,
  DEFAULT_TRANSLATION_ID,
  parseVerseKey,
  TRANSLITERATION_ID,
} from "./content";
import type { QuranContentResponse } from "./content";

const API_BASE_BY_ENV = {
  prelive: "https://apis-prelive.quran.foundation",
  production: "https://apis.quran.foundation",
} as const;

type TokenCache = { accessToken: string; expiresAt: number };
let tokenCache: TokenCache | null = null;
let tokenRequest: Promise<string> | null = null;

function getConfiguration() {
  const clientId = process.env.QF_CLIENT_ID;
  const clientSecret = process.env.QF_CLIENT_SECRET;
  const environment = process.env.QF_ENV === "production" ? "production" : "prelive";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, baseUrl: API_BASE_BY_ENV[environment] };
}

async function getAccessToken(fetchImpl: typeof fetch): Promise<string> {
  const configuration = getConfiguration();
  if (!configuration) throw new Error("Quran Foundation is not configured.");
  if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.accessToken;
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    const credentials = Buffer.from(`${configuration.clientId}:${configuration.clientSecret}`).toString("base64");
    const response = await fetchImpl(`${configuration.baseUrl}/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials&scope=content",
    });
    if (!response.ok) throw new Error("Quran Foundation authentication failed.");
    const payload = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!payload.access_token) throw new Error("Quran Foundation returned no access token.");
    tokenCache = { accessToken: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 };
    return payload.access_token;
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
}

type ApiVerse = {
  verse_key?: string;
  page_number?: number;
  text_uthmani?: string;
  words?: Array<{
    page_number?: number;
    text_uthmani?: string;
    text_qpc_hafs?: string;
    text_indopak?: string;
  }>;
  translations?: Array<{ resource_id?: number; text?: string }>;
};

function wordsText(verse: ApiVerse, field: "text_uthmani" | "text_qpc_hafs" | "text_indopak") {
  const words = verse.words?.map((word) => word[field]).filter(Boolean);
  return words?.length ? words.join(" ") : null;
}

export async function fetchQuranVerse(verseKey: string, fetchImpl: typeof fetch = fetch): Promise<QuranContentResponse> {
  if (!parseVerseKey(verseKey)) return { status: "error", message: "Enter a valid verse reference." };
  const configuration = getConfiguration();
  if (!configuration) {
    return {
      status: "setup_required",
      message: "Add QF_CLIENT_ID and QF_CLIENT_SECRET on the server to load Quran Foundation content.",
    };
  }

  try {
    const accessToken = await getAccessToken(fetchImpl);
    const url = new URL(`${configuration.baseUrl}/content/api/v4/verses/by_key/${verseKey}`);
    url.searchParams.set("words", "true");
    url.searchParams.set("word_fields", "text_uthmani,text_qpc_hafs,text_indopak");
    url.searchParams.set("translations", `${DEFAULT_TRANSLATION_ID},${TRANSLITERATION_ID}`);

    const response = await fetchImpl(url, {
      headers: { "x-auth-token": accessToken, "x-client-id": configuration.clientId },
    });
    if (response.status === 401) {
      tokenCache = null;
      return { status: "error", message: "Quran Foundation authentication expired. Try again." };
    }
    if (!response.ok) return { status: "error", message: "Quran Foundation content is temporarily unavailable." };

    const payload = (await response.json()) as { verses?: ApiVerse[] };
    const verse = payload.verses?.[0];
    if (!verse) return { status: "error", message: "The requested Quran verse was not found." };
    const resolvedKey = verse.verse_key ?? verseKey;
    const translation = verse.translations?.find((item) => item.resource_id === DEFAULT_TRANSLATION_ID)?.text;
    const transliteration = verse.translations?.find((item) => item.resource_id === TRANSLITERATION_ID)?.text;
    return {
      status: "ready",
      verse: buildVerseContent({
        verseKey: resolvedKey,
        pageNumber: verse.page_number ?? verse.words?.[0]?.page_number,
        textUthmani: wordsText(verse, "text_uthmani") ?? verse.text_uthmani,
        textQpcHafs: wordsText(verse, "text_qpc_hafs"),
        textIndopak: wordsText(verse, "text_indopak"),
        translation,
        transliteration,
      }),
    };
  } catch {
    return { status: "error", message: "Could not connect to Quran Foundation. Check server setup and try again." };
  }
}
