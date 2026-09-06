import type { CtcFrameLogits } from "./ctc-forced-alignment.ts";
import { normalizeTilawaArabic } from "./tilawa-lexical.ts";

export const FASTCONFORMER_IDENTIFICATION_DEFAULTS = {
  windowMs: 12_000,
  hopMs: 6_000,
  minimumVoicedMs: 1_200,
  coarseCandidateLimit: 48,
  rerankCandidateLimit: 24,
  minimumCandidateWords: 2,
} as const;

export type QuranIdentificationWord = {
  surah: number;
  ayah: number;
  canonicalWordIndex: number;
  globalWordIndex: number;
  /** Untouched corpus source text; never inferred from CTC output. */
  canonicalArabic: string;
  /** Tilawa-compatible model-only word representation. */
  lexicalText: string;
  /** Published Tilawa CTC IDs assigned to this lexical word when available. */
  ctcTokenIds: readonly number[];
  /** Optional Tilawa prelude before this canonical word (for example basmalah).
   * It is acoustic evidence only and never becomes a canonical word. */
  optionalPreludeCtcTokenIds?: readonly number[];
  /** Model-only lexical prelude corresponding to optionalPreludeCtcTokenIds. */
  optionalPreludeLexicalText?: string;
};

export type QuranWideLexicalIndex = {
  words: readonly QuranIdentificationWord[];
  /** Quran-wide canonical CTC stream in lexical order. */
  ctcTokenIds: readonly number[];
  /** Deterministic inverted lexical 1–3 gram index used only for recall. */
  ngramPositions: ReadonlyMap<string, readonly number[]>;
};

export type GreedyCtcDecode = {
  tokenIds: readonly number[];
  lexicalText: string;
  lexicalTokens: readonly string[];
};

export type QuranPassageCandidate = {
  start: Pick<QuranIdentificationWord, "surah" | "ayah" | "canonicalWordIndex" | "globalWordIndex">;
  end: Pick<QuranIdentificationWord, "surah" | "ayah" | "canonicalWordIndex" | "globalWordIndex">;
  startPosition: number;
  endPosition: number;
  retrievalScore: number;
  ctcScore: number | null;
  /** Forward CTC log likelihood / acoustic frame. It compares span lengths
   * without rewarding a candidate merely for having more frames. */
  normalizedCtcScore: number | null;
  confidence: number;
  marginFromSecond: number | null;
  ctcTokenCount: number;
  optionalPrelude: {
    available: boolean;
    selected: "present" | "absent";
    lexicalText: string;
    canonicalFirstWordStart: QuranPassageCandidate["start"];
    canonicalOnlyScore: number | null;
    optionalBasmalahPlusCanonicalScore: number | null;
  };
};

export type IdentificationWindowInput = {
  index: number;
  startMs: number;
  endMs: number;
  voicedMs: number;
  logits: CtcFrameLogits;
  vocabulary: Record<string, string>;
  blankTokenId: number;
};

export type IdentificationWindowResult = {
  index: number;
  startMs: number;
  endMs: number;
  voicedMs: number;
  greedy: GreedyCtcDecode;
  candidates: QuranPassageCandidate[];
  selectedCandidate: QuranPassageCandidate | null;
  state: "strong-candidate" | "weak-candidate" | "ambiguous" | "no-usable-evidence";
  elapsedMs: number;
  performance: { retrievalMs: number; rerankingMs: number; candidatesReranked: number };
  /** Candidate expansions rejected because they would join two surahs. */
  crossSurahCandidatesRejected: number;
};

export type QuranContinuitySolution = {
  path: Array<{ windowIndex: number; candidate: QuranPassageCandidate | null }>;
  span: { start: QuranPassageCandidate["start"]; end: QuranPassageCandidate["end"] } | null;
  continuityScore: number;
  agreeingWindows: number;
  selectedSurah: number | null;
  surahConsensus: { selectedSurah: number | null; strongWindowCount: number; agreeingStrongWindows: number };
};

export type FastConformerIdentificationResult = {
  status: "complete" | "unavailable" | "failed";
  reason?: string;
  span: QuranContinuitySolution["span"];
  /** Alias that makes the shadow result's canonical-only contract explicit. */
  canonicalSpan: QuranContinuitySolution["span"];
  wordLevelSpan: QuranContinuitySolution["span"];
  selectedSurah: number | null;
  optionalPrelude: QuranPassageCandidate["optionalPrelude"] | null;
  surahConsensus: QuranContinuitySolution["surahConsensus"];
  windowResults: readonly IdentificationWindowResult[];
  retrievalCandidates: readonly QuranPassageCandidate[];
  normalizedCtcScore: number | null;
  margin: number | null;
  continuityScore: number;
  confidence: {
    /** Heuristic only; components remain available for manual inspection. */
    composite: number | null;
    normalizedBestCtcScore: number | null;
    bestVsSecondMargin: number | null;
    agreeingWindows: number;
    voicedAudioExplained: number;
  };
  performance: { inferenceMs: number; retrievalMs: number; rerankingMs: number; candidatesReranked: number; totalMs: number };
  /** Development-only count; production passage selection remains Whisper-owned. */
  CROSS_SURAH_CANDIDATES_REJECTED: number;
};

export type PassageIdentificationCompare = {
  currentProduction: {
    engine: "whisper-quran-matcher";
    span: { firstVerseKey: string; lastVerseKey: string; firstWordIndex: number; lastWordIndex: number } | null;
    confidence: number | null;
  };
  fastConformerShadow: FastConformerIdentificationResult;
  agreement: { sameSurah: boolean | null; overlappingAyat: boolean | null; exactSpan: boolean | null };
};

export function comparePassageIdentification(
  currentProduction: PassageIdentificationCompare["currentProduction"],
  fastConformerShadow: FastConformerIdentificationResult,
): PassageIdentificationCompare {
  const shadow = fastConformerShadow.span;
  const production = currentProduction.span;
  if (!shadow || !production) return { currentProduction, fastConformerShadow, agreement: { sameSurah: null, overlappingAyat: null, exactSpan: null } };
  const [firstSurah, firstAyah] = production.firstVerseKey.split(":").map(Number);
  const [lastSurah, lastAyah] = production.lastVerseKey.split(":").map(Number);
  const sameSurah = shadow.start.surah === firstSurah && shadow.end.surah === lastSurah;
  const overlappingAyat = shadow.start.surah === lastSurah && shadow.end.surah === firstSurah
    ? shadow.start.ayah <= lastAyah! && shadow.end.ayah >= firstAyah!
    : false;
  const exactSpan = shadow.start.surah === firstSurah && shadow.start.ayah === firstAyah && shadow.start.canonicalWordIndex === production.firstWordIndex
    && shadow.end.surah === lastSurah && shadow.end.ayah === lastAyah && shadow.end.canonicalWordIndex === production.lastWordIndex;
  return { currentProduction, fastConformerShadow, agreement: { sameSurah, overlappingAyat, exactSpan } };
}

function ngramKey(tokens: readonly string[]) {
  return tokens.join("\u0001");
}

function lexicalTokens(value: string) {
  return normalizeTilawaArabic(value).split(" ").filter(Boolean);
}

const BASMALAH_LEXICAL_TOKENS = ["بسم", "الله", "الرحمن", "الرحيم"] as const;

/** The basmalah is common optional acoustic context, not passage-location
 * evidence. Strip it only from coarse lookup; CTC later scores it as a
 * candidate-specific optional prelude. */
function locationTokens(decodedTokens: readonly string[]) {
  const beginsWithBasmalah = BASMALAH_LEXICAL_TOKENS.every((token, index) => decodedTokens[index] === token);
  return beginsWithBasmalah ? decodedTokens.slice(BASMALAH_LEXICAL_TOKENS.length) : decodedTokens;
}

/** Builds a reversible Quran-wide lexical stream without mutating the corpus. */
export function buildQuranWideLexicalIndex(words: readonly QuranIdentificationWord[]): QuranWideLexicalIndex {
  const canonical = words.map((word) => ({ ...word, ctcTokenIds: [...word.ctcTokenIds], optionalPreludeCtcTokenIds: word.optionalPreludeCtcTokenIds ? [...word.optionalPreludeCtcTokenIds] : undefined }));
  const ngramPositions = new Map<string, number[]>();
  for (let start = 0; start < canonical.length; start += 1) {
    for (let size = 1; size <= 3 && start + size <= canonical.length && canonical[start + size - 1]?.surah === canonical[start]?.surah; size += 1) {
      const key = ngramKey(canonical.slice(start, start + size).map((word) => word.lexicalText));
      const positions = ngramPositions.get(key) ?? [];
      positions.push(start);
      ngramPositions.set(key, positions);
    }
  }
  return {
    words: canonical,
    ctcTokenIds: canonical.flatMap((word) => word.ctcTokenIds),
    ngramPositions,
  };
}

/** Greedy CTC is retrieval evidence only; callers must never display it. */
export function greedyDecodeCtc(logits: CtcFrameLogits, vocabulary: Record<string, string>, blankTokenId: number): GreedyCtcDecode {
  let previous = -1;
  const tokenIds: number[] = [];
  for (let frame = 0; frame < logits.frames; frame += 1) {
    const offset = frame * logits.vocabularySize;
    let bestId = 0;
    let best = Number.NEGATIVE_INFINITY;
    for (let tokenId = 0; tokenId < logits.vocabularySize; tokenId += 1) {
      const value = logits.values[offset + tokenId] ?? Number.NEGATIVE_INFINITY;
      if (value > best) { best = value; bestId = tokenId; }
    }
    if (bestId !== previous && bestId !== blankTokenId) tokenIds.push(bestId);
    previous = bestId;
  }
  const lexicalText = normalizeTilawaArabic(tokenIds
    .map((id) => vocabulary[String(id)] ?? "")
    .filter((token) => token && token !== "<unk>" && token !== "<blank>")
    .join("")
    .replaceAll("▁", " "));
  return { tokenIds, lexicalText, lexicalTokens: lexicalTokens(lexicalText) };
}

function candidateFromPositions(index: QuranWideLexicalIndex, startPosition: number, endPosition: number, retrievalScore: number): QuranPassageCandidate | null {
  const start = index.words[startPosition];
  const end = index.words[endPosition];
  if (!start || !end || endPosition < startPosition || start.surah !== end.surah) return null;
  const ctcTokenCount = index.words.slice(startPosition, endPosition + 1).reduce((sum, word) => sum + word.ctcTokenIds.length, 0);
  if (!ctcTokenCount) return null;
  return {
    start: { surah: start.surah, ayah: start.ayah, canonicalWordIndex: start.canonicalWordIndex, globalWordIndex: start.globalWordIndex },
    end: { surah: end.surah, ayah: end.ayah, canonicalWordIndex: end.canonicalWordIndex, globalWordIndex: end.globalWordIndex },
    startPosition,
    endPosition,
    retrievalScore,
    ctcScore: null,
    normalizedCtcScore: null,
    confidence: 0,
    marginFromSecond: null,
    ctcTokenCount,
    optionalPrelude: {
      available: Boolean(start.canonicalWordIndex === 1 && start.optionalPreludeCtcTokenIds?.length),
      selected: "absent",
      lexicalText: start.canonicalWordIndex === 1 ? start.optionalPreludeLexicalText ?? "" : "",
      canonicalFirstWordStart: { surah: start.surah, ayah: start.ayah, canonicalWordIndex: start.canonicalWordIndex, globalWordIndex: start.globalWordIndex },
      canonicalOnlyScore: null,
      optionalBasmalahPlusCanonicalScore: null,
    },
  };
}

function surahBounds(index: QuranWideLexicalIndex, position: number) {
  const word = index.words[position];
  if (!word) return null;
  let start = position;
  let end = position;
  while (start > 0 && index.words[start - 1]?.surah === word.surah) start -= 1;
  while (end < index.words.length - 1 && index.words[end + 1]?.surah === word.surah) end += 1;
  return { start, end };
}

function retrieveQuranCandidatesWithDiagnostics(index: QuranWideLexicalIndex, decodedTokens: readonly string[], limit: number) {
  const locationEvidence = locationTokens(decodedTokens);
  if (!locationEvidence.length) return { candidates: [] as QuranPassageCandidate[], crossSurahCandidatesRejected: 0 };
  let crossSurahCandidatesRejected = 0;
  const anchors = new Map<string, { anchor: number; surah: number; score: number }>();
  for (let size = Math.min(3, locationEvidence.length); size >= 1; size -= 1) {
    for (let offset = 0; offset + size <= locationEvidence.length; offset += 1) {
      const positions = index.ngramPositions.get(ngramKey(locationEvidence.slice(offset, offset + size))) ?? [];
      const weight = (size * size) / Math.max(1, positions.length);
      for (const position of positions) {
        const matchedWord = index.words[position];
        if (!matchedWord) continue;
        const anchor = position - offset;
        const key = `${matchedWord.surah}:${anchor}`;
        const existing = anchors.get(key);
        anchors.set(key, { anchor, surah: matchedWord.surah, score: (existing?.score ?? 0) + weight });
      }
    }
  }
  const estimatedWords = Math.max(FASTCONFORMER_IDENTIFICATION_DEFAULTS.minimumCandidateWords, locationEvidence.length);
  const lengths = [...new Set([0.65, 0.82, 1, 1.2, 1.45].map((factor) => Math.max(FASTCONFORMER_IDENTIFICATION_DEFAULTS.minimumCandidateWords, Math.round(estimatedWords * factor))))];
  const candidates = new Map<string, QuranPassageCandidate>();
  for (const { anchor, surah, score } of [...anchors.values()].sort((left, right) => right.score - left.score || left.anchor - right.anchor).slice(0, limit * 3)) {
    const anchorPosition = index.words.findIndex((word) => word.surah === surah);
    const bounds = anchorPosition < 0 ? null : surahBounds(index, anchorPosition);
    if (!bounds) continue;
    const drift = Math.max(1, Math.round(estimatedWords * 0.18));
    for (const startOffset of [-drift, 0, drift]) {
      for (const length of lengths) {
        const requestedStart = anchor + startOffset;
        const requestedEnd = requestedStart + length - 1;
        if (requestedStart < bounds.start || requestedEnd > bounds.end) crossSurahCandidatesRejected += 1;
        const start = Math.max(bounds.start, Math.min(bounds.end, requestedStart));
        const end = Math.max(start, Math.min(bounds.end, requestedEnd));
        const candidate = candidateFromPositions(index, start, end, score / Math.max(1, locationEvidence.length));
        if (!candidate) continue;
        const key = `${start}:${end}`;
        if (!candidates.has(key) || candidates.get(key)!.retrievalScore < candidate.retrievalScore) candidates.set(key, candidate);
      }
    }
  }
  return {
    candidates: [...candidates.values()]
      .sort((left, right) => right.retrievalScore - left.retrievalScore || left.startPosition - right.startPosition || left.endPosition - right.endPosition)
      .slice(0, limit),
    crossSurahCandidatesRejected,
  };
}

/** Recall-first anchor retrieval. It creates contiguous word ranges, including
 * cross-ayah and mid-ayah ranges, then leaves acoustic discrimination to CTC. */
export function retrieveQuranCandidates(index: QuranWideLexicalIndex, decodedTokens: readonly string[], limit = FASTCONFORMER_IDENTIFICATION_DEFAULTS.coarseCandidateLimit): QuranPassageCandidate[] {
  return retrieveQuranCandidatesWithDiagnostics(index, decodedTokens, limit).candidates;
}

function logAdd(left: number, right: number) {
  if (!Number.isFinite(left)) return right;
  if (!Number.isFinite(right)) return left;
  const maximum = Math.max(left, right);
  return maximum + Math.log(Math.exp(left - maximum) + Math.exp(right - maximum));
}

function frameLogProbabilities(logits: CtcFrameLogits) {
  const output = new Float32Array(logits.frames * logits.vocabularySize);
  for (let frame = 0; frame < logits.frames; frame += 1) {
    const offset = frame * logits.vocabularySize;
    let maximum = Number.NEGATIVE_INFINITY;
    for (let id = 0; id < logits.vocabularySize; id += 1) maximum = Math.max(maximum, logits.values[offset + id] ?? Number.NEGATIVE_INFINITY);
    let sum = 0;
    for (let id = 0; id < logits.vocabularySize; id += 1) sum += Math.exp((logits.values[offset + id] ?? Number.NEGATIVE_INFINITY) - maximum);
    const normalizer = maximum + Math.log(sum);
    for (let id = 0; id < logits.vocabularySize; id += 1) output[offset + id] = (logits.values[offset + id] ?? Number.NEGATIVE_INFINITY) - normalizer;
  }
  return output;
}

/** Exact forward (sum-over-paths) CTC likelihood in log space. */
function ctcForwardScoreFromLogProbabilities(logProbs: Float32Array, logits: Pick<CtcFrameLogits, "frames" | "vocabularySize">, tokenIds: readonly number[], blankTokenId: number): number | null {
  if (!tokenIds.length || tokenIds.length > logits.frames || blankTokenId < 0 || blankTokenId >= logits.vocabularySize || tokenIds.some((id) => id < 0 || id >= logits.vocabularySize)) return null;
  const labels = [blankTokenId, ...tokenIds.flatMap((id) => [id, blankTokenId])];
  let previous = new Float64Array(labels.length).fill(Number.NEGATIVE_INFINITY);
  previous[0] = logProbs[blankTokenId]!;
  if (labels.length > 1) previous[1] = logProbs[tokenIds[0]!]!;
  for (let frame = 1; frame < logits.frames; frame += 1) {
    const current = new Float64Array(labels.length).fill(Number.NEGATIVE_INFINITY);
    const offset = frame * logits.vocabularySize;
    for (let state = 0; state < labels.length; state += 1) {
      let total = previous[state]!;
      if (state > 0) total = logAdd(total, previous[state - 1]!);
      if (state > 1 && labels[state] !== blankTokenId && labels[state] !== labels[state - 2]) total = logAdd(total, previous[state - 2]!);
      current[state] = total + logProbs[offset + labels[state]!]!;
    }
    previous = current;
  }
  const score = logAdd(previous.at(-1)!, previous.at(-2)!);
  return Number.isFinite(score) ? score : null;
}

export function ctcForwardScore(logits: CtcFrameLogits, tokenIds: readonly number[], blankTokenId: number): number | null {
  return ctcForwardScoreFromLogProbabilities(frameLogProbabilities(logits), logits, tokenIds, blankTokenId);
}

function candidateTokenSequences(index: QuranWideLexicalIndex, candidate: QuranPassageCandidate) {
  const words = index.words.slice(candidate.startPosition, candidate.endPosition + 1);
  const canonical = words.flatMap((word) => word.ctcTokenIds);
  const optionalPrelude = candidate.start.canonicalWordIndex === 1 ? words[0]?.optionalPreludeCtcTokenIds ?? [] : [];
  return { canonical, optionalPrelude: optionalPrelude.length ? [...optionalPrelude, ...canonical] : null };
}

export function rerankQuranCandidates(index: QuranWideLexicalIndex, candidates: readonly QuranPassageCandidate[], logits: CtcFrameLogits, blankTokenId: number, limit = FASTCONFORMER_IDENTIFICATION_DEFAULTS.rerankCandidateLimit): QuranPassageCandidate[] {
  const logProbs = frameLogProbabilities(logits);
  const scored = candidates.slice(0, limit).map((candidate) => {
    const sequences = candidateTokenSequences(index, candidate);
    const canonicalOnlyScore = ctcForwardScoreFromLogProbabilities(logProbs, logits, sequences.canonical, blankTokenId);
    const optionalBasmalahPlusCanonicalScore = sequences.optionalPrelude
      ? ctcForwardScoreFromLogProbabilities(logProbs, logits, sequences.optionalPrelude, blankTokenId)
      : null;
    const selected = optionalBasmalahPlusCanonicalScore !== null && (canonicalOnlyScore === null || optionalBasmalahPlusCanonicalScore > canonicalOnlyScore)
      ? "present" as const
      : "absent" as const;
    const ctcScore = selected === "present" ? optionalBasmalahPlusCanonicalScore : canonicalOnlyScore;
    return {
      ...candidate,
      ctcScore,
      normalizedCtcScore: ctcScore === null ? null : Number((ctcScore / logits.frames).toFixed(6)),
      optionalPrelude: {
        ...candidate.optionalPrelude,
        selected,
        canonicalOnlyScore,
        optionalBasmalahPlusCanonicalScore,
      },
    };
  }).filter((candidate) => candidate.normalizedCtcScore !== null);
  scored.sort((left, right) => right.normalizedCtcScore! - left.normalizedCtcScore! || right.retrievalScore - left.retrievalScore || left.startPosition - right.startPosition);
  const best = scored[0]?.normalizedCtcScore ?? null;
  const runnerUp = scored[1]?.normalizedCtcScore ?? null;
  return scored.map((candidate, position) => {
    const margin = best === null || position > 0 ? null : runnerUp === null ? null : Number((best - runnerUp).toFixed(6));
    // This is intentionally a bounded diagnostic strength, not probability.
    const confidence = Number(Math.max(0, Math.min(1, ((candidate.normalizedCtcScore ?? -20) + 20) / 20)).toFixed(4));
    return { ...candidate, confidence, marginFromSecond: margin };
  });
}

export function identifyQuranWindow(index: QuranWideLexicalIndex, input: IdentificationWindowInput): IdentificationWindowResult {
  const startedAt = performance.now();
  const greedy = greedyDecodeCtc(input.logits, input.vocabulary, input.blankTokenId);
  const retrievalStartedAt = performance.now();
  const retrieval = retrieveQuranCandidatesWithDiagnostics(index, greedy.lexicalTokens, FASTCONFORMER_IDENTIFICATION_DEFAULTS.coarseCandidateLimit);
  const coarse = retrieval.candidates;
  const retrievalMs = Math.round(performance.now() - retrievalStartedAt);
  const rerankStartedAt = performance.now();
  const candidates = rerankQuranCandidates(index, coarse, input.logits, input.blankTokenId);
  const rerankingMs = Math.round(performance.now() - rerankStartedAt);
  const best = candidates[0] ?? null;
  const margin = best?.marginFromSecond ?? null;
  const state = !best ? "no-usable-evidence"
    : margin !== null && margin < 0.015 ? "ambiguous"
      : best.confidence < 0.25 ? "weak-candidate"
        : "strong-candidate";
  return { index: input.index, startMs: input.startMs, endMs: input.endMs, voicedMs: input.voicedMs, greedy, candidates, selectedCandidate: best, state, elapsedMs: Math.round(performance.now() - startedAt), performance: { retrievalMs, rerankingMs, candidatesReranked: Math.min(coarse.length, FASTCONFORMER_IDENTIFICATION_DEFAULTS.rerankCandidateLimit) }, crossSurahCandidatesRejected: retrieval.crossSurahCandidatesRejected };
}

function localScore(candidate: QuranPassageCandidate | null) {
  return candidate ? (candidate.normalizedCtcScore ?? -20) + Math.min(0.25, candidate.retrievalScore * 0.04) : -2.25;
}

function transitionScore(previous: QuranPassageCandidate | null, current: QuranPassageCandidate | null, previousWindow: IdentificationWindowResult, currentWindow: IdentificationWindowResult) {
  if (!previous || !current) return current ? -0.5 : 0;
  const elapsedRatio = Math.max(0, currentWindow.startMs - previousWindow.startMs) / Math.max(1, previousWindow.endMs - previousWindow.startMs);
  const previousLength = previous.endPosition - previous.startPosition + 1;
  const expectedStart = previous.startPosition + previousLength * elapsedRatio;
  const movement = current.startPosition - previous.startPosition;
  if (movement < -2) return -12 - Math.min(8, Math.abs(movement) * 0.04);
  if (current.start.surah !== previous.end.surah && current.startPosition - previous.endPosition > 2) return -14;
  const distancePenalty = Math.min(8, Math.abs(current.startPosition - expectedStart) * 0.055);
  const sameOrAdjacentAyah = current.start.ayah === previous.end.ayah || (current.start.surah === previous.end.surah && current.start.ayah === previous.end.ayah + 1);
  return (sameOrAdjacentAyah ? 0.65 : 0) - distancePenalty;
}

/** Global deterministic Viterbi chain. An explicit null state lets one bad
 * window be ignored instead of vetoing a coherent Quran progression. */
export function solveQuranContinuity(windows: readonly IdentificationWindowResult[]): QuranContinuitySolution {
  if (!windows.length) return { path: [], span: null, continuityScore: 0, agreeingWindows: 0, selectedSurah: null, surahConsensus: { selectedSurah: null, strongWindowCount: 0, agreeingStrongWindows: 0 } };
  const strong = windows.flatMap((window) => window.state === "strong-candidate" && window.selectedCandidate ? [window.selectedCandidate] : []);
  const bySurah = new Map<number, number>();
  for (const candidate of strong) bySurah.set(candidate.start.surah, (bySurah.get(candidate.start.surah) ?? 0) + 1);
  const [consensusSurah, consensusCount] = [...bySurah].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0] ?? [null, 0];
  // Two independently strong windows are enough to establish a single-surah
  // shadow hypothesis. A contrary window can still be represented by null.
  const selectedSurah = consensusSurah !== null && consensusCount >= 2 ? consensusSurah : null;
  const states = windows.map((window) => [
    ...window.candidates.filter((candidate) => selectedSurah === null || candidate.start.surah === selectedSurah).slice(0, 5),
    null,
  ]);
  let scores = states[0]!.map(localScore);
  // A skipped/no-evidence state retains the last acoustic hypothesis so the
  // next good window cannot use the skip as permission for a backward jump.
  let lastKnownCandidates = states[0]!.map((candidate) => candidate);
  let lastKnownWindowIndexes: number[] = states[0]!.map((candidate) => candidate ? 0 : -1);
  const backtraces: number[][] = [];
  for (let index = 1; index < states.length; index += 1) {
    const currentScores = states[index]!.map(() => Number.NEGATIVE_INFINITY);
    const backtrace = states[index]!.map(() => 0);
    const nextKnownCandidates = states[index]!.map(() => null as QuranPassageCandidate | null);
    const nextKnownWindowIndexes = states[index]!.map(() => -1);
    for (const [currentIndex, current] of states[index]!.entries()) {
      for (const [previousIndex, previous] of states[index - 1]!.entries()) {
        const reference = previous ?? lastKnownCandidates[previousIndex] ?? null;
        const referenceWindowIndex = previous ? index - 1 : lastKnownWindowIndexes[previousIndex]!;
        const referenceWindow = referenceWindowIndex >= 0 ? windows[referenceWindowIndex]! : windows[index - 1]!;
        const score = scores[previousIndex]! + localScore(current) + transitionScore(reference, current, referenceWindow, windows[index]!);
        if (score > currentScores[currentIndex]!) {
          currentScores[currentIndex] = score;
          backtrace[currentIndex] = previousIndex;
          nextKnownCandidates[currentIndex] = current ?? reference;
          nextKnownWindowIndexes[currentIndex] = current ? index : referenceWindowIndex;
        }
      }
    }
    scores = currentScores;
    lastKnownCandidates = nextKnownCandidates;
    lastKnownWindowIndexes = nextKnownWindowIndexes;
    backtraces.push(backtrace);
  }
  let cursor = scores.reduce((best, score, index) => score > scores[best]! ? index : best, 0);
  const path = new Array<{ windowIndex: number; candidate: QuranPassageCandidate | null }>(windows.length);
  for (let index = windows.length - 1; index >= 0; index -= 1) {
    path[index] = { windowIndex: windows[index]!.index, candidate: states[index]![cursor]! };
    if (index > 0) cursor = backtraces[index - 1]![cursor]!;
  }
  const selected = path.flatMap((item) => item.candidate ? [item.candidate] : []);
  const solvedSurah = selectedSurah ?? [...selected.reduce((counts, candidate) => counts.set(candidate.start.surah, (counts.get(candidate.start.surah) ?? 0) + 1), new Map<number, number>())]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0] ?? null;
  const selectedInsideSurah = solvedSurah === null ? [] : selected.filter((candidate) => candidate.start.surah === solvedSurah && candidate.end.surah === solvedSurah);
  const first = selectedInsideSurah.reduce<QuranPassageCandidate | null>((best, candidate) => !best || candidate.startPosition < best.startPosition ? candidate : best, null);
  const last = selectedInsideSurah.reduce<QuranPassageCandidate | null>((best, candidate) => !best || candidate.endPosition > best.endPosition ? candidate : best, null);
  return {
    path,
    span: first && last ? { start: first.start, end: last.end } : null,
    continuityScore: Number(scores.reduce((best, score) => Math.max(best, score), Number.NEGATIVE_INFINITY).toFixed(4)),
    agreeingWindows: selectedInsideSurah.length,
    selectedSurah: solvedSurah,
    surahConsensus: { selectedSurah: solvedSurah, strongWindowCount: strong.length, agreeingStrongWindows: solvedSurah === null ? 0 : bySurah.get(solvedSurah) ?? 0 },
  };
}

export function summarizeFastConformerIdentification(windows: readonly IdentificationWindowResult[], inferenceMs: number): FastConformerIdentificationResult {
  const startedAt = performance.now();
  const solution = solveQuranContinuity(windows);
  const selected = solution.path.flatMap((entry) => entry.candidate ? [entry.candidate] : []);
  const selectedInsideSurah = selected.filter((candidate) => candidate.start.surah === solution.selectedSurah && candidate.end.surah === solution.selectedSurah);
  const best = selectedInsideSurah[0] ?? null;
  const optionalPrelude = selectedInsideSurah.find((candidate) => candidate.optionalPrelude.selected === "present")?.optionalPrelude
    ?? selectedInsideSurah.find((candidate) => candidate.optionalPrelude.available)?.optionalPrelude
    ?? null;
  const voicedTotal = windows.reduce((sum, window) => sum + window.voicedMs, 0);
  // Every selected candidate explains its own voiced window; retain a direct,
  // deterministic proportion rather than claiming calibrated probability.
  const explained = voicedTotal ? windows.filter((window) => solution.path.find((entry) => entry.windowIndex === window.index)?.candidate).reduce((sum, window) => sum + window.voicedMs, 0) / voicedTotal : 0;
  const margin = best?.marginFromSecond ?? null;
  const composite = best ? Number(Math.max(0, Math.min(1, best.confidence * 0.6 + Math.min(1, solution.agreeingWindows / Math.max(1, windows.length)) * 0.25 + Math.min(1, Math.max(0, margin ?? 0) / 0.1) * 0.15)).toFixed(4)) : null;
  return {
    status: solution.span ? "complete" : "unavailable",
    reason: solution.span ? undefined : "No FastConformer Quran-wide window produced usable CTC evidence.",
    span: solution.span,
    canonicalSpan: solution.span,
    wordLevelSpan: solution.span,
    selectedSurah: solution.selectedSurah,
    optionalPrelude,
    surahConsensus: solution.surahConsensus,
    windowResults: windows,
    retrievalCandidates: windows.flatMap((window) => window.candidates),
    normalizedCtcScore: best?.normalizedCtcScore ?? null,
    margin,
    continuityScore: solution.continuityScore,
    confidence: { composite, normalizedBestCtcScore: best?.normalizedCtcScore ?? null, bestVsSecondMargin: margin, agreeingWindows: solution.agreeingWindows, voicedAudioExplained: Number(explained.toFixed(4)) },
    performance: { inferenceMs, retrievalMs: windows.reduce((sum, window) => sum + window.performance.retrievalMs, 0), rerankingMs: windows.reduce((sum, window) => sum + window.performance.rerankingMs, 0), candidatesReranked: windows.reduce((sum, window) => sum + window.performance.candidatesReranked, 0), totalMs: Math.round(performance.now() - startedAt) },
    CROSS_SURAH_CANDIDATES_REJECTED: windows.reduce((sum, window) => sum + window.crossSurahCandidatesRejected, 0),
  };
}
