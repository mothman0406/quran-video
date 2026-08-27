import hafsCorpus from "../quran/hafs-corpus.json" with { type: "json" };

export type TranscriptChunk = {
  startMs: number;
  endMs: number;
  text: string;
};

export type QuranCorpusVerse = {
  verseKey: string;
  text: string;
};

export type RecognitionMatch = {
  verseKey: string;
  startMs: number;
  endMs: number;
  confidence: number;
};

export type RecognitionResult = RecognitionMatch[];

export type RecognitionDiagnostic = {
  startMs: number;
  endMs: number;
  normalizedText: string;
  topCandidate?: {
    startVerseKey: string;
    endVerseKey: string;
    score: number;
    confidence: number;
    textSimilarity: number;
    tokenSequenceSimilarity: number;
  };
  candidateGenerationPath?: "token-retrieval" | "character-fallback";
  rejectionReason: "empty transcript" | "invalid timestamps" | "no candidate sequence" | "ambiguous short phrase" | "below confidence threshold" | null;
};

export type RecognitionAnalysis = {
  matches: RecognitionResult;
  diagnostics: RecognitionDiagnostic[];
};

type CorpusChapter = {
  id: number;
  verses: Array<{ id: number; text: string }>;
};

const corpus = hafsCorpus as CorpusChapter[];

export const hafsVerses: readonly QuranCorpusVerse[] = corpus.flatMap((chapter) =>
  chapter.verses.map((verse) => ({ verseKey: `${chapter.id}:${verse.id}`, text: verse.text })),
);

const ARABIC_DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;
const ARABIC_PUNCTUATION = /[ۖۗۚۛۜۙۘ۝۞]/g;
const normalizedVerseCache = new WeakMap<QuranCorpusVerse, string>();
const verseWordCache = new WeakMap<QuranCorpusVerse, string[]>();

/** Matching-only normalization. Callers must retain the original Arabic for display. */
export function normalizeArabic(value: string): string {
  return value
    .normalize("NFKC")
    .replace(ARABIC_DIACRITICS, "")
    .replace(ARABIC_PUNCTUATION, "")
    .replace(/[ٱأإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ـ/g, "")
    .replace(/[^\u0621-\u063a\u0641-\u064a\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedVerseText(verse: QuranCorpusVerse): string {
  const cached = normalizedVerseCache.get(verse);
  if (cached !== undefined) return cached;
  const normalized = normalizeArabic(verse.text);
  normalizedVerseCache.set(verse, normalized);
  return normalized;
}

function normalizedVerseWords(verse: QuranCorpusVerse): string[] {
  const cached = verseWordCache.get(verse);
  if (cached !== undefined) return cached;
  const words = normalizedVerseText(verse).split(" ");
  verseWordCache.set(verse, words);
  return words;
}

function editSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (!left || !right) return 0;
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}

function bestTextSimilarity(transcript: string, verseText: string): number {
  if (transcript === verseText) return 1;
  if (verseText.includes(transcript)) return 0.96;
  // Long ASR chunks are normally near-complete ayah windows. Comparing those
  // directly avoids repeatedly sliding a large edit-distance window across
  // unrelated retrieval candidates; short clips retain the precise search.
  if (transcript.length >= 18) return editSimilarity(transcript, verseText);
  if (transcript.length < verseText.length) {
    const windowSize = transcript.length;
    let best = 0;
    for (let start = 0; start < verseText.length; start += 1) {
      for (const size of [windowSize - 2, windowSize, windowSize + 2]) {
        if (size > 0 && start + size <= verseText.length) {
          best = Math.max(best, editSimilarity(transcript, verseText.slice(start, start + size)));
        }
      }
    }
    return best * 0.98;
  }
  return editSimilarity(transcript, verseText);
}

function tokenSimilarity(left: string, right: string): number {
  if (left === right) return 1;
  if (left.length < 3 || right.length < 3) return 0;
  return editSimilarity(left, right);
}

/**
 * Rewards an ordered run of matching tokens, while still allowing Whisper to
 * insert, omit, or slightly corrupt individual words. Unlike a bag-of-words
 * score, this makes five consecutive ayat much stronger evidence than an
 * isolated lexical coincidence.
 */
function tokenSequenceSimilarity(transcript: string, verseText: string): number {
  const transcriptWords = transcript.split(" ").filter((word) => word.length >= 3);
  const verseWords = verseText.split(" ").filter((word) => word.length >= 3);
  if (transcriptWords.length === 0 || verseWords.length === 0) return 0;

  let verseCursor = 0;
  let matchedScore = 0;
  let matchedWords = 0;
  for (const transcriptWord of transcriptWords) {
    let bestScore = 0;
    let bestIndex = -1;
    for (let index = verseCursor; index < verseWords.length; index += 1) {
      const score = tokenSimilarity(transcriptWord, verseWords[index]);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestScore >= 0.58 && bestIndex >= 0) {
      matchedScore += bestScore;
      matchedWords += 1;
      verseCursor = bestIndex + 1;
    }
  }
  return matchedWords === 0 ? 0 : matchedScore / transcriptWords.length;
}

function confidenceFor(score: number, normalizedText: string): number {
  if (score === 1) return 1;
  const wordCount = normalizedText ? normalizedText.split(" ").length : 0;
  const lengthFactor = wordCount === 1 ? 0.85 : Math.min(1, wordCount / 3);
  return Math.max(0, Math.min(1, score * (0.45 + lengthFactor * 0.55)));
}

type CandidateStarts = {
  starts: number[];
  path: "token-retrieval" | "character-fallback";
};

function candidateStarts(
  normalizedText: string,
  verses: readonly QuranCorpusVerse[],
  maxVersesPerChunk: number,
): CandidateStarts {
  const words = normalizedText.split(" ").filter((word) => word.length >= 3);
  const starts = new Set<number>();

  // Search every meaningful transcript token, not just the first one. A hit in
  // ayah N also seeds the preceding positions of a possible contiguous window,
  // so a corrupted first ayah can be recovered from strong evidence in ayah N+1.
  const rankedTokenHits = verses.map((verse, index) => {
    const verseWords = normalizedVerseWords(verse);
    const scores = words.map((word) => Math.max(...verseWords.map((verseWord) => tokenSimilarity(word, verseWord))))
      .filter((score) => score >= 0.7);
    return { index, score: scores.reduce((sum, score) => sum + score, 0), count: scores.length };
  }).filter((hit) => hit.count > 0)
    .sort((left, right) => right.count - left.count || right.score - left.score)
    .slice(0, 16);
  rankedTokenHits.forEach(({ index }) => {
    const verse = verses[index];
    for (let offset = 0; offset < maxVersesPerChunk && index - offset >= 0; offset += 1) {
      const candidate = index - offset;
      if (verses[candidate].verseKey.split(":")[0] === verse.verseKey.split(":")[0]) starts.add(candidate);
    }
  });
  if (starts.size > 0) return { starts: [...starts], path: "token-retrieval" };

  // Rare, heavily corrupted speech may have no token above the retrieval
  // threshold. Bound the expensive scorer to the most character-similar ayat;
  // the later contiguous-window score and normal confidence rejection remain
  // responsible for accepting a result.
  const fallback = verses
    .map((verse, index) => ({ index, score: bestTextSimilarity(normalizedText, normalizedVerseText(verse)) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 24);
  fallback.forEach(({ index }) => {
    for (let offset = 0; offset < maxVersesPerChunk && index - offset >= 0; offset += 1) {
      const candidate = index - offset;
      if (verses[candidate].verseKey.split(":")[0] === verses[index].verseKey.split(":")[0]) starts.add(candidate);
    }
  });
  return { starts: [...starts], path: "character-fallback" };
}

function splitTiming(chunk: TranscriptChunk, verses: readonly QuranCorpusVerse[]): RecognitionMatch[] {
  const weights = verses.map((verse) => Math.max(1, normalizedVerseText(verse).length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let elapsed = chunk.startMs;
  return verses.map((verse, index) => {
    const endMs = index === verses.length - 1 ? chunk.endMs : Math.round(elapsed + (chunk.endMs - chunk.startMs) * weights[index] / total);
    const result = { verseKey: verse.verseKey, startMs: elapsed, endMs, confidence: 0 };
    elapsed = endMs;
    return result;
  });
}

type ScoredCandidate = {
  start: number;
  end: number;
  score: number;
  textSimilarity: number;
  tokenSequenceSimilarity: number;
};

function bestCandidateForStarts(
  normalizedChunk: string,
  starts: readonly number[],
  verses: readonly QuranCorpusVerse[],
  maxVersesPerChunk: number,
): ScoredCandidate | null {
  let best: ScoredCandidate | null = null;
  for (const start of starts) {
    let combined = "";
    for (let end = start; end < Math.min(verses.length, start + maxVersesPerChunk); end += 1) {
      combined = `${combined} ${normalizedVerseText(verses[end])}`.trim();
      const textSimilarity = bestTextSimilarity(normalizedChunk, combined);
      const sequenceSimilarity = tokenSequenceSimilarity(normalizedChunk, combined);
      const score = textSimilarity * 0.45 + sequenceSimilarity * 0.55;
      if (!best || score > best.score || (score === best.score && end - start < best.end - best.start)) {
        best = { start, end, score, textSimilarity, tokenSequenceSimilarity: sequenceSimilarity };
      }
    }
  }
  return best;
}

function diagnosticCandidate(best: ScoredCandidate, verses: readonly QuranCorpusVerse[], normalizedText: string) {
  const confidence = confidenceFor(best.score, normalizedText);
  return {
    startVerseKey: verses[best.start].verseKey,
    endVerseKey: verses[best.end].verseKey,
    score: Number(best.score.toFixed(4)),
    confidence: Number(confidence.toFixed(4)),
    textSimilarity: Number(best.textSimilarity.toFixed(4)),
    tokenSequenceSimilarity: Number(best.tokenSequenceSimilarity.toFixed(4)),
  };
}

export function analyzeTranscript(
  chunks: readonly TranscriptChunk[],
  options: { corpus?: readonly QuranCorpusVerse[]; minConfidence?: number; maxVersesPerChunk?: number } = {},
): RecognitionAnalysis {
  const verses = options.corpus ?? hafsVerses;
  const minConfidence = options.minConfidence ?? 0.52;
  const maxVersesPerChunk = options.maxVersesPerChunk ?? 5;
  const orderedChunks = [...chunks].sort((left, right) => left.startMs - right.startMs);
  const matches: RecognitionMatch[] = [];
  const diagnostics: RecognitionDiagnostic[] = [];
  let cursor = 0;

  for (const chunk of orderedChunks) {
    const normalizedChunk = normalizeArabic(chunk.text);
    const diagnostic: RecognitionDiagnostic = {
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      normalizedText: normalizedChunk,
      rejectionReason: null,
    };
    if (!normalizedChunk) {
      diagnostics.push({ ...diagnostic, rejectionReason: "empty transcript" });
      continue;
    }
    if (chunk.endMs < chunk.startMs) {
      diagnostics.push({ ...diagnostic, rejectionReason: "invalid timestamps" });
      continue;
    }
    const candidates = candidateStarts(normalizedChunk, verses, maxVersesPerChunk);
    diagnostic.candidateGenerationPath = candidates.path;
    const starts = candidates.starts.filter((start) => start >= cursor);
    if (starts.length === 0) {
      const rejectedBest = bestCandidateForStarts(normalizedChunk, candidates.starts, verses, maxVersesPerChunk);
      if (rejectedBest) diagnostic.topCandidate = diagnosticCandidate(rejectedBest, verses, normalizedChunk);
      diagnostics.push({ ...diagnostic, rejectionReason: "no candidate sequence" });
      continue;
    }
    const best = bestCandidateForStarts(normalizedChunk, starts, verses, maxVersesPerChunk);
    if (!best) continue;
    const confidence = confidenceFor(best.score, normalizedChunk);
    diagnostic.topCandidate = diagnosticCandidate(best, verses, normalizedChunk);
    if (normalizedChunk.split(" ").length === 1 && starts.length > 1) {
      diagnostics.push({ ...diagnostic, rejectionReason: "ambiguous short phrase" });
      continue;
    }
    if (confidence < minConfidence) {
      diagnostics.push({ ...diagnostic, rejectionReason: "below confidence threshold" });
      continue;
    }
    const selected = verses.slice(best.start, best.end + 1);
    const timed = splitTiming(chunk, selected);
    timed.forEach((match) => {
      match.confidence = Number(confidence.toFixed(4));
      const previous = matches[matches.length - 1];
      if (previous?.verseKey === match.verseKey) {
        previous.endMs = match.endMs;
        previous.confidence = Math.max(previous.confidence, match.confidence);
      } else {
        matches.push(match);
      }
    });
    cursor = Math.max(cursor, best.end + 1);
    diagnostics.push(diagnostic);
  }
  return { matches, diagnostics };
}

export function recognizeTranscript(
  chunks: readonly TranscriptChunk[],
  options: { corpus?: readonly QuranCorpusVerse[]; minConfidence?: number; maxVersesPerChunk?: number } = {},
): RecognitionResult {
  return analyzeTranscript(chunks, options).matches;
}
