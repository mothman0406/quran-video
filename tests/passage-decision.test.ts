import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTranscript, canonicalSpanFromFastConformerIdentification, createPrimaryTranscript } from "../src/lib/recognition/core.ts";
import { decideFastConformerPassage } from "../src/lib/recognition/passage-decision.ts";
import type { FastConformerIdentificationResult, IdentificationWindowResult, QuranGlobalHypothesis, QuranPassageCandidate } from "../src/lib/recognition/fastconformer-identification.ts";

function candidate(surah = 74, ayah = 1): QuranPassageCandidate {
  return { start: { surah, ayah, canonicalWordIndex: 1, globalWordIndex: 1 }, end: { surah, ayah: ayah + 1, canonicalWordIndex: 1, globalWordIndex: 3 }, startPosition: 0, endPosition: 2, retrievalScore: 1, lexicalUniqueness: 0.8, lexicalCoverage: 1, targetCoverage: 1, ctcScore: -2, normalizedCtcScore: -0.23, confidence: 0.8, marginFromSecond: 0.18, ctcTokenCount: 2, optionalPrelude: { available: false, selected: "absent", lexicalText: "", canonicalFirstWordStart: { surah, ayah, canonicalWordIndex: 1, globalWordIndex: 1 }, canonicalOnlyScore: -2, optionalBasmalahPlusCanonicalScore: null } };
}

function window(index: number, value = candidate()): IdentificationWindowResult {
  return { index, startMs: index * 6_000, endMs: index * 6_000 + 12_000, voicedMs: 8_000, greedy: { tokenIds: [], lexicalText: "", lexicalTokens: [] }, candidates: [value], selectedCandidate: value, state: "strong-candidate", elapsedMs: 0, performance: { retrievalMs: 0, rerankingMs: 0, candidatesReranked: 1 }, crossSurahCandidatesRejected: 0 };
}

function identification(overrides: Partial<FastConformerIdentificationResult> = {}): FastConformerIdentificationResult {
  const windows = [window(0), window(1), window(2), window(3)];
  const span = { start: { surah: 74, ayah: 1, canonicalWordIndex: 1, globalWordIndex: 1 }, end: { surah: 74, ayah: 9, canonicalWordIndex: 1, globalWordIndex: 20 } };
  return { status: "complete", span, canonicalSpan: span, wordLevelSpan: span, selectedSurah: 74, optionalPrelude: null, surahConsensus: { selectedSurah: 74, strongWindowCount: 4, agreeingStrongWindows: 4 }, windowResults: windows, retrievalCandidates: windows.map((item) => item.selectedCandidate!), normalizedCtcScore: -0.233966, margin: 0.183743, continuityScore: 1, globalHypotheses: [], confidence: { composite: 0.993, normalizedBestCtcScore: -0.233966, bestVsSecondMargin: 0.183743, agreeingWindows: 4, voicedAudioExplained: 1 }, performance: { inferenceMs: 1, retrievalMs: 1, rerankingMs: 1, candidatesReranked: 4, totalMs: 4 }, CROSS_SURAH_CANDIDATES_REJECTED: 0, ...overrides };
}

function hypothesis(overrides: Partial<QuranGlobalHypothesis> = {}): QuranGlobalHypothesis {
  return {
    surah: 74,
    span: identification().canonicalSpan,
    path: identification().windowResults.map((_, windowIndex) => ({ windowIndex, candidate: candidate() })),
    acousticScore: -0.2,
    lexicalUniqueness: 0.5,
    localSharedPhraseScore: 0.5,
    continuityScore: 1,
    voicedCoverage: 1,
    finalScore: 1,
    agreeingWindows: 4,
    ...overrides,
  };
}

function decision(value: FastConformerIdentificationResult | null) {
  return decideFastConformerPassage(value, canonicalSpanFromFastConformerIdentification(value?.canonicalSpan ?? null));
}

test("production gate accepts the reported noisy Surah 74 multi-window recovery shape", () => {
  const result = decision(identification());
  assert.deepEqual({ accepted: result.accepted, state: result.state, surah: result.evidence.selectedSurah, agreement: result.evidence.agreeingStrongWindows }, { accepted: true, state: "accepted", surah: 74, agreement: 4 });
});

test("a coherent three-window passage uses strong best-window evidence without the long-timeline mean CTC gate", () => {
  const windows = [window(0), window(1), window(2)];
  const result = decision(identification({
    windowResults: windows,
    surahConsensus: { selectedSurah: 74, strongWindowCount: 2, agreeingStrongWindows: 2 },
    normalizedCtcScore: -0.349854,
    margin: 3.6864,
    globalHypotheses: [hypothesis({
      path: [{ windowIndex: 0, candidate: candidate(74, 1) }, { windowIndex: 1, candidate: null }, { windowIndex: 2, candidate: candidate(74, 8) }],
      acousticScore: -1.012985,
      lexicalUniqueness: 0.460593,
      localSharedPhraseScore: 0.539407,
      voicedCoverage: 0.6296,
      agreeingWindows: 2,
    })],
    confidence: { composite: 0.8, normalizedBestCtcScore: -0.349854, bestVsSecondMargin: 3.6864, agreeingWindows: 2, voicedAudioExplained: 0.6296 },
  }));
  assert.deepEqual({
    accepted: result.accepted,
    state: result.state,
    windows: result.evidence.totalWindowCount,
    bestCtc: result.evidence.normalizedBestCtcScore,
    coherentCtc: result.evidence.normalizedCoherentCtcScore,
    coverage: result.evidence.voicedAudioExplained,
    margin: result.evidence.bestVsSecondMargin,
    agreement: result.evidence.agreeingStrongWindows,
    ratio: result.evidence.coherentWindowRatio,
    gap: result.evidence.longestUnexplainedWindowRun,
  }, {
    accepted: true,
    state: "accepted",
    windows: 3,
    bestCtc: -0.349854,
    coherentCtc: -1.012985,
    coverage: 0.6296,
    margin: 3.6864,
    agreement: 2,
    ratio: 0.6667,
    gap: 1,
  });
});

test("production gate supports a genuinely strong short clip but rejects weak and ambiguous single windows", () => {
  const one = identification({ windowResults: [window(0)], surahConsensus: { selectedSurah: 74, strongWindowCount: 1, agreeingStrongWindows: 1 }, confidence: { composite: 0.1, normalizedBestCtcScore: -0.2, bestVsSecondMargin: 0.15, agreeingWindows: 1, voicedAudioExplained: 0.9 }, normalizedCtcScore: -0.2, margin: 0.15 });
  assert.equal(decision(one).accepted, true);
  assert.equal(decision({ ...one, normalizedCtcScore: -0.5 }).accepted, false);
  assert.equal(decision({ ...one, margin: 0.01 }).state, "ambiguous");
});

test("short recordings still reject a weak best-window acoustic score", () => {
  const weak = identification({
    windowResults: [window(0), window(1), window(2)],
    surahConsensus: { selectedSurah: 74, strongWindowCount: 3, agreeingStrongWindows: 3 },
    normalizedCtcScore: -0.61,
    margin: 0.2,
    globalHypotheses: [hypothesis({ path: [{ windowIndex: 0, candidate: candidate() }, { windowIndex: 1, candidate: candidate() }, { windowIndex: 2, candidate: candidate() }], acousticScore: -0.8, agreeingWindows: 3 })],
    confidence: { composite: 0.5, normalizedBestCtcScore: -0.61, bestVsSecondMargin: 0.2, agreeingWindows: 3, voicedAudioExplained: 0.8 },
  });
  const result = decision(weak);
  assert.deepEqual({ accepted: result.accepted, state: result.state, reason: result.reason }, {
    accepted: false,
    state: "insufficient-evidence",
    reason: "FastConformer best-window CTC fit is below the documented production threshold.",
  });
});

test("a short shared Quran phrase is ambiguous instead of falsely certain", () => {
  const short = identification({
    windowResults: [window(0)],
    surahConsensus: { selectedSurah: 74, strongWindowCount: 1, agreeingStrongWindows: 1 },
    globalHypotheses: [{
      surah: 74,
      span: identification().canonicalSpan,
      path: [{ windowIndex: 0, candidate: candidate() }],
      acousticScore: -0.2,
      lexicalUniqueness: 0.02,
      localSharedPhraseScore: 0.98,
      continuityScore: -0.2,
      voicedCoverage: 1,
      finalScore: -0.2,
      agreeingWindows: 1,
    }],
  });
  assert.deepEqual({ accepted: decision(short).accepted, state: decision(short).state }, { accepted: false, state: "ambiguous" });
});

test("one noisy window is tolerated, while contradictory surahs and invalid structure are rejected", () => {
  const noisy = identification({ windowResults: [...identification().windowResults, { ...window(4), state: "no-usable-evidence", selectedCandidate: null, candidates: [] }] });
  assert.equal(decision(noisy).accepted, true);
  const contradictory = identification({ windowResults: [window(0), window(1, candidate(69, 19))] });
  assert.equal(decision(contradictory).state, "ambiguous");
  const crossSurah = identification({ canonicalSpan: { start: { surah: 74, ayah: 1, canonicalWordIndex: 1, globalWordIndex: 1 }, end: { surah: 75, ayah: 1, canonicalWordIndex: 1, globalWordIndex: 2 } } });
  assert.equal(decision(crossSurah).state, "failed");
  assert.equal(decision(identification({ normalizedCtcScore: Number.NaN })).state, "failed");
});

test("long recordings with isolated or mixed local candidates abstain instead of assembling a weak global span", () => {
  const mixed = identification({
    windowResults: [window(0), window(1), window(2), window(3), window(4), window(5)],
    surahConsensus: { selectedSurah: 74, strongWindowCount: 3, agreeingStrongWindows: 3 },
    globalHypotheses: [{
      surah: 74,
      span: identification().canonicalSpan,
      path: [{ windowIndex: 0, candidate: candidate() }, { windowIndex: 1, candidate: null }, { windowIndex: 2, candidate: null }, { windowIndex: 3, candidate: null }, { windowIndex: 4, candidate: candidate() }, { windowIndex: 5, candidate: candidate() }],
      acousticScore: -0.2,
      lexicalUniqueness: 0.5,
      localSharedPhraseScore: 0.5,
      continuityScore: 1,
      voicedCoverage: 0.5,
      finalScore: 1,
      agreeingWindows: 3,
    }],
    confidence: { composite: 0.8, normalizedBestCtcScore: -0.2, bestVsSecondMargin: 0.2, agreeingWindows: 3, voicedAudioExplained: 0.5 },
  });
  const result = decision(mixed);
  assert.deepEqual({ accepted: result.accepted, state: result.state, gap: result.evidence.longestUnexplainedWindowRun }, { accepted: false, state: "insufficient-evidence", gap: 3 });
});

test("a long recording with one strong local window still requires a passing whole-path CTC mean", () => {
  const windows = [window(0), window(1), window(2), window(3), window(4)];
  const result = decision(identification({
    windowResults: windows,
    surahConsensus: { selectedSurah: 74, strongWindowCount: 5, agreeingStrongWindows: 5 },
    normalizedCtcScore: -0.2,
    margin: 0.2,
    globalHypotheses: [hypothesis({ path: windows.map((_, windowIndex) => ({ windowIndex, candidate: candidate() })), acousticScore: -1.01, agreeingWindows: 5 })],
    confidence: { composite: 0.8, normalizedBestCtcScore: -0.2, bestVsSecondMargin: 0.2, agreeingWindows: 5, voicedAudioExplained: 0.9 },
  }));
  assert.deepEqual({ accepted: result.accepted, state: result.state, reason: result.reason }, {
    accepted: false,
    state: "insufficient-evidence",
    reason: "The coherent FastConformer path CTC fit is below the documented production threshold.",
  });
});

test("a long path built from repeated Quran language remains ambiguous", () => {
  const windows = [window(0), window(1), window(2), window(3), window(4)];
  const result = decision(identification({
    windowResults: windows,
    surahConsensus: { selectedSurah: 74, strongWindowCount: 5, agreeingStrongWindows: 5 },
    globalHypotheses: [hypothesis({ path: windows.map((_, windowIndex) => ({ windowIndex, candidate: candidate() })), lexicalUniqueness: 0.02, localSharedPhraseScore: 0.98, agreeingWindows: 5 })],
    confidence: { composite: 0.8, normalizedBestCtcScore: -0.2, bestVsSecondMargin: 0.2, agreeingWindows: 5, voicedAudioExplained: 0.9 },
  }));
  assert.deepEqual({ accepted: result.accepted, state: result.state, reason: result.reason }, {
    accepted: false,
    state: "ambiguous",
    reason: "The long recording relies too heavily on repeated Quran language without distinctive passage context.",
  });
});

test("coverage, margin, agreement, surah consistency, and finite evidence remain mandatory", () => {
  const lowCoverage = identification({ confidence: { composite: 0.5, normalizedBestCtcScore: -0.2, bestVsSecondMargin: 0.2, agreeingWindows: 4, voicedAudioExplained: 0.49 } });
  assert.equal(decision(lowCoverage).state, "insufficient-evidence");

  const smallMargin = identification({ margin: 0.049 });
  assert.equal(decision(smallMargin).state, "ambiguous");

  const insufficientAgreement = identification({ surahConsensus: { selectedSurah: 74, strongWindowCount: 4, agreeingStrongWindows: 1 } });
  assert.equal(decision(insufficientAgreement).state, "ambiguous");

  const inconsistentSurah = identification({ windowResults: [window(0), window(1, candidate(69, 19))] });
  assert.equal(decision(inconsistentSurah).state, "ambiguous");

  assert.equal(decision(identification({ normalizedCtcScore: Number.NaN })).state, "failed");
  assert.equal(decision(identification({ globalHypotheses: [hypothesis({ acousticScore: Number.NaN })] })).state, "failed");
});

test("accepted FastConformer and rejected FastConformer/Whisper fallback retain typed passage sources", () => {
  const span = canonicalSpanFromFastConformerIdentification(identification().canonicalSpan)!;
  const emptyWhisper = createPrimaryTranscript([], "chunk-fallback");
  assert.equal(analyzeTranscript(emptyWhisper, { passageOverride: { canonicalSpan: span, passageSource: "fastconformer-quran" } }).passage.passageSource, "fastconformer-quran");
  assert.equal(analyzeTranscript(emptyWhisper, { passageOverride: { canonicalSpan: span, passageSource: "whisper-fallback" } }).passage.passageSource, "whisper-fallback");
  assert.equal(decision(null).accepted, false);
  assert.equal(analyzeTranscript(emptyWhisper).passage.state, "no-reliable-match");
});
