import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTranscript, canonicalSpanFromFastConformerIdentification, createPrimaryTranscript } from "../src/lib/recognition/core.ts";
import { decideFastConformerPassage } from "../src/lib/recognition/passage-decision.ts";
import type { FastConformerIdentificationResult, IdentificationWindowResult, QuranPassageCandidate } from "../src/lib/recognition/fastconformer-identification.ts";

function candidate(surah = 74, ayah = 1): QuranPassageCandidate {
  return { start: { surah, ayah, canonicalWordIndex: 1, globalWordIndex: 1 }, end: { surah, ayah: ayah + 1, canonicalWordIndex: 1, globalWordIndex: 3 }, startPosition: 0, endPosition: 2, retrievalScore: 1, ctcScore: -2, normalizedCtcScore: -0.23, confidence: 0.8, marginFromSecond: 0.18, ctcTokenCount: 2, optionalPrelude: { available: false, selected: "absent", lexicalText: "", canonicalFirstWordStart: { surah, ayah, canonicalWordIndex: 1, globalWordIndex: 1 }, canonicalOnlyScore: -2, optionalBasmalahPlusCanonicalScore: null } };
}

function window(index: number, value = candidate()): IdentificationWindowResult {
  return { index, startMs: index * 6_000, endMs: index * 6_000 + 12_000, voicedMs: 8_000, greedy: { tokenIds: [], lexicalText: "", lexicalTokens: [] }, candidates: [value], selectedCandidate: value, state: "strong-candidate", elapsedMs: 0, performance: { retrievalMs: 0, rerankingMs: 0, candidatesReranked: 1 }, crossSurahCandidatesRejected: 0 };
}

function identification(overrides: Partial<FastConformerIdentificationResult> = {}): FastConformerIdentificationResult {
  const windows = [window(0), window(1), window(2), window(3)];
  const span = { start: { surah: 74, ayah: 1, canonicalWordIndex: 1, globalWordIndex: 1 }, end: { surah: 74, ayah: 9, canonicalWordIndex: 1, globalWordIndex: 20 } };
  return { status: "complete", span, canonicalSpan: span, wordLevelSpan: span, selectedSurah: 74, optionalPrelude: null, surahConsensus: { selectedSurah: 74, strongWindowCount: 4, agreeingStrongWindows: 4 }, windowResults: windows, retrievalCandidates: windows.map((item) => item.selectedCandidate!), normalizedCtcScore: -0.233966, margin: 0.183743, continuityScore: 1, confidence: { composite: 0.993, normalizedBestCtcScore: -0.233966, bestVsSecondMargin: 0.183743, agreeingWindows: 4, voicedAudioExplained: 1 }, performance: { inferenceMs: 1, retrievalMs: 1, rerankingMs: 1, candidatesReranked: 4, totalMs: 4 }, CROSS_SURAH_CANDIDATES_REJECTED: 0, ...overrides };
}

function decision(value: FastConformerIdentificationResult | null) {
  return decideFastConformerPassage(value, canonicalSpanFromFastConformerIdentification(value?.canonicalSpan ?? null));
}

test("production gate accepts the reported noisy Surah 74 multi-window recovery shape", () => {
  const result = decision(identification());
  assert.deepEqual({ accepted: result.accepted, state: result.state, surah: result.evidence.selectedSurah, agreement: result.evidence.agreeingStrongWindows }, { accepted: true, state: "accepted", surah: 74, agreement: 4 });
});

test("production gate supports a genuinely strong short clip but rejects weak and ambiguous single windows", () => {
  const one = identification({ windowResults: [window(0)], surahConsensus: { selectedSurah: 74, strongWindowCount: 1, agreeingStrongWindows: 1 }, confidence: { composite: 0.1, normalizedBestCtcScore: -0.2, bestVsSecondMargin: 0.15, agreeingWindows: 1, voicedAudioExplained: 0.9 }, normalizedCtcScore: -0.2, margin: 0.15 });
  assert.equal(decision(one).accepted, true);
  assert.equal(decision({ ...one, normalizedCtcScore: -0.5 }).accepted, false);
  assert.equal(decision({ ...one, margin: 0.01 }).state, "ambiguous");
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

test("accepted FastConformer and rejected FastConformer/Whisper fallback retain typed passage sources", () => {
  const span = canonicalSpanFromFastConformerIdentification(identification().canonicalSpan)!;
  const emptyWhisper = createPrimaryTranscript([], "chunk-fallback");
  assert.equal(analyzeTranscript(emptyWhisper, { passageOverride: { canonicalSpan: span, passageSource: "fastconformer-quran" } }).passage.passageSource, "fastconformer-quran");
  assert.equal(analyzeTranscript(emptyWhisper, { passageOverride: { canonicalSpan: span, passageSource: "whisper-fallback" } }).passage.passageSource, "whisper-fallback");
  assert.equal(decision(null).accepted, false);
  assert.equal(analyzeTranscript(emptyWhisper).passage.state, "no-reliable-match");
});
