import assert from "node:assert/strict";
import test from "node:test";
import { canonicalDisplayWords, DEFAULT_MAX_ARABIC_VISIBLE_CHARS, planAyahDisplaySplit, visibleArabicCharacterCount, waqfMetadataForWord } from "../src/lib/editor/ayah-display-splitting.ts";
import { createCaptionSegmentsFromVerseBoundaries } from "../src/lib/editor/captions.ts";
import { getVerse } from "../src/lib/quran/local.ts";
import type { QuranVerseContent } from "../src/lib/quran/content.ts";

function alignedWords(values: readonly string[]) {
  return canonicalDisplayWords(values.map((canonicalArabic, index) => ({
    canonicalWordIndex: index + 1,
    canonicalArabic,
    startMs: 1_000 + index * 100,
    endMs: 1_099 + index * 100,
  })));
}

function arabicWord(length: number, mark = "") { return `${"ا".repeat(length)}${mark}`; }

test("visible Arabic size ignores harakat, Quranic marks, tatweel, zero-width text, and ayah ornaments", () => {
  assert.equal(visibleArabicCharacterCount("بِسْمِ ٱللّٰهِ"), 8);
  assert.equal(visibleArabicCharacterCount("سـلام\u200d ۝١"), 4);
  assert.equal(visibleArabicCharacterCount("قُلْ ۖ إِنَّ"), 5, "spaces still count between visible words");
});

test("audited Tanzil waqf marks are classified from their attached word", () => {
  assert.deepEqual(waqfMetadataForWord("عَلَيْهِمۘ").type, "preferred");
  assert.deepEqual(waqfMetadataForWord("تَذَكَّرُونَۗ").type, "preferred");
  assert.deepEqual(waqfMetadataForWord("تَعْلَمُونَۚ").type, "acceptable");
  assert.deepEqual(waqfMetadataForWord("تَفْعَلُونَۖ").type, "continuation");
  assert.deepEqual(waqfMetadataForWord("عَلَيْهِمۙ").type, "avoid");
});

test("an ayah below or exactly at the display limit remains one piece", () => {
  assert.equal(planAyahDisplaySplit(alignedWords([arabicWord(39), arabicWord(40)]), 80).pieces.length, 1);
  assert.equal(planAyahDisplaySplit(alignedWords([arabicWord(40), arabicWord(39)]), 80).pieces.length, 1);
});

test("oversized ayat use only complete canonical words and prefer a strong nearby waqf", () => {
  const words = [arabicWord(11), arabicWord(11), arabicWord(11, "ۗ"), arabicWord(11), arabicWord(11), arabicWord(11), arabicWord(11)];
  const plan = planAyahDisplaySplit(alignedWords(words), 50);
  assert.deepEqual(plan.selectedCuts, [3], "the strong waqf beats an arbitrary equally-balanced word boundary");
  assert.deepEqual(plan.pieces.map((piece) => [piece.canonicalStartWordIndex, piece.canonicalEndWordIndex]), [[1, 3], [4, 7]]);
  assert.equal(plan.pieces.every((piece) => piece.visibleCharCount <= 50), true);
});

test("ordinary boundaries use a balanced fallback and avoid a tiny trailing piece", () => {
  const balanced = planAyahDisplaySplit(alignedWords([arabicWord(14), arabicWord(14), arabicWord(14), arabicWord(14), arabicWord(14), arabicWord(14)]), 55);
  assert.deepEqual(balanced.selectedCuts, [3]);
  const noTinyTail = planAyahDisplaySplit(alignedWords([arabicWord(15), arabicWord(15), arabicWord(15), arabicWord(15), arabicWord(3)]), 50);
  assert.deepEqual(noTinyTail.selectedCuts, [2]);
});

test("three-piece selection is planned globally rather than emitted as greedy first cuts", () => {
  const words = [arabicWord(10), arabicWord(10), arabicWord(10, "ۗ"), arabicWord(10), arabicWord(10, "ۚ"), arabicWord(10), arabicWord(10), arabicWord(10)];
  const plan = planAyahDisplaySplit(alignedWords(words), 35);
  assert.equal(plan.minimumPieces, 3);
  assert.equal(plan.pieces.length, 3);
  assert.equal(plan.pieces.every((piece) => piece.visibleCharCount <= 35), true);
  assert.deepEqual(plan.pieces.flatMap((piece) => Array.from({ length: piece.canonicalEndWordIndex - piece.canonicalStartWordIndex + 1 }, (_, index) => piece.canonicalStartWordIndex + index)), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test("split CaptionSegments use the next FastConformer word start exactly and retain only the final ornament", () => {
  const text = [arabicWord(30), arabicWord(30, "ۗ"), arabicWord(30), arabicWord(30)].join(" ");
  const verse = { verseKey: "1:1", arabic: { uthmani: text }, translation: "A whole-ayah translation", transliteration: "A whole ayah transliteration" } as unknown as QuranVerseContent;
  const timings = text.split(" ").map((canonicalArabic, index) => ({ verseKey: "1:1", canonicalWordIndex: index + 1, canonicalArabic, startMs: 1_000 + index * 100, endMs: 1_099 + index * 100 }));
  const segments = createCaptionSegmentsFromVerseBoundaries(
    [{ verseKey: "1:1", startMs: 1_000, endMs: 1_400, evidence: { source: "fastconformer", selectedWord: null, candidates: [] } }],
    { "1:1": verse },
    undefined,
    timings,
  );
  assert.deepEqual(segments.map((segment) => [segment.wordStart, segment.wordEnd, segment.startMs, segment.endMs, segment.showVerseNumberAtEnd]), [[0, 2, 1_000, 1_200, false], [2, 4, 1_200, 1_400, true]]);
  assert.equal(segments[0]!.endMs, segments[1]!.startMs);
  assert.equal(segments.map((segment) => segment.arabic).join(" "), text);
});

test("real bundled Quran stress cases preserve every word exactly once", () => {
  for (const [key, minimumPieces] of [["4:3", 2], ["2:255", 3], ["2:282", 3]] as const) {
    const text = getVerse(key)!.arabic.uthmani;
    const sourceWords = text.split(/\s+/u);
    const plan = planAyahDisplaySplit(alignedWords(sourceWords), DEFAULT_MAX_ARABIC_VISIBLE_CHARS);
    assert.ok(plan.pieces.length >= minimumPieces, key);
    assert.equal(plan.pieces.every((piece) => piece.visibleCharCount <= DEFAULT_MAX_ARABIC_VISIBLE_CHARS), true, key);
    const plannedWords = plan.pieces.flatMap((piece) => sourceWords.slice(piece.canonicalStartWordIndex - 1, piece.canonicalEndWordIndex));
    assert.deepEqual(plannedWords, sourceWords, key);
  }
});
