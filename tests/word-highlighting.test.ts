import assert from "node:assert/strict";
import test from "node:test";
import { arabicCaptionPresentationWords, createCaptionSegmentsFromVerseBoundaries, mergeCaptionWithNext, resolveWordHighlightPresentation, splitCaptionSegment } from "../src/lib/editor/captions.ts";
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
    .filter((word) => word.kind === "quran-word" && word.highlighted)
    .map((word) => word.text);
}

function alignedBasmalahSegment() {
  return createCaptionSegmentsFromVerseBoundaries(
    [{ verseKey: "18:57", startMs: 1_600, endMs: 1_800, evidence: { source: "fastconformer", selectedWord: null, candidates: [] } }],
    { "18:57": verse },
    {
      available: true,
      selected: "present",
      startMs: 1_000,
      endMs: 1_500,
      wordTimings: [
        { canonicalWordIndex: 1, startMs: 1_000, endMs: 1_110 },
        { canonicalWordIndex: 2, startMs: 1_120, endMs: 1_230 },
        { canonicalWordIndex: 3, startMs: 1_240, endMs: 1_350 },
        { canonicalWordIndex: 4, startMs: 1_360, endMs: 1_500 },
      ],
    },
  )[0]!;
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

test("the final verse ornament follows the final canonical word in each highlight mode", () => {
  const readSoFar = arabicCaptionPresentationWords(segment(), true, 1_500, "read-so-far");
  assert.equal(readSoFar.at(-1)?.kind, "verse-number");
  assert.equal(readSoFar.at(-1)?.highlighted, true);
  assert.equal(arabicCaptionPresentationWords(segment(), true, 1_699, "current-word").at(-1)?.highlighted, true);
  assert.equal(arabicCaptionPresentationWords(segment(), true, 1_700, "current-word").at(-1)?.highlighted, false);
  assert.equal(arabicCaptionPresentationWords(segment(), true, 1_500, "off").at(-1)?.highlighted, false);
});

test("only the terminal piece of a split ayah carries and highlights the ornament", () => {
  const [first, final] = splitCaptionSegment(segment(), 3);
  assert.equal(arabicCaptionPresentationWords(first!, true, 1_300, "read-so-far").some((word) => word.kind === "verse-number"), false);
  const finalWords = arabicCaptionPresentationWords(final!, true, 1_600, "read-so-far");
  assert.equal(finalWords.at(-1)?.kind, "verse-number");
  assert.equal(finalWords.at(-1)?.highlighted, true);
});

test("shared highlight presentation is vivid at the default intensity and only affects highlighted text", () => {
  const highlighted = resolveWordHighlightPresentation({ baseTextColor: "#ffffff", highlightColor: "#B7FF00", intensity: 0.85, isHighlighted: true });
  const normal = resolveWordHighlightPresentation({ baseTextColor: "#ffffff", highlightColor: "#B7FF00", intensity: 0.85, isHighlighted: false });
  assert.equal(highlighted.color, "#B7FF00");
  assert.ok(highlighted.glowBlurPx > 9);
  assert.equal(normal.color, "#ffffff");
  assert.equal(normal.glowBlurPx, 0);
});

test("split and merged pieces retain only their owned canonical word timings", () => {
  const split = splitCaptionSegment(segment(), 3);
  assert.deepEqual(split.map((piece) => piece.wordTimings?.map((word) => word.canonicalWordIndex)), [[1, 2], [3]]);
  assert.deepEqual(arabicCaptionPresentationWords(split[0]!, true, 1_600, "read-so-far").filter((word) => word.highlighted), [], "piece one is no longer visible");
  assert.deepEqual(arabicCaptionPresentationWords(split[1]!, true, 1_600, "current-word").filter((word) => word.kind === "quran-word" && word.highlighted).map((word) => word.text), ["مِمَّنْ"]);
  const merged = mergeCaptionWithNext(split, 0)[0]!;
  assert.deepEqual(merged.wordTimings?.map((word) => word.canonicalWordIndex), [1, 2, 3]);
  assert.deepEqual(arabicCaptionPresentationWords(merged, true, 1_220, "current-word").filter((word) => word.highlighted).map((word) => word.text), ["أَظْلَمُ"]);
});

test("basmalah without precise canonical word timings and legacy persistence both remain safe", () => {
  const prelude = { ...segment(), id: "basmalah-prelude#1", contentKind: "basmalah-prelude" as const, verseKeys: [], arabic: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", wordTimings: undefined, showVerseNumberAtEnd: false };
  assert.deepEqual(arabicCaptionPresentationWords(prelude, true, 1_250, "current-word").filter((word) => word.highlighted), []);
  const persisted = CaptionSegmentSchema.parse(segment());
  assert.equal(persisted.wordTimings?.length, 3);
  assert.equal(TypographySchema.shape.wordHighlightMode.parse(undefined), "read-so-far");
  assert.equal(TypographySchema.shape.wordHighlightColor.parse(undefined), "#B7FF00");
  assert.equal(TypographySchema.shape.wordHighlightIntensity.parse(undefined), 0.85);
});

test("a real forced-aligned basmalah uses the shared read-so-far word model without an ayah ornament", () => {
  const prelude = alignedBasmalahSegment();
  assert.equal(prelude.contentKind, "basmalah-prelude");
  assert.deepEqual(prelude.verseKeys, []);
  assert.equal(prelude.arabic, "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", "the canonical basmalah text is unchanged");
  assert.equal(prelude.showVerseNumberAtEnd, false);
  assert.deepEqual(prelude.wordTimings?.map((timing) => [timing.canonicalWordIndex, timing.sourceWordStart, timing.sourceWordEnd, timing.startMs, timing.endMs]), [
    [1, 0, 1, 1_000, 1_110], [2, 1, 2, 1_120, 1_230], [3, 2, 3, 1_240, 1_350], [4, 3, 4, 1_360, 1_500],
  ]);
  const highlighted = (timeMs: number) => arabicCaptionPresentationWords(prelude, true, timeMs, "read-so-far")
    .filter((word) => word.highlighted)
    .map((word) => word.text);
  assert.deepEqual(highlighted(999), []);
  assert.deepEqual(highlighted(1_120), ["بِسْمِ", "اللَّهِ"]);
  assert.deepEqual(highlighted(1_355), ["بِسْمِ", "اللَّهِ", "الرَّحْمَٰنِ"]);
  assert.deepEqual(highlighted(1_359), ["بِسْمِ", "اللَّهِ", "الرَّحْمَٰنِ"]);
  assert.deepEqual(highlighted(1_360), ["بِسْمِ", "اللَّهِ", "الرَّحْمَٰنِ", "الرَّحِيمِ"]);
  assert.deepEqual(highlighted(1_499), ["بِسْمِ", "اللَّهِ", "الرَّحْمَٰنِ", "الرَّحِيمِ"], "the terminal word remains read until the half-open segment boundary");
  assert.deepEqual(highlighted(1_500), [], "the prelude stays half-open at its real aligned end");
  assert.equal(arabicCaptionPresentationWords(prelude, true, 1_499, "read-so-far").some((word) => word.kind === "verse-number"), false);
});
