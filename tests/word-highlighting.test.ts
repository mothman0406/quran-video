import assert from "node:assert/strict";
import test from "node:test";
import { arabicCaptionPresentationWords, createCaptionSegmentsFromVerseBoundaries, mergeCaptionWithNext, splitCaptionSegment } from "../src/lib/editor/captions.ts";
import { CaptionSegmentSchema, TypographySchema } from "../src/lib/schemas/project.ts";
import type { QuranVerseContent } from "../src/lib/quran/content.ts";

const verse = {
  verseKey: "18:57",
  arabic: { uthmani: "وَمَنْ أَظْلَمُ ۖ مِمَّنْ" },
  translation: null,
  transliteration: null,
} as unknown as QuranVerseContent;

const timings = [
  { verseKey: "18:57", canonicalWordIndex: 1, canonicalArabic: "وَمَنْ", startMs: 1_000, endMs: 1_100 },
  { verseKey: "18:57", canonicalWordIndex: 2, canonicalArabic: "أَظْلَمُ", startMs: 1_220, endMs: 1_350 },
  { verseKey: "18:57", canonicalWordIndex: 3, canonicalArabic: "مِمَّنْ", startMs: 1_500, endMs: 1_700 },
];

function segment() {
  return createCaptionSegmentsFromVerseBoundaries(
    [{ verseKey: "18:57", startMs: 900, endMs: 1_800, evidence: { source: "fastconformer", selectedWord: null, candidates: [] } }],
    { "18:57": verse },
    undefined,
    timings,
  )[0]!;
}

function highlightedAt(timeMs: number, mode: "current-word" | "read-so-far") {
  return arabicCaptionPresentationWords(segment(), true, timeMs, mode)
    .filter((word) => word.highlighted)
    .map((word) => word.text);
}

test("canonical Quran word spans preserve Uthmani harakat, display cleaning, spaces, RTL source order, and exclude the ornament", () => {
  const words = arabicCaptionPresentationWords(segment(), true, 1_250, "current-word");
  assert.deepEqual(words.map((word) => word.text), ["وَمَنْ", "أَظْلَمُ", "مِمَّنْ", "٥٧"]);
  assert.deepEqual(words.map((word) => word.kind), ["quran-word", "quran-word", "quran-word", "verse-number"]);
  assert.equal(words[0]!.text.includes("ْ"), true, "harakat remain intact");
  assert.equal(words.some((word) => word.text.includes("ۖ")), false, "display-only annotation cleaning remains active");
  assert.equal(words.at(-1)!.highlighted, false, "the final ayah ornament is never a Quran word");
});

test("current-word timing uses real half-open acoustic endpoints and clears during silence", () => {
  assert.deepEqual(highlightedAt(999, "current-word"), []);
  assert.deepEqual(highlightedAt(1_000, "current-word"), ["وَمَنْ"]);
  assert.deepEqual(highlightedAt(1_099, "current-word"), ["وَمَنْ"]);
  assert.deepEqual(highlightedAt(1_100, "current-word"), []);
  assert.deepEqual(highlightedAt(1_180, "current-word"), [], "the first real acoustic gap is unhighlighted");
  assert.deepEqual(highlightedAt(1_220, "current-word"), ["أَظْلَمُ"]);
  assert.deepEqual(highlightedAt(1_350, "current-word"), []);
  assert.deepEqual(highlightedAt(1_700, "current-word"), []);
});

test("read-so-far retains completed words through silence and seeking is a pure lookup", () => {
  assert.deepEqual(highlightedAt(1_180, "read-so-far"), ["وَمَنْ"]);
  assert.deepEqual(highlightedAt(1_350, "read-so-far"), ["وَمَنْ", "أَظْلَمُ"]);
  assert.deepEqual(highlightedAt(1_500, "read-so-far"), ["وَمَنْ", "أَظْلَمُ", "مِمَّنْ"]);
  assert.deepEqual(highlightedAt(1_799, "read-so-far"), ["وَمَنْ", "أَظْلَمُ", "مِمَّنْ"]);
  assert.deepEqual(highlightedAt(1_800, "read-so-far"), [], "manual/display segment end clips highlighting");
});

test("split and merged pieces retain only their owned canonical word timings", () => {
  const split = splitCaptionSegment(segment(), 3);
  assert.deepEqual(split.map((piece) => piece.wordTimings?.map((word) => word.canonicalWordIndex)), [[1, 2], [3]]);
  assert.deepEqual(arabicCaptionPresentationWords(split[0]!, true, 1_600, "read-so-far").filter((word) => word.highlighted), [], "piece one is no longer visible");
  assert.deepEqual(arabicCaptionPresentationWords(split[1]!, true, 1_600, "current-word").filter((word) => word.highlighted).map((word) => word.text), ["مِمَّنْ"]);
  const merged = mergeCaptionWithNext(split, 0)[0]!;
  assert.deepEqual(merged.wordTimings?.map((word) => word.canonicalWordIndex), [1, 2, 3]);
  assert.deepEqual(arabicCaptionPresentationWords(merged, true, 1_220, "current-word").filter((word) => word.highlighted).map((word) => word.text), ["أَظْلَمُ"]);
});

test("basmalah without precise canonical word timings and legacy persistence both remain safe", () => {
  const prelude = { ...segment(), id: "basmalah-prelude#1", contentKind: "basmalah-prelude" as const, verseKeys: [], arabic: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", wordTimings: undefined, showVerseNumberAtEnd: false };
  assert.deepEqual(arabicCaptionPresentationWords(prelude, true, 1_250, "current-word").filter((word) => word.highlighted), []);
  const persisted = CaptionSegmentSchema.parse(segment());
  assert.equal(persisted.wordTimings?.length, 3);
  assert.equal(TypographySchema.shape.wordHighlightMode.parse(undefined), "off");
});
