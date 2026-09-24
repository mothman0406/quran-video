import { forceAlignCtc, type CtcCanonicalWord, type CtcFrameLogits, type CtcTargetToken } from "./ctc-forced-alignment.ts";
import { ctcForwardScore } from "./fastconformer-identification.ts";

export const FROZEN_CORE_BOUNDARY_RULE = Object.freeze({
  searchSpanMs: 6_000,
  evaluationWindowMs: 12_000,
  coarseStepMs: 200,
  fineStepMs: 40,
  boundaryTokenToleranceMs: 200,
  boundaryTargetAyahCount: 3,
  minimumTargetTokenCount: 2,
  requireCompleteBoundaryTarget: true,
  requireCompleteWholeCore: true,
});

export type BoundaryCandidate = {
  cutMs: number;
  intervalStartMs: number;
  intervalEndMs: number;
  frameCount: number;
  targetTokenCount: number;
  alignedTokenCount: number;
  targetCoverage: number;
  normalizedTargetLogLikelihood: number | null;
  alignmentComplete: boolean;
  boundaryTokenDistanceMs: number | null;
  temporalConsistency: boolean;
  valid: boolean;
};

export type CoreBoundaryLocation = {
  edge: "start" | "end";
  searchStartMs: number;
  searchEndMs: number;
  coarseEvaluationCount: number;
  fineEvaluationCount: number;
  selected: BoundaryCandidate | null;
  candidates: readonly BoundaryCandidate[];
};

export function selectApplicableCoreBoundaries(input: {
  core: { startAyah: number; endAyah: number };
  surahAyahCount: number;
  establishedStartMs: number | null;
  establishedEndMs: number | null;
  startLocation: CoreBoundaryLocation;
  endLocation: CoreBoundaryLocation;
}) {
  return {
    startMs: input.core.startAyah > 1 ? input.startLocation.selected?.cutMs ?? null : input.establishedStartMs,
    endMs: input.core.endAyah < input.surahAyahCount ? input.endLocation.selected?.cutMs ?? null : input.establishedEndMs,
  };
}

function uniqueGrid(startMs: number, endMs: number, stepMs: number) {
  const values: number[] = [];
  for (let value = startMs; value <= endMs; value += stepMs) values.push(Math.round(value));
  if (values.at(-1) !== Math.round(endMs)) values.push(Math.round(endMs));
  return [...new Set(values)];
}

export function sliceCtcLogits(
  logits: CtcFrameLogits,
  audioStartMs: number,
  audioEndMs: number,
  intervalStartMs: number,
  intervalEndMs: number,
): CtcFrameLogits | null {
  if (!(audioEndMs > audioStartMs) || !(intervalEndMs > intervalStartMs) || !logits.frames) return null;
  const frameAt = (ms: number) => Math.round((ms - audioStartMs) / (audioEndMs - audioStartMs) * logits.frames);
  const startFrame = Math.max(0, Math.min(logits.frames, frameAt(intervalStartMs)));
  const endFrame = Math.max(startFrame, Math.min(logits.frames, frameAt(intervalEndMs)));
  if (endFrame <= startFrame) return null;
  const start = startFrame * logits.vocabularySize;
  const end = endFrame * logits.vocabularySize;
  return {
    values: logits.values instanceof Float32Array
      ? logits.values.slice(start, end)
      : logits.values.slice(start, end),
    frames: endFrame - startFrame,
    vocabularySize: logits.vocabularySize,
  };
}

function evaluateCandidate(input: {
  edge: "start" | "end";
  cutMs: number;
  audioStartMs: number;
  audioEndMs: number;
  logits: CtcFrameLogits;
  canonicalWords: readonly CtcCanonicalWord[];
  targetTokens: readonly CtcTargetToken[];
  blankTokenId: number;
}): BoundaryCandidate {
  const duration = FROZEN_CORE_BOUNDARY_RULE.evaluationWindowMs;
  const intervalStartMs = input.edge === "start" ? input.cutMs : input.cutMs - duration;
  const intervalEndMs = input.edge === "start" ? input.cutMs + duration : input.cutMs;
  const sliced = sliceCtcLogits(input.logits, input.audioStartMs, input.audioEndMs, intervalStartMs, intervalEndMs);
  const targetTokenCount = input.targetTokens.length;
  if (!sliced || targetTokenCount < FROZEN_CORE_BOUNDARY_RULE.minimumTargetTokenCount) {
    return {
      cutMs: input.cutMs, intervalStartMs, intervalEndMs, frameCount: sliced?.frames ?? 0,
      targetTokenCount, alignedTokenCount: 0, targetCoverage: 0,
      normalizedTargetLogLikelihood: null, alignmentComplete: false,
      boundaryTokenDistanceMs: null, temporalConsistency: false, valid: false,
    };
  }
  const score = ctcForwardScore(sliced, input.targetTokens.map((token) => token.tokenId), input.blankTokenId);
  const normalizedTargetLogLikelihood = score === null ? null : Number((score / sliced.frames).toFixed(6));
  const alignment = forceAlignCtc(input.canonicalWords, input.targetTokens, sliced, {
    blankTokenId: input.blankTokenId,
    startMs: intervalStartMs,
    endMs: intervalEndMs,
    finalSpeechEndMs: intervalEndMs,
    frameExactEndpoints: true,
  });
  const alignmentComplete = alignment.status === "complete";
  const alignedTokenCount = alignmentComplete ? alignment.targetTokens.length : 0;
  const targetCoverage = targetTokenCount ? alignedTokenCount / targetTokenCount : 0;
  const boundaryTokenDistanceMs = !alignmentComplete ? null : input.edge === "start"
    ? (alignment.words[0]?.startMs ?? intervalEndMs) - input.cutMs
    : input.cutMs - (alignment.words.at(-1)?.endMs ?? intervalStartMs);
  const temporalConsistency = boundaryTokenDistanceMs !== null
    && boundaryTokenDistanceMs >= 0
    && boundaryTokenDistanceMs <= FROZEN_CORE_BOUNDARY_RULE.boundaryTokenToleranceMs;
  const valid = alignmentComplete
    && alignedTokenCount === targetTokenCount
    && temporalConsistency
    && normalizedTargetLogLikelihood !== null
    && Number.isFinite(normalizedTargetLogLikelihood);
  return {
    cutMs: input.cutMs,
    intervalStartMs,
    intervalEndMs,
    frameCount: sliced.frames,
    targetTokenCount,
    alignedTokenCount,
    targetCoverage: Number(targetCoverage.toFixed(6)),
    normalizedTargetLogLikelihood,
    alignmentComplete,
    boundaryTokenDistanceMs: boundaryTokenDistanceMs === null ? null : Math.round(boundaryTokenDistanceMs),
    temporalConsistency,
    valid,
  };
}

function strongest(candidates: readonly BoundaryCandidate[]) {
  return candidates.filter((candidate) => candidate.valid).sort((left, right) =>
    (right.normalizedTargetLogLikelihood ?? Number.NEGATIVE_INFINITY)
      - (left.normalizedTargetLogLikelihood ?? Number.NEGATIVE_INFINITY)
    || left.cutMs - right.cutMs)[0] ?? null;
}

/**
 * Locates one core edge without scoring any audio outside the candidate cut.
 * Every candidate uses the same twelve-second acoustic duration and the same
 * complete three-ayah boundary target, so per-frame likelihoods are comparable.
 */
export function locateCoreBoundary(input: {
  edge: "start" | "end";
  audioStartMs: number;
  audioEndMs: number;
  firstSpeechMs: number;
  finalSpeechMs: number;
  logits: CtcFrameLogits;
  canonicalWords: readonly CtcCanonicalWord[];
  targetTokens: readonly CtcTargetToken[];
  blankTokenId: number;
}): CoreBoundaryLocation {
  const duration = FROZEN_CORE_BOUNDARY_RULE.evaluationWindowMs;
  const searchStartMs = input.edge === "start"
    ? Math.max(input.audioStartMs, input.firstSpeechMs)
    : Math.max(input.audioStartMs + duration, input.finalSpeechMs - FROZEN_CORE_BOUNDARY_RULE.searchSpanMs);
  const searchEndMs = input.edge === "start"
    ? Math.min(input.audioEndMs - duration, input.firstSpeechMs + FROZEN_CORE_BOUNDARY_RULE.searchSpanMs)
    : Math.min(input.audioEndMs, input.finalSpeechMs);
  if (searchEndMs < searchStartMs) {
    return { edge: input.edge, searchStartMs, searchEndMs, coarseEvaluationCount: 0, fineEvaluationCount: 0, selected: null, candidates: [] };
  }
  const evaluate = (cutMs: number) => evaluateCandidate({ ...input, cutMs });
  const coarse = uniqueGrid(searchStartMs, searchEndMs, FROZEN_CORE_BOUNDARY_RULE.coarseStepMs).map(evaluate);
  const coarseBest = strongest(coarse);
  if (!coarseBest) {
    return { edge: input.edge, searchStartMs, searchEndMs, coarseEvaluationCount: coarse.length, fineEvaluationCount: 0, selected: null, candidates: coarse };
  }
  const fineStart = Math.max(searchStartMs, coarseBest.cutMs - FROZEN_CORE_BOUNDARY_RULE.coarseStepMs);
  const fineEnd = Math.min(searchEndMs, coarseBest.cutMs + FROZEN_CORE_BOUNDARY_RULE.coarseStepMs);
  const coarseCuts = new Set(coarse.map((candidate) => candidate.cutMs));
  const fine = uniqueGrid(fineStart, fineEnd, FROZEN_CORE_BOUNDARY_RULE.fineStepMs)
    .filter((cutMs) => !coarseCuts.has(cutMs))
    .map(evaluate);
  const candidates = [...coarse, ...fine].sort((left, right) => left.cutMs - right.cutMs);
  return {
    edge: input.edge,
    searchStartMs,
    searchEndMs,
    coarseEvaluationCount: coarse.length,
    fineEvaluationCount: fine.length,
    selected: strongest(candidates),
    candidates,
  };
}
