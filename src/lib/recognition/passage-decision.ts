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
  normalizedBestCtcScore: number | null;
  bestVsSecondMargin: number | null;
  voicedAudioExplained: number;
  continuityScore: number;
  selectedSurah: number | null;
  structuralReasons: readonly string[];
};

export type FastConformerPassageDecision = {
  accepted: boolean;
  state: FastConformerPassageAcceptanceState;
  reason: string;
  evidence: FastConformerPassageEvidence;
};

function finiteOrNull(value: number | null) {
  return value === null || Number.isFinite(value);
}

/** One deterministic owner for FastConformer production authority. */
export function decideFastConformerPassage(
  identification: FastConformerIdentificationResult | null,
  canonicalSpan: CanonicalSpan | null,
): FastConformerPassageDecision {
  const strong = identification?.windowResults.filter((window) => window.state === "strong-candidate" && window.selectedCandidate) ?? [];
  const selectedSurah = identification?.selectedSurah ?? null;
  const contradictoryStrongWindows = strong.filter((window) => window.selectedCandidate!.start.surah !== selectedSurah || window.selectedCandidate!.end.surah !== selectedSurah).length;
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
    normalizedBestCtcScore: identification?.normalizedCtcScore ?? null,
    bestVsSecondMargin: identification?.margin ?? null,
    voicedAudioExplained: identification?.confidence.voicedAudioExplained ?? 0,
    continuityScore: identification?.continuityScore ?? 0,
    selectedSurah,
    structuralReasons,
  };
  if (structuralReasons.length) return { accepted: false, state: "failed", reason: structuralReasons[0]!, evidence };
  if (contradictoryStrongWindows > 0) return { accepted: false, state: "ambiguous", reason: "Strong FastConformer windows disagree on the Quran surah.", evidence };

  const singleWindow = strong.length === 1;
  const ctcMinimum = singleWindow ? FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.singleWindowMinimumNormalizedCtcScore : FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.multiWindowMinimumNormalizedCtcScore;
  const marginMinimum = singleWindow ? FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.singleWindowMinimumMargin : FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.multiWindowMinimumMargin;
  const voicedMinimum = singleWindow ? FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.singleWindowMinimumVoicedExplained : FASTCONFORMER_PASSAGE_EVIDENCE_THRESHOLDS.multiWindowMinimumVoicedExplained;
  if ((identification!.normalizedCtcScore ?? Number.NEGATIVE_INFINITY) < ctcMinimum) return { accepted: false, state: "insufficient-evidence", reason: "FastConformer CTC fit is below the documented production threshold.", evidence };
  if ((identification!.margin ?? Number.NEGATIVE_INFINITY) < marginMinimum) return { accepted: false, state: "ambiguous", reason: "FastConformer best-path margin is too small.", evidence };
  if (identification!.confidence.voicedAudioExplained < voicedMinimum) return { accepted: false, state: "insufficient-evidence", reason: "Too little VAD-qualified audio is explained by the FastConformer path.", evidence };
  if (!singleWindow && identification!.surahConsensus.agreeingStrongWindows < 2) return { accepted: false, state: "ambiguous", reason: "Multiple useful windows did not form a coherent Quran path.", evidence };
  return { accepted: true, state: "accepted", reason: singleWindow ? "Strong short-clip FastConformer evidence passed." : "Coherent multi-window FastConformer evidence passed.", evidence };
}
