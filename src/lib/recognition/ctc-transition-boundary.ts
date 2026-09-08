import {
  viterbiCtcPath,
  type CtcCanonicalWord,
  type CtcFrameLogits,
  type CtcTargetToken,
} from "./ctc-forced-alignment.ts";

export type CtcTransitionBoundaryWord = CtcCanonicalWord & {
  startMs: number;
  endMs: number;
  /** Small, serializable evidence retained only when a caller explicitly asks for it. */
  transition: {
    terminalFrame: number;
    boundaryFrame: number;
    nextOnsetFrame: number | null;
    terminalPosterior: number;
    blankPosterior: number;
    nextOnsetPosterior: number | null;
  };
};

function frameToMs(frame: number, frames: number, startMs: number, endMs: number) {
  return Math.round(startMs + (endMs - startMs) * frame / frames);
}

function posteriors(logits: CtcFrameLogits, tokenIds: readonly number[]) {
  const wanted = new Set(tokenIds);
  const values = Array.from({ length: logits.frames }, () => new Map<number, number>());
  for (let frame = 0; frame < logits.frames; frame += 1) {
    const offset = frame * logits.vocabularySize;
    let maximum = Number.NEGATIVE_INFINITY;
    for (let token = 0; token < logits.vocabularySize; token += 1) maximum = Math.max(maximum, logits.values[offset + token] ?? Number.NEGATIVE_INFINITY);
    let denominator = 0;
    for (let token = 0; token < logits.vocabularySize; token += 1) denominator += Math.exp((logits.values[offset + token] ?? Number.NEGATIVE_INFINITY) - maximum);
    for (const tokenId of wanted) values[frame]!.set(tokenId, Math.exp((logits.values[offset + tokenId] ?? Number.NEGATIVE_INFINITY) - maximum) / denominator);
  }
  return values;
}

/**
 * Chooses a word end from the CTC transition between two already-forced,
 * canonical words. It cannot introduce, remove, reorder, or retime starts.
 *
 * The score explicitly combines the current word's terminal-token posterior,
 * intervening blank posterior, and the next word's onset posterior. This is a
 * benchmark/diagnostic primitive; product callers must opt in deliberately.
 */
export function deriveCtcTransitionBoundaryWords(
  words: readonly CtcCanonicalWord[],
  tokens: readonly CtcTargetToken[],
  logits: CtcFrameLogits,
  options: { blankTokenId: number; startMs: number; endMs: number },
): CtcTransitionBoundaryWord[] | null {
  const path = viterbiCtcPath(logits, tokens, options.blankTokenId);
  if (!path) return null;
  const sourceTokenIndexes: Array<number | null> = [null];
  for (const index of tokens.keys()) sourceTokenIndexes.push(index, null);
  const framesByWord = new Map<number, number[]>();
  for (const [frame, state] of path.states.entries()) {
    const tokenIndex = sourceTokenIndexes[state];
    if (tokenIndex === null || tokenIndex === undefined) continue;
    const wordIndex = tokens[tokenIndex]?.globalWordIndex;
    if (wordIndex === undefined) continue;
    const frames = framesByWord.get(wordIndex) ?? [];
    frames.push(frame);
    framesByWord.set(wordIndex, frames);
  }
  const tokenIds = [options.blankTokenId, ...tokens.map((token) => token.tokenId)];
  const posterior = posteriors(logits, tokenIds);
  return words.map((word, wordOffset) => {
    const ownFrames = framesByWord.get(word.globalWordIndex);
    if (!ownFrames?.length) throw new Error(`Canonical word ${word.globalWordIndex} has no CTC frame.`);
    const first = Math.min(...ownFrames);
    const terminal = Math.max(...ownFrames);
    const next = words[wordOffset + 1];
    const nextFrames = next ? framesByWord.get(next.globalWordIndex) : undefined;
    const nextOnset = nextFrames?.length ? Math.min(...nextFrames) : null;
    const ownTokens = tokens.filter((token) => token.globalWordIndex === word.globalWordIndex);
    const terminalTokenId = ownTokens.at(-1)?.tokenId;
    const nextTokenId = next ? tokens.find((token) => token.globalWordIndex === next.globalWordIndex)?.tokenId : undefined;
    const terminalPosterior = terminalTokenId === undefined ? 0 : posterior[terminal]?.get(terminalTokenId) ?? 0;
    const nextOnsetPosterior = nextOnset === null || nextTokenId === undefined ? null : posterior[nextOnset]?.get(nextTokenId) ?? null;
    let boundary = terminal + 1;
    let blankPosterior = boundary < logits.frames ? posterior[boundary]?.get(options.blankTokenId) ?? 0 : 0;
    if (nextOnset !== null && nextOnset > boundary) {
      let bestScore = Number.NEGATIVE_INFINITY;
      // The terminal/onset terms protect the transition from choosing a frame
      // outside the observed CTC word pair. Blank evidence selects its centre.
      for (let candidate = boundary; candidate <= nextOnset; candidate += 1) {
        const blank = candidate < logits.frames ? posterior[candidate]?.get(options.blankTokenId) ?? 0 : 0;
        const distance = (candidate - boundary) / Math.max(1, nextOnset - boundary);
        const score = terminalPosterior * 0.25 + blank * 0.55 + (nextOnsetPosterior ?? 0) * 0.2 - Math.abs(distance - 0.5) * 0.04;
        if (score > bestScore) {
          bestScore = score;
          boundary = candidate;
          blankPosterior = blank;
        }
      }
    }
    const startMs = frameToMs(first, logits.frames, options.startMs, options.endMs);
    const endMs = frameToMs(Math.max(first + 1, boundary), logits.frames, options.startMs, options.endMs);
    return {
      ...word,
      startMs,
      endMs,
      transition: {
        terminalFrame: terminal,
        boundaryFrame: boundary,
        nextOnsetFrame: nextOnset,
        terminalPosterior: Number(terminalPosterior.toFixed(6)),
        blankPosterior: Number(blankPosterior.toFixed(6)),
        nextOnsetPosterior: nextOnsetPosterior === null ? null : Number(nextOnsetPosterior.toFixed(6)),
      },
    };
  });
}
