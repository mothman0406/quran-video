import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCtcWords, type CtcCanonicalWord, type CtcTargetToken } from "../src/lib/recognition/ctc-forced-alignment.ts";
import { extractCtcBoundaryCandidates, ctcWordDiagnostics, refineBoundaryWithLocalEnergy } from "../tools/timing-benchmark/ctc-boundaries.ts";
import { importCpFairReference } from "../tools/timing-benchmark/cpfair.ts";
import { decideTimingPromotion, evaluateTimingBenchmark, evaluateTimingFixture, timingBenchmarkMarkdown, validateStructuralTiming } from "../tools/timing-benchmark/lib.ts";
import type { BenchmarkWordTiming, TimingFixture, WordTimingResult } from "../tools/timing-benchmark/types.ts";
import { createBenchmarkAudioVariant, transformTimestampForPlaybackSpeed } from "../tools/timing-benchmark/variants.ts";
import { phonemizeQuranWord } from "../tools/timing-benchmark/quran-phonetics.ts";
import { forceAlignPhonemeDp } from "../tools/timing-benchmark/phoneme-dp.ts";
import { deriveCtcTransitionBoundaryWords } from "../src/lib/recognition/ctc-transition-boundary.ts";

const canonical: BenchmarkWordTiming[] = [
  { verseKey: "1:1", canonicalWordIndex: 1, canonicalArabic: "بسم", startMs: 0 },
  { verseKey: "1:1", canonicalWordIndex: 2, canonicalArabic: "الله", startMs: 0 },
  { verseKey: "1:2", canonicalWordIndex: 1, canonicalArabic: "الحمد", startMs: 0 },
];
const fixture: TimingFixture = {
  fixtureId: "fixture",
  source: "test",
  surah: 1,
  ayahRange: { start: 1, end: 2 },
  words: [
    { verseKey: "1:1", canonicalWordIndex: 1, expectedStartMs: 100, expectedEndMs: 220, provenance: "human-reviewed" },
    { verseKey: "1:1", canonicalWordIndex: 2, expectedStartMs: 230, provenance: "human-reviewed" },
  ],
  boundaries: [{ verseKey: "1:2", expectedStartMs: 400, provenance: "human-reviewed" }],
};
const result: WordTimingResult = {
  fixtureId: "fixture",
  engineId: "fastconformer-current",
  words: [
    { ...canonical[0]!, startMs: 110, endMs: 225, confidence: 0.8 },
    { ...canonical[1]!, startMs: 225, endMs: 390 },
    { ...canonical[2]!, startMs: 410, endMs: 600 },
  ],
};

test("word-timing benchmark reports starts, ends, ayah boundaries, and worst diagnostics separately", () => {
  const report = evaluateTimingFixture(fixture, canonical, result);
  assert.equal(report.structural.valid, true);
  assert.equal(report.wordStarts.count, 2);
  assert.equal(report.wordStarts.medianAbsoluteErrorMs, 5, "nearest-rank median is deterministic for an even sample count");
  assert.equal(report.wordEnds.count, 1);
  assert.equal(report.wordEnds.maxAbsoluteErrorMs, 5);
  assert.equal(report.ayahBoundaryStarts.meanSignedErrorMs, 10);
  const aggregate = evaluateTimingBenchmark([{ fixture, canonicalWords: canonical, result }]);
  assert.match(timingBenchmarkMarkdown(aggregate), /Ayah-boundary starts \(not word labels\)/);
  assert.equal(aggregate.aggregate.worstBoundaries[0]?.absoluteErrorMs, 10);
  assert.equal(aggregate.perReciter.unattributed?.wordStarts.count, 2);
});

test("promotion gate rejects trivial timing noise even with complete canonical coverage", () => {
  const current = evaluateTimingBenchmark([{ fixture, canonicalWords: canonical, result }]);
  const nearTie = evaluateTimingBenchmark([{ fixture, canonicalWords: canonical, result: { ...result, engineId: "candidate", words: result.words.map((word) => ({ ...word, startMs: word.startMs - 1 })) } }]);
  const decision = decideTimingPromotion(current, nearTie);
  assert.equal(decision.promote, false);
  assert.ok(decision.reasons.some((reason) => reason.includes("not material")));
});

test("promotion gate accepts a material CTC-derived word-end win when starts remain equivalent", () => {
  const current = evaluateTimingBenchmark([{ fixture, canonicalWords: canonical, result: { ...result, words: result.words.map((word, index) => index === 0 ? { ...word, endMs: 111 } : word) } }]);
  const candidate = evaluateTimingBenchmark([{ fixture, canonicalWords: canonical, result: { ...result, engineId: "fastconformer-transition-boundary", words: result.words.map((word, index) => index === 0 ? { ...word, endMs: 220 } : word) } }]);
  const decision = decideTimingPromotion(current, candidate);
  assert.equal(decision.promote, true);
});

test("word-timing benchmark rejects omissions, duplicates, reordered words, backwards timestamps, and non-positive ends", () => {
  const broken: WordTimingResult = {
    ...result,
    words: [
      { ...canonical[1]!, startMs: 200, endMs: 200 },
      { ...canonical[0]!, startMs: 100, endMs: 190 },
      { ...canonical[0]!, startMs: 250, endMs: 300 },
    ],
  };
  const validity = validateStructuralTiming(canonical, broken);
  assert.equal(validity.valid, false);
  assert.deepEqual(validity.missingWords, ["1:2#1"]);
  assert.deepEqual(validity.duplicateWords, ["1:1#1"]);
  assert.ok(validity.outOfOrderWords.length >= 1);
  assert.ok(validity.timestampFailures.some((failure) => failure.includes("goes backward")));
  assert.ok(validity.timestampFailures.some((failure) => failure.includes("end timestamp")));
});

test("cpfair import retains machine provenance and does not invent inner-word timestamps", () => {
  const references = importCpFairReference(fixture, [{ surah: 1, ayah: 1, segments: [[0, 2, 10, 200]] }], "https://example.invalid/release");
  assert.deepEqual(references, [
    { verseKey: "1:1", canonicalWordIndex: 1, expectedStartMs: 10, provenance: "external-reference-dataset", source: "https://example.invalid/release" },
    { verseKey: "1:1", canonicalWordIndex: 2, expectedStartMs: 200, expectedEndMs: 200, provenance: "external-reference-dataset", source: "https://example.invalid/release" },
  ]);
});

function logitsFor(ids: number[], vocabularySize = 5) {
  const values = new Float32Array(ids.length * vocabularySize).fill(-12);
  ids.forEach((id, frame) => { values[frame * vocabularySize + id] = 12; });
  return { values, frames: ids.length, vocabularySize };
}

test("raw CTC boundary experiments preserve the canonical path and emit useful diagnostics", () => {
  const words: CtcCanonicalWord[] = canonicalCtcWords([{ verseKey: "1:1", text: "بسم الله" }]);
  const tokens: CtcTargetToken[] = [
    { tokenId: 1, token: "a", globalWordIndex: 1 },
    { tokenId: 2, token: "b", globalWordIndex: 2 },
  ];
  const input = { words, tokens, logits: logitsFor([0, 1, 0, 2, 0]), blankTokenId: 0, startMs: 0, endMs: 500 };
  const candidates = extractCtcBoundaryCandidates(input);
  assert.deepEqual(candidates.filter((candidate) => candidate.method === "first-aligned-token").map((candidate) => candidate.startMs), [100, 300]);
  assert.equal(candidates.filter((candidate) => candidate.method === "blank-to-lexical-transition").length, 2);
  const diagnostics = ctcWordDiagnostics(input);
  assert.equal(diagnostics.length, 2);
  assert.deepEqual(diagnostics[0]?.ctcTokens.map((token) => [token.tokenId, token.firstAlignedFrame, token.lastAlignedFrame]), [[1, 1, 1]]);
  assert.equal(diagnostics[0]?.nextWordStartMs, 300);
});

test("CTC transition boundary derives ordered ends from terminal, blank, and next-onset evidence", () => {
  const words: CtcCanonicalWord[] = canonicalCtcWords([{ verseKey: "1:1", text: "بسم الله" }]);
  const tokens: CtcTargetToken[] = [
    { tokenId: 1, token: "a", globalWordIndex: 1 },
    { tokenId: 2, token: "b", globalWordIndex: 2 },
  ];
  const timings = deriveCtcTransitionBoundaryWords(words, tokens, logitsFor([0, 1, 0, 0, 2, 0]), { blankTokenId: 0, startMs: 0, endMs: 600 });
  assert.equal(timings?.length, 2);
  assert.equal(timings?.[0]?.transition.terminalFrame, 1);
  assert.equal(timings?.[0]?.transition.nextOnsetFrame, 4);
  assert.ok((timings?.[0]?.endMs ?? 0) > (timings?.[0]?.startMs ?? 0));
  assert.ok((timings?.[1]?.startMs ?? 0) >= (timings?.[0]?.startMs ?? 0));
});

test("Quran phonetics preserve word ownership and phoneme DP consumes the complete fixed sequence", () => {
  const first = phonemizeQuranWord({ verseKey: "1:1", canonicalWordIndex: 1, canonicalArabic: "الشَّمْس" });
  const second = phonemizeQuranWord({ verseKey: "1:1", canonicalWordIndex: 2, canonicalArabic: "مَدَّ" });
  assert.ok(first.phonemes.includes("ʃ"), "sun-letter surface remains audible");
  assert.equal(second.phonemes.filter((phone) => phone === "d").length, 2, "shadda expands the consonant");
  const labels = ["<blank>", ...new Set([...first.phonemes, ...second.phonemes])];
  const sequence = ["<blank>", ...first.phonemes, "<blank>", ...second.phonemes, "<blank>"];
  const values = new Float32Array(sequence.length * labels.length).fill(-20);
  sequence.forEach((label, frame) => { values[frame * labels.length + labels.indexOf(label)] = 0; });
  const aligned = forceAlignPhonemeDp([first, second], { labels, values, frames: sequence.length });
  assert.deepEqual(aligned?.map((word) => [word.verseKey, word.canonicalWordIndex]), [["1:1", 1], ["1:1", 2]]);
  assert.ok((aligned?.[0]?.endFrame ?? 0) <= (aligned?.[1]?.startFrame ?? Infinity));
});

test("local acoustic refinement stays within its supplied CTC neighborhood", () => {
  const samples = new Float32Array(1_000);
  samples[520] = 1;
  const refinement = refineBoundaryWithLocalEnergy(samples, 1_000, 500, 40);
  assert.ok(refinement.refinedMs >= 460 && refinement.refinedMs <= 540);
  assert.equal(refinement.evidence, "maximum-local-rms-rise");
});

test("benchmark degradations are reproducible and speed references transform with the audio duration", () => {
  const clean = new Float32Array([0, 0.5, -0.5, 0]);
  assert.deepEqual(createBenchmarkAudioVariant(clean, 16_000, { id: "clean" }), clean);
  assert.deepEqual(
    createBenchmarkAudioVariant(clean, 16_000, { id: "room-noise", snrDb: 10, seed: 7 }),
    createBenchmarkAudioVariant(clean, 16_000, { id: "room-noise", snrDb: 10, seed: 7 }),
  );
  assert.equal(transformTimestampForPlaybackSpeed(1_100, 1.1), 1_000);
  assert.equal(transformTimestampForPlaybackSpeed(900, 0.9), 1_000);
});
