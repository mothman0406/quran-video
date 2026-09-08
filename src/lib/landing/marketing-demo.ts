import { getVerse } from "../quran/local.ts";

export const MARKETING_DEMO_VERSE_KEYS = ["93:1", "93:2", "112:1", "112:2"] as const;

export type MarketingQuranDemo = {
  verseKey: (typeof MARKETING_DEMO_VERSE_KEYS)[number];
  arabic: string;
};

/** Quran text used by public product mockups always comes from the product corpus. */
export function getMarketingQuranDemo(): MarketingQuranDemo[] {
  return MARKETING_DEMO_VERSE_KEYS.map((verseKey) => {
    const verse = getVerse(verseKey);
    if (!verse) throw new Error(`Marketing Quran demo verse ${verseKey} is unavailable.`);
    return { verseKey, arabic: verse.arabic.uthmani };
  });
}
