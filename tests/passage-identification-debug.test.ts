import assert from "node:assert/strict";
import test from "node:test";
import { createFinalPassageDebugFacts, createPassageIdentificationDebugReport } from "../src/lib/recognition/passage-identification-debug.ts";
import { decideFastConformerPassage } from "../src/lib/recognition/passage-decision.ts";
import { canonicalSpanFromFastConformerIdentification } from "../src/lib/recognition/core.ts";
import type { FastConformerIdentificationResult, QuranPassageCandidate } from "../src/lib/recognition/fastconformer-identification.ts";

function candidate(index: number): QuranPassageCandidate {
  return { start: { surah: 74, ayah: index + 1, canonicalWordIndex: 1, globalWordIndex: index + 1 }, end: { surah: 74, ayah: index + 1, canonicalWordIndex: 2, globalWordIndex: index + 2 }, startPosition: index, endPosition: index + 1, retrievalScore: 10 - index, lexicalUniqueness: 0.5, lexicalCoverage: 0.7, targetCoverage: 0.8, ctcScore: -2, normalizedCtcScore: -0.2 - index / 100, confidence: 0.8, marginFromSecond: 0.2, ctcTokenCount: 3, optionalPrelude: { available: false, selected: "absent", lexicalText: "", canonicalFirstWordStart: { surah: 74, ayah: index + 1, canonicalWordIndex: 1, globalWordIndex: index + 1 }, canonicalOnlyScore: -2, optionalBasmalahPlusCanonicalScore: null } };
}

test("developer passage report retains CTC evidence, ten candidates, and gate reason without media", () => {
  const candidates = Array.from({ length: 12 }, (_, index) => candidate(index));
  const span = { start: candidates[0]!.start, end: candidates[0]!.end };
  const identification: FastConformerIdentificationResult = { status: "complete", span, canonicalSpan: span, wordLevelSpan: span, selectedSurah: 74, optionalPrelude: null, surahConsensus: { selectedSurah: 74, strongWindowCount: 1, agreeingStrongWindows: 1 }, windowResults: [{ index: 0, startMs: 0, endMs: 12000, voicedMs: 9000, greedy: { tokenIds: [4, 8, 15], lexicalText: "يا ايها المدثر", lexicalTokens: ["يا", "ايها", "المدثر"] }, candidates, selectedCandidate: candidates[0]!, state: "strong-candidate", elapsedMs: 1, performance: { retrievalMs: 1, rerankingMs: 1, candidatesReranked: 12 }, crossSurahCandidatesRejected: 2 }], retrievalCandidates: candidates, normalizedCtcScore: -0.2, margin: 0.2, continuityScore: 1, globalHypotheses: [], confidence: { composite: 0.8, normalizedBestCtcScore: -0.2, bestVsSecondMargin: 0.2, agreeingWindows: 1, voicedAudioExplained: 0.9 }, performance: { inferenceMs: 1, retrievalMs: 1, rerankingMs: 1, candidatesReranked: 12, totalMs: 3 }, CROSS_SURAH_CANDIDATES_REJECTED: 2 };
  const report = createPassageIdentificationDebugReport(identification, decideFastConformerPassage(identification, canonicalSpanFromFastConformerIdentification(span)));
  assert.equal(report.windows[0]?.candidates.length, 10);
  assert.deepEqual(report.windows[0]?.ctcTokenSequence, [4, 8, 15]);
  assert.equal(report.final.crossSurahCandidatesRejected, 2);
  assert.equal(JSON.stringify(report).includes("audio"), false);
});

function identificationWithWindows(windowCount: number, coherentCtc: number): FastConformerIdentificationResult {
  const candidates = Array.from({ length: windowCount }, (_, index) => candidate(index));
  const windows = candidates.map((value, index) => ({
    index,
    startMs: index * 6_000,
    endMs: index * 6_000 + 12_000,
    voicedMs: 8_000,
    greedy: { tokenIds: [], lexicalText: "", lexicalTokens: [] },
    candidates: [value],
    selectedCandidate: value,
    state: "strong-candidate" as const,
    elapsedMs: 1,
    performance: { retrievalMs: 1, rerankingMs: 1, candidatesReranked: 1 },
    crossSurahCandidatesRejected: 0,
  }));
  const span = { start: candidates[0]!.start, end: candidates.at(-1)!.end };
  return {
    status: "complete",
    span,
    canonicalSpan: span,
    wordLevelSpan: span,
    selectedSurah: 74,
    optionalPrelude: null,
    surahConsensus: { selectedSurah: 74, strongWindowCount: windowCount, agreeingStrongWindows: windowCount },
    windowResults: windows,
    retrievalCandidates: candidates,
    normalizedCtcScore: -0.2,
    margin: 0.2,
    continuityScore: 1,
    globalHypotheses: [{ surah: 74, span, path: candidates.map((value, windowIndex) => ({ windowIndex, candidate: value })), acousticScore: coherentCtc, lexicalUniqueness: 0.5, continuityScore: 1, voicedCoverage: 0.9, localSharedPhraseScore: 0.5, finalScore: 1, agreeingWindows: windowCount }],
    confidence: { composite: 0.8, normalizedBestCtcScore: -0.2, bestVsSecondMargin: 0.2, agreeingWindows: windowCount, voicedAudioExplained: 0.9 },
    performance: { inferenceMs: 1, retrievalMs: 1, rerankingMs: 1, candidatesReranked: windowCount, totalMs: 4 },
    CROSS_SURAH_CANDIDATES_REJECTED: 0,
  };
}

test("final passage diagnostics expose best-window gate mode and every decision field for a short recording", () => {
  const identification = identificationWithWindows(3, -1.01);
  const decision = decideFastConformerPassage(identification, canonicalSpanFromFastConformerIdentification(identification.canonicalSpan));
  const facts = createFinalPassageDebugFacts(identification, decision);
  assert.equal(decision.accepted, true, "short recordings do not gate on coherent-path mean CTC");
  assert.equal(facts.gateMode, "short-recording-best-window-ctc");
  assert.deepEqual(facts.failedAcceptanceRules, []);
  for (const field of ["bestWindowCtc", "coherentPathMeanCtc", "margin", "coverage", "agreeingWindowCount", "totalWindowCount", "coherentRatio", "longestUnsupportedRun", "lexicalUniqueness", "structuralValidity", "surahConsistency", "reasons"]) {
    assert.equal(field in facts, true, `missing ${field}`);
  }
});

test("final passage diagnostics expose coherent-path gate mode and failed rules for a long recording", () => {
  const identification = identificationWithWindows(5, -1.01);
  const decision = decideFastConformerPassage(identification, canonicalSpanFromFastConformerIdentification(identification.canonicalSpan));
  const facts = createFinalPassageDebugFacts(identification, decision);
  assert.equal(decision.accepted, false);
  assert.equal(facts.gateMode, "long-recording-best-and-coherent-path-ctc");
  assert.deepEqual(facts.failedAcceptanceRules, ["coherent-path-ctc"]);
});
