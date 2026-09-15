import type { CanonicalSpan } from "./core.ts";
import type { FastConformerIdentificationResult } from "./fastconformer-identification.ts";

/**
 * Production-only calibration for Quran-wide FastConformer identification.
 * These are deliberately independent signals: composite is diagnostic only.
 *
 * - -0.60 allows the observed clean/noisy CTC range while excluding very poor
 *   paths; -0.35 is required when a single short window must stand alone.
 * - 0.05 requires a meaningful alternative-path separation for multi-window
 *   clips; 0.12 is required for a single-window clip.
 * - 0.50 requires at least half of VAD-qualified audio to be explained by the
 *   solved path (0.80 for a single window).
 */
export const FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS = {
  multiWindowMinimumNormalizedCtcScore: -0.60,
  singleWindowMinimumNormalizedCtcScore: -0.35,
  multiWindowMinimumMargin: 0.05,
  singleWindowMinimumMargin: 0.12,
  multiWindowMinimumVoicedExplained: 0.50,
  singleWindowMinimumVoicedExplained: 0.80,
} as const;

export type FastConformerPassageAcceptanceState = "accepted" | "ambiguous" | "insufficient-evidence" | "failed";

export type FastConformerPassageEvidence = {
  strongWindowCount: number;
  agreeingStrongWindows: number;
  contradictoryStrongWindows: number;
  totalWindowCount: number;
  usableWindowCount: number;
  coherentWindowCount: number;
  coherentWindowRatio: number;
  longestUnexplainedWindowRun: number;
  normalizedBestCtcScore: number | null;
  normalizedCoherentCtcScore: number | null;
  bestVsSecondMargin: number | null;
  voicedAudioExplained: number;
  continuityScore: number;
  lexicalUniqueness: number;
  sharedPhraseReliance: number;
  selectedSurah: number | null;
  structuralReasons: readonly string[];
};

export type FastConformerPassageDecision = {
  accepted: boolean;
  state: FastConformerPassageAcceptanceState;
  reason: string;
  evidence: FastConformerPassageEvidence;
};

function longestUnexplainedRun(path: readonly { candidate: unknown | null }[]) {
  let longest = 0;
  let current = 0;
  for (const entry of path) {
    current = entry.candidate ? 0 : current + 1;
    longest = Math.max(longest, current);
  }
  return longest;
}

function finiteOrNull(value: number | null) {
  return value === null || Number.isFinite(value);
}

/** One deterministic owner for FastConformer production authority. */
export function decideFastConformerPassage(
  identification: FastConformerIdentificationResult | null,
  canonicalSpan: CanonicalSpan | null,
): FastConformerPassageDecision {
  const winningHypothesis = identification?.globalHypotheses[0] ?? null;
  // The production gate follows the winning coherent path, not the independent
  // local winners. A shared phrase may locally prefer another surah even when
  // the complete sequence strongly supports this path.
  const coherentCandidates = winningHypothesis?.path.flatMap((entry) => entry.candidate ? [entry.candidate] : []) ?? [];
  const strong = coherentCandidates.length
    ? coherentCandidates
    : identification?.windowResults.filter((window) => window.state === "strong-candidate" && window.selectedCandidate).map((window) => window.selectedCandidate!) ?? [];
  const selectedSurah = identification?.selectedSurah ?? null;
  const totalWindowCount = identification?.windowResults.length ?? 0;
  const usableWindowCount = identification?.windowResults.filter((window) => window.state !== "no-usable-evidence").length ?? 0;
  const coherentWindowCount = coherentCandidates.length || (!winningHypothesis ? strong.length : 0);
  const coherentWindowRatio = coherentWindowCount / Math.max(1, usableWindowCount);
  const longestUnsupportedRun = winningHypothesis ? longestUnexplainedRun(winningHypothesis.path) : 0;
  const contradictoryStrongWindows = strong.filter((candidate) => candidate.start.surah !== selectedSurah || candidate.end.surah !== selectedSurah).length;
  const structuralReasons: string[] = [];
  const span = identification?.canonicalSpan;
  if (!identification || identification.status !== "complete") structuralReasons.push("FastConformer did not complete Quran-wide identification.");
  if (!span || !canonicalSpan) structuralReasons.push("No structurally valid canonical Quran span was produced.");
  if (span && (span.start.surah !== span.end.surah || span.start.surah !== selectedSurah)) structuralReasons.push("The selected FastConformer span crosses or disagrees with its selected surah.");
  if (span && (!Number.isInteger(span.start.ayah) || !Number.isInteger(span.end.ayah) || !Number.isInteger(span.start.canonicalWordIndex) || !Number.isInteger(span.end.canonicalWordIndex) || span.start.ayah < 1 || span.end.ayah < 1 || span.start.canonicalWordIndex < 1 || span.end.canonicalWordIndex < 1)) structuralReasons.push("FastConformer returned illegal Quran coordinates.");
  if (span && (span.start.ayah > span.end.ayah || (span.start.ayah === span.end.ayah && span.start.canonicalWordIndex > span.end.canonicalWordIndex))) structuralReasons.push("FastConformer span starts after it ends.");
  if (!strong.length) structuralReasons.push("No usable acoustic window produced a strong candidate.");
  if (!finiteOrNull(identification?.normalizedCtcScore ?? null) || !finiteOrNull(identification?.margin ?? null) || !Number.isFinite(identification?.confidence.voicedAudioExplained ?? Number.NaN) || !Number.isFinite(identification?.continuityScore ?? Number.NaN)) structuralReasons.push("FastConformer evidence contains a non-finite score.");

  const evidence: FastConformerPassageEvidence = {
    strongWindowCount: strong.length,
    agreeingStrongWindows: identification?.surahConsensus.agreeingStrongWindows ?? 0,
    contradictoryStrongWindows,
    totalWindowCount,
    usableWindowCount,
    coherentWindowCount,
    coherentWindowRatio: Number(coherentWindowRatio.toFixed(4)),
    longestUnexplainedWindowRun: longestUnsupportedRun,
    normalizedBestCtcScore: identification?.normalizedCtcScore ?? null,
    normalizedCoherentCtcScore: winningHypothesis?.acousticScore ?? identification?.normalizedCtcScore ?? null,
    bestVsSecondMargin: identification?.margin ?? null,
    voicedAudioExplained: identification?.confidence.voicedAudioExplained ?? 0,
    continuityScore: identification?.continuityScore ?? 0,
    lexicalUniqueness: winningHypothesis?.lexicalUniqueness ?? 0,
    sharedPhraseReliance: winningHypothesis?.localSharedPhraseScore ?? 1,
    selectedSurah,
    structuralReasons,
  };
  if (structuralReasons.length) return { accepted: false, state: "failed", reason: structuralReasons[0]!, evidence };
  if (contradictoryStrongWindows > 0) return { accepted: false, state: "ambiguous", reason: "Strong FastConformer windows disagree on the Quran surah.", evidence };

  const singleWindow = strong.length === 1;
  const ctcMinimum = singleWindow ? FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.singleWindowMinimumNormalizedCtcScore : FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.multiWindowMinimumNormalizedCtcScore;
  const marginMinimum = singleWindow ? FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.singleWindowMinimumMargin : FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.multiWindowMinimumMargin;
  const voicedMinimum = singleWindow ? FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.singleWindowMinimumVoicedExplained : FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.multiWindowMinimumVoicedExplained;
  // The whole path, rather than a single locally excellent window, must meet
  // the published fit threshold. This prevents a long recording from being
  // promoted by an isolated phrase while its remaining selected windows are
  // acoustically poor.
  if ((evidence.normalizedCoherentCtcScore ?? Number.NEGATIVE_INFINITY) < ctcMinimum) return { accepted: false, state: "insufficient-evidence", reason: "The coherent FastConformer path CTC fit is below the documented production threshold.", evidence };
  if ((identification!.margin ?? Number.NEGATIVE_INFINITY) < marginMinimum) return { accepted: false, state: "ambiguous", reason: "FastConformer best-path margin is too small.", evidence };
  if (identification!.confidence.voicedAudioExplained < voicedMinimum) return { accepted: false, state: "insufficient-evidence", reason: "Too little VAD-qualified audio is explained by the FastConformer path.", evidence };
  if (!singleWindow && identification!.surahConsensus.agreeingStrongWindows < 2) return { accepted: false, state: "ambiguous", reason: "Multiple useful windows did not form a coherent Quran path.", evidence };
  // Identification windows have already been VAD-qualified. For a long
  // recording, repeatedly skipping those voiced windows is not a coherent
  // passage explanation; it is exactly the shape in which repeated phrases
  // can otherwise assemble a plausible-looking but wrong global span.
  if (!singleWindow && totalWindowCount >= 5 && (coherentWindowRatio < 0.6 || longestUnsupportedRun >= 3)) return { accepted: false, state: "insufficient-evidence", reason: "The selected Quran path does not support enough of the long recording's voiced timeline.", evidence };
  if (!singleWindow && totalWindowCount >= 5 && winningHypothesis && winningHypothesis.lexicalUniqueness < 0.08) return { accepted: false, state: "ambiguous", reason: "The long recording relies too heavily on repeated Quran language without distinctive passage context.", evidence };
  if (singleWindow && winningHypothesis && winningHypothesis.lexicalUniqueness < 0.08) return { accepted: false, state: "ambiguous", reason: "A short clip contains only common Quran language without disambiguating context.", evidence };
  return { accepted: true, state: "accepted", reason: singleWindow ? "Strong short-clip FastConformer evidence passed." : "Coherent multi-window FastConformer evidence passed.", evidence };
}
