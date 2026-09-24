import { expandCanonicalAyahRange, type CanonicalRange } from "./canonical-passage-reconstruction.ts";

export const FROZEN_BOUNDED_EDGE_RULE = Object.freeze({
  maximumAyahExpansionPerEdge: 1,
  minimumVoicedDurationMs: 320,
  requireCompleteTargetCoverage: true,
  requireDirectNoExtensionWin: true,
});

export type EdgeAcousticEvidence = {
  edge: "start" | "end";
  candidateAyah: number;
  voicedDurationMs: number;
  candidateTokenCount: number;
  alignedTokenCount: number;
  candidateLogLikelihoodPerFrame: number;
  noExtensionLogLikelihoodPerFrame: number;
  alignmentComplete: boolean;
  temporallyOrderedOutsideCore: boolean;
  overlapsCoreAudio: boolean;
  optionalBasmalahOnly: boolean;
};

export type EdgeDecision = {
  edge: "start" | "end";
  hypothesis: CanonicalRange | null;
  extended: boolean;
  reasons: string[];
};

function verifyEdge(
  core: CanonicalRange,
  edge: "start" | "end",
  evidence: EdgeAcousticEvidence | null,
  surahAyahCount: number,
): EdgeDecision {
  const candidateAyah = edge === "start" ? core.startAyah - 1 : core.endAyah + 1;
  const exists = candidateAyah >= 1 && candidateAyah <= surahAyahCount;
  const hypothesis = exists ? {
    surah: core.surah,
    startAyah: edge === "start" ? candidateAyah : core.startAyah,
    endAyah: edge === "end" ? candidateAyah : core.endAyah,
  } : null;
  const coverageComplete = Boolean(evidence && evidence.candidateTokenCount > 0
    && evidence.alignedTokenCount === evidence.candidateTokenCount);
  const directWin = Boolean(evidence
    && Number.isFinite(evidence.candidateLogLikelihoodPerFrame)
    && Number.isFinite(evidence.noExtensionLogLikelihoodPerFrame)
    && evidence.candidateLogLikelihoodPerFrame > evidence.noExtensionLogLikelihoodPerFrame);
  const reasons = [
    ...(!exists ? ["no-adjacent-canonical-ayah"] : []),
    ...(!evidence ? ["missing-comparative-acoustic-evidence"] : []),
    ...(evidence && evidence.edge !== edge ? ["wrong-edge-evidence"] : []),
    ...(evidence && evidence.candidateAyah !== candidateAyah ? ["unbounded-candidate"] : []),
    ...(evidence && evidence.voicedDurationMs < FROZEN_BOUNDED_EDGE_RULE.minimumVoicedDurationMs ? ["no-usable-voiced-audio"] : []),
    ...(evidence && !evidence.alignmentComplete ? ["incomplete-candidate-alignment"] : []),
    ...(evidence && !coverageComplete ? ["incomplete-target-coverage"] : []),
    ...(evidence && !directWin ? ["no-extension-hypothesis-wins"] : []),
    ...(evidence && !evidence.temporallyOrderedOutsideCore ? ["candidate-not-outside-core"] : []),
    ...(evidence?.overlapsCoreAudio ? ["extension-steals-core-audio"] : []),
    ...(evidence?.optionalBasmalahOnly ? ["optional-basmalah-is-not-canonical-edge-evidence"] : []),
  ];
  return { edge, hypothesis, extended: reasons.length === 0, reasons };
}

/** Tests at most the immediately adjacent ayah at each edge. */
export function completeBoundedEdges(input: {
  core: CanonicalRange;
  surahAyahCount: number;
  startEvidence: EdgeAcousticEvidence | null;
  endEvidence: EdgeAcousticEvidence | null;
}) {
  const start = verifyEdge(input.core, "start", input.startEvidence, input.surahAyahCount);
  const end = verifyEdge(input.core, "end", input.endEvidence, input.surahAyahCount);
  const range = {
    surah: input.core.surah,
    startAyah: start.extended ? input.core.startAyah - 1 : input.core.startAyah,
    endAyah: end.extended ? input.core.endAyah + 1 : input.core.endAyah,
  };
  return { range, start, end, canonicalAyat: expandCanonicalAyahRange(range) };
}
