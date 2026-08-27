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

function confidenceFor(score: number, normalizedText: string): number {
  if (score === 1) return 1;
  const wordCount = normalizedText ? normalizedText.split(" ").length : 0;
  const lengthFactor = wordCount === 1 ? 0.85 : Math.min(1, wordCount / 3);
  return Math.max(0, Math.min(1, score * (0.45 + lengthFactor * 0.55)));
}

function candidateStarts(normalizedText: string, verses: readonly QuranCorpusVerse[]): number[] {
  const words = normalizedText.split(" ");
  const firstWord = words[0];
  return verses.reduce<number[]>((result, verse, index) => {
    const verseWords = normalizeArabic(verse.text).split(" ");
    if (verseWords.includes(firstWord)) result.push(index);
    return result;
  }, []);
}

function splitTiming(chunk: TranscriptChunk, verses: readonly QuranCorpusVerse[]): RecognitionMatch[] {
  const weights = verses.map((verse) => Math.max(1, normalizeArabic(verse.text).length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let elapsed = chunk.startMs;
  return verses.map((verse, index) => {
    const endMs = index === verses.length - 1 ? chunk.endMs : Math.round(elapsed + (chunk.endMs - chunk.startMs) * weights[index] / total);
    const result = { verseKey: verse.verseKey, startMs: elapsed, endMs, confidence: 0 };
    elapsed = endMs;
    return result;
  });
}

export function recognizeTranscript(
  chunks: readonly TranscriptChunk[],
  options: { corpus?: readonly QuranCorpusVerse[]; minConfidence?: number; maxVersesPerChunk?: number } = {},
): RecognitionResult {
  const verses = options.corpus ?? hafsVerses;
  const minConfidence = options.minConfidence ?? 0.52;
  const maxVersesPerChunk = options.maxVersesPerChunk ?? 4;
  const orderedChunks = [...chunks].sort((left, right) => left.startMs - right.startMs);
  const matches: RecognitionMatch[] = [];
  let cursor = 0;

  for (const chunk of orderedChunks) {
    const normalizedChunk = normalizeArabic(chunk.text);
    if (!normalizedChunk || chunk.endMs < chunk.startMs) continue;
    const starts = candidateStarts(normalizedChunk, verses).filter((start) => start >= cursor);
    if (starts.length === 0) continue;
    let best: { start: number; end: number; score: number } | null = null;
    for (const start of starts) {
      let combined = "";
      for (let end = start; end < Math.min(verses.length, start + maxVersesPerChunk); end += 1) {
        combined = `${combined} ${normalizeArabic(verses[end].text)}`.trim();
        const score = bestTextSimilarity(normalizedChunk, combined);
        if (!best || score > best.score || (score === best.score && end - start < best.end - best.start)) {
          best = { start, end, score };
        }
      }
    }
    if (!best) continue;
    if (normalizedChunk.split(" ").length === 1 && starts.length > 1) continue;
    const confidence = confidenceFor(best.score, normalizedChunk);
    if (confidence < minConfidence) continue;
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
  }
  return matches;
}
