import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  basmalahDiagnosticsEnabled,
  createBasmalahDiagnostic,
  shouldShowBasmalahDiagnostics,
} from "../src/lib/editor/basmalah-diagnostics.ts";
import { arabicCaptionPresentationWords, createCaptionSegmentsFromVerseBoundaries } from "../src/lib/editor/captions.ts";
import type { QuranVerseContent } from "../src/lib/quran/content.ts";

const verse = {
  verseKey: "18:57",
  arabic: { uthmani: "وَمَنْ أَظْلَمُ" },
  translation: null,
  transliteration: null,
} as unknown as QuranVerseContent;

const preludeWordTimings = [
  { canonicalWordIndex: 1, startMs: 1_000, endMs: 1_110 },
  { canonicalWordIndex: 2, startMs: 1_120, endMs: 1_230 },
  { canonicalWordIndex: 3, startMs: 1_240, endMs: 1_350 },
  { canonicalWordIndex: 4, startMs: 1_360, endMs: 1_500 },
];

function basmalahSegment() {
  return createCaptionSegmentsFromVerseBoundaries(
    [{ verseKey: "18:57", startMs: 1_600, endMs: 1_800, evidence: { source: "fastconformer", selectedWord: null, candidates: [] } }],
    { "18:57": verse },
    { available: true, selected: "present", startMs: 1_000, endMs: 1_500, wordTimings: preludeWordTimings },
  )[0]!;
}

test("basmalah diagnostics control stays absent unless the explicit query gate and prelude segment are both present", () => {
  const segment = basmalahSegment();
  assert.equal(basmalahDiagnosticsEnabled(""), false);
  assert.equal(basmalahDiagnosticsEnabled("?debugBasmalah=0"), false);
  assert.equal(basmalahDiagnosticsEnabled("?debugBasmalah=1"), true);
  assert.equal(shouldShowBasmalahDiagnostics("", [segment]), false);
  assert.equal(shouldShowBasmalahDiagnostics("?debugBasmalah=1", []), false);
  assert.equal(shouldShowBasmalahDiagnostics("?debugBasmalah=1", [segment]), true);
  const source = readFileSync(new URL("../src/lib/editor/basmalah-diagnostics.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /getBoundingClientRect|offsetTop|offsetLeft|line-wrap/i);
});

test("four-word basmalah diagnostic records the alignment-to-presentation handoff without sensitive project data", () => {
  const diagnostic = createBasmalahDiagnostic({
    segment: basmalahSegment(),
    optionalPrelude: { startMs: 1_000, endMs: 1_500, wordTimings: preludeWordTimings },
    wordHighlightMode: "read-so-far",
  });
  assert.equal(diagnostic.contentKind, "basmalah-prelude");
  assert.equal(diagnostic.canonicalLexicalTokenCount, 4);
  assert.equal(diagnostic.counts.canonicalWordCount, 4);
  assert.equal(diagnostic.counts.optionalPreludeWordTimingCount, 4);
  assert.equal(diagnostic.counts.captionWordTimingCount, 4);
  assert.equal(diagnostic.counts.displayTokenCount, 4);
  assert.equal(diagnostic.counts.mappedDisplayTokenCount, 4);
  assert.equal(diagnostic.finalWord.hasPreludeTiming, true);
  assert.equal(diagnostic.finalWord.hasCaptionTiming, true);
  assert.equal(diagnostic.finalWord.hasPresentationMapping, true);
  assert.equal(diagnostic.finalWord.hasValidStart, true);
  assert.equal(diagnostic.finalWord.hasValidEnd, true);
  const payload = JSON.stringify(diagnostic);
  for (const excluded of ["mediaUrl", "signedUrl", "userId", "email", "stripe", "authToken", "supabase", "sourcePath", "filePath"]) assert.equal(payload.includes(excluded), false);
});

test("diagnostic explicitly identifies when the fourth word is lost after optional prelude alignment", () => {
  const segment = { ...basmalahSegment(), wordTimings: basmalahSegment().wordTimings?.slice(0, 3) };
  const diagnostic = createBasmalahDiagnostic({
    segment,
    optionalPrelude: { startMs: 1_000, endMs: 1_500, wordTimings: preludeWordTimings },
    wordHighlightMode: "read-so-far",
  });
  assert.deepEqual(diagnostic.finalWord, {
    canonicalWordIndex: 4,
    hasPreludeTiming: true,
    hasCaptionTiming: false,
    hasPresentationMapping: false,
    hasValidStart: false,
    hasValidEnd: false,
  });
  assert.equal(diagnostic.representativeHighlightEvaluation, null);
});

test("representative basmalah highlight evaluations use the shared presentation function", () => {
  const segment = basmalahSegment();
  const diagnostic = createBasmalahDiagnostic({
    segment,
    optionalPrelude: { startMs: 1_000, endMs: 1_500, wordTimings: preludeWordTimings },
    wordHighlightMode: "read-so-far",
  });
  const expectedAtStart = arabicCaptionPresentationWords(segment, false, 1_360, "read-so-far")
    .filter((word) => word.kind === "quran-word" && word.highlighted)
    .map((_, index) => index + 1);
  assert.deepEqual(diagnostic.representativeHighlightEvaluation?.find((entry) => entry.label === "at-final-word-start")?.highlightedCanonicalWordIndexes, expectedAtStart);
  assert.deepEqual(diagnostic.representativeHighlightEvaluation?.map((entry) => entry.highlightedCanonicalWordIndexes), [[1, 2, 3], [1, 2, 3, 4], [1, 2, 3, 4], [1, 2, 3, 4]]);
  const source = readFileSync(new URL("../src/lib/editor/basmalah-diagnostics.ts", import.meta.url), "utf8");
  assert.match(source, /arabicCaptionPresentationWords\(segment, false, timeMs, wordHighlightMode\)/);
});

test("diagnostic creation does not alter generated caption timing", () => {
  const segment = basmalahSegment();
  const before = structuredClone(segment.wordTimings);
  createBasmalahDiagnostic({ segment, optionalPrelude: { startMs: 1_000, endMs: 1_500, wordTimings: preludeWordTimings }, wordHighlightMode: "read-so-far" });
  assert.deepEqual(segment.wordTimings, before);
});
