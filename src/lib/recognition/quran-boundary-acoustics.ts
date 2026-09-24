import type { CtcFrameLogits } from "./ctc-forced-alignment.ts";
import type { VadSpeechRegion } from "./speech-regions.ts";

export const FROZEN_BOUNDARY_EVIDENCE_RULE = Object.freeze({
  maximumBoundaryDurationMs: 12_000,
  minimumVoicedDurationMs: 320,
  requireStrictCandidateWin: true,
  requireCompleteTargetCoverage: true,
  maximumExpansionPerEdge: 1,
});

function frameLogProbability(logits: CtcFrameLogits, frame: number, tokenId: number) {
  const offset = frame * logits.vocabularySize;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let id = 0; id < logits.vocabularySize; id += 1) maximum = Math.max(maximum, logits.values[offset + id] ?? Number.NEGATIVE_INFINITY);
  let sum = 0;
  for (let id = 0; id < logits.vocabularySize; id += 1) sum += Math.exp((logits.values[offset + id] ?? Number.NEGATIVE_INFINITY) - maximum);
  return (logits.values[offset + tokenId] ?? Number.NEGATIVE_INFINITY) - maximum - Math.log(sum);
}

export function normalizedBlankCtcLogLikelihood(logits: CtcFrameLogits, blankTokenId: number) {
  if (!logits.frames || blankTokenId < 0 || blankTokenId >= logits.vocabularySize) return null;
  let score = 0;
  for (let frame = 0; frame < logits.frames; frame += 1) score += frameLogProbability(logits, frame, blankTokenId);
  return Number((score / logits.frames).toFixed(6));
}

export function voicedDurationInRegion(regions: readonly VadSpeechRegion[], startMs: number, endMs: number) {
  return Math.round(regions.reduce((total, region) => total
    + Math.max(0, Math.min(endMs, region.endMs) - Math.max(startMs, region.startMs)), 0));
}

export function boundedBoundaryRegion(input: {
  edge: "start" | "end";
  coreStartMs: number;
  coreEndMs: number;
  audioDurationMs: number;
}) {
  const maximum = FROZEN_BOUNDARY_EVIDENCE_RULE.maximumBoundaryDurationMs;
  return input.edge === "start"
    ? { startMs: Math.max(0, input.coreStartMs - maximum), endMs: input.coreStartMs }
    : { startMs: input.coreEndMs, endMs: Math.min(input.audioDurationMs, input.coreEndMs + maximum) };
}
