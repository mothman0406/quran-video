import assert from "node:assert/strict";
import test from "node:test";
import { resolveGlobalAyahBoundaries, resolveVerseBoundaries, type WordOccurrence } from "../src/lib/recognition/core.ts";
import type { CtcForcedAlignmentResult } from "../src/lib/recognition/ctc-forced-alignment.ts";
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

test("chunk-fallback CTC scaffold still permits the verified early 6:77 local refinement", () => {
  const ctcAlignment: CtcForcedAlignmentResult = {
    status: "complete",
    canonicalWords: [
      { verseKey: "6:76", canonicalWordIndex: 1, globalWordIndex: 1, canonicalArabic: "قال", alignmentText: "قال" },
      { verseKey: "6:77", canonicalWordIndex: 1, globalWordIndex: 2, canonicalArabic: "فلم", alignmentText: "فلم" },
    ],
    targetTokens: [],
    words: [
      { verseKey: "6:76", canonicalWordIndex: 1, globalWordIndex: 1, canonicalArabic: "قال", alignmentText: "قال", startMs: 32_064, endMs: 44_700, confidence: 0.9, alignmentScore: 0.9, lowConfidence: false },
      { verseKey: "6:77", canonicalWordIndex: 1, globalWordIndex: 2, canonicalArabic: "فلم", alignmentText: "فلم", startMs: 46_000, endMs: 60_000, confidence: 0.9, alignmentScore: 0.9, lowConfidence: false },
    ],
    verses: [
      { verseKey: "6:76", startMs: 32_064, endMs: 46_000, confidence: 0.9 },
      { verseKey: "6:77", startMs: 46_000, endMs: 60_000, confidence: 0.9 },
    ],
    pauses: [], audibleRepetitions: [], frameCount: 1, frameDurationMs: 1,
  };
  const result = resolveGlobalAyahBoundaries({
    verseKeys: ["6:76", "6:77"],
    wordOccurrences: [occurrence("6:77", 1, 44_832, 45_050), occurrence("6:77", 2, 45_100, 45_480)],
    speechRegions: [{ startMs: 32_064, endMs: 44_256, durationMs: 12_192, confidence: 0.95 }, { startMs: 44_832, endMs: 60_000, durationMs: 15_168, confidence: 0.95 }],
    verifiedFirstOnset: 32_064,
    finalSpeechEnd: 60_000,
    durationMs: 60_000,
    ctcAlignment,
  });
  assert.equal(result.boundaries[1]?.startMs, 44_832);
  assert.equal(result.boundaries[0]?.endMs, 44_832);
  assert.equal(result.usedCtcScaffold, true);
});

test("real-shaped Surah 69 local refinement records an overridden CTC tail without blocking caption generation", () => {
  const verseKeys = Array.from({ length: 14 }, (_, index) => `69:${index + 19}`);
  // CTC is deliberately complete and monotonic. Its 69:20 proposal is late,
  // while the accepted VAD-corroborated local onset is 9,504 ms. The raw CTC
  // 69:19 word extends beyond that accepted transition and must be diagnostic,
  // not a containment requirement for the final caption interval.
  const ctcStarts = [1_950, 14_148, 16_992, 19_392, 21_888, 25_000, 29_088, 36_000, 41_000, 47_000, 53_000, 58_000, 61_500, 64_000];
  const finalStarts = [1_950, 9_504, 16_992, 19_392, 21_888, 25_000, 29_088, 36_000, 41_000, 47_000, 53_000, 58_000, 61_500, 64_000];
  const endMs = 65_944;
  const ctcCanonicalWords = verseKeys.flatMap((verseKey, verseIndex) => Array.from({ length: verseKey === "69:20" || verseKey === "69:25" ? 2 : 1 }, (_, wordOffset) => ({
    verseKey, canonicalWordIndex: wordOffset + 1, globalWordIndex: verseIndex + wordOffset + 1, canonicalArabic: "كلمة", alignmentText: "كلمة",
  })));
  const ctcAlignment: CtcForcedAlignmentResult = {
    status: "complete",
    canonicalWords: ctcCanonicalWords,
    targetTokens: [],
    words: ctcCanonicalWords.map((word) => {
      const index = verseKeys.indexOf(word.verseKey);
      return {
      ...word,
      startMs: word.canonicalWordIndex === 1 ? ctcStarts[index]! : ctcStarts[index]! + 100,
      endMs: index === 0 ? 11_000 : word.canonicalWordIndex === 1 ? (ctcStarts[index + 1] ?? endMs) - 40 : (ctcStarts[index + 1] ?? endMs) - 20,
      confidence: 0.9,
      alignmentScore: 0.9,
      lowConfidence: false,
    }; }),
    verses: verseKeys.map((verseKey, index) => ({ verseKey, startMs: ctcStarts[index]!, endMs: index === 0 ? 11_000 : ctcStarts[index + 1] ?? endMs, confidence: 0.9 })),
    pauses: [],
    audibleRepetitions: [],
    frameCount: 1,
    frameDurationMs: 1,
  };
  const duplicated = [
    occurrence("69:20", 1, 9_504, 16_992), occurrence("69:20", 2, 9_700, 16_992), occurrence("69:20", 1, 9_504, 16_992),
    // This lexical interval belongs to 69:25 but is impossible for its CTC
    // corridor. The old per-transition resolver selected it anyway.
    occurrence("69:25", 1, 21_888, 29_088), occurrence("69:25", 2, 21_888, 29_088),
    occurrence("69:25", 1, 21_888, 29_088),
  ];
  const input = {
    verseKeys,
    wordOccurrences: duplicated,
    speechRegions: finalStarts.map((startMs, index) => ({ startMs, endMs: finalStarts[index + 1] ?? endMs, durationMs: (finalStarts[index + 1] ?? endMs) - startMs, confidence: 0.95 })),
    verifiedFirstOnset: finalStarts[0]!,
    finalSpeechEnd: endMs,
    durationMs: endMs,
    ctcAlignment,
  };
  const first = resolveGlobalAyahBoundaries(input);
  const second = resolveGlobalAyahBoundaries(input);
  assert.deepEqual(second, first, "equal input must yield exactly equal global boundaries");
  assert.equal(first.usedCtcScaffold, true);
  assert.deepEqual(first.boundaries.map((boundary) => boundary.verseKey), verseKeys);
  assert.equal(first.boundaries[0]?.endMs, 9_504);
  assert.equal(first.boundaries[1]?.startMs, 9_504);
  assert.ok(first.boundaries.every((boundary) => boundary.endMs - boundary.startMs > 20));
  assert.ok(first.boundaries.every((boundary, index) => index === first.boundaries.length - 1 || boundary.endMs === first.boundaries[index + 1]!.startMs));
  assert.ok(first.trace.every((item) => !item.allowedCorridor || item.allowedCorridor.startMs >= 0 && item.allowedCorridor.startMs < item.allowedCorridor.endMs && item.allowedCorridor.endMs <= endMs));
  assert.ok(first.trace.every((item) => item.uniqueRecoveredWordCount <= item.canonicalWordCount));
  const transition = first.boundaries.find((boundary) => boundary.verseKey === "69:25")!;
  assert.equal(transition.startMs, 29_088, "outside-corridor local evidence cannot displace the CTC scaffold");
  assert.ok(transition.evidence.candidates.every((candidate) => !candidate.accepted || candidate.timestampMs >= 27_288 && candidate.timestampMs <= 35_088));
  assert.match(transition.evidence.candidates.find((candidate) => candidate.timestampMs === 21_888)?.reason ?? "", /outside-corridor/);
  const refined = first.trace.find((item) => item.verseKey === "69:20")!;
  assert.equal(refined.ctcBaselineMs, 14_148);
  assert.equal(refined.finalStartMs, 9_504);
  assert.equal(refined.finalSource, "vad-corroborated-local-asr");
  assert.deepEqual(refined.acceptedEvidence.map((evidence) => [evidence.source, evidence.timestampMs]), [["vad-corroborated-local-asr", 9_504]]);
  assert.deepEqual(refined.rejectedEvidence.filter((evidence) => evidence.source === "ctc").map((evidence) => [evidence.status, evidence.timestampMs]), [["overridden", 14_148]]);
  assert.ok(ctcAlignment.words.some((word) => word.verseKey === "69:19" && word.endMs > first.boundaries[0]!.endMs), "the raw rejected CTC tail is intentionally outside the final 69:19 interval");
});
