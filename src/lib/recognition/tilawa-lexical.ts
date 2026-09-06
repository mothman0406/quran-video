/**
 * Model-only lexical form used by Tilawa's Quran CTC assets.  Canonical Quran
 * display text is deliberately never changed by this normalizer.
 */
export function normalizeTilawaArabic(value: string) {
  return value
    .replace(/\ufeff/g, "")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DE\u06DF-\u06ED\u0640]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671\u0629\u0649]/g, (character) => ({ "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي" })[character] ?? character)
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}
