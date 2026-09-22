import { normalizeCapturedLongPathFeature, type NormalizedLongPathFeature } from "./multisignal-long-path.ts";
import {
  computeProgressionFeatures,
  type ProgressionFeatures,
  type ProgressionProvenance,
  type ProgressionTrajectoryFixture,
} from "./progression-trajectory.ts";

export type ProgressionSampleClass =
  | "long-positive"
  | "short-positive"
  | "identity-positive-edge-failure"
  | "real-negative"
  | "logical-negative";

export type ProgressionSample = {
  id: string;
  sampleClass: ProgressionSampleClass;
  provenance: ProgressionProvenance | "design-trajectory-missing" | "logical";
  negativeType: string | null;
  readerGroup: string | null;
  gates: NormalizedLongPathFeature;
  /** Null when the retained evidence has no per-window canonical coordinates. */
  progression: ProgressionFeatures | null;
};

function sameRange(left: { surah: number | null; startAyah: number | null; endAyah: number | null }, right: { surah: number; startAyah: number; endAyah: number } | null) {
  return right !== null && left.surah === right.surah && left.startAyah === right.startAyah && left.endAyah === right.endAyah;
}

export function progressionSampleFromFixture(fixture: ProgressionTrajectoryFixture): ProgressionSample {
  const gates = normalizeCapturedLongPathFeature(fixture);
  const progression = computeProgressionFeatures(fixture.trajectory.windows);
  let sampleClass: ProgressionSampleClass;
  if (fixture.expected.outcome !== "positive") sampleClass = "real-negative";
  else if (!sameRange(fixture.expected, fixture.fastConformerProposedRange)) sampleClass = "identity-positive-edge-failure";
  else sampleClass = fixture.totalGeneratedWindows >= 5 ? "long-positive" : "short-positive";
  return { id: fixture.id, sampleClass, provenance: fixture.provenance, negativeType: fixture.negativeType, readerGroup: fixture.readerGroup, gates, progression };
}

/** Samples whose retained evidence predates per-window coordinates. */
export function progressionSampleWithoutTrajectory(gates: NormalizedLongPathFeature): ProgressionSample {
  const sampleClass: ProgressionSampleClass = gates.classification === "logical-negative" ? "logical-negative"
    : gates.classification === "known-positive" ? "long-positive"
      : gates.classification === "real-negative" ? "real-negative" : "short-positive";
  return {
    id: gates.id,
    sampleClass,
    provenance: sampleClass === "logical-negative" ? "logical" : "design-trajectory-missing",
    negativeType: null,
    readerGroup: null,
    gates,
    progression: null,
  };
}

export type ProgressionCandidateThresholds = {
  minimumGeneratedWindows: number;
  /** Retained existing production long-path component, not a new condition. */
  minimumBestCtc: number;
  minimumMargin: number;
  maximumResetCount: number;
  maximumNoProgressRun: number;
};

/**
 * Frozen before any held-out progression capture was converted or inspected.
 * Derived by `calibrateProgressionThresholds` from design, external-validation,
 * and design-support evidence only.
 */
export const FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS: Readonly<ProgressionCandidateThresholds> = Object.freeze({
  minimumGeneratedWindows: 5,
  minimumBestCtc: -0.60,
  minimumMargin: 8,
  maximumResetCount: 0,
  maximumNoProgressRun: 2,
});

export type ProgressionCandidateResult = {
  accepted: boolean;
  /** A null progression condition means the trajectory was unavailable. */
  conditions: {
    existingSafetyGates: boolean;
    longRecording: boolean;
    bestCtc: boolean;
    margin: boolean;
    noReset: boolean | null;
    boundedNoProgressRun: boolean | null;
  };
  distances: {
    margin: number | null;
    resetCount: number | null;
    noProgressRun: number | null;
  };
  firstFailedStage: "existing-safety" | "identity-margin" | "progression" | "trajectory-missing" | null;
};

function round(value: number) {
  return Number(value.toFixed(6));
}

/**
 * Staged candidate: existing safety and long-path scope, then whole-passage
 * identity margin, then sustained canonical progression without a reset or a
 * long run of windows that add no canonical coverage.
 */
export function evaluateProgressionCandidate(sample: ProgressionSample, thresholds: ProgressionCandidateThresholds = FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS): ProgressionCandidateResult {
  const { gates, progression } = sample;
  const conditions = {
    existingSafetyGates: gates.fixedSafetyGatesPass,
    longRecording: gates.totalGeneratedWindows >= thresholds.minimumGeneratedWindows,
    bestCtc: gates.bestCoherentCtc !== null && gates.bestCoherentCtc >= thresholds.minimumBestCtc,
    margin: gates.globalViterbiMargin !== null && gates.globalViterbiMargin >= thresholds.minimumMargin,
    noReset: progression ? progression.resetCount <= thresholds.maximumResetCount : null,
    boundedNoProgressRun: progression ? progression.longestNoProgressRun <= thresholds.maximumNoProgressRun : null,
  };
  const safety = conditions.existingSafetyGates && conditions.longRecording && conditions.bestCtc;
  const firstFailedStage = !safety ? "existing-safety"
    : !conditions.margin ? "identity-margin"
      : progression === null ? "trajectory-missing"
        : !conditions.noReset || !conditions.boundedNoProgressRun ? "progression" : null;
  return {
    accepted: firstFailedStage === null,
    conditions,
    distances: {
      margin: gates.globalViterbiMargin === null ? null : round(gates.globalViterbiMargin - thresholds.minimumMargin),
      resetCount: progression ? thresholds.maximumResetCount - progression.resetCount : null,
      noProgressRun: progression ? thresholds.maximumNoProgressRun - progression.longestNoProgressRun : null,
    },
    firstFailedStage,
  };
}

/**
 * Deterministic fold calibration. Progression limits come only from training
 * positives: no more resets than any training positive, and one window of
 * tolerance above the longest training-positive no-progress run. The margin is
 * one integer point above the strongest training real negative that the
 * safety and progression stages would otherwise admit. Calibration fails when
 * that margin would exceed a training positive.
 */
export function calibrateProgressionThresholds(trainingPositives: readonly ProgressionSample[], trainingNegatives: readonly ProgressionSample[]): ProgressionCandidateThresholds | null {
  const positives = trainingPositives.filter((sample) => sample.progression !== null);
  if (!positives.length) return null;
  const partial = {
    minimumGeneratedWindows: 5,
    minimumBestCtc: -0.60,
    maximumResetCount: Math.max(...positives.map((sample) => sample.progression!.resetCount)),
    maximumNoProgressRun: Math.max(...positives.map((sample) => sample.progression!.longestNoProgressRun)) + 1,
  };
  const admitted = trainingNegatives.filter((sample) => {
    const result = evaluateProgressionCandidate(sample, { ...partial, minimumMargin: Number.NEGATIVE_INFINITY });
    return result.firstFailedStage === null && sample.gates.globalViterbiMargin !== null;
  });
  const strongestAdmittedNegative = admitted.length ? Math.max(...admitted.map((sample) => sample.gates.globalViterbiMargin!)) : 0;
  const minimumMargin = Math.ceil(strongestAdmittedNegative) + 1;
  const weakestPositiveMargin = Math.min(...trainingPositives.flatMap((sample) => sample.gates.globalViterbiMargin === null ? [] : [sample.gates.globalViterbiMargin]));
  if (minimumMargin > weakestPositiveMargin) return null;
  return { ...partial, minimumMargin };
}

/** Alternative single-family conditions evaluated for comparison only. */
export const PROGRESSION_RULE_FAMILIES = {
  resetRejection: [0, 1].map((limit) => ({ id: `A reset<=${limit}`, accepts: (p: ProgressionFeatures) => p.resetCount <= limit })),
  novelty: [0.25, 0.3, 0.4, 0.45, 0.5].map((limit) => ({ id: `B novelty>=${limit}`, accepts: (p: ProgressionFeatures) => p.noveltyRatio !== null && p.noveltyRatio >= limit })),
  efficiency: [0.5, 0.75, 0.9, 1].map((limit) => ({ id: `C efficiency>=${limit}`, accepts: (p: ProgressionFeatures) => p.progressionEfficiency === null || p.progressionEfficiency >= limit })),
  revisitNoProgress: [0.25, 0.5].flatMap((ratio) => [1, 2, 3].map((run) => ({ id: `D revisit<=${ratio} run<=${run}`, accepts: (p: ProgressionFeatures) => (p.revisitRatio ?? 0) <= ratio && p.longestNoProgressRun <= run }))),
  localAgreement: [0, 1, 2].map((limit) => ({ id: `F reset=0 run<=2 localBehind<=${limit}`, accepts: (p: ProgressionFeatures) => p.resetCount === 0 && p.longestNoProgressRun <= 2 && p.local.behindFrontierCount <= limit })),
} as const;
