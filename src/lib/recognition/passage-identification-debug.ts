import type { FastConformerIdentificationResult, QuranPassageCandidate } from "./fastconformer-identification.ts";
import type { FastConformerPassageDecision } from "./passage-decision.ts";

/**
 * Privacy-safe developer evidence report. It deliberately contains no PCM,
 * media URL, file name, or full customer transcript. The CTC decode is model
 * evidence only and must never be rendered as Quran text.
 */
export type PassageIdentificationDebugReport = {
  reportVersion: 1;
  final: {
    accepted: boolean;
    state: FastConformerPassageDecision["state"];
    reason: string;
    selectedSurah: number | null;
    canonicalSpan: FastConformerIdentificationResult["canonicalSpan"];
    crossSurahCandidatesRejected: number;
    optionalPrelude: FastConformerIdentificationResult["optionalPrelude"];
  };
  globalHypotheses: Array<{
    rank: number;
    surah: number;
    span: FastConformerIdentificationResult["canonicalSpan"];
    acousticScore: number;
    rerankingScore: number;
    coverageScore: number;
    lexicalUniqueness: number;
    repeatedPhraseAmbiguity: number;
  }>;
  windows: Array<{
    index: number;
    intervalMs: readonly [number, number];
    voicedMs: number;
    normalizedModelOutput: string;
    ctcTokenSequence: readonly number[];
    state: string;
    candidates: Array<ReturnType<typeof candidateReport>>;
  }>;
};

function candidateReport(candidate: QuranPassageCandidate, rank: number) {
  return {
    rank,
    surah: candidate.start.surah,
    ayahRange: `${candidate.start.ayah}:${candidate.start.canonicalWordIndex}-${candidate.end.ayah}:${candidate.end.canonicalWordIndex}`,
    rawRetrievalScore: candidate.retrievalScore,
    rerankingScore: candidate.normalizedCtcScore,
    ctcScore: candidate.ctcScore,
    coverage: {
      lexical: candidate.lexicalCoverage,
      target: candidate.targetCoverage,
      ctcTokens: candidate.ctcTokenCount,
    },
    // Uniqueness near zero means the lexical evidence is common/repeated Quran
    // language, so this is an ambiguity signal rather than a confidence claim.
    repeatedPhraseAmbiguity: Number((1 - candidate.lexicalUniqueness).toFixed(6)),
    boundaryEvidence: {
      canonicalStart: candidate.start,
      canonicalEnd: candidate.end,
      optionalPrelude: candidate.optionalPrelude,
    },
    unmatchedEvidence: "Not independently token-aligned; inspect targetCoverage and the full competing top-10 set.",
  };
}

export function createPassageIdentificationDebugReport(
  identification: FastConformerIdentificationResult | null,
  decision: FastConformerPassageDecision,
): PassageIdentificationDebugReport {
  return {
    reportVersion: 1,
    final: {
      accepted: decision.accepted,
      state: decision.state,
      reason: decision.reason,
      selectedSurah: identification?.selectedSurah ?? null,
      canonicalSpan: identification?.canonicalSpan ?? null,
      crossSurahCandidatesRejected: identification?.CROSS_SURAH_CANDIDATES_REJECTED ?? 0,
      optionalPrelude: identification?.optionalPrelude ?? null,
    },
    globalHypotheses: (identification?.globalHypotheses ?? []).slice(0, 10).map((hypothesis, index) => ({
      rank: index + 1,
      surah: hypothesis.surah,
      span: hypothesis.span,
      acousticScore: hypothesis.acousticScore,
      rerankingScore: hypothesis.finalScore,
      coverageScore: hypothesis.voicedCoverage,
      lexicalUniqueness: hypothesis.lexicalUniqueness,
      repeatedPhraseAmbiguity: hypothesis.localSharedPhraseScore,
    })),
    windows: (identification?.windowResults ?? []).map((window) => ({
      index: window.index,
      intervalMs: [window.startMs, window.endMs],
      voicedMs: window.voicedMs,
      normalizedModelOutput: window.greedy.lexicalText,
      ctcTokenSequence: window.greedy.tokenIds,
      state: window.state,
      candidates: window.candidates.slice(0, 10).map(candidateReport),
    })),
  };
}

/** Compact ?debugMedia=1 recognition outcome, separate from media preparation. */
export function quranRecognitionDebug(
  identification: FastConformerIdentificationResult | null,
  decision: FastConformerPassageDecision,
): void {
  if (typeof window === "undefined" || new URLSearchParams(window.location.search).get("debugMedia") !== "1") return;
  const span = identification?.canonicalSpan ?? null;
  console.info("[Quran AutoCaption recognition]", {
    event: "final-passage-decision",
    proposedSurah: identification?.selectedSurah ?? null,
    startAyah: span?.start.ayah ?? null,
    endAyah: span?.end.ayah ?? null,
    accepted: decision.accepted,
    reason: decision.reason,
    voicedCoverage: decision.evidence.voicedAudioExplained,
    continuity: decision.evidence.continuityScore,
    usableWindows: decision.evidence.usableWindowCount,
    totalWindows: decision.evidence.totalWindowCount,
  });
}
