import { viterbiCtcPath, type CtcCanonicalWord, type CtcFrameLogits, type CtcTargetToken } from "../../src/lib/recognition/ctc-forced-alignment.ts";
import type { CtcWordDiagnostic } from "./types.ts";

export type CtcBoundaryMethod = "first-aligned-token" | "blank-to-lexical-transition" | "posterior-half-mass-onset";
export type CtcPathInput = {
  words: readonly CtcCanonicalWord[];
  tokens: readonly CtcTargetToken[];
  logits: CtcFrameLogits;
  blankTokenId: number;
  startMs: number;
  endMs: number;
};

type AlignedPath = {
  states: readonly number[];
  byWord: Map<number, Array<{ frame: number; tokenIndex: number; tokenId: number }>>;
  byToken: Map<number, number[]>;
};

function probability(logits: CtcFrameLogits, frame: number, tokenId: number) {
  const offset = frame * logits.vocabularySize;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < logits.vocabularySize; index += 1) maximum = Math.max(maximum, logits.values[offset + index] ?? Number.NEGATIVE_INFINITY);
  let sum = 0;
  for (let index = 0; index < logits.vocabularySize; index += 1) sum += Math.exp((logits.values[offset + index] ?? Number.NEGATIVE_INFINITY) - maximum);
  return Math.exp((logits.values[offset + tokenId] ?? Number.NEGATIVE_INFINITY) - maximum) / sum;
}

function frameMs(input: CtcPathInput, frame: number) {
  return Math.round(input.startMs + (input.endMs - input.startMs) * frame / input.logits.frames);
}

function alignedPath(input: CtcPathInput): AlignedPath {
  const path = viterbiCtcPath(input.logits, input.tokens, input.blankTokenId);
  if (!path) throw new Error("CTC path cannot reach the supplied canonical target.");
  const sourceTokenIndexes: Array<number | null> = [null];
  for (const index of input.tokens.keys()) sourceTokenIndexes.push(index, null);
  const byWord = new Map<number, Array<{ frame: number; tokenIndex: number; tokenId: number }>>();
  const byToken = new Map<number, number[]>();
  for (const [frame, state] of path.states.entries()) {
    const tokenIndex = sourceTokenIndexes[state];
    if (tokenIndex === null || tokenIndex === undefined) continue;
    const token = input.tokens[tokenIndex]!;
    const tokenFrames = byToken.get(tokenIndex) ?? [];
    tokenFrames.push(frame);
    byToken.set(tokenIndex, tokenFrames);
    if (token.owner === "optional-prelude" || token.globalWordIndex === undefined) continue;
    const entries = byWord.get(token.globalWordIndex) ?? [];
    entries.push({ frame, tokenIndex, tokenId: token.tokenId });
    byWord.set(token.globalWordIndex, entries);
  }
  return { states: path.states, byWord, byToken };
}

/**
 * Evaluation-only raw-path boundary alternatives. They retain the fixed
 * canonical Viterbi path; no method changes identity, token order, or target.
 */
export function extractCtcBoundaryCandidates(input: CtcPathInput): Array<{ word: CtcCanonicalWord; method: CtcBoundaryMethod; startMs: number; endMs: number }> {
  const path = alignedPath(input);
  return input.words.flatMap((word) => {
    const frames = path.byWord.get(word.globalWordIndex);
    if (!frames?.length) return [];
    const first = Math.min(...frames.map((item) => item.frame));
    const last = Math.max(...frames.map((item) => item.frame));
    // In the CTC-expanded target, even states are blanks. A direct lexical
    // skip has no observed blank->lexical transition and is therefore not
    // manufactured as a candidate.
    const hasBlankTransition = first > 0 && path.states[first - 1]! % 2 === 0 && path.states[first]! % 2 === 1;
    const local = frames.map((item) => ({ frame: item.frame, posterior: probability(input.logits, item.frame, item.tokenId) }));
    const total = local.reduce((sum, item) => sum + item.posterior, 0);
    let cumulative = 0;
    const halfMass = local.find((item) => { cumulative += item.posterior; return cumulative >= total / 2; })?.frame ?? first;
    const result: Array<{ word: CtcCanonicalWord; method: CtcBoundaryMethod; startMs: number; endMs: number }> = [
      { word, method: "first-aligned-token" as const, startMs: frameMs(input, first), endMs: frameMs(input, last + 1) },
      { word, method: "posterior-half-mass-onset" as const, startMs: frameMs(input, halfMass), endMs: frameMs(input, last + 1) },
    ];
    if (hasBlankTransition) result.splice(1, 0, { word, method: "blank-to-lexical-transition", startMs: frameMs(input, first), endMs: frameMs(input, last + 1) });
    return result;
  });
}

/** Captures why a raw CTC path chose its word boundaries without exposing it to product UI. */
export function ctcWordDiagnostics(input: CtcPathInput): CtcWordDiagnostic[] {
  const candidates = extractCtcBoundaryCandidates(input).filter((item) => item.method === "first-aligned-token");
  const path = alignedPath(input);
  return candidates.map(({ word, startMs, endMs }, index) => {
    const tokenIndexes = input.tokens.flatMap((token, tokenIndex) => token.globalWordIndex === word.globalWordIndex ? [tokenIndex] : []);
    const tokenFrames = tokenIndexes.map((tokenIndex) => {
      const token = input.tokens[tokenIndex]!;
      const frames = path.byToken.get(tokenIndex) ?? [];
      return { tokenId: token.tokenId, token: token.token, firstAlignedFrame: frames[0] ?? 0, lastAlignedFrame: frames.at(-1) ?? 0, meanPosterior: Number((frames.reduce((sum, frame) => sum + probability(input.logits, frame, token.tokenId), 0) / Math.max(1, frames.length)).toFixed(6)) };
    });
    const firstFrame = Math.round((startMs - input.startMs) / (input.endMs - input.startMs) * input.logits.frames);
    const lastFrame = Math.round((endMs - input.startMs) / (input.endMs - input.startMs) * input.logits.frames) - 1;
    return {
      verseKey: word.verseKey,
      canonicalWordIndex: word.canonicalWordIndex,
      canonicalArabic: word.canonicalArabic,
      lexicalRepresentation: word.alignmentText,
      ctcTokens: tokenFrames,
      firstAlignedFrame: firstFrame,
      lastAlignedFrame: lastFrame,
      frameToMs: { startMs, endMs, frameDurationMs: Number(((input.endMs - input.startMs) / input.logits.frames).toFixed(4)) },
      neighboringBlankPosterior: { before: firstFrame > 0 ? Number(probability(input.logits, firstFrame - 1, input.blankTokenId).toFixed(6)) : null, after: lastFrame + 1 < input.logits.frames ? Number(probability(input.logits, lastFrame + 1, input.blankTokenId).toFixed(6)) : null },
      previousWordEndMs: candidates[index - 1]?.endMs ?? null,
      nextWordStartMs: candidates[index + 1]?.startMs ?? null,
    };
  });
}

/** Local-only energy refinement for an already known CTC onset; it cannot choose Quran text or identity. */
export function refineBoundaryWithLocalEnergy(samples: Float32Array, sampleRate: number, predictedMs: number, windowMs: number) {
  if (!Number.isFinite(predictedMs) || !Number.isFinite(windowMs) || windowMs <= 0 || sampleRate <= 0) throw new Error("A finite local refinement window and sample rate are required.");
  const center = Math.round(predictedMs * sampleRate / 1_000);
  const radius = Math.round(windowMs * sampleRate / 1_000);
  const hop = Math.max(1, Math.round(sampleRate / 100)); // 10 ms RMS analysis resolution, reported rather than hidden.
  let best = { slope: Number.NEGATIVE_INFINITY, frame: center };
  let previousRms: number | null = null;
  for (let start = Math.max(0, center - radius); start < Math.min(samples.length, center + radius); start += hop) {
    const end = Math.min(samples.length, start + hop);
    const rms = Math.sqrt(samples.slice(start, end).reduce((sum, value) => sum + value * value, 0) / Math.max(1, end - start));
    if (previousRms !== null && rms - previousRms > best.slope) best = { slope: rms - previousRms, frame: start };
    previousRms = rms;
  }
  return { refinedMs: Math.round(best.frame / sampleRate * 1_000), evidence: "maximum-local-rms-rise" as const, searchWindowMs: windowMs, analysisHopMs: 10 };
}
