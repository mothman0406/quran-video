/**
 * Display-only Quran ayah segmentation. Canonical text and FastConformer
 * alignment stay separate: this module groups already aligned canonical words
 * without changing either source of truth.
 */

export const DEFAULT_MAX_ARABIC_VISIBLE_CHARS = 80;

export type WaqfType = "preferred" | "acceptable" | "continuation" | "ordinary" | "avoid";

export type WaqfMetadata = {
  type: WaqfType;
  marks: string[];
};

export type CanonicalDisplayWord = {
  /** The one-based word index used by FastConformer canonical alignment. */
  wordIndex: number;
  canonicalText: string;
  visibleCharCount: number;
  alignmentStartMs: number;
  alignmentEndMs: number;
  waqfMetadata: WaqfMetadata;
};

export type AyahDisplayPiece = {
  canonicalStartWordIndex: number;
  canonicalEndWordIndex: number;
  visibleCharCount: number;
  endingWaqfType: WaqfType;
};

export type AyahDisplaySplitPlan = {
  totalVisibleChars: number;
  maxVisibleChars: number;
  requiredSplit: boolean;
  minimumPieces: number;
  candidateCuts: Array<{ afterWordIndex: number; waqfType: WaqfType }>;
  selectedCuts: number[];
  exceptionalReason?: "single-word-exceeds-limit";
  pieces: AyahDisplayPiece[];
};

/**
 * The bundled Tanzil Uthmani corpus attaches these signs directly to the
 * preceding word. Other U+06D6–U+06ED code points in the corpus are Quranic
 * annotation/recitation marks, not display-cut preferences.
 */
const WAQF_TYPES: Readonly<Record<string, WaqfType>> = {
  "ۘ": "preferred", // U+06D8 small high meem: required stop
  "ۗ": "preferred", // U+06D7 qaf-lam-alef: stopping preferred
  "ۚ": "acceptable", // U+06DA small high jeem: permissible stop
  "ۛ": "acceptable", // U+06DB small high three dots: paired permissible stop
  "ۖ": "continuation", // U+06D6 sad-lam-alef: continuation preferred
  "ۙ": "avoid", // U+06D9 small high lam-alef: do not stop
  "ۜ": "avoid", // U+06DC small high seen: saktah, not a caption cut cue
};

const ZERO_WIDTH_OR_FORMATTING = /[\u200b-\u200f\u2060\ufeff]/u;
const ARABIC_INDIC_DIGIT = /[\u0660-\u0669\u06f0-\u06f9]/u;
const COMBINING_MARK = /\p{M}/u;
const QURANIC_ANNOTATION = /[\u06d6-\u06ed]/u;

/**
 * Counts approximate rendered characters without altering the canonical
 * Uthmani string. Harakat, Quranic combining annotations, tatweel, zero-width
 * formatting, terminal ayah ornaments, and Arabic-Indic digits do not add to
 * the display-size budget. Word separators count once between words.
 */
export function visibleArabicCharacterCount(value: string): number {
  const withoutTerminalOrnament = value.replace(/\s*\u06dd\s*[0-9٠-٩۰-۹]*\s*$/u, "");
  const isIgnored = (character: string) => character === "\u0640"
    || character === "\u06dd"
    || ZERO_WIDTH_OR_FORMATTING.test(character)
    || ARABIC_INDIC_DIGIT.test(character)
    || COMBINING_MARK.test(character)
    || QURANIC_ANNOTATION.test(character);
  const normalizedSpaces = [...withoutTerminalOrnament]
    .filter((character) => !isIgnored(character))
    .join("")
    .trim()
    .split(/\s+/u)
    .filter(Boolean)
    .join(" ");
  let count = 0;
  for (const character of normalizedSpaces) {
    if (isIgnored(character)) continue;
    count += 1;
  }
  return count;
}

export function waqfMetadataForWord(value: string): WaqfMetadata {
  const marks = [...value].filter((character) => character in WAQF_TYPES);
  if (!marks.length) return { type: "ordinary", marks: [] };
  const type = marks.reduce<WaqfType>((current, mark) => {
    const candidate = WAQF_TYPES[mark]!;
    const rank: Record<WaqfType, number> = { preferred: 4, acceptable: 3, continuation: 2, ordinary: 1, avoid: 0 };
    return rank[candidate] > rank[current] ? candidate : current;
  }, "avoid");
  return { type, marks };
}

export function canonicalDisplayWords(input: readonly {
  canonicalWordIndex: number;
  canonicalArabic: string;
  startMs: number;
  endMs: number;
}[]): CanonicalDisplayWord[] {
  return input.map((word) => ({
    wordIndex: word.canonicalWordIndex,
    canonicalText: word.canonicalArabic,
    visibleCharCount: visibleArabicCharacterCount(word.canonicalArabic),
    alignmentStartMs: word.startMs,
    alignmentEndMs: word.endMs,
    waqfMetadata: waqfMetadataForWord(word.canonicalArabic),
  }));
}

function cutPenalty(type: WaqfType): number {
  switch (type) {
    case "preferred": return -180;
    case "acceptable": return -70;
    case "continuation": return -18;
    case "avoid": return 160;
    default: return 0;
  }
}

function segmentPenalty(visibleChars: number, idealChars: number): number {
  const distance = visibleChars - idealChars;
  const balance = distance * distance;
  const tiny = visibleChars < idealChars * 0.48 ? (idealChars * 0.48 - visibleChars) ** 2 * 14 : 0;
  return balance + tiny;
}

type Candidate = { cost: number; cuts: number[] };

function betterCandidate(current: Candidate | undefined, next: Candidate): Candidate {
  if (!current || next.cost < current.cost) return next;
  if (next.cost > current.cost) return current;
  for (let index = 0; index < Math.min(current.cuts.length, next.cuts.length); index += 1) {
    if (next.cuts[index] !== current.cuts[index]) return next.cuts[index]! < current.cuts[index]! ? next : current;
  }
  return next.cuts.length < current.cuts.length ? next : current;
}

/** Plans all canonical word-boundary cuts together; no greedy midpoint cuts. */
export function planAyahDisplaySplit(words: readonly CanonicalDisplayWord[], maxVisibleChars = DEFAULT_MAX_ARABIC_VISIBLE_CHARS): AyahDisplaySplitPlan {
  if (!Number.isInteger(maxVisibleChars) || maxVisibleChars < 1) throw new Error("maxVisibleChars must be a positive integer.");
  if (!words.length) return { totalVisibleChars: 0, maxVisibleChars, requiredSplit: false, minimumPieces: 1, candidateCuts: [], selectedCuts: [], pieces: [] };
  const prefix = [0];
  words.forEach((word) => prefix.push(prefix.at(-1)! + word.visibleCharCount));
  const chars = (start: number, end: number) => prefix[end]! - prefix[start]! + Math.max(0, end - start - 1);
  const totalVisibleChars = chars(0, words.length);
  const requiredSplit = totalVisibleChars > maxVisibleChars;
  const candidateCuts = words.slice(0, -1).map((word) => ({ afterWordIndex: word.wordIndex, waqfType: word.waqfMetadata.type }));
  const oneOversizedWord = words.some((word) => word.visibleCharCount > maxVisibleChars);
  const makePieces = (cuts: readonly number[]): AyahDisplayPiece[] => {
    const boundaries = [0, ...cuts.map((cut) => words.findIndex((word) => word.wordIndex === cut) + 1), words.length];
    return boundaries.slice(0, -1).map((start, index) => {
      const end = boundaries[index + 1]!;
      const last = words[end - 1]!;
      return {
        canonicalStartWordIndex: words[start]!.wordIndex,
        canonicalEndWordIndex: last.wordIndex,
        visibleCharCount: chars(start, end),
        endingWaqfType: last.waqfMetadata.type,
      };
    });
  };
  if (!requiredSplit) {
    return { totalVisibleChars, maxVisibleChars, requiredSplit, minimumPieces: 1, candidateCuts, selectedCuts: [], pieces: makePieces([]) };
  }

  const minimumPieces = Math.max(2, Math.ceil(totalVisibleChars / maxVisibleChars));
  for (let pieceCount = minimumPieces; pieceCount <= words.length; pieceCount += 1) {
    const idealChars = totalVisibleChars / pieceCount;
    const states: Array<Array<Candidate | undefined>> = Array.from({ length: pieceCount + 1 }, () => Array(words.length + 1));
    states[0]![0] = { cost: 0, cuts: [] };
    for (let pieces = 1; pieces <= pieceCount; pieces += 1) {
      for (let end = pieces; end <= words.length; end += 1) {
        let selected: Candidate | undefined;
        for (let start = pieces - 1; start < end; start += 1) {
          const previous = states[pieces - 1]![start];
          if (!previous) continue;
          const visibleChars = chars(start, end);
          const isSingleOversizedWord = end === start + 1 && words[start]!.visibleCharCount > maxVisibleChars;
          if (visibleChars > maxVisibleChars && !isSingleOversizedWord) continue;
          const cut = start === 0 ? 0 : cutPenalty(words[start - 1]!.waqfMetadata.type);
          selected = betterCandidate(selected, { cost: previous.cost + segmentPenalty(visibleChars, idealChars) + cut, cuts: start === 0 ? previous.cuts : [...previous.cuts, words[start - 1]!.wordIndex] });
        }
        states[pieces]![end] = selected;
      }
    }
    const selected = states[pieceCount]![words.length];
    if (selected) {
      return {
        totalVisibleChars,
        maxVisibleChars,
        requiredSplit,
        minimumPieces,
        candidateCuts,
        selectedCuts: selected.cuts,
        ...(oneOversizedWord ? { exceptionalReason: "single-word-exceeds-limit" as const } : {}),
        pieces: makePieces(selected.cuts),
      };
    }
  }
  throw new Error("Could not construct contiguous Quran display pieces.");
}
