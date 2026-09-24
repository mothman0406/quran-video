import type { CoreBoundaryLocation } from "./quran-core-boundary-localizer.ts";

export const CORE_BOUNDARY_EVIDENCE_SCHEMA_VERSION = 1 as const;

export type CoreBoundarySummary = Pick<CoreBoundaryLocation,
  "edge" | "searchStartMs" | "searchEndMs" | "coarseEvaluationCount" | "fineEvaluationCount"> & {
    selectedCutMs: number | null;
    selectedTargetLogLikelihoodPerFrame: number | null;
    selectedTargetCoverage: number;
    selectedAlignmentComplete: boolean;
    selectedTemporalConsistency: boolean;
  };

export type PrivacySafeCoreBoundaryFixture = {
  schemaVersion: typeof CORE_BOUNDARY_EVIDENCE_SCHEMA_VERSION;
  id: string;
  role: "design-edge-positive" | "design-edge-negative" | "held-out-positive-b";
  expectedEdgePresent: boolean;
  edge: "start" | "end";
  core: { surah: number; startAyah: number; endAyah: number };
  candidateAyah: number;
  audioDurationMs: number;
  oldCoreStartMs: number | null;
  oldCoreEndMs: number | null;
  startLocator: CoreBoundarySummary;
  endLocator: CoreBoundarySummary;
  selectedCoreStartMs: number | null;
  selectedCoreEndMs: number | null;
  wholeCoreAlignmentComplete: boolean;
  wholeCoreTargetTokenCount: number;
  wholeCoreAlignedTokenCount: number;
  wholeCoreTargetCoverage: number;
  relativeBoundaryStartMs: number | null;
  relativeBoundaryEndMs: number | null;
  boundaryDurationMs: number;
  voicedDurationMs: number;
  candidateTokenCount: number;
  alignedTokenCount: number;
  targetCoverage: number;
  candidateLogLikelihoodPerFrame: number | null;
  noExtensionLogLikelihoodPerFrame: number | null;
  likelihoodDifference: number | null;
  alignmentComplete: boolean;
  orderingValid: boolean;
  coreOverlap: boolean;
  stealsCoreAudio: boolean;
  optionalBasmalahOnly: boolean;
  decision: boolean;
  decisionReasons: string[];
  finalRange: string;
  fullRecordingInferenceMs: number;
  edgeInferenceMs: number;
  totalRuntimeMs: number;
};

export function summarizeCoreBoundary(location: CoreBoundaryLocation): CoreBoundarySummary {
  return {
    edge: location.edge,
    searchStartMs: Math.round(location.searchStartMs),
    searchEndMs: Math.round(location.searchEndMs),
    coarseEvaluationCount: location.coarseEvaluationCount,
    fineEvaluationCount: location.fineEvaluationCount,
    selectedCutMs: location.selected?.cutMs ?? null,
    selectedTargetLogLikelihoodPerFrame: location.selected?.normalizedTargetLogLikelihood ?? null,
    selectedTargetCoverage: location.selected?.targetCoverage ?? 0,
    selectedAlignmentComplete: location.selected?.alignmentComplete ?? false,
    selectedTemporalConsistency: location.selected?.temporalConsistency ?? false,
  };
}

