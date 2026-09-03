/**
 * Deterministic CTC forced alignment for a transcript that has already been
 * identified. This module intentionally has no ASR decoding dependency: the
 * canonical token sequence is the only display truth.
 */

export type CtcCanonicalWord = {
  verseKey: string;
  canonicalWordIndex: number;
  globalWordIndex: number;
  /** Display text. This is never normalized or replaced by acoustic tokens. */
  canonicalArabic: string;
  /** Model-only text used to derive the target CTC tokens. */
  alignmentText: string;
};

export type CtcTargetToken = {
  tokenId: number;
  token: string;
  globalWordIndex: number;
};

export type CtcRepeat = {
  /** Inclusive canonical word range repeated audibly after endWordIndex. */
  startWordIndex: number;
  endWordIndex: number;
  afterWordIndex: number;
};

export type CtcFrameLogits = {
  /** Row-major [frame][vocabulary] unnormalised logits. */
  values: Float32Array | readonly number[];
  frames: number;
  vocabularySize: number;
};

export type CtcWordTiming = CtcCanonicalWord & {
  startMs: number;
  endMs: number;
  confidence: number;
  alignmentScore: number;
  /** CTC was able to emit a path, but its local posterior is too weak to trust as a precise boundary. */
  lowConfidence: boolean;
};

export type CtcAudibleRepetition = CtcRepeat & {
  confidence: number;
  alignmentScore: number;
};

export type CtcVerseTiming = {
  verseKey: string;
  startMs: number;
  endMs: number;
  confidence: number;
};

export type CtcPause = {
  startMs: number;
  endMs: number;
  durationMs: number;
  canonicalWordBefore: number;
  canonicalWordAfter: number;
  verseKey: string;
  isAyahBoundary: boolean;
};

export type CtcForcedAlignmentResult = {
  status: "complete" | "unavailable" | "failed";
  reason?: string;
  canonicalWords: readonly CtcCanonicalWord[];
  /** Exact model-token targets, grouped by their original canonical word. */
  targetTokens: readonly CtcTargetToken[];
  words: readonly CtcWordTiming[];
  verses: readonly CtcVerseTiming[];
  pauses: readonly CtcPause[];
  audibleRepetitions: readonly CtcAudibleRepetition[];
  frameCount: number;
  frameDurationMs: number;
  performance?: {
    modelDownloadBytes?: number;
    modelArtifactBytes?: number;
    cacheStatus?: "cold-download" | "browser-cache" | "memory" | "unavailable";
    backend?: "webgpu" | "wasm";
    coldModelLoadMs?: number;
    warmModelLoadMs?: number;
    preprocessingMs?: number;
    inferenceMs?: number;
    viterbiMs?: number;
    totalMs?: number;
  };
};

const NEGATIVE_INFINITY = Number.NEGATIVE_INFINITY;

function finiteInteger(value: number) {
  return Number.isInteger(value) && Number.isFinite(value);
}

function logProbability(logits: CtcFrameLogits, frame: number, tokenId: number) {
  const offset = frame * logits.vocabularySize;
  let maximum = NEGATIVE_INFINITY;
  for (let index = 0; index < logits.vocabularySize; index += 1) maximum = Math.max(maximum, logits.values[offset + index] ?? NEGATIVE_INFINITY);
  if (!Number.isFinite(maximum)) return NEGATIVE_INFINITY;
  let sum = 0;
  for (let index = 0; index < logits.vocabularySize; index += 1) sum += Math.exp((logits.values[offset + index] ?? NEGATIVE_INFINITY) - maximum);
  return (logits.values[offset + tokenId] ?? NEGATIVE_INFINITY) - maximum - Math.log(sum);
}

function expandTarget(tokens: readonly CtcTargetToken[], blankTokenId: number) {
  const labels: number[] = [blankTokenId];
  const sourceTokenIndexes: Array<number | null> = [null];
  for (const [index, token] of tokens.entries()) {
    labels.push(token.tokenId, blankTokenId);
    sourceTokenIndexes.push(index, null);
  }
  return { labels, sourceTokenIndexes };
}

/**
 * Expands a canonical target with independently recorded repeat arcs. The
 * display cursor never changes: repeated tokens retain their original word
 * index and are emitted only in audibleRepetitions.
 */
export function expandCtcTargetWithRepeats(
  tokens: readonly CtcTargetToken[],
  repeats: readonly CtcRepeat[],
): { tokens: CtcTargetToken[]; repeatedTokenIndexes: Set<number> } {
  const valid = [...repeats]
    .filter((repeat) => finiteInteger(repeat.startWordIndex) && finiteInteger(repeat.endWordIndex)
      && finiteInteger(repeat.afterWordIndex) && repeat.startWordIndex >= 1
      && repeat.startWordIndex <= repeat.endWordIndex && repeat.endWordIndex <= repeat.afterWordIndex)
    .sort((left, right) => left.afterWordIndex - right.afterWordIndex || left.startWordIndex - right.startWordIndex || left.endWordIndex - right.endWordIndex);
  const expanded: CtcTargetToken[] = [];
  const repeatedTokenIndexes = new Set<number>();
  for (const [tokenIndex, token] of tokens.entries()) {
    expanded.push(token);
    const nextWordIndex = tokens[tokenIndex + 1]?.globalWordIndex;
    // Insert only after the final character token of the canonical word.
    for (const repeat of valid.filter((item) => item.afterWordIndex === token.globalWordIndex && nextWordIndex !== token.globalWordIndex)) {
      for (const repeated of tokens.filter((item) => item.globalWordIndex >= repeat.startWordIndex && item.globalWordIndex <= repeat.endWordIndex)) {
        repeatedTokenIndexes.add(expanded.length);
        expanded.push(repeated);
      }
    }
  }
  return { tokens: expanded, repeatedTokenIndexes };
}

/**
 * Converts a separately decoded, monotonic word-evidence path to repeat arcs.
 * A backward move is accepted only when every word in a 1–4 word phrase is
 * heard twice consecutively. A single low-confidence/backwards observation is
 * therefore never enough to move the canonical cursor.
 */
export function coherentCtcRepeatHints(observedCanonicalWordIndexes: readonly number[]): CtcRepeat[] {
  const hints: CtcRepeat[] = [];
  for (let index = 0; index < observedCanonicalWordIndexes.length; index += 1) {
    for (let length = 4; length >= 1; length -= 1) {
      const first = observedCanonicalWordIndexes.slice(index, index + length);
      const second = observedCanonicalWordIndexes.slice(index + length, index + length * 2);
      if (first.length !== length || second.length !== length || !first.every((word, offset) => word === second[offset])) continue;
      const consecutive = first.every((word, offset) => offset === 0 || word === first[offset - 1]! + 1);
      if (!consecutive) continue;
      hints.push({ startWordIndex: first[0]!, endWordIndex: first.at(-1)!, afterWordIndex: first.at(-1)! });
      index += length * 2 - 1;
      break;
    }
  }
  return hints;
}

type ViterbiPath = { states: number[]; score: number };

/**
 * CTC trellis with fixed tie breaking: stay, advance by one state, then skip
 * a blank. Keeping that order makes identical input logits bit-for-bit stable.
 */
export function viterbiCtcPath(
  logits: CtcFrameLogits,
  tokens: readonly CtcTargetToken[],
  blankTokenId: number,
): ViterbiPath | null {
  if (!tokens.length || logits.frames < tokens.length || logits.values.length < logits.frames * logits.vocabularySize) return null;
  if (!finiteInteger(blankTokenId) || blankTokenId < 0 || blankTokenId >= logits.vocabularySize) return null;
  if (tokens.some((token) => !finiteInteger(token.tokenId) || token.tokenId < 0 || token.tokenId >= logits.vocabularySize)) return null;
  const { labels } = expandTarget(tokens, blankTokenId);
  const stateCount = labels.length;
  let previous = new Float64Array(stateCount).fill(NEGATIVE_INFINITY);
  previous[0] = logProbability(logits, 0, labels[0]!);
  if (stateCount > 1) previous[1] = logProbability(logits, 0, labels[1]!);
  const backtrace = Array.from({ length: logits.frames }, () => new Int32Array(stateCount).fill(-1));
  for (let frame = 1; frame < logits.frames; frame += 1) {
    const current = new Float64Array(stateCount).fill(NEGATIVE_INFINITY);
    for (let state = 0; state < stateCount; state += 1) {
      // Candidate order is the documented deterministic tie breaker.
      let predecessor = state;
      let best = previous[state]!;
      if (state > 0 && previous[state - 1]! > best) { predecessor = state - 1; best = previous[state - 1]!; }
      if (state > 1 && labels[state] !== blankTokenId && labels[state] !== labels[state - 2] && previous[state - 2]! > best) {
        predecessor = state - 2;
        best = previous[state - 2]!;
      }
      if (Number.isFinite(best)) {
        current[state] = best + logProbability(logits, frame, labels[state]!);
        backtrace[frame]![state] = predecessor;
      }
    }
    previous = current;
  }
  // Prefer the terminal label over terminal blank for equal values.
  let state = stateCount - 2;
  let score = previous[state]!;
  if (previous[stateCount - 1]! > score) { state = stateCount - 1; score = previous[state]!; }
  if (!Number.isFinite(score)) return null;
  const states = new Array<number>(logits.frames);
  for (let frame = logits.frames - 1; frame >= 0; frame -= 1) {
    states[frame] = state;
    if (frame > 0) state = backtrace[frame]![state]!;
  }
  return { states, score };
}

function msAtFrame(frame: number, frameCount: number, startMs: number, endMs: number) {
  return Math.round(startMs + (endMs - startMs) * frame / Math.max(1, frameCount));
}

export function forceAlignCtc(
  canonicalWords: readonly CtcCanonicalWord[],
  tokens: readonly CtcTargetToken[],
  logits: CtcFrameLogits,
  options: { blankTokenId: number; startMs: number; endMs: number; finalSpeechEndMs?: number; repeats?: readonly CtcRepeat[] },
): CtcForcedAlignmentResult {
  const startedAt = performance.now();
  const expanded = expandCtcTargetWithRepeats(tokens, options.repeats ?? []);
  const path = viterbiCtcPath(logits, expanded.tokens, options.blankTokenId);
  if (!path) return { status: "failed", reason: "CTC trellis could not reach the complete canonical target.", canonicalWords, targetTokens: tokens, words: [], verses: [], pauses: [], audibleRepetitions: [], frameCount: logits.frames, frameDurationMs: 0 };
  const { sourceTokenIndexes } = expandTarget(expanded.tokens, options.blankTokenId);
  const occurrenceFrames = new Map<number, number[]>();
  for (const [frame, state] of path.states.entries()) {
    const tokenIndex = sourceTokenIndexes[state];
    if (tokenIndex === null || tokenIndex === undefined) continue;
    const frames = occurrenceFrames.get(tokenIndex) ?? [];
    frames.push(frame);
    occurrenceFrames.set(tokenIndex, frames);
  }
  if (occurrenceFrames.size !== expanded.tokens.length) return { status: "failed", reason: "At least one canonical CTC token received no acoustic frame.", canonicalWords, targetTokens: tokens, words: [], verses: [], pauses: [], audibleRepetitions: [], frameCount: logits.frames, frameDurationMs: 0 };
  const byWord = new Map<number, Array<{ frame: number; score: number; repeated: boolean }>>();
  for (const [tokenIndex, frames] of occurrenceFrames) {
    const token = expanded.tokens[tokenIndex]!;
    const items = byWord.get(token.globalWordIndex) ?? [];
    for (const frame of frames) items.push({ frame, score: logProbability(logits, frame, token.tokenId), repeated: expanded.repeatedTokenIndexes.has(tokenIndex) });
    byWord.set(token.globalWordIndex, items);
  }
  const words = canonicalWords.map((word) => {
    const frames = (byWord.get(word.globalWordIndex) ?? []).filter((item) => !item.repeated);
    if (!frames.length) throw new Error(`Canonical CTC word ${word.globalWordIndex} received only repeat frames.`);
    const first = Math.min(...frames.map((item) => item.frame));
    const last = Math.max(...frames.map((item) => item.frame));
    const score = frames.reduce((sum, item) => sum + item.score, 0) / frames.length;
    const confidence = Number(Math.exp(Math.max(-20, score)).toFixed(4));
    return { ...word, startMs: msAtFrame(first, logits.frames, options.startMs, options.endMs), endMs: Math.max(msAtFrame(last + 1, logits.frames, options.startMs, options.endMs), msAtFrame(first, logits.frames, options.startMs, options.endMs) + 1), confidence, alignmentScore: Number(score.toFixed(4)), lowConfidence: confidence < 0.08 };
  });
  const audibleRepetitions = (options.repeats ?? []).map((repeat) => {
    const frames = [...byWord.entries()].filter(([word]) => word >= repeat.startWordIndex && word <= repeat.endWordIndex).flatMap(([, items]) => items.filter((item) => item.repeated));
    const score = frames.length ? frames.reduce((sum, item) => sum + item.score, 0) / frames.length : NEGATIVE_INFINITY;
    return { ...repeat, confidence: Number(Math.exp(Math.max(-20, score)).toFixed(4)), alignmentScore: Number(score.toFixed(4)) };
  });
  const verses = [...new Set(words.map((word) => word.verseKey))].map((verseKey, index, keys) => {
    const verseWords = words.filter((word) => word.verseKey === verseKey);
    const nextVerse = keys[index + 1];
    const startMs = verseWords[0]!.startMs;
    const terminal = Math.max(verseWords.at(-1)!.endMs, Math.round(options.finalSpeechEndMs ?? 0));
    return { verseKey, startMs, endMs: nextVerse ? words.find((word) => word.verseKey === nextVerse)!.startMs : terminal, confidence: Number((verseWords.reduce((sum, word) => sum + word.confidence, 0) / verseWords.length).toFixed(4)) };
  });
  const pauses: CtcPause[] = [];
  for (let index = 0; index < words.length - 1; index += 1) {
    const before = words[index]!;
    const after = words[index + 1]!;
    if (after.startMs - before.endMs < 80) continue;
    pauses.push({ startMs: before.endMs, endMs: after.startMs, durationMs: after.startMs - before.endMs, canonicalWordBefore: before.globalWordIndex, canonicalWordAfter: after.globalWordIndex, verseKey: before.verseKey, isAyahBoundary: before.verseKey !== after.verseKey });
  }
  return { status: "complete", canonicalWords, targetTokens: tokens, words, verses, pauses, audibleRepetitions, frameCount: logits.frames, frameDurationMs: Number(((options.endMs - options.startMs) / Math.max(1, logits.frames)).toFixed(4)), performance: { viterbiMs: Math.round(performance.now() - startedAt) } };
}

/** Builds complete display words from the fixed identified verse range. */
export function canonicalCtcWords(verses: readonly { verseKey: string; text: string }[]): CtcCanonicalWord[] {
  let globalWordIndex = 0;
  return verses.flatMap((verse) => verse.text.trim().split(/\s+/).filter(Boolean).map((canonicalArabic, index) => ({
    verseKey: verse.verseKey,
    canonicalWordIndex: index + 1,
    globalWordIndex: ++globalWordIndex,
    canonicalArabic,
    alignmentText: canonicalArabic,
  })));
}
