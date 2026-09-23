import { parseMediaDebugEvents } from "./ctc-calibration-capture.ts";
import {
  FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS,
  evaluateProgressionCandidate,
  type ProgressionCandidateResult,
  type ProgressionSample,
} from "./progression-long-path.ts";
import type { ProgressionTrajectoryFixture } from "./progression-trajectory.ts";

/**
 * Frozen external validation of the progression-aware candidate. This module
 * never calibrates: it consumes the candidate frozen by the progression
 * milestone, and no validation fixture can reach a threshold.
 */
export const FROZEN_PROGRESSION_VALIDATION_CANDIDATE = FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS;

export const PROGRESSION_VALIDATION_PROVENANCE = "progression-external-validation";

export type ProgressionValidationRole = "positive" | "hard-negative" | "control-negative";

export type ProgressionValidationDesignation = {
  id: string;
  role: ProgressionValidationRole;
  readerGroup: string;
  /** Canonical range recited, or the underlying range a negative was built from. */
  sourceRange: { surah: number; startAyah: number; endAyah: number };
  /** Ordered ayah segments concatenated from independently keyed per-ayah public audio. */
  construction: string;
  negativeType: string | null;
  refrainStress: boolean;
};

/**
 * Designated before any validation media was recognized. Ground truth is the
 * verse key of each per-ayah public source file, never model output.
 */
export const PROGRESSION_VALIDATION_DESIGNATIONS: readonly ProgressionValidationDesignation[] = Object.freeze([
  { id: "progression-validation-positive-reader-d-55-1-25", role: "positive", readerGroup: "reader-d", sourceRange: { surah: 55, startAyah: 1, endAyah: 25 }, construction: "55:1-25", negativeType: null, refrainStress: true },
  { id: "progression-validation-positive-reader-e-77-1-28", role: "positive", readerGroup: "reader-e", sourceRange: { surah: 77, startAyah: 1, endAyah: 28 }, construction: "77:1-28", negativeType: null, refrainStress: true },
  { id: "progression-validation-positive-reader-f-78-1-16", role: "positive", readerGroup: "reader-f", sourceRange: { surah: 78, startAyah: 1, endAyah: 16 }, construction: "78:1-16", negativeType: null, refrainStress: false },
  { id: "progression-validation-positive-reader-g-54-15-22", role: "positive", readerGroup: "reader-g", sourceRange: { surah: 54, startAyah: 15, endAyah: 22 }, construction: "54:15-22", negativeType: null, refrainStress: true },
  { id: "progression-validation-positive-reader-h-91-1-15", role: "positive", readerGroup: "reader-h", sourceRange: { surah: 91, startAyah: 1, endAyah: 15 }, construction: "91:1-15", negativeType: null, refrainStress: false },
  { id: "progression-validation-negative-reader-f-78-x2", role: "hard-negative", readerGroup: "reader-f", sourceRange: { surah: 78, startAyah: 1, endAyah: 16 }, construction: "78:1-16, 78:1-16", negativeType: "repeated-complete", refrainStress: false },
  { id: "progression-validation-negative-reader-e-77-partial-reset", role: "hard-negative", readerGroup: "reader-e", sourceRange: { surah: 77, startAyah: 1, endAyah: 28 }, construction: "77:1-14, 77:15-28, 77:1-14", negativeType: "partial-reset", refrainStress: true },
  { id: "progression-validation-negative-reader-f-78-alternating", role: "hard-negative", readerGroup: "reader-f", sourceRange: { surah: 78, startAyah: 1, endAyah: 16 }, construction: "78:1-8, 78:9-16, 78:1-8, 78:9-16", negativeType: "alternating-halves", refrainStress: false },
  { id: "progression-validation-negative-reader-d-55-refrain-out-of-order", role: "hard-negative", readerGroup: "reader-d", sourceRange: { surah: 55, startAyah: 5, endAyah: 25 }, construction: "55:17-25, 55:5-16", negativeType: "refrain-out-of-order", refrainStress: true },
  { id: "progression-validation-negative-reader-e-77-repeat-after-progress", role: "hard-negative", readerGroup: "reader-e", sourceRange: { surah: 77, startAyah: 1, endAyah: 28 }, construction: "77:1-28, 77:15-28", negativeType: "repeat-after-progress", refrainStress: true },
  { id: "progression-validation-negative-reader-g-54-x3", role: "hard-negative", readerGroup: "reader-g", sourceRange: { surah: 54, startAyah: 15, endAyah: 22 }, construction: "54:15-22, 54:15-22, 54:15-22", negativeType: "repeated-refrain-passage", refrainStress: true },
]);

export type ProgressionValidationFixture = ProgressionTrajectoryFixture & {
  provenance: typeof PROGRESSION_VALIDATION_PROVENANCE;
  validationRole: ProgressionValidationRole;
  refrainStress: boolean;
  architectureEvidence: {
    canonicalPcmPreparations: number;
    topLevelFastConformerDecisions: number;
    whisperEntered: boolean;
  };
  forcedAlignment: {
    status: "complete" | "failed" | "not-run";
    resultingStartAyah: number | null;
    resultingEndAyah: number | null;
  };
};

/** Privacy-safe architecture and alignment facts from the latest build-marked run. */
export function extractValidationRunFacts(input: string): Pick<ProgressionValidationFixture, "architectureEvidence" | "forcedAlignment"> {
  const parsed = parseMediaDebugEvents(input);
  const events = parsed.slice(Math.max(0, parsed.findLastIndex((entry) => entry.event === "build-marker")));
  const count = (name: string) => events.filter((entry) => entry.event === name).length;
  const whisper = events.findLast((entry) => entry.event === "whisper-fallback")?.facts;
  const alignment = events.findLast((entry) => entry.event === "forced-alignment-succeeded" || entry.event === "forced-alignment-failed");
  const ayah = (value: unknown) => Number.isInteger(value) ? value as number : null;
  return {
    architectureEvidence: {
      canonicalPcmPreparations: count("recognition-preparation"),
      topLevelFastConformerDecisions: count("fastconformer-primary"),
      whisperEntered: whisper?.entered === true,
    },
    forcedAlignment: alignment ? {
      status: alignment.event === "forced-alignment-succeeded" && alignment.facts.status === "complete" ? "complete" : "failed",
      resultingStartAyah: ayah(alignment.facts.resultingStartAyah),
      resultingEndAyah: ayah(alignment.facts.resultingEndAyah),
    } : { status: "not-run", resultingStartAyah: null, resultingEndAyah: null },
  };
}

/** Exactly the frozen candidate; no novelty, revisit, local-behind, reader, refrain, or edge condition. */
export function evaluateFrozenProgressionValidation(sample: ProgressionSample): ProgressionCandidateResult {
  return evaluateProgressionCandidate(sample, FROZEN_PROGRESSION_VALIDATION_CANDIDATE);
}
