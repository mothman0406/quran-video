import type { FastConformerIdentificationResult, QuranPassageCandidate } from "./fastconformer-identification.ts";
import { FASTCONFORMER_LONG_TIMELINE_MINIMUM_WINDOW_COUNT, FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS, type FastConformerPassageDecision } from "./passage-decision.ts";
import type { VadSpeechRegion } from "./speech-regions.ts";
import { mediaDebug, type MediaDebugFacts } from "./media-debug.ts";

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
    continuation: FastConformerIdentificationResult["windowResults"][number]["continuation"];
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
    origins: candidate.origins ?? [],
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
      continuation: window.continuation,
      candidates: window.candidates.slice(0, 10).map(candidateReport),
    })),
  };
}

export type FastConformerCtcGateMode = "short-recording-best-window-ctc" | "long-recording-best-and-coherent-path-ctc";

export function fastConformerCtcGateMode(decision: FastConformerPassageDecision): FastConformerCtcGateMode {
  return decision.evidence.totalWindowCount >= FASTCONFORMER_LONG_TIMELINE_MINIMUM_WINDOW_COUNT
    ? "long-recording-best-and-coherent-path-ctc"
    : "short-recording-best-window-ctc";
}

function failedAcceptanceRules(decision: FastConformerPassageDecision): string[] {
  const evidence = decision.evidence;
  const singleWindow = evidence.strongWindowCount === 1;
  const longTimeline = evidence.totalWindowCount >= FASTCONFORMER_LONG_TIMELINE_MINIMUM_WINDOW_COUNT;
  const ctcMinimum = singleWindow ? FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.singleWindowMinimumNormalizedCtcScore : FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.multiWindowMinimumNormalizedCtcScore;
  const marginMinimum = singleWindow ? FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.singleWindowMinimumMargin : FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.multiWindowMinimumMargin;
  const coverageMinimum = singleWindow ? FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.singleWindowMinimumVoicedExplained : FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.multiWindowMinimumVoicedExplained;
  const failed: string[] = [];
  if (evidence.structuralReasons.length) failed.push("structural-validity");
  if (evidence.contradictoryStrongWindows > 0) failed.push("surah-consistency");
  if ((evidence.normalizedBestCtcScore ?? Number.NEGATIVE_INFINITY) < ctcMinimum) failed.push("best-window-ctc");
  if (longTimeline && (evidence.normalizedCoherentCtcScore ?? Number.NEGATIVE_INFINITY) < ctcMinimum) failed.push("coherent-path-ctc");
  if ((evidence.bestVsSecondMargin ?? Number.NEGATIVE_INFINITY) < marginMinimum) failed.push("margin");
  if (evidence.voicedAudioExplained < coverageMinimum) failed.push("coverage");
  if (!singleWindow && evidence.agreeingStrongWindows < 2) failed.push("window-agreement");
  if (!singleWindow && longTimeline && (evidence.coherentWindowRatio < 0.6 || evidence.longestUnexplainedWindowRun >= 3)) failed.push("coherent-window-support");
  if (singleWindow && evidence.lexicalUniqueness < FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.minimumLexicalUniqueness) failed.push("lexical-uniqueness");
  if (!singleWindow && longTimeline && evidence.lexicalUniqueness < FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.minimumLexicalUniqueness) failed.push("lexical-uniqueness");
  return failed;
}

export function createFinalPassageDebugFacts(
  identification: FastConformerIdentificationResult | null,
  decision: FastConformerPassageDecision,
) {
  const span = identification?.canonicalSpan ?? null;
  return {
    proposedSurah: identification?.selectedSurah ?? null,
    startAyah: span?.start.ayah ?? null,
    endAyah: span?.end.ayah ?? null,
    bestWindowCtc: decision.evidence.normalizedBestCtcScore,
    coherentPathMeanCtc: decision.evidence.normalizedCoherentCtcScore,
    margin: decision.evidence.bestVsSecondMargin,
    coverage: decision.evidence.voicedAudioExplained,
    agreeingWindowCount: decision.evidence.agreeingStrongWindows,
    totalWindowCount: decision.evidence.totalWindowCount,
    usableWindowCount: decision.evidence.usableWindowCount,
    coherentRatio: decision.evidence.coherentWindowRatio,
    longestUnsupportedRun: decision.evidence.longestUnexplainedWindowRun,
    lexicalUniqueness: decision.evidence.lexicalUniqueness,
    structuralValidity: decision.evidence.structuralReasons.length === 0,
    structuralReasons: [...decision.evidence.structuralReasons],
    surahConsistency: decision.evidence.contradictoryStrongWindows === 0,
    gateMode: fastConformerCtcGateMode(decision),
    failedAcceptanceRules: failedAcceptanceRules(decision),
    decision: decision.accepted ? "accepted" : "abstained",
    accepted: decision.accepted,
    reasons: [decision.reason],
  } as const;
}

function compactCandidate(candidate: QuranPassageCandidate | null) {
  if (!candidate) return null;
  return {
    surah: candidate.start.surah,
    startAyah: candidate.start.ayah,
    endAyah: candidate.end.ayah,
    normalizedCtcScore: candidate.normalizedCtcScore,
    retrievalScore: candidate.retrievalScore,
    lexicalCoverage: candidate.lexicalCoverage,
    lexicalUniqueness: candidate.lexicalUniqueness,
  };
}

/** Shared /create and /editor ?debugMedia=1 recognition evidence. */
export function quranRecognitionDebug(
  identification: FastConformerIdentificationResult | null,
  decision: FastConformerPassageDecision,
  context?: { speechRegions: readonly VadSpeechRegion[]; durationMs: number },
): void {
  const windows = identification?.windowResults ?? [];
  const rawVadVoicedDurationMs = context?.speechRegions.reduce((sum, region) => sum + region.durationMs, 0) ?? null;
  mediaDebug("vad-window-summary", {
    rawVadVoicedDurationMs,
    rawVadCoverage: rawVadVoicedDurationMs === null ? null : rawVadVoicedDurationMs / Math.max(1, context?.durationMs ?? 0),
    totalGeneratedIdentificationWindows: windows.length,
    usableWindows: decision.evidence.usableWindowCount,
    windows: windows.map((window) => ({
      index: window.index,
      startMs: window.startMs,
      endMs: window.endMs,
      voicedMs: window.voicedMs,
      vadQualifiedWeight: window.voicedMs / Math.max(1, window.endMs - window.startMs),
    })),
  });
  const coherentPath = new Map((identification?.globalHypotheses[0]?.path ?? []).map((entry) => [entry.windowIndex, entry.candidate]));
  for (const window of windows) {
    mediaDebug("fastconformer-window-result", {
      index: window.index,
      startMs: window.startMs,
      endMs: window.endMs,
      state: window.state,
      winningCandidate: compactCandidate(window.selectedCandidate),
      continuation: window.continuation,
      participatesInFinalCoherentPath: coherentPath.get(window.index) != null,
    });
  }
  mediaDebug("fastconformer-primary", {
    decision: decision.accepted ? "accepted" : "abstained",
    accepted: decision.accepted,
    reason: decision.reason,
  });
  mediaDebug("final-passage-decision", createFinalPassageDebugFacts(identification, decision));
}

export function quranFallbackDebug(decision: FastConformerPassageDecision, whisperExecuted: boolean): void {
  const entered = !decision.accepted;
  mediaDebug("whisper-fallback", {
    entered,
    whisperExecuted,
    reason: entered
      ? `FastConformer abstained: ${decision.reason}`
      : whisperExecuted ? "Development comparison only; FastConformer already accepted." : "FastConformer accepted, so fallback was not entered.",
    authority: "secondary Quran identity only; cannot veto accepted FastConformer identity and never owns caption timing",
  });
}

export function quranFinalIdentityDebug(facts: MediaDebugFacts): void {
  mediaDebug("final-identity-decision", facts);
}

export function quranForcedAlignmentDebug(
  phase: "started" | "succeeded" | "failed",
  facts: MediaDebugFacts,
): void {
  mediaDebug(`forced-alignment-${phase}`, facts);
}
