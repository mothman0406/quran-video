import { forceAlignCtc, type CtcCanonicalWord, type CtcFrameLogits, type CtcTargetToken } from "./ctc-forced-alignment.ts";
import { ctcForwardScore } from "./fastconformer-identification.ts";
import { normalizedBlankCtcLogLikelihood } from "./quran-boundary-acoustics.ts";
import type { VadSpeechRegion } from "./speech-regions.ts";

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
  anchorCutMs?: number;
  intervalStartMs: number;
  intervalEndMs: number;
  frameCount: number;
  targetTokenCount: number;
  minimumFramesRequired: number;
  targetRepresentationFeasible: boolean;
  alignedTokenCount: number;
  targetCoverage: number;
  normalizedTargetLogLikelihood: number | null;
  alignmentComplete: boolean;
  boundaryTokenDistanceMs: number | null;
  temporalConsistency: boolean;
  valid: boolean;
  outerEvidence?: OuterBoundaryEvidence;
};

export type OuterBoundaryEvidence = {
  edge: "start" | "end";
  intervalStartMs: number;
  intervalEndMs: number;
  frameCount: number;
  targetTokenCount: number;
  normalizedTargetLogLikelihood: number;
  normalizedBlankLogLikelihood: number;
  likelihoodDifference: number;
  orderedGreedyCanonicalMatches: number;
  alignmentComplete: true;
  firstAlignedTokenMs: number;
  lastAlignedTokenMs: number;
  blankCompletionApplied: boolean;
  boundaryMs: number;
};

export type BoundaryTargetRepresentation = {
  edge: "start" | "end";
  status: "full" | "bounded" | "infeasible";
  sourceFeasibility: "alignable" | "target-representation-infeasible";
  availableFrames: number;
  sourceTokenCount: number;
  sourceMinimumFramesRequired: number;
  selectedTokenCount: number;
  selectedMinimumFramesRequired: number;
  selectedFrameRequirementWithSlack: number;
  selectedCanonicalWordCount: number;
};

export type CoreBoundaryLocation = {
  edge: "start" | "end";
  searchStartMs: number;
  searchEndMs: number;
  coarseEvaluationCount: number;
  fineEvaluationCount: number;
  selected: BoundaryCandidate | null;
  candidates: readonly BoundaryCandidate[];
  targetRepresentation?: BoundaryTargetRepresentation;
};

/**
 * A CTC path needs one frame for every label. Consecutive equal labels need an
 * intervening blank because the trellis cannot skip directly between them.
 * Initial/final blank states are optional, so they do not increase the
 * mathematical minimum.
 */
export function minimumCtcFramesRequired(tokens: readonly CtcTargetToken[]) {
  return tokens.length + tokens.reduce((repeats, token, index) =>
    repeats + Number(index > 0 && token.tokenId === tokens[index - 1]!.tokenId), 0);
}

/**
 * Boundary localization reserves one non-label frame per selected label. This
 * is derived from the alternating blank/label CTC topology rather than an
 * ayah- or token-count limit. The mathematical feasibility state remains
 * separately visible in diagnostics.
 */
export function boundaryLocalizationFrameRequirement(tokens: readonly CtcTargetToken[]) {
  return minimumCtcFramesRequired(tokens) + tokens.length;
}

export function selectFeasibleBoundaryTarget(input: {
  edge: "start" | "end";
  availableFrames: number;
  canonicalWords: readonly CtcCanonicalWord[];
  targetTokens: readonly CtcTargetToken[];
}) {
  const availableFrames = Math.max(0, Math.floor(input.availableFrames));
  const sourceMinimumFramesRequired = minimumCtcFramesRequired(input.targetTokens);
  const sourceFeasibility = sourceMinimumFramesRequired <= availableFrames
    ? "alignable" as const
    : "target-representation-infeasible" as const;
  let selectedTokens: readonly CtcTargetToken[] = [];
  if (input.edge === "start") {
    for (let end = 1; end <= input.targetTokens.length; end += 1) {
      const candidate = input.targetTokens.slice(0, end);
      if (boundaryLocalizationFrameRequirement(candidate) > availableFrames) break;
      selectedTokens = candidate;
    }
  } else {
    for (let start = input.targetTokens.length - 1; start >= 0; start -= 1) {
      const candidate = input.targetTokens.slice(start);
      if (boundaryLocalizationFrameRequirement(candidate) > availableFrames) break;
      selectedTokens = candidate;
    }
  }
  const selectedWordIndexes = new Set(selectedTokens.flatMap((token) =>
    token.globalWordIndex === undefined ? [] : [token.globalWordIndex]));
  const canonicalWords = input.canonicalWords.filter((word) => selectedWordIndexes.has(word.globalWordIndex));
  const selectedMinimumFramesRequired = minimumCtcFramesRequired(selectedTokens);
  const feasible = selectedTokens.length >= FROZEN_CORE_BOUNDARY_RULE.minimumTargetTokenCount
    && selectedMinimumFramesRequired <= availableFrames;
  const representation: BoundaryTargetRepresentation = {
    edge: input.edge,
    status: !feasible ? "infeasible" : selectedTokens.length === input.targetTokens.length ? "full" : "bounded",
    sourceFeasibility,
    availableFrames,
    sourceTokenCount: input.targetTokens.length,
    sourceMinimumFramesRequired,
    selectedTokenCount: feasible ? selectedTokens.length : 0,
    selectedMinimumFramesRequired: feasible ? selectedMinimumFramesRequired : 0,
    selectedFrameRequirementWithSlack: feasible ? boundaryLocalizationFrameRequirement(selectedTokens) : 0,
    selectedCanonicalWordCount: feasible ? canonicalWords.length : 0,
  };
  return {
    canonicalWords: feasible ? canonicalWords : [],
    targetTokens: feasible ? selectedTokens : [],
    representation,
  };
}

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
  const minimumFramesRequired = minimumCtcFramesRequired(input.targetTokens);
  const targetRepresentationFeasible = Boolean(sliced && minimumFramesRequired <= sliced.frames);
  if (!sliced || targetTokenCount < FROZEN_CORE_BOUNDARY_RULE.minimumTargetTokenCount || !targetRepresentationFeasible) {
    return {
      cutMs: input.cutMs, intervalStartMs, intervalEndMs, frameCount: sliced?.frames ?? 0,
      targetTokenCount, minimumFramesRequired, targetRepresentationFeasible,
      alignedTokenCount: 0, targetCoverage: 0,
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
    minimumFramesRequired,
    targetRepresentationFeasible,
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

function greedyFrameToken(logits: CtcFrameLogits, frame: number) {
  const offset = frame * logits.vocabularySize;
  let selected = 0;
  for (let token = 1; token < logits.vocabularySize; token += 1) {
    if (logits.values[offset + token]! > logits.values[offset + selected]!) selected = token;
  }
  return selected;
}

function orderedGreedyCanonicalMatches(logits: CtcFrameLogits, targetTokens: readonly CtcTargetToken[], blankTokenId: number) {
  const greedy: number[] = [];
  let previousFrameToken: number | null = null;
  for (let frame = 0; frame < logits.frames; frame += 1) {
    const token = greedyFrameToken(logits, frame);
    if (token !== blankTokenId && token !== previousFrameToken) greedy.push(token);
    previousFrameToken = token;
  }
  const target = targetTokens.map((token) => token.tokenId);
  const lengths = Array.from({ length: greedy.length + 1 }, () => new Uint16Array(target.length + 1));
  for (let greedyIndex = 1; greedyIndex <= greedy.length; greedyIndex += 1) {
    for (let targetIndex = 1; targetIndex <= target.length; targetIndex += 1) {
      lengths[greedyIndex]![targetIndex] = greedy[greedyIndex - 1] === target[targetIndex - 1]
        ? lengths[greedyIndex - 1]![targetIndex - 1]! + 1
        : Math.max(lengths[greedyIndex - 1]![targetIndex]!, lengths[greedyIndex]![targetIndex - 1]!);
    }
  }
  const targetIndexes: number[] = [];
  let greedyIndex = greedy.length;
  let targetIndex = target.length;
  while (greedyIndex > 0 && targetIndex > 0) {
    if (greedy[greedyIndex - 1] === target[targetIndex - 1]) {
      targetIndexes.push(targetIndex - 1);
      greedyIndex -= 1;
      targetIndex -= 1;
    } else if (lengths[greedyIndex - 1]![targetIndex]! >= lengths[greedyIndex]![targetIndex - 1]!) greedyIndex -= 1;
    else targetIndex -= 1;
  }
  targetIndexes.reverse();
  return { count: targetIndexes.length, firstTargetIndex: targetIndexes[0] ?? null, lastTargetIndex: targetIndexes.at(-1) ?? null };
}

function greedyBlankBetween(input: {
  logits: CtcFrameLogits;
  intervalStartMs: number;
  intervalEndMs: number;
  startMs: number;
  endMs: number;
  blankTokenId: number;
}) {
  if (input.endMs <= input.startMs) return true;
  const frameAt = (ms: number) => Math.max(0, Math.min(input.logits.frames,
    Math.round((ms - input.intervalStartMs) / (input.intervalEndMs - input.intervalStartMs) * input.logits.frames)));
  const startFrame = frameAt(input.startMs);
  const endFrame = frameAt(input.endMs);
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    if (greedyFrameToken(input.logits, frame) !== input.blankTokenId) return false;
  }
  return true;
}

function locateOuterCanonicalEvidence(input: {
  edge: "start" | "end";
  anchorCutMs: number;
  outerLimitMs: number;
  audioStartMs: number;
  audioEndMs: number;
  logits: CtcFrameLogits;
  canonicalWords: readonly CtcCanonicalWord[];
  targetTokens: readonly CtcTargetToken[];
  blankTokenId: number;
  speechRegions: readonly VadSpeechRegion[];
}): OuterBoundaryEvidence | null {
  if (!input.speechRegions.length) return null;
  const intervalStartMs = input.edge === "start" ? input.outerLimitMs : input.anchorCutMs;
  const intervalEndMs = input.edge === "start" ? input.anchorCutMs : input.outerLimitMs;
  const sliced = sliceCtcLogits(input.logits, input.audioStartMs, input.audioEndMs, intervalStartMs, intervalEndMs);
  if (!sliced) return null;
  const blank = normalizedBlankCtcLogLikelihood(sliced, input.blankTokenId);
  if (blank === null) return null;
  const orderedMatches = orderedGreedyCanonicalMatches(sliced, input.targetTokens, input.blankTokenId);
  if (orderedMatches.count < FROZEN_CORE_BOUNDARY_RULE.minimumTargetTokenCount
    || orderedMatches.firstTargetIndex === null || orderedMatches.lastTargetIndex === null) return null;
  const tokens = input.edge === "start"
    ? input.targetTokens.slice(0, orderedMatches.lastTargetIndex + 1)
    : input.targetTokens.slice(orderedMatches.firstTargetIndex);
  if (boundaryLocalizationFrameRequirement(tokens) > sliced.frames) return null;
  const rawScore = ctcForwardScore(sliced, tokens.map((token) => token.tokenId), input.blankTokenId);
  if (rawScore === null) return null;
  const score = rawScore / sliced.frames;
  const difference = score - blank;
  if (!(difference > 0)) return null;
  const selectedWordIndexes = new Set(tokens.flatMap((token) =>
    token.globalWordIndex === undefined ? [] : [token.globalWordIndex]));
  const canonicalWords = input.canonicalWords.filter((word) => selectedWordIndexes.has(word.globalWordIndex));
  const alignment = forceAlignCtc(canonicalWords, tokens, sliced, {
    blankTokenId: input.blankTokenId,
    startMs: intervalStartMs,
    endMs: intervalEndMs,
    finalSpeechEndMs: intervalEndMs,
    frameExactEndpoints: true,
  });
  if (alignment.status !== "complete" || !alignment.words.length) return null;
  const firstAlignedTokenMs = alignment.words[0]!.startMs;
  const lastAlignedTokenMs = alignment.words.at(-1)!.endMs;
  const alignedEdgeMs = input.edge === "start" ? firstAlignedTokenMs : lastAlignedTokenMs;
  const speechRegion = input.speechRegions.find((region) => alignedEdgeMs >= region.startMs && alignedEdgeMs <= region.endMs);
  const blankLimitMs = speechRegion
    ? input.edge === "start" ? Math.max(intervalStartMs, speechRegion.startMs) : Math.min(intervalEndMs, speechRegion.endMs)
    : alignedEdgeMs;
  const blankCompletionApplied = Boolean(speechRegion && blankLimitMs !== alignedEdgeMs && greedyBlankBetween({
    logits: sliced,
    intervalStartMs,
    intervalEndMs,
    startMs: input.edge === "start" ? blankLimitMs : alignedEdgeMs,
    endMs: input.edge === "start" ? alignedEdgeMs : blankLimitMs,
    blankTokenId: input.blankTokenId,
  }));
  const boundaryMs = blankCompletionApplied ? blankLimitMs : alignedEdgeMs;
  return {
    edge: input.edge,
    intervalStartMs,
    intervalEndMs,
    frameCount: sliced.frames,
    targetTokenCount: tokens.length,
    normalizedTargetLogLikelihood: Number(score.toFixed(6)),
    normalizedBlankLogLikelihood: blank,
    likelihoodDifference: Number(difference.toFixed(6)),
    orderedGreedyCanonicalMatches: orderedMatches.count,
    alignmentComplete: true,
    firstAlignedTokenMs,
    lastAlignedTokenMs,
    blankCompletionApplied,
    boundaryMs,
  };
}

/**
 * Locates one core edge with equal-duration candidate intervals and one
 * frame-feasible canonical edge representation. A winning emission anchor may
 * move outward only when that bounded region contains ordered canonical
 * emissions and its canonical CTC hypothesis strictly beats blank.
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
  speechRegions?: readonly VadSpeechRegion[];
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
  const coarseCuts = uniqueGrid(searchStartMs, searchEndMs, FROZEN_CORE_BOUNDARY_RULE.coarseStepMs);
  const capacityCuts = uniqueGrid(searchStartMs, searchEndMs, FROZEN_CORE_BOUNDARY_RULE.fineStepMs);
  const availableFrames = Math.min(...capacityCuts.map((cutMs) => {
    const intervalStartMs = input.edge === "start" ? cutMs : cutMs - duration;
    const intervalEndMs = input.edge === "start" ? cutMs + duration : cutMs;
    return sliceCtcLogits(input.logits, input.audioStartMs, input.audioEndMs, intervalStartMs, intervalEndMs)?.frames ?? 0;
  }));
  const target = selectFeasibleBoundaryTarget({
    edge: input.edge,
    availableFrames,
    canonicalWords: input.canonicalWords,
    targetTokens: input.targetTokens,
  });
  if (target.representation.status === "infeasible") {
    return {
      edge: input.edge, searchStartMs, searchEndMs, coarseEvaluationCount: 0, fineEvaluationCount: 0,
      selected: null, candidates: [], targetRepresentation: target.representation,
    };
  }
  const evaluate = (cutMs: number) => evaluateCandidate({
    ...input,
    canonicalWords: target.canonicalWords,
    targetTokens: target.targetTokens,
    cutMs,
  });
  const coarse = coarseCuts.map(evaluate);
  const coarseBest = strongest(coarse);
  if (!coarseBest) {
    return { edge: input.edge, searchStartMs, searchEndMs, coarseEvaluationCount: coarse.length, fineEvaluationCount: 0, selected: null, candidates: coarse, targetRepresentation: target.representation };
  }
  const fineStart = Math.max(searchStartMs, coarseBest.cutMs - FROZEN_CORE_BOUNDARY_RULE.coarseStepMs);
  const fineEnd = Math.min(searchEndMs, coarseBest.cutMs + FROZEN_CORE_BOUNDARY_RULE.coarseStepMs);
  const coarseCutSet = new Set(coarse.map((candidate) => candidate.cutMs));
  const fine = uniqueGrid(fineStart, fineEnd, FROZEN_CORE_BOUNDARY_RULE.fineStepMs)
    .filter((cutMs) => !coarseCutSet.has(cutMs))
    .map(evaluate);
  const candidates = [...coarse, ...fine].sort((left, right) => left.cutMs - right.cutMs);
  const selectedAnchor = strongest(candidates);
  const outerEvidence = selectedAnchor ? locateOuterCanonicalEvidence({
    edge: input.edge,
    anchorCutMs: selectedAnchor.cutMs,
    outerLimitMs: input.edge === "start" ? input.firstSpeechMs : input.finalSpeechMs,
    audioStartMs: input.audioStartMs,
    audioEndMs: input.audioEndMs,
    logits: input.logits,
    canonicalWords: target.canonicalWords,
    targetTokens: target.targetTokens,
    blankTokenId: input.blankTokenId,
    speechRegions: input.speechRegions ?? [],
  }) : null;
  const selected = selectedAnchor && outerEvidence && (input.edge === "start"
    ? outerEvidence.boundaryMs < selectedAnchor.cutMs
    : outerEvidence.boundaryMs > selectedAnchor.cutMs)
    ? { ...selectedAnchor, anchorCutMs: selectedAnchor.cutMs, cutMs: outerEvidence.boundaryMs, outerEvidence }
    : selectedAnchor;
  return {
    edge: input.edge,
    searchStartMs,
    searchEndMs,
    coarseEvaluationCount: coarse.length,
    fineEvaluationCount: fine.length,
    selected,
    candidates,
    targetRepresentation: target.representation,
  };
}
