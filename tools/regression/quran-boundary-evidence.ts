import type { EdgeAcousticEvidence } from "./quran-edge-completion.ts";
import {
  boundedBoundaryRegion,
  FROZEN_BOUNDARY_EVIDENCE_RULE,
  normalizedBlankCtcLogLikelihood,
  voicedDurationInRegion,
} from "../../src/lib/recognition/quran-boundary-acoustics.ts";

export { boundedBoundaryRegion, FROZEN_BOUNDARY_EVIDENCE_RULE, normalizedBlankCtcLogLikelihood, voicedDurationInRegion };

export const BOUNDARY_EVIDENCE_SCHEMA_VERSION = 1 as const;
export type BoundaryCaptureRole = "design-edge-positive" | "design-edge-negative" | "held-out-positive-b";

export type PrivacySafeBoundaryFixture = {
  schemaVersion: typeof BOUNDARY_EVIDENCE_SCHEMA_VERSION;
  id: string;
  role: BoundaryCaptureRole;
  expectedEdgePresent: boolean;
  edge: "start" | "end";
  core: { surah: number; startAyah: number; endAyah: number };
  candidateAyah: number;
  relativeBoundaryStartMs: number;
  relativeBoundaryEndMs: number;
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
  runtimeMs: number;
};

export const BOUNDARY_CAPTURE_DESIGNATIONS = Object.freeze([
  Object.freeze({
    id: "local-core-edge-design-positive-reader-h-91-start",
    role: "design-edge-positive" as const,
    expectedEdgePresent: true,
    knownRange: Object.freeze({ surah: 91, startAyah: 1, endAyah: 15 }),
    core: Object.freeze({ surah: 91, startAyah: 2, endAyah: 15 }),
    edge: "start" as const,
    candidateAyah: 1,
  }),
  Object.freeze({
    id: "local-core-edge-design-negative-reader-j-90-end",
    role: "design-edge-negative" as const,
    expectedEdgePresent: false,
    knownRange: Object.freeze({ surah: 90, startAyah: 1, endAyah: 12 }),
    core: Object.freeze({ surah: 90, startAyah: 1, endAyah: 12 }),
    edge: "end" as const,
    candidateAyah: 13,
  }),
  Object.freeze({
    id: "local-core-edge-held-out-positive-b-101-start",
    role: "held-out-positive-b" as const,
    expectedEdgePresent: true,
    knownRange: Object.freeze({ surah: 101, startAyah: 1, endAyah: 11 }),
    core: Object.freeze({ surah: 101, startAyah: 2, endAyah: 11 }),
    edge: "start" as const,
    candidateAyah: 1,
  }),
] as const);

export function boundaryEvidenceReasons(evidence: EdgeAcousticEvidence) {
  return [
    ...(!(evidence.voicedDurationMs >= FROZEN_BOUNDARY_EVIDENCE_RULE.minimumVoicedDurationMs) ? ["insufficient-voiced-boundary-audio"] : []),
    ...(!evidence.alignmentComplete ? ["incomplete-candidate-alignment"] : []),
    ...(evidence.candidateTokenCount <= 0 || evidence.alignedTokenCount !== evidence.candidateTokenCount ? ["incomplete-target-coverage"] : []),
    ...(!(Number.isFinite(evidence.candidateLogLikelihoodPerFrame)
      && Number.isFinite(evidence.noExtensionLogLikelihoodPerFrame)
      && evidence.candidateLogLikelihoodPerFrame > evidence.noExtensionLogLikelihoodPerFrame) ? ["no-extension-hypothesis-wins"] : []),
    ...(!evidence.temporallyOrderedOutsideCore ? ["candidate-not-outside-core"] : []),
    ...(evidence.overlapsCoreAudio ? ["extension-steals-core-audio"] : []),
    ...(evidence.optionalBasmalahOnly ? ["optional-basmalah-is-not-canonical-edge-evidence"] : []),
  ];
}
