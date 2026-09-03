import assert from "node:assert/strict";
import test from "node:test";
import { resolveVerseBoundaries, type WordOccurrence } from "../src/lib/recognition/core.ts";
import { createCaptionSegmentsFromVerseBoundaries, getActiveCaptionSegment } from "../src/lib/editor/captions.ts";

const occurrence = (verseKey: string, canonicalWordIndex: number, startMs: number, endMs: number, confidence = 1): WordOccurrence => ({
  verseKey,
  canonicalWordIndex,
  globalWordIndex: canonicalWordIndex,
  canonicalText: canonicalWordIndex === 1 ? "فَلَمَّا" : `word-${canonicalWordIndex}`,
  normalizedText: canonicalWordIndex === 1 ? "فلما" : `word${canonicalWordIndex}`,
  occurrenceIndex: 1,
  startMs,
  endMs,
  confidence,
  evidence: "micro-asr",
  pcmRefined: false,
  asrText: canonicalWordIndex === 1 ? "فَلَمَّا" : `word-${canonicalWordIndex}`,
});

test("actual 6:76-77 evidence flows through the single caption timing authority", () => {
  const boundaries = resolveVerseBoundaries({
    verseKeys: ["6:76", "6:77"],
    speechRegions: [
      { startMs: 32_064, endMs: 44_256, durationMs: 12_192, confidence: 0.95 },
      { startMs: 44_832, endMs: 55_104, durationMs: 10_272, confidence: 0.95 },
      { startMs: 55_584, endMs: 65_280, durationMs: 9_696, confidence: 0.95 },
    ],
    wordOccurrences: [
      occurrence("6:76", 15, 42_864, 44_864),
      occurrence("6:77", 1, 44_832, 45_050),
      occurrence("6:77", 2, 45_100, 45_480),
      occurrence("6:77", 3, 45_600, 46_000),
      occurrence("6:77", 4, 46_100, 46_500),
      occurrence("6:77", 16, 55_584, 55_900),
      occurrence("6:77", 17, 55_584, 55_900),
      occurrence("6:77", 18, 55_584, 55_900),
    ],
    firstOnset: 32_064,
    finalSpeechEnd: 65_280,
    durationMs: 65_280,
  });
  const next = boundaries[1]!;
  assert.equal(next.startMs, 44_832);
  assert.equal(boundaries[0]?.endMs, 44_832);
  assert.equal(next.evidence.candidates.find((candidate) => candidate.canonicalWordIndex === 1)?.timestampMs, 44_832);
  assert.equal(next.evidence.candidates.find((candidate) => candidate.canonicalWordIndex === 1)?.accepted, true);
  assert.match(next.evidence.candidates.find((candidate) => candidate.canonicalWordIndex === 16)?.reason ?? "", /cannot override/);

  const segments = createCaptionSegmentsFromVerseBoundaries(boundaries, {
    "6:76": { arabic: { uthmani: "آية ستة وسبعون" }, translation: null, transliteration: null },
    "6:77": { arabic: { uthmani: "آية سبعة وسبعون" }, translation: null, transliteration: null },
  } as never);
  // The page's editor state passes this exact array to both preview and timeline.
  const editorState = { segments };
  assert.deepEqual(editorState.segments.map((segment) => [segment.verseKeys[0], segment.startMs, segment.endMs]), [["6:76", 32_064, 44_832], ["6:77", 44_832, 65_280]]);
  assert.equal(getActiveCaptionSegment(editorState.segments, 44_831)?.verseKeys[0], "6:76");
  assert.equal(getActiveCaptionSegment(editorState.segments, 44_832)?.verseKeys[0], "6:77");
});
