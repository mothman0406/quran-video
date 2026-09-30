import {
  forceAlignCtc,
  type CtcCanonicalWord,
  type CtcForcedAlignmentResult,
  type CtcFrameLogits,
  type CtcTargetToken,
} from "./ctc-forced-alignment.ts";
import { ctcForwardScore } from "./fastconformer-identification.ts";
import { normalizedBlankCtcLogLikelihood } from "./quran-boundary-acoustics.ts";
import {
  FROZEN_CORE_BOUNDARY_RULE,
  minimumCtcFramesRequired,
  sliceCtcLogits,
} from "./quran-core-boundary-localizer.ts";
import type { VadSpeechRegion } from "./speech-regions.ts";

export type QuranOuterTimingEdgeRefinement = {
  edge: "start" | "end";
  localizedBoundaryMs: number;
  searchLimitMs: number;
  refinedBoundaryMs: number;
  expanded: boolean;
  reason: "already-at-evidence-limit" | "expanded-canonical-boundary" | "no-complete-expanded-path" | "no-outer-canonical-words" | "insufficient-canonical-proof";
  proof: {
    intervalStartMs: number;
    intervalEndMs: number;
    targetTokenCount: number;
    orderedGreedyCanonicalMatches: number;
    normalizedTargetLogLikelihood: number | null;
    normalizedBlankLogLikelihood: number | null;
    likelihoodDifference: number | null;
    alignmentComplete: boolean;
    alignedBoundaryTokenMs: number | null;
    blankOrRepeatContinuationApplied: boolean;
    blankContinuationFrames: number;
    repeatContinuationFrames: number;
  } | null;
};

export type QuranOuterTimingRefinement = {
  intervalStartMs: number;
  intervalEndMs: number;
  acceptedCanonicalIdentityUnchanged: true;
  start: QuranOuterTimingEdgeRefinement;
  end: QuranOuterTimingEdgeRefinement;
};

function greedyFrameToken(logits: CtcFrameLogits, frame: number) {
  const offset = frame * logits.vocabularySize;
  let selected = 0;
  for (let token = 1; token < logits.vocabularySize; token += 1) {
    if (logits.values[offset + token]! > logits.values[offset + selected]!) selected = token;
  }
  return selected;
}

function orderedGreedyCanonicalMatches(
  logits: CtcFrameLogits,
  targetTokens: readonly CtcTargetToken[],
  blankTokenId: number,
) {
  const greedy: number[] = [];
  let previous: number | null = null;
  for (let frame = 0; frame < logits.frames; frame += 1) {
    const token = greedyFrameToken(logits, frame);
    if (token !== blankTokenId && token !== previous) greedy.push(token);
    previous = token;
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
  return lengths[greedy.length]![target.length]!;
}

function containingSpeechRegion(
  speechRegions: readonly VadSpeechRegion[],
  boundaryMs: number,
) {
  return speechRegions.find((region) => boundaryMs >= region.startMs && boundaryMs <= region.endMs) ?? null;
}

function emptyEdge(
  edge: "start" | "end",
  localizedBoundaryMs: number,
  searchLimitMs: number,
  reason: QuranOuterTimingEdgeRefinement["reason"],
): QuranOuterTimingEdgeRefinement {
  return {
    edge,
    localizedBoundaryMs,
    searchLimitMs,
    refinedBoundaryMs: localizedBoundaryMs,
    expanded: false,
    reason,
    proof: null,
  };
}

function continuationEvidence(input: {
  edge: "start" | "end";
  logits: CtcFrameLogits;
  intervalStartMs: number;
  intervalEndMs: number;
  alignedBoundaryMs: number;
  blankTokenId: number;
  repeatTokenIds: ReadonlySet<number>;
}) {
  const frameAt = (ms: number) => Math.max(0, Math.min(input.logits.frames,
    Math.round((ms - input.intervalStartMs) / Math.max(1, input.intervalEndMs - input.intervalStartMs) * input.logits.frames)));
  const boundaryFrame = frameAt(input.alignedBoundaryMs);
  const startFrame = input.edge === "start" ? 0 : boundaryFrame;
  const endFrame = input.edge === "start" ? boundaryFrame : input.logits.frames;
  let blankFrames = 0;
  let repeatFrames = 0;
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    const token = greedyFrameToken(input.logits, frame);
    if (token === input.blankTokenId) blankFrames += 1;
    else if (input.repeatTokenIds.has(token)) repeatFrames += 1;
    else return { supported: false, blankFrames, repeatFrames };
  }
  return { supported: true, blankFrames, repeatFrames };
}

function refineEdge(input: {
  edge: "start" | "end";
  localizedBoundaryMs: number;
  searchLimitMs: number;
  audioStartMs: number;
  audioEndMs: number;
  fullLogits: CtcFrameLogits;
  expandedAlignment: CtcForcedAlignmentResult;
  canonicalWords: readonly CtcCanonicalWord[];
  targetTokens: readonly CtcTargetToken[];
  blankTokenId: number;
}) : QuranOuterTimingEdgeRefinement {
  if (input.searchLimitMs === input.localizedBoundaryMs) {
    return emptyEdge(input.edge, input.localizedBoundaryMs, input.searchLimitMs, "already-at-evidence-limit");
  }
  const outsideWords = input.edge === "start"
    ? input.expandedAlignment.words.filter((word) => word.startMs < input.localizedBoundaryMs)
    : input.expandedAlignment.words.filter((word) => word.endMs > input.localizedBoundaryMs);
  if (!outsideWords.length) {
    return emptyEdge(input.edge, input.localizedBoundaryMs, input.searchLimitMs, "no-outer-canonical-words");
  }
  const selectedWords = input.edge === "start"
    ? input.canonicalWords.slice(0, input.canonicalWords.findIndex((word) => word.globalWordIndex === outsideWords.at(-1)!.globalWordIndex) + 1)
    : input.canonicalWords.slice(input.canonicalWords.findIndex((word) => word.globalWordIndex === outsideWords[0]!.globalWordIndex));
  const selectedWordIndexes = new Set(selectedWords.map((word) => word.globalWordIndex));
  const selectedTokens = input.targetTokens.filter((token) => token.globalWordIndex !== undefined && selectedWordIndexes.has(token.globalWordIndex));
  const proofStartMs = input.edge === "start"
    ? input.searchLimitMs
    : Math.min(input.localizedBoundaryMs, outsideWords[0]!.startMs);
  const proofEndMs = input.edge === "start"
    ? Math.max(input.localizedBoundaryMs, outsideWords.at(-1)!.endMs)
    : input.searchLimitMs;
  const proofLogits = sliceCtcLogits(input.fullLogits, input.audioStartMs, input.audioEndMs, proofStartMs, proofEndMs);
  const targetScore = proofLogits && selectedTokens.length >= FROZEN_CORE_BOUNDARY_RULE.minimumTargetTokenCount
    && minimumCtcFramesRequired(selectedTokens) <= proofLogits.frames
    ? ctcForwardScore(proofLogits, selectedTokens.map((token) => token.tokenId), input.blankTokenId)
    : null;
  const normalizedTarget = targetScore === null || !proofLogits ? null : Number((targetScore / proofLogits.frames).toFixed(6));
  const normalizedBlank = proofLogits ? normalizedBlankCtcLogLikelihood(proofLogits, input.blankTokenId) : null;
  const orderedMatches = proofLogits ? orderedGreedyCanonicalMatches(proofLogits, selectedTokens, input.blankTokenId) : 0;
  const alignment = proofLogits ? forceAlignCtc(selectedWords, selectedTokens, proofLogits, {
    blankTokenId: input.blankTokenId,
    startMs: proofStartMs,
    endMs: proofEndMs,
    finalSpeechEndMs: proofEndMs,
    frameExactEndpoints: true,
  }) : null;
  const alignmentComplete = alignment?.status === "complete";
  const alignedBoundaryMs = !alignmentComplete ? null : input.edge === "start"
    ? alignment.words[0]?.startMs ?? null
    : alignment.words.at(-1)?.endMs ?? null;
  const strictCanonicalWin = normalizedTarget !== null && normalizedBlank !== null && normalizedTarget > normalizedBlank;
  const repeatWordIndex = input.edge === "start" ? selectedWords[0]?.globalWordIndex : selectedWords.at(-1)?.globalWordIndex;
  const repeatTokenIds = new Set(selectedTokens.filter((token) => token.globalWordIndex === repeatWordIndex).map((token) => token.tokenId));
  const continuation = proofLogits && alignedBoundaryMs !== null ? continuationEvidence({
    edge: input.edge,
    logits: proofLogits,
    intervalStartMs: proofStartMs,
    intervalEndMs: proofEndMs,
    alignedBoundaryMs,
    blankTokenId: input.blankTokenId,
    repeatTokenIds,
  }) : { supported: false, blankFrames: 0, repeatFrames: 0 };
  const proof: NonNullable<QuranOuterTimingEdgeRefinement["proof"]> = {
    intervalStartMs: proofStartMs,
    intervalEndMs: proofEndMs,
    targetTokenCount: selectedTokens.length,
    orderedGreedyCanonicalMatches: orderedMatches,
    normalizedTargetLogLikelihood: normalizedTarget,
    normalizedBlankLogLikelihood: normalizedBlank,
    likelihoodDifference: normalizedTarget === null || normalizedBlank === null ? null : Number((normalizedTarget - normalizedBlank).toFixed(6)),
    alignmentComplete,
    alignedBoundaryTokenMs: alignedBoundaryMs,
    blankOrRepeatContinuationApplied: continuation.supported && alignedBoundaryMs !== input.searchLimitMs,
    blankContinuationFrames: continuation.blankFrames,
    repeatContinuationFrames: continuation.repeatFrames,
  };
  if (!alignmentComplete || alignedBoundaryMs === null || !strictCanonicalWin) {
    return { ...emptyEdge(input.edge, input.localizedBoundaryMs, input.searchLimitMs, "insufficient-canonical-proof"), proof };
  }
  const supportedBoundaryMs = continuation.supported ? input.searchLimitMs : alignedBoundaryMs;
  const refinedBoundaryMs = input.edge === "start"
    ? Math.min(input.localizedBoundaryMs, supportedBoundaryMs)
    : Math.max(input.localizedBoundaryMs, supportedBoundaryMs);
  return {
    edge: input.edge,
    localizedBoundaryMs: input.localizedBoundaryMs,
    searchLimitMs: input.searchLimitMs,
    refinedBoundaryMs,
    expanded: refinedBoundaryMs !== input.localizedBoundaryMs,
    reason: refinedBoundaryMs !== input.localizedBoundaryMs ? "expanded-canonical-boundary" : "insufficient-canonical-proof",
    proof,
  };
}

/**
 * Refines only the temporal envelope of an already accepted canonical target.
 * It cannot inspect or mutate a surah/ayah range. The search stays inside the
 * same VAD region and the existing six-second boundary neighborhood, but VAD
 * alone is never evidence: a complete accepted prefix/suffix path and a
 * strict canonical-over-blank win are required. Greedy emissions remain
 * diagnostic and guard the optional blank/repeat continuation to the VAD edge.
 */
export function refineQuranOuterTiming(input: {
  localizedStartMs: number;
  localizedEndMs: number;
  audioStartMs: number;
  audioEndMs: number;
  logits: CtcFrameLogits;
  canonicalWords: readonly CtcCanonicalWord[];
  targetTokens: readonly CtcTargetToken[];
  blankTokenId: number;
  speechRegions: readonly VadSpeechRegion[];
}): QuranOuterTimingRefinement {
  const startRegion = containingSpeechRegion(input.speechRegions, input.localizedStartMs);
  const endRegion = containingSpeechRegion(input.speechRegions, input.localizedEndMs);
  const searchStartMs = startRegion
    ? Math.max(startRegion.startMs, input.localizedStartMs - FROZEN_CORE_BOUNDARY_RULE.searchSpanMs)
    : input.localizedStartMs;
  const searchEndMs = endRegion
    ? Math.min(endRegion.endMs, input.localizedEndMs + FROZEN_CORE_BOUNDARY_RULE.searchSpanMs)
    : input.localizedEndMs;
  const expandedLogits = sliceCtcLogits(input.logits, input.audioStartMs, input.audioEndMs, searchStartMs, searchEndMs);
  const expandedAlignment = expandedLogits ? forceAlignCtc(input.canonicalWords, input.targetTokens, expandedLogits, {
    blankTokenId: input.blankTokenId,
    startMs: searchStartMs,
    endMs: searchEndMs,
    finalSpeechEndMs: searchEndMs,
    frameExactEndpoints: true,
  }) : null;
  if (expandedAlignment?.status !== "complete") {
    return {
      intervalStartMs: input.localizedStartMs,
      intervalEndMs: input.localizedEndMs,
      acceptedCanonicalIdentityUnchanged: true,
      start: emptyEdge("start", input.localizedStartMs, searchStartMs, "no-complete-expanded-path"),
      end: emptyEdge("end", input.localizedEndMs, searchEndMs, "no-complete-expanded-path"),
    };
  }
  const start = refineEdge({
    edge: "start",
    localizedBoundaryMs: input.localizedStartMs,
    searchLimitMs: searchStartMs,
    audioStartMs: input.audioStartMs,
    audioEndMs: input.audioEndMs,
    fullLogits: input.logits,
    expandedAlignment,
    canonicalWords: input.canonicalWords,
    targetTokens: input.targetTokens,
    blankTokenId: input.blankTokenId,
  });
  const end = refineEdge({
    edge: "end",
    localizedBoundaryMs: input.localizedEndMs,
    searchLimitMs: searchEndMs,
    audioStartMs: input.audioStartMs,
    audioEndMs: input.audioEndMs,
    fullLogits: input.logits,
    expandedAlignment,
    canonicalWords: input.canonicalWords,
    targetTokens: input.targetTokens,
    blankTokenId: input.blankTokenId,
  });
  return {
    intervalStartMs: Math.min(input.localizedStartMs, start.refinedBoundaryMs),
    intervalEndMs: Math.max(input.localizedEndMs, end.refinedBoundaryMs),
    acceptedCanonicalIdentityUnchanged: true,
    start,
    end,
  };
}
