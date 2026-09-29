import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import type { CtcCanonicalWord, CtcFrameLogits, CtcTargetToken } from "../src/lib/recognition/ctc-forced-alignment.ts";
import {
  boundaryLocalizationFrameRequirement,
  FROZEN_CORE_BOUNDARY_RULE,
  locateCoreBoundary,
  minimumCtcFramesRequired,
  selectFeasibleBoundaryTarget,
  selectApplicableCoreBoundaries,
  sliceCtcLogits,
} from "../tools/regression/quran-core-boundary-localizer.ts";

const execFileAsync = promisify(execFile);

const BLANK = 0;
const TARGETS: CtcTargetToken[] = [
  { tokenId: 1, token: "a", globalWordIndex: 1, owner: "canonical" },
  { tokenId: 2, token: "b", globalWordIndex: 2, owner: "canonical" },
];
const WORDS: CtcCanonicalWord[] = [
  { verseKey: "1:1", canonicalWordIndex: 1, globalWordIndex: 1, canonicalArabic: "a", alignmentText: "a" },
  { verseKey: "1:2", canonicalWordIndex: 1, globalWordIndex: 2, canonicalArabic: "b", alignmentText: "b" },
];

function logits(events: Readonly<Record<number, number>>, frames = 200): CtcFrameLogits {
  const vocabularySize = 4;
  const values = new Float32Array(frames * vocabularySize).fill(-6);
  for (let frame = 0; frame < frames; frame += 1) {
    values[frame * vocabularySize + BLANK] = 6;
    const token = events[frame];
    if (token === undefined) continue;
    values[frame * vocabularySize + BLANK] = -6;
    values[frame * vocabularySize + token] = 6;
  }
  return { values, frames, vocabularySize };
}

function longTarget(length: number) {
  const words: CtcCanonicalWord[] = [];
  const tokens: CtcTargetToken[] = [];
  for (let index = 0; index < length; index += 1) {
    const globalWordIndex = index + 1;
    words.push({ verseKey: "1:1", canonicalWordIndex: globalWordIndex, globalWordIndex, canonicalArabic: `w${globalWordIndex}`, alignmentText: `w${globalWordIndex}` });
    tokens.push({ tokenId: index % 3 + 1, token: `t${index}`, globalWordIndex, owner: "canonical" });
  }
  return { words, tokens };
}

test("CTC feasibility includes the mandatory blank between repeated labels", () => {
  const repeated: CtcTargetToken[] = [
    { tokenId: 1, token: "a", globalWordIndex: 1, owner: "canonical" },
    { tokenId: 1, token: "a", globalWordIndex: 1, owner: "canonical" },
    { tokenId: 2, token: "b", globalWordIndex: 2, owner: "canonical" },
  ];
  assert.equal(minimumCtcFramesRequired(repeated), 4);
  assert.equal(boundaryLocalizationFrameRequirement(repeated), 7);
});

test("long boundary targets become frame-derived canonical prefixes and suffixes", () => {
  const source = longTarget(100);
  const start = selectFeasibleBoundaryTarget({ edge: "start", availableFrames: 20, canonicalWords: source.words, targetTokens: source.tokens });
  const end = selectFeasibleBoundaryTarget({ edge: "end", availableFrames: 20, canonicalWords: source.words, targetTokens: source.tokens });
  for (const selected of [start, end]) {
    assert.equal(selected.representation.sourceFeasibility, "target-representation-infeasible");
    assert.equal(selected.representation.status, "bounded");
    assert.ok(selected.targetTokens.length >= FROZEN_CORE_BOUNDARY_RULE.minimumTargetTokenCount);
    assert.ok(boundaryLocalizationFrameRequirement(selected.targetTokens) <= selected.representation.availableFrames);
  }
  assert.deepEqual(start.targetTokens.map((token) => token.globalWordIndex), Array.from({ length: 10 }, (_, index) => index + 1));
  assert.deepEqual(end.targetTokens.map((token) => token.globalWordIndex), Array.from({ length: 10 }, (_, index) => index + 91));
});

test("short boundary targets remain byte-for-byte complete", () => {
  const start = selectFeasibleBoundaryTarget({ edge: "start", availableFrames: 20, canonicalWords: WORDS, targetTokens: TARGETS });
  const end = selectFeasibleBoundaryTarget({ edge: "end", availableFrames: 20, canonicalWords: WORDS, targetTokens: TARGETS });
  assert.equal(start.representation.status, "full");
  assert.equal(end.representation.status, "full");
  assert.deepEqual(start.targetTokens, TARGETS);
  assert.deepEqual(end.targetTokens, TARGETS);
});

test("a target too small for the existing minimum proof remains infeasible rather than accepted", () => {
  const source = longTarget(10);
  const selected = selectFeasibleBoundaryTarget({ edge: "start", availableFrames: 3, canonicalWords: source.words, targetTokens: source.tokens });
  assert.equal(selected.representation.status, "infeasible");
  assert.deepEqual(selected.targetTokens, []);
});

test("leading arbitrary speech remains outside the independently located core start", () => {
  const result = locateCoreBoundary({
    edge: "start", audioStartMs: 0, audioEndMs: 20_000, firstSpeechMs: 0, finalSpeechMs: 20_000,
    logits: logits({ 5: 3, 12: 3, 30: 1, 32: 2 }), canonicalWords: WORDS, targetTokens: TARGETS, blankTokenId: BLANK,
  });
  assert.ok(result.selected);
  assert.ok((result.selected?.cutMs ?? 0) >= 2_760 && (result.selected?.cutMs ?? 0) <= 3_000);
  assert.ok(result.selected.cutMs > 0);
  assert.equal(result.selected.alignmentComplete, true);
  assert.equal(result.selected.targetCoverage, 1);
});

test("the core end locator excludes incompatible trailing speech", () => {
  const result = locateCoreBoundary({
    edge: "end", audioStartMs: 0, audioEndMs: 20_000, firstSpeechMs: 0, finalSpeechMs: 16_000,
    logits: logits({ 128: 1, 130: 2, 145: 3, 150: 3 }), canonicalWords: WORDS, targetTokens: TARGETS, blankTokenId: BLANK,
  });
  assert.ok(result.selected);
  assert.ok((result.selected?.cutMs ?? 0) >= 13_000 && (result.selected?.cutMs ?? 0) <= 13_200);
  assert.ok(result.selected.cutMs < 16_000);
  assert.equal(result.selected.temporalConsistency, true);
});

test("strict canonical prefix evidence retains an earlier supported boundary", () => {
  const result = locateCoreBoundary({
    edge: "start", audioStartMs: 0, audioEndMs: 20_000, firstSpeechMs: 0, finalSpeechMs: 20_000,
    logits: logits({ 5: 1, 7: 2, 30: 1, 32: 2 }), canonicalWords: WORDS, targetTokens: TARGETS, blankTokenId: BLANK,
    speechRegions: [{ startMs: 0, endMs: 20_000, durationMs: 20_000, confidence: 1 }],
  });
  assert.ok(result.selected?.outerEvidence);
  assert.ok((result.selected?.anchorCutMs ?? 0) >= 2_760 && (result.selected?.anchorCutMs ?? 0) <= 3_000);
  assert.ok((result.selected?.cutMs ?? Infinity) <= 500);
  assert.ok((result.selected?.outerEvidence?.likelihoodDifference ?? 0) > 0);
});

test("VAD alone cannot expand a boundary without a strict canonical-over-blank win", () => {
  const result = locateCoreBoundary({
    edge: "start", audioStartMs: 0, audioEndMs: 20_000, firstSpeechMs: 0, finalSpeechMs: 20_000,
    logits: logits({ 30: 1, 32: 2 }), canonicalWords: WORDS, targetTokens: TARGETS, blankTokenId: BLANK,
    speechRegions: [{ startMs: 0, endMs: 20_000, durationMs: 20_000, confidence: 1 }],
  });
  assert.equal(result.selected?.outerEvidence, undefined);
  assert.ok((result.selected?.cutMs ?? 0) >= 2_760);
});

test("unrelated voiced logits cannot expand the accepted canonical boundary", () => {
  const result = locateCoreBoundary({
    edge: "start", audioStartMs: 0, audioEndMs: 20_000, firstSpeechMs: 0, finalSpeechMs: 20_000,
    logits: logits({ 5: 3, 7: 3, 30: 1, 32: 2 }), canonicalWords: WORDS, targetTokens: TARGETS, blankTokenId: BLANK,
    speechRegions: [{ startMs: 0, endMs: 20_000, durationMs: 20_000, confidence: 1 }],
  });
  assert.equal(result.selected?.outerEvidence, undefined);
  assert.ok((result.selected?.cutMs ?? 0) >= 2_760);
});

test("wrong-order adjacent Quran tokens cannot expand the accepted core", () => {
  const result = locateCoreBoundary({
    edge: "start", audioStartMs: 0, audioEndMs: 20_000, firstSpeechMs: 0, finalSpeechMs: 20_000,
    logits: logits({ 5: 2, 7: 1, 30: 1, 32: 2 }), canonicalWords: WORDS, targetTokens: TARGETS, blankTokenId: BLANK,
    speechRegions: [{ startMs: 0, endMs: 20_000, durationMs: 20_000, confidence: 1 }],
  });
  assert.equal(result.selected?.outerEvidence, undefined);
  assert.ok((result.selected?.cutMs ?? 0) >= 2_760);
});

test("strict canonical suffix evidence retains a later supported completion", () => {
  const result = locateCoreBoundary({
    edge: "end", audioStartMs: 0, audioEndMs: 20_000, firstSpeechMs: 0, finalSpeechMs: 16_000,
    logits: logits({ 128: 1, 130: 2, 145: 1, 147: 2 }), canonicalWords: WORDS, targetTokens: TARGETS, blankTokenId: BLANK,
    speechRegions: [{ startMs: 0, endMs: 16_000, durationMs: 16_000, confidence: 1 }],
  });
  assert.equal(result.selected?.cutMs, 16_000);
  assert.ok(result.selected?.outerEvidence);
  assert.equal(result.selected?.outerEvidence?.blankCompletionApplied, true);
});

test("candidate offsets use equal acoustic durations and per-frame normalization", () => {
  const result = locateCoreBoundary({
    edge: "start", audioStartMs: 0, audioEndMs: 20_000, firstSpeechMs: 0, finalSpeechMs: 20_000,
    logits: logits({ 30: 1, 32: 2 }), canonicalWords: WORDS, targetTokens: TARGETS, blankTokenId: BLANK,
  });
  assert.ok(result.candidates.length > 2);
  assert.equal(new Set(result.candidates.map((candidate) => candidate.frameCount)).size, 1);
  assert.ok(result.candidates.every((candidate) => candidate.normalizedTargetLogLikelihood === null
    || Number.isFinite(candidate.normalizedTargetLogLikelihood)));
});

test("a weak partial target cannot beat a complete boundary target", () => {
  const result = locateCoreBoundary({
    edge: "start", audioStartMs: 0, audioEndMs: 20_000, firstSpeechMs: 0, finalSpeechMs: 20_000,
    logits: logits({ 10: 1, 30: 1, 32: 2 }), canonicalWords: WORDS, targetTokens: TARGETS, blankTokenId: BLANK,
  });
  assert.ok((result.selected?.cutMs ?? 0) >= 2_760 && (result.selected?.cutMs ?? 0) <= 3_000);
  assert.notEqual(result.selected?.cutMs, 1_000);
});

test("frame slicing excludes evidence before and after a proposed cut", () => {
  const source = logits({ 10: 1, 30: 2 }, 40);
  const sliced = sliceCtcLogits(source, 0, 4_000, 2_000, 4_000);
  assert.equal(sliced?.frames, 20);
  assert.equal(sliced?.values.length, 80);
  assert.equal(sliced?.values[2], -6);
  assert.equal(sliced?.values[(30 - 20) * 4 + 2], 6);
});

test("the frozen locator is deterministic, compact, and reader-agnostic", () => {
  assert.equal(Object.isFrozen(FROZEN_CORE_BOUNDARY_RULE), true);
  assert.equal(FROZEN_CORE_BOUNDARY_RULE.boundaryTargetAyahCount, 3);
  assert.equal("reader" in FROZEN_CORE_BOUNDARY_RULE, false);
  assert.equal("surah" in FROZEN_CORE_BOUNDARY_RULE, false);
  assert.throws(() => {
    (FROZEN_CORE_BOUNDARY_RULE as { coarseStepMs: number }).coarseStepMs = 100;
  }, TypeError);
});

test("only edges with an adjacent canonical ayah apply a searched boundary", () => {
  const selected = { cutMs: 2_000 } as NonNullable<ReturnType<typeof locateCoreBoundary>["selected"]>;
  const startLocation = { edge: "start" as const, searchStartMs: 0, searchEndMs: 6_000, coarseEvaluationCount: 1, fineEvaluationCount: 0, selected, candidates: [selected] };
  const endLocation = { ...startLocation, edge: "end" as const, selected: { ...selected, cutMs: 10_000 } };
  assert.deepEqual(selectApplicableCoreBoundaries({
    core: { startAyah: 1, endAyah: 12 }, surahAyahCount: 20,
    establishedStartMs: 400, establishedEndMs: 12_000, startLocation, endLocation,
  }), { startMs: 400, endMs: 10_000 });
  assert.deepEqual(selectApplicableCoreBoundaries({
    core: { startAyah: 2, endAyah: 15 }, surahAyahCount: 15,
    establishedStartMs: 100, establishedEndMs: 14_000, startLocation, endLocation,
  }), { startMs: 2_000, endMs: 14_000 });
});

test("frozen evaluator proves H/J design separation before Positive B and preserves every regression", async () => {
  const run = () => execFileAsync(process.execPath, ["--experimental-strip-types", "tools/regression/evaluate-quran-core-boundary-localization.ts"], { cwd: process.cwd(), maxBuffer: 8_000_000 });
  const [first, second] = await Promise.all([run(), run()]);
  assert.equal(first.stdout, second.stdout);
  const report = JSON.parse(first.stdout);
  assert.equal(report.frozenBeforePositiveB, true);
  assert.deepEqual(report.calibrationExclusions, [
    "canonical-validation-positive-reader-m-101-1-11",
    "canonical-validation-negative-reader-l-100-reset",
  ]);
  assert.equal(report.design.h.decision, true);
  assert.equal(report.design.h.finalRange, "91:1-15");
  assert.equal(report.design.j.decision, false);
  assert.equal(report.design.j.finalRange, "90:1-12");
  assert.equal(report.design.passes, true);
  assert.equal(report.externalPostFreeze.positiveB.provisionalRange, "101:2-11");
  assert.equal(report.externalPostFreeze.positiveB.finalCombinedRange, "101:1-11");
  assert.equal(report.externalPostFreeze.positiveB.boundary.decision, true);
  assert.equal(report.externalPostFreeze.negativeA.integrityValid, false);
  assert.deepEqual(report.externalPostFreeze.negativeA.integrityVetoes, ["reset-or-revisit-run", "repeated-covered-quran-run"]);
  assert.equal(report.historical.h.finalRange, "91:1-15");
  assert.equal(report.historical.k.finalRange, "92:1-14");
  assert.equal(report.historical.genuineExact, "20/20");
  assert.equal(report.historical.adversarialRejected, "23/23");
  assert.equal(report.canonicalCompleteness, true);
  assert.equal(report.totalMediaRecognitionRuns, 4);
  assert.equal(report.conclusion, "CANDIDATE JUSTIFIED FOR ONE FINAL FROZEN VALIDATION");
});

test("retained core-boundary fixtures are privacy-safe", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", "tools/regression/validate-quran-core-boundary-privacy.ts"], { cwd: process.cwd() });
  assert.match(stdout, /PASS Quran core-boundary privacy \(3 fixtures/u);
});
