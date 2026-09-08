/**
 * Small independent Hafs-oriented phonetic representation for benchmarking.
 * It is intentionally a deterministic text target, not an acoustic model and
 * never changes canonical display text.
 */
export type QuranPhoneticWord = {
  verseKey: string;
  canonicalWordIndex: number;
  canonicalArabic: string;
  phonemes: readonly string[];
};

const SILENT = new Set(["ۡ", "ْ", "۟", "۠", "ۢ", "ۣ", "ۤ", "ۥ", "ۦ", "ۧ", "ۨ", "۩", "ـ", "ٖ", "ٗ", "ٔ"]);
const DIACRITICS = new Set(["َ", "ُ", "ِ", "ً", "ٌ", "ٍ", "ّ", "ْ", "ٰ", ...SILENT]);
const SUN = new Set(["ت", "ث", "د", "ذ", "ر", "ز", "س", "ش", "ص", "ض", "ط", "ظ", "ل", "ن"]);
const BASE: Record<string, string> = {
  "ء": "ʔ", "أ": "ʔ", "إ": "ʔ", "ؤ": "ʔ", "ئ": "ʔ", "ا": "aː", "ى": "aː", "ب": "b", "ت": "t", "ث": "θ", "ج": "d͡ʒ", "ح": "ħ", "خ": "x", "د": "d", "ذ": "ð", "ر": "r", "ز": "z", "س": "s", "ش": "ʃ", "ص": "sˤ", "ض": "dˤ", "ط": "tˤ", "ظ": "ðˤ", "ع": "ʕ", "غ": "ɣ", "ف": "f", "ق": "q", "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "ة": "t", "و": "w", "ي": "j",
};

function normalizedLetters(text: string) {
  return [...text].filter((character) => !SILENT.has(character) && character !== "ـ");
}

/** Maps one Uthmani canonical word to a reversible token list. */
export function phonemizeQuranWord(word: Omit<QuranPhoneticWord, "phonemes">, options: { waslFromPrevious?: boolean } = {}): QuranPhoneticWord {
  const characters = normalizedLetters(word.canonicalArabic);
  const phonemes: string[] = [];
  let lastBaseIndex: number | null = null;
  const firstLetter = characters.find((character) => !DIACRITICS.has(character));
  // Alif wasl is pronounced initially and elided after the preceding word.
  if (firstLetter === "ٱ" && !options.waslFromPrevious) phonemes.push("a");
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]!;
    if (character === "ٱ") { lastBaseIndex = phonemes.length - 1; continue; }
    if (character === "ّ") {
      if (lastBaseIndex !== null && phonemes[lastBaseIndex]) phonemes.push(phonemes[lastBaseIndex]!);
      continue;
    }
    if (character === "َ" || character === "ً" || character === "ٰ") { phonemes.push(character === "ٰ" ? "aː" : "a"); continue; }
    if (character === "ُ" || character === "ٌ") { phonemes.push("u"); continue; }
    if (character === "ِ" || character === "ٍ") { phonemes.push("i"); continue; }
    if (DIACRITICS.has(character)) continue;
    const base = BASE[character];
    if (!base) continue;
    // Definite-article lam assimilates to the following sun letter. The next
    // letter remains in the stream and shadda expansion keeps it audible.
    const previous = characters[index - 1];
    const next = characters[index + 1];
    if (character === "ل" && (previous === "ٱ" || previous === "ا") && next && SUN.has(next)) continue;
    phonemes.push(base);
    lastBaseIndex = phonemes.length - 1;
  }
  return { ...word, phonemes };
}

/** Keeps every emitted phone tied to its immutable canonical word boundary. */
export function phonemizeQuranWords(words: readonly Omit<QuranPhoneticWord, "phonemes">[]) {
  return words.map((word, index) => phonemizeQuranWord(word, { waslFromPrevious: index > 0 }));
}
