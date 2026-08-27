/**
 * Internal, conservative approximation of how Hafs recitation is commonly
 * represented by a general Arabic ASR system. It is deliberately not a Quran
 * display normalizer and must never be rendered to a user.
 *
 * This is a replaceable boundary: a future speech-to-phoneme transcriber can
 * emit this representation (or another recognition unit sequence) without
 * changing the verse matcher.
 */
const ARABIC_DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;
const ARABIC_PUNCTUATION = /[ۖۗۚۛۜۙۘ۝۞]/g;
const SUN_LETTERS = "تثدذرزسشصضطظلن";
const ARTICLE_PREFIX = "(^|[\\sوفبكل])";

export type QuranRecognitionUnits = {
  /** Existing spelling-oriented matching units. */
  orthographic: string;
  /** Recitation-aware matching units; internal-only. */
  recitation: string;
};

/**
 * Reduces only deterministic Hafs-relevant surface variation:
 * - harakat, madd marks, tanwin, and ghunnah marks are non-lexical here;
 * - hamzat al-wasl is omitted in connected speech;
 * - the lam of the definite article is assimilated before sun letters;
 * - ASR-expanded gemination is collapsed;
 * - hamza carrier spellings are compared by their consonant/vowel carrier.
 *
 * Madd letters themselves are retained: duration must not change lexical
 * identity. Idgham across independent words is intentionally left to fuzzy
 * sequence alignment rather than deleting lexical consonants.
 */
export function normalizeQuranRecitation(value: string): string {
  const withoutMarks = value
    .normalize("NFKC")
    .replace(ARABIC_DIACRITICS, "")
    .replace(ARABIC_PUNCTUATION, "")
    .replace(new RegExp(`${ARTICLE_PREFIX}ٱل([${SUN_LETTERS}])`, "g"), "$1$2")
    // Uthmani wasl alif is silent in connected recitation. A plain initial
    // alif from ASR remains, so either output stays close enough to compare.
    .replace(/ٱ/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    // General Arabic ASR frequently chooses a different hamza seat. Preserve
    // the carrier sound rather than treating the spelling as lexical evidence.
    .replace(/ئ/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ء/g, "")
    .replace(/[^\u0621-\u063a\u0641-\u064a\s]/g, " ");

  return withoutMarks
    // Apply to both Uthmani and ordinary ASR spellings. This models lam
    // shamsiyyah without changing qamariyyah articles.
    .replace(new RegExp(`${ARTICLE_PREFIX}ال([${SUN_LETTERS}])`, "g"), "$1$2")
    // Some recognizers spell a shadda as a repeated consonant. This secondary
    // representation tolerates it; orthographic scoring still protects
    // lexical distinctions such as single vs. doubled consonants.
    .replace(/(.)\1+/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function quranRecognitionUnits(orthographic: string, source?: string): QuranRecognitionUnits {
  return { orthographic, recitation: normalizeQuranRecitation(source ?? orthographic) };
}
