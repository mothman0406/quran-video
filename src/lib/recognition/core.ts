import hafsCorpus from "../quran/hafs-corpus.json" with { type: "json" };
import { normalizeQuranRecitation, quranRecognitionUnits, type QuranRecognitionUnits } from "./quran-recitation.ts";
import type { AudioAnalysis } from "./audio-analysis.ts";
import { detectSpeechRegions, refineFirstAyahOnsetWithEnergy, refineTransitionWithEnergy, refineWordEdgeWithEnergy } from "./audio-analysis.ts";

export type TranscriptChunk = {
  startMs: number;
  endMs: number;
  text: string;
  /** Optional ASR word offsets. Chunk offsets are used when the runtime does not expose these. */
  words?: Array<{ text: string; startMs: number; endMs: number }>;
  /** A bounded second ASR pass is temporal evidence at the window level, not
   * a replacement for missing Whisper word timestamps. */
  timingSource?: "whole-recording" | "micro-asr";
};

/**
 * The immutable textual result of the initial whole-recording ASR pass.
 * Passage identification consumes this value exclusively; later timing
 * recovery can add temporal evidence but cannot replace these words.
 */
export type PrimaryTranscript = {
  readonly chunks: readonly TranscriptChunk[];
  readonly rawText: string;
  readonly normalizedTokens: readonly string[];
  readonly timestampMode: "word" | "chunk-fallback";
};

export function createPrimaryTranscript(
  chunks: readonly TranscriptChunk[],
  timestampMode: "word" | "chunk-fallback",
): PrimaryTranscript {
  const immutableChunks = chunks.map((chunk) => ({
    ...chunk,
    words: chunk.words?.map((word) => ({ ...word })),
  }));
  const rawText = immutableChunks.map((chunk) => chunk.text).join(" ");
  return {
    chunks: immutableChunks,
    rawText,
    normalizedTokens: normalizeArabic(rawText).split(" ").filter(Boolean),
    timestampMode,
  };
}

export type TimingEvidenceSource =
  | "word-timestamp"
  | "micro-asr"
  | "interpolated"
  | "pcm-refined"
  | "chunk-coarse"
  | "unknown"
  /** Legacy persisted/manual timing labels remain readable. New recognition
   * output uses the evidence classes above. */
  | "word-audio-refined"
  | "token-interpolated"
  | "chunk-interpolated"
  | "low-confidence-fallback"
  | "direct-asr-word"
  | "chunk-text-alignment"
  | "interpolation"
  | "low-confidence";

export type QuranCorpusVerse = {
  verseKey: string;
  text: string;
};

export type RecognitionMatch = {
  verseKey: string;
  startMs: number;
  endMs: number;
  confidence: number;
  timing: {
    start: { timestampMs: number; source: TimingEvidenceSource };
    end: { timestampMs: number; source: TimingEvidenceSource };
    matchedText: string;
  };
  /** Canonical evidence is independent from timestamp precision. Word indexes are one-based. */
  wordSupport: {
    canonicalStartWordIndex: number;
    canonicalEndWordIndex: number;
    matchedCanonicalWordCount: number;
    canonicalWordCount: number;
    coverage: number;
    evidenceQuality: number;
  };
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

export type PassageCandidateDiagnostic = {
  startVerseKey: string;
  endVerseKey: string;
  firstWordIndex: number;
  lastWordIndex: number;
  totalScore: number;
  confidence: number;
  textSimilarity: number;
  sequenceConsistency: number;
  transcriptCoverage: number;
  canonicalCoverage: number;
  consecutiveAyat: number;
  explainedTranscriptTokens: number;
  unexplainedTranscriptBefore: number;
  unexplainedTranscriptAfter: number;
};

export type PassageAmbiguityState = "confident-unique" | "plausible-ambiguous" | "no-reliable-match";

export type PassageInference = {
  /** Passage identity always comes from the initial whole-recording ASR text. */
  passageSource: "primary-transcript";
  state: PassageAmbiguityState;
  candidates: PassageCandidateDiagnostic[];
  candidateMargin: number | null;
  selectedCandidate: PassageCandidateDiagnostic | null;
  disambiguatedByLaterChunks: boolean;
  canonicalSpan: CanonicalSpan | null;
  mappingQuality: number | null;
  transcriptCoverage: number | null;
  canonicalSpanCoverage: number | null;
  uniquenessMargin: number | null;
  firstBoundaryConfidence: number | null;
  lastBoundaryConfidence: number | null;
  boundaryCompletion: { extendedBackward: boolean; extendedForward: boolean };
  shadowComparison: {
    stablePreF0840e7: { state: PassageAmbiguityState; selectedCandidate: PassageCandidateDiagnostic | null };
    current: { state: PassageAmbiguityState; selectedCandidate: PassageCandidateDiagnostic | null };
    regressionDetected: boolean;
  };
};

export type CanonicalSpan = {
  surah: number;
  firstVerseKey: string;
  firstWordIndex: number;
  firstWordText: string;
  firstBoundary: "verse-beginning" | "mid-verse" | "uncertain";
  lastVerseKey: string;
  lastWordIndex: number;
  lastWordText: string;
  lastBoundary: "verse-end" | "mid-verse" | "uncertain";
  coveredVerseKeys: string[];
};

export type RecognitionAnalysis = {
  matches: RecognitionResult;
  diagnostics: RecognitionDiagnostic[];
  passage: PassageInference;
  timingTrace: RecognitionTimingTrace | null;
  /** Detailed, canonical-first alignment. This deliberately remains separate
   * from the legacy VerseAlignment-shaped matches used by saved projects. */
  forcedAlignment: ForcedAlignment | null;
  /** A known-passage local ASR pass is required before a fallback timing
   * result may be presented as recovered timing. */
  timingRecoveryPlan: TimingRecoveryPlan | null;
};

export type CanonicalPassageWord = {
  verseKey: string;
  canonicalWordIndex: number;
  globalWordIndex: number;
  canonicalText: string;
  normalizedText: string;
};

export type WordOccurrence = CanonicalPassageWord & {
  occurrenceIndex: number;
  startMs: number;
  endMs: number;
  confidence: number;
  evidence: "direct-word-alignment" | "micro-asr" | "chunk-coarse";
  pcmRefined: boolean;
  asrText: string;
};

/** Every canonical word in a selected passage has an alignment record.  A
 * missing ASR observation changes its evidence grade, never its existence. */
export type CanonicalWordAlignment = CanonicalPassageWord & {
  startMs: number;
  endMs: number;
  timingEvidence: TimingEvidenceSource;
  confidence: number;
  directMatch: boolean;
  recoveredMatch: boolean;
};

export type ForcedVerseTiming = {
  verseKey: string;
  startMs: number;
  endMs: number;
  firstCanonicalWordIndex: number;
  lastCanonicalWordIndex: number;
  partialStart: boolean;
  partialEnd: boolean;
  confidence: number;
  startEvidence: TimingEvidenceSource;
  endEvidence: TimingEvidenceSource;
  directWordCount: number;
  recoveredWordCount: number;
  recoveryAttempted: boolean;
};

export type PauseCandidate = {
  afterVerseKey: string;
  afterWordIndex: number;
  startMs: number;
  endMs: number;
  durationMs: number;
  depth: number;
  confidence: number;
  score: number;
};

export type CaptionSetPlan = {
  id: string;
  verseKey: string;
  canonicalStartWordIndex: number;
  canonicalEndWordIndex: number;
  startMs: number;
  endMs: number;
  cutReason: "whole-ayah" | "short-ayah" | "acoustic-pause" | "visual-length" | "partial-ayah";
};

export type ForcedAlignment = {
  canonicalPassage: readonly CanonicalPassageWord[];
  canonicalWordAlignments?: readonly CanonicalWordAlignment[];
  wordOccurrences: readonly WordOccurrence[];
  verseTimings: readonly ForcedVerseTiming[];
  pauseCandidates: readonly PauseCandidate[];
  captionSets: readonly CaptionSetPlan[];
};

export type TimingRecoveryWindow = {
  startMs: number;
  endMs: number;
  verseKeys: string[];
  reason: "first-onset" | "missing-verse" | "transition";
};

export type TimingRecoveryPlan = {
  required: boolean;
  timestampMode: "word" | "chunk-fallback";
  windows: TimingRecoveryWindow[];
  missingVerseKeys: string[];
  firstOnsetRequired: boolean;
};

export type VerseTimingTrace = {
  verseKey: string;
  /** Earliest token aligned by the passage matcher, before credibility filtering. */
  firstAlignedAsrEvidenceMs: number | null;
  /** First token in the selected local, multi-word alignment anchor. */
  firstStrongAlignmentAnchorMs: number | null;
  firstCanonicalWordSupported: number | null;
  onsetCorridorStartMs: number | null;
  onsetCorridorEndMs: number | null;
  pcmLocalOnsetCandidateMs: number | null;
  rawVerseAlignmentStartMs: number;
  verseAlignmentStartMs: number;
  verseAlignmentEndMs: number;
};

export type RecognitionTimingTrace = {
  earliestAudioActivityCandidateMs: number | null;
  firstAsrChunkStartMs: number | null;
  firstAsrTimestampedWordMs: number | null;
  firstAsrWordAlignedToDetectedQuranMs: number | null;
  firstCanonicalQuranWordSupported: number | null;
  firstStrongAlignmentAnchorMs: number | null;
  pcmLocalOnsetCandidateMs: number | null;
  rawVerseAlignmentStartMs: number | null;
  verseAlignmentStartMs: number | null;
  verses: VerseTimingTrace[];
};

type CorpusChapter = {
  id: number;
  name: string;
  transliteration: string;
  verses: Array<{ id: number; text: string }>;
};

const corpus = hafsCorpus as CorpusChapter[];

export const hafsSurahs = corpus.map((chapter) => ({
  number: chapter.id,
  name: chapter.name,
  transliteration: chapter.transliteration,
  verseCount: chapter.verses.length,
}));

export const hafsVerses: readonly QuranCorpusVerse[] = corpus.flatMap((chapter) =>
  chapter.verses.map((verse) => ({ verseKey: `${chapter.id}:${verse.id}`, text: verse.text })),
);

const ARABIC_DIACRITICS = /[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g;
const ARABIC_PUNCTUATION = /[ۖۗۚۛۜۙۘ۝۞]/g;
const normalizedVerseCache = new WeakMap<QuranCorpusVerse, string>();
const verseWordCache = new WeakMap<QuranCorpusVerse, string[]>();
const recitationVerseCache = new WeakMap<QuranCorpusVerse, string>();
const recitationVerseWordCache = new WeakMap<QuranCorpusVerse, string[]>();

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

function recitationVerseText(verse: QuranCorpusVerse): string {
  const cached = recitationVerseCache.get(verse);
  if (cached !== undefined) return cached;
  const normalized = normalizeQuranRecitation(verse.text);
  recitationVerseCache.set(verse, normalized);
  return normalized;
}

function recitationVerseWords(verse: QuranCorpusVerse): string[] {
  const cached = recitationVerseWordCache.get(verse);
  if (cached !== undefined) return cached;
  const words = recitationVerseText(verse).split(" ").filter(Boolean);
  recitationVerseWordCache.set(verse, words);
  return words;
}

function combinedScore(orthographic: number, recitation: number): number {
  // Orthographic evidence remains the floor. Recitation-only evidence can
  // improve a candidate, but only as a limited corroborating signal.
  return Math.max(orthographic, orthographic * 0.6 + recitation * 0.4);
}

function combinedTextSimilarity(units: QuranRecognitionUnits, verse: QuranRecognitionUnits): number {
  return combinedScore(
    bestTextSimilarity(units.orthographic, verse.orthographic),
    bestTextSimilarity(units.recitation, verse.recitation),
  );
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

function recognitionUnitSimilarity(left: QuranRecognitionUnits, right: QuranRecognitionUnits): number {
  return combinedScore(tokenSimilarity(left.orthographic, right.orthographic), tokenSimilarity(left.recitation, right.recitation));
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

function combinedTokenSequenceSimilarity(units: QuranRecognitionUnits, verse: QuranRecognitionUnits): number {
  return combinedScore(
    tokenSequenceSimilarity(units.orthographic, verse.orthographic),
    tokenSequenceSimilarity(units.recitation, verse.recitation),
  );
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
  units: QuranRecognitionUnits,
  verses: readonly QuranCorpusVerse[],
  maxVersesPerChunk: number,
): CandidateStarts {
  const orthographicWords = units.orthographic.split(" ").filter((word) => word.length >= 3);
  const recitationWords = units.recitation.split(" ").filter((word) => word.length >= 3);
  const starts = new Set<number>();

  // Search every meaningful transcript token, not just the first one. A hit in
  // ayah N also seeds the preceding positions of a possible contiguous window,
  // so a corrupted first ayah can be recovered from strong evidence in ayah N+1.
  const rankedTokenHits = verses.map((verse, index) => {
    const verseWords = normalizedVerseWords(verse);
    const recitationWordsForVerse = recitationVerseWords(verse);
    const scores = orthographicWords.map((word) => Math.max(...verseWords.map((verseWord) => tokenSimilarity(word, verseWord))))
      .concat(recitationWords.map((word) => Math.max(...recitationWordsForVerse.map((verseWord) => tokenSimilarity(word, verseWord)))))
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
    .map((verse, index) => ({ index, score: combinedTextSimilarity(units, { orthographic: normalizedVerseText(verse), recitation: recitationVerseText(verse) }) }))
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

type TimedToken = {
  units: QuranRecognitionUnits;
  /** Original ASR surface text; it is evidence only and is never display text. */
  displayText: string;
  startMs: number;
  endMs: number;
  source: "direct-asr-word" | "micro-asr" | "chunk-coarse";
  /** True only when Whisper supplied a word offset, rather than a segment
   * interval shared by all words in that segment. */
  hasWordTimestamp: boolean;
};

type CanonicalToken = {
  units: QuranRecognitionUnits;
  ayah: number;
  verseKey: string;
  /** Zero-based internally; public metadata is one-based. */
  wordIndex: number;
  globalWordIndex: number;
  displayText: string;
};

type AlignedAyahEvidence = {
  token: TimedToken;
  canonicalWordIndex: number;
  similarity: number;
};

function timedTokens(chunks: readonly TranscriptChunk[]): TimedToken[] {
  return chunks.reduce<TimedToken[]>((all, chunk) => {
    if (chunk.words?.length) {
      all.push(...chunk.words.flatMap<TimedToken>((word) => {
        const orthographic = normalizeArabic(word.text);
        return orthographic ? [{
          units: quranRecognitionUnits(orthographic, word.text),
          displayText: word.text.trim(),
          startMs: word.startMs,
          endMs: word.endMs,
          source: "direct-asr-word" as const,
          hasWordTimestamp: true,
        }] : [];
      }));
      return all;
    }
    const words = chunk.text.split(/\s+/).map((displayText) => ({ displayText, orthographic: normalizeArabic(displayText) })).filter((word) => word.orthographic);
    // Do not distribute a coarse Whisper segment across its text. Every token
    // keeps the same interval so it can support passage identity/order while
    // remaining unusable as a precise word-time anchor.
    const source = chunk.timingSource === "micro-asr" ? "micro-asr" as const : "chunk-coarse" as const;
    all.push(...words.map<TimedToken>((word) => ({
      units: quranRecognitionUnits(word.orthographic, word.displayText),
      displayText: word.displayText,
      startMs: chunk.startMs,
      endMs: chunk.endMs,
      source,
      hasWordTimestamp: false,
    })));
    return all;
  }, []).filter((token) => token.endMs >= token.startMs);
}

/** Textual evidence for passage search never consults word offsets or timing. */
function transcriptTokens(chunks: readonly TranscriptChunk[]): TimedToken[] {
  return chunks.flatMap((chunk) => chunk.text
    .split(/\s+/)
    .map((displayText) => ({ displayText, orthographic: normalizeArabic(displayText) }))
    .filter((word) => word.orthographic)
    .map((word) => ({
      units: quranRecognitionUnits(word.orthographic, word.displayText),
      displayText: word.displayText,
      startMs: 0,
      endMs: 0,
      source: "chunk-coarse" as const,
      hasWordTimestamp: false,
    })));
}

type TokenAlignment = {
  matched: Map<number, TimedToken[]>;
  matchedAsrIndexes: Set<number>;
  similarities: Map<number, number[]>;
  firstCanonicalIndex: number | null;
  lastCanonicalIndex: number | null;
  score: number;
  evidenceTokenCount: number;
};

/**
 * Semi-global alignment: canonical start/end gaps are free because a clip can
 * begin or end in the middle of an ayah. ASR gaps are deliberately penalized.
 * This is the key asymmetry that prevents a later clean anchor from discarding
 * spoken Quran text at the beginning or end of a recording.
 */
function alignTokens(canonical: readonly CanonicalToken[], asr: readonly TimedToken[]): TokenAlignment {
  const rows = canonical.length + 1;
  const columns = asr.length + 1;
  const scores = Array.from({ length: rows }, () => new Float64Array(columns));
  const moves = Array.from({ length: rows }, () => new Uint8Array(columns)); // 1 diag, 2 canonical gap, 3 ASR gap
  for (let i = 1; i < rows; i += 1) { scores[i][0] = 0; moves[i][0] = 2; }
  // Transcript words are speech evidence, not free padding. Silence produces
  // no token here, while unrelated speech can remain unmatched at a cost.
  for (let j = 1; j < columns; j += 1) { scores[0][j] = scores[0][j - 1] - 0.78; moves[0][j] = 3; }
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const similarity = recognitionUnitSimilarity(canonical[i - 1].units, asr[j - 1].units);
      const diagonal = scores[i - 1][j - 1] + (similarity >= 0.58 ? similarity * 2.25 : -1.25);
      const skipCanonical = scores[i - 1][j] - 0.1;
      const skipAsr = scores[i][j - 1] - 0.78;
      if (diagonal >= skipCanonical && diagonal >= skipAsr) { scores[i][j] = diagonal; moves[i][j] = 1; }
      else if (skipCanonical >= skipAsr) { scores[i][j] = skipCanonical; moves[i][j] = 2; }
      else { scores[i][j] = skipAsr; moves[i][j] = 3; }
    }
  }
  // Reaching the canonical end is not required: it is a free suffix gap.
  let endRow = 0;
  for (let i = 1; i < rows; i += 1) if (scores[i][columns - 1] > scores[endRow][columns - 1]) endRow = i;
  const aligned = new Map<number, TimedToken[]>();
  const similarities = new Map<number, number[]>();
  const matchedAsrIndexes = new Set<number>();
  let i = endRow;
  let j = asr.length;
  while (i > 0 || j > 0) {
    const move = moves[i]?.[j] ?? 0;
    if (move === 1) {
      const similarity = recognitionUnitSimilarity(canonical[i - 1].units, asr[j - 1].units);
      if (similarity >= 0.58) {
        const current = aligned.get(i - 1) ?? [];
        current.unshift(asr[j - 1]);
        aligned.set(i - 1, current);
        const currentSimilarities = similarities.get(i - 1) ?? [];
        currentSimilarities.unshift(similarity);
        similarities.set(i - 1, currentSimilarities);
        matchedAsrIndexes.add(j - 1);
      }
      i -= 1; j -= 1;
    } else if (move === 2) i -= 1;
    else if (move === 3) j -= 1;
    else break;
  }
  const indexes = [...aligned.keys()].sort((left, right) => left - right);
  return {
    matched: aligned,
    matchedAsrIndexes,
    similarities,
    firstCanonicalIndex: indexes[0] ?? null,
    lastCanonicalIndex: indexes.at(-1) ?? null,
    score: scores[endRow][columns - 1],
    evidenceTokenCount: asr.length,
  };
}

function canonicalPassageTokens(passage: readonly QuranCorpusVerse[]) {
  const canonical: CanonicalToken[] = [];
  passage.forEach((verse, ayah) => {
    const orthographicWords = normalizedVerseWords(verse);
    const recitationWords = recitationVerseWords(verse);
    const displayWords = verse.text.trim().split(/\s+/).filter((word) => normalizeArabic(word));
    orthographicWords.forEach((word, index) => canonical.push({
      units: { orthographic: word, recitation: recitationWords[index] ?? normalizeQuranRecitation(word) },
      ayah,
      verseKey: verse.verseKey,
      wordIndex: index,
      globalWordIndex: canonical.length,
      displayText: displayWords[index] ?? word,
    }));
  });
  return canonical;
}

/**
 * A lone early token can be Whisper output during silence. When the same ayah
 * has a later, coherent run of aligned tokens, use that run as the onset
 * anchor. One-token recordings remain supported: there is no invented delay.
 */
function selectFirstAyahOnsetAnchor(evidence: readonly AlignedAyahEvidence[]): AlignedAyahEvidence | null {
  if (!evidence.length) return null;
  const strong = evidence.filter((item) => item.similarity >= 0.7);
  const candidates = (strong.length ? strong : evidence).slice().sort((left, right) => left.token.startMs - right.token.startMs);
  if (candidates.length === 1) return candidates[0];
  const clusters: AlignedAyahEvidence[][] = [];
  for (const item of candidates) {
    const current = clusters.at(-1);
    if (!current || item.token.startMs - current.at(-1)!.token.endMs > 1_800) clusters.push([item]);
    else current.push(item);
  }
  const best = clusters.reduce((winner, cluster) => {
    const score = (items: readonly AlignedAyahEvidence[]) => {
      const distinctWords = new Set(items.map((item) => item.canonicalWordIndex)).size;
      const averageSimilarity = items.reduce((sum, item) => sum + item.similarity, 0) / items.length;
      return items.length + distinctWords * 0.5 + averageSimilarity;
    };
    return score(cluster) > score(winner) ? cluster : winner;
  });
  return best[0] ?? null;
}

function earliestAudioActivityCandidate(audioAnalysis: AudioAnalysis | undefined): number | null {
  if (!audioAnalysis?.rms.length) return null;
  const values = [...audioAnalysis.rms].sort((left, right) => left - right);
  const floor = values[Math.floor((values.length - 1) * 0.2)] ?? 0;
  const peak = values.at(-1) ?? floor;
  const threshold = floor + (peak - floor) * 0.16;
  const index = audioAnalysis.rms.findIndex((value) => value > threshold);
  return index < 0 ? null : index * audioAnalysis.windowMs;
}

function reconstructPassage(
  selected: ScoredCandidate,
  chunks: readonly TranscriptChunk[],
  verses: readonly QuranCorpusVerse[],
  audioAnalysis?: AudioAnalysis,
): { matches: RecognitionMatch[]; timingTrace: RecognitionTimingTrace } {
  const passage = verses.slice(selected.start, selected.end + 1);
  const canonical = canonicalPassageTokens(passage);
  const allEvidence = timedTokens(chunks);
  // Whole-recording fallback chunks help select the passage, but once local
  // recovery exists they must not compete with its ordered temporal anchors.
  const evidence = allEvidence.some((token) => token.source !== "chunk-coarse")
    ? allEvidence.filter((token) => token.source !== "chunk-coarse")
    : allEvidence;
  const aligned = selected.alignment;
  if (aligned.firstCanonicalIndex === null || aligned.lastCanonicalIndex === null) {
    return { matches: [], timingTrace: {
      earliestAudioActivityCandidateMs: earliestAudioActivityCandidate(audioAnalysis),
      firstAsrChunkStartMs: chunks.length ? Math.min(...chunks.map((chunk) => chunk.startMs)) : null,
      firstAsrTimestampedWordMs: null,
      firstAsrWordAlignedToDetectedQuranMs: null,
      firstCanonicalQuranWordSupported: null,
      firstStrongAlignmentAnchorMs: null,
      pcmLocalOnsetCandidateMs: null,
      rawVerseAlignmentStartMs: null,
      verseAlignmentStartMs: null,
      verses: [],
    } };
  }
  // Passage selection identifies contiguous ayat. Missing boundary ASR words
  // are ambiguous, so the canonical display range defaults to full ayat.
  const activeStart = 0;
  const activeEnd = passage.length - 1;
  const byAyah = passage.map(() => [] as TimedToken[]);
  const alignedEvidenceByAyah = passage.map(() => [] as AlignedAyahEvidence[]);
  const textByAyah = passage.map(() => [] as string[]);
  const matchedWordsByAyah = passage.map(() => new Set<number>());
  const qualityByAyah = passage.map(() => [] as number[]);
  aligned.matched.forEach((tokens, canonicalIndex) => {
    const ayah = canonical[canonicalIndex].ayah;
    byAyah[ayah].push(...tokens);
    textByAyah[ayah].push(...tokens.map((token) => token.displayText));
    matchedWordsByAyah[ayah].add(canonical[canonicalIndex].wordIndex);
    qualityByAyah[ayah].push(...(aligned.similarities.get(canonicalIndex) ?? []));
    const similarities = aligned.similarities.get(canonicalIndex) ?? [];
    tokens.forEach((token, tokenIndex) => alignedEvidenceByAyah[ayah].push({
      token,
      canonicalWordIndex: canonical[canonicalIndex].wordIndex,
      similarity: similarities[tokenIndex] ?? 0,
    }));
  });
  const sourceDuration = Math.max(0, audioAnalysis?.durationMs ?? 0, ...chunks.map((chunk) => chunk.endMs));
  // Once local recovery or word offsets are available, a whole-recording
  // coarse chunk must not pull a verse back into its leading silence.
  const temporalTokensByAyah = byAyah.map((tokens) => {
    const temporal = tokens.filter((token) => token.source !== "chunk-coarse");
    return temporal.length ? temporal : tokens;
  });
  const rawStarts = temporalTokensByAyah.map((tokens) => tokens.length ? Math.min(...tokens.map((token) => token.startMs)) : null);
  const rawEnds = temporalTokensByAyah.map((tokens) => tokens.length ? Math.max(...tokens.map((token) => token.endMs)) : null);
  const starts = [...rawStarts];
  const ends = [...rawEnds];
  // Missing evidence is interpolated between textual neighbours, never assigned to a
  // silence gap. This is what retains weak interior ayat such as 6:75.
  for (let index = 0; index < passage.length; index += 1) {
    if (starts[index] !== null && ends[index] !== null) continue;
    let previous = index - 1;
    while (previous >= 0 && ends[previous] === null) previous -= 1;
    let next = index + 1;
    while (next < passage.length && starts[next] === null) next += 1;
    const left = previous >= 0 ? ends[previous]! : evidence[0]?.startMs ?? 0;
    const right = next < passage.length ? starts[next]! : evidence.at(-1)?.endMs ?? sourceDuration;
    const share = (right - left) / (next - previous);
    starts[index] = Math.round(left + share * (index - previous - 1));
    ends[index] = Math.round(left + share * (index - previous));
  }
  const evidenceSourceFor = (tokens: readonly TimedToken[]): TimingEvidenceSource => {
    if (tokens.some((token) => token.hasWordTimestamp)) return "word-timestamp";
    if (tokens.some((token) => token.source === "micro-asr")) return "micro-asr";
    if (tokens.length) return "chunk-coarse";
    return "interpolated";
  };
  const startSources = passage.map<RecognitionMatch["timing"]["start"]["source"]>((_, index) => evidenceSourceFor(byAyah[index]));
  const endSources = [...startSources];

  // Refine only expected canonical verse transitions.  Energy is never scanned
  // as a generic segmenter, so breaths surrounded by tokens from one ayah are
  // intentionally ignored.
  for (let index = activeStart; index < activeEnd; index += 1) {
    const previous = temporalTokensByAyah[index];
    const next = temporalTokensByAyah[index + 1];
    const previousLast = previous.length ? Math.max(...previous.map((token) => token.endMs)) : null;
    const nextFirst = next.length ? Math.min(...next.map((token) => token.startMs)) : null;
    if (previousLast === null || nextFirst === null
      || previous.every((token) => token.source === "chunk-coarse")
      || next.every((token) => token.source === "chunk-coarse")) continue;
    const refined = audioAnalysis ? refineTransitionWithEnergy(audioAnalysis, previousLast, nextFirst) : null;
    if (refined?.foundGap) {
      ends[index] = Math.max(starts[index] ?? 0, refined.speechOffsetMs);
      starts[index + 1] = Math.max(ends[index]!, refined.speechOnsetMs);
      endSources[index] = "pcm-refined";
      startSources[index + 1] = "pcm-refined";
    } else {
      // Connected recitation gets a textual transition inside the two observed
      // words, rather than a made-up silence or an early next-ayah display.
      const transition = Math.round((previousLast + nextFirst) / 2);
      ends[index] = Math.max(starts[index] ?? 0, transition);
      starts[index + 1] = Math.max(transition, starts[index + 1] ?? transition);
    }
  }
  const lastTokens = temporalTokensByAyah[activeEnd];
  const rawFirstStartMs = starts[activeStart] ?? null;
  const firstAnchor = selectFirstAyahOnsetAnchor(alignedEvidenceByAyah[activeStart]
    .filter((item) => item.token.source !== "chunk-coarse"));
  const firstCanonicalWordSupported = firstAnchor ? firstAnchor.canonicalWordIndex + 1 : null;
  const onsetLookbackMs = firstAnchor
    ? Math.min(1_600, Math.max(360, 280 + firstAnchor.canonicalWordIndex * 160))
    : 0;
  const onsetCorridorStartMs = firstAnchor ? Math.max(0, firstAnchor.token.startMs - onsetLookbackMs) : null;
  const onsetCorridorEndMs = firstAnchor ? Math.min(sourceDuration, firstAnchor.token.startMs + 180) : null;
  const pcmLocalOnsetCandidateMs = audioAnalysis && firstAnchor
    ? refineFirstAyahOnsetWithEnergy(audioAnalysis, firstAnchor.token.startMs, onsetLookbackMs)
    : null;
  // Never use generic audio activity here. The anchor is Quran identity; PCM
  // only sharpens it within the bounded local corridor.
  if (firstAnchor) {
    const refinedStart = pcmLocalOnsetCandidateMs ?? firstAnchor.token.startMs;
    starts[activeStart] = Math.max(0, Math.min(refinedStart, ends[activeStart]! - 1));
    if (pcmLocalOnsetCandidateMs !== null) startSources[activeStart] = "pcm-refined";
  }
  if (audioAnalysis && lastTokens.length) {
    const refined = refineWordEdgeWithEnergy(audioAnalysis, Math.max(...lastTokens.map((token) => token.endMs)), "end");
    if (refined !== null) {
      ends[activeEnd] = Math.max(starts[activeEnd]! + 1, Math.min(sourceDuration, refined));
      endSources[activeEnd] = "pcm-refined";
    }
  }
  const matches = passage.slice(activeStart, activeEnd + 1).map((verse, offset) => {
    const index = activeStart + offset;
    const startMs = Math.round(Math.max(0, Math.min(sourceDuration, starts[index] ?? 0)));
    const endMs = Math.round(Math.max(startMs + 1, Math.min(sourceDuration, ends[index] ?? startMs + 1)));
    return {
      verseKey: verse.verseKey,
      startMs,
      endMs,
      // This is passage identity confidence. Timing confidence is carried
      // separately in timing evidence and ForcedVerseTiming coverage.
      confidence: Number(selected.mappingQuality.toFixed(4)),
      timing: {
        start: { timestampMs: startMs, source: startSources[index] },
        end: { timestampMs: endMs, source: endSources[index] },
        matchedText: textByAyah[index].join(" "),
      },
      wordSupport: {
        canonicalStartWordIndex: 1,
        canonicalEndWordIndex: normalizedVerseWords(verse).length,
        matchedCanonicalWordCount: matchedWordsByAyah[index].size,
        canonicalWordCount: normalizedVerseWords(verse).length,
        coverage: Number((matchedWordsByAyah[index].size / Math.max(1, normalizedVerseWords(verse).length)).toFixed(4)),
        evidenceQuality: Number(((qualityByAyah[index].reduce((sum, value) => sum + value, 0) / Math.max(1, qualityByAyah[index].length))).toFixed(4)),
      },
    };
  });
  const verseTrace = matches.map((match, offset) => {
    const index = activeStart + offset;
    const evidenceForVerse = alignedEvidenceByAyah[index];
    const anchor = index === activeStart ? firstAnchor : selectFirstAyahOnsetAnchor(evidenceForVerse);
    return {
      verseKey: match.verseKey,
      firstAlignedAsrEvidenceMs: evidenceForVerse.length ? Math.min(...evidenceForVerse.map((item) => item.token.startMs)) : null,
      firstStrongAlignmentAnchorMs: anchor?.token.startMs ?? null,
      firstCanonicalWordSupported: anchor ? anchor.canonicalWordIndex + 1 : null,
      onsetCorridorStartMs: index === activeStart ? onsetCorridorStartMs : null,
      onsetCorridorEndMs: index === activeStart ? onsetCorridorEndMs : null,
      pcmLocalOnsetCandidateMs: index === activeStart ? pcmLocalOnsetCandidateMs : null,
      rawVerseAlignmentStartMs: index === activeStart ? rawFirstStartMs ?? match.startMs : rawStarts[index] ?? match.startMs,
      verseAlignmentStartMs: match.startMs,
      verseAlignmentEndMs: match.endMs,
    };
  });
  const firstAlignedWord = verseTrace[0]?.firstAlignedAsrEvidenceMs ?? null;
  return { matches, timingTrace: {
    earliestAudioActivityCandidateMs: earliestAudioActivityCandidate(audioAnalysis),
    firstAsrChunkStartMs: chunks.length ? Math.min(...chunks.map((chunk) => chunk.startMs)) : null,
    firstAsrTimestampedWordMs: evidence.length ? Math.min(...evidence.map((token) => token.startMs)) : null,
    firstAsrWordAlignedToDetectedQuranMs: firstAlignedWord,
    firstCanonicalQuranWordSupported: firstCanonicalWordSupported,
    firstStrongAlignmentAnchorMs: firstAnchor?.token.startMs ?? null,
    pcmLocalOnsetCandidateMs,
    rawVerseAlignmentStartMs: rawFirstStartMs,
    verseAlignmentStartMs: matches[0]?.startMs ?? null,
    verses: verseTrace,
  } };
}

/**
 * Second-pass, canonical-first timing. The selected passage is fixed before
 * this runs; ASR text is therefore evidence for where a known Quran word was
 * heard, never the source of the displayed Quran text. The small backward
 * allowance represents a reciter repeating a local phrase without permitting
 * a jump to another Quran location.
 */
function hasMeaningfulBackwardRepeat(
  canonical: readonly CanonicalToken[],
  evidence: readonly TimedToken[],
  tokenIndex: number,
  canonicalIndex: number,
): boolean {
  const nextToken = evidence[tokenIndex + 1];
  const nextCanonical = canonical[canonicalIndex + 1];
  // A lone noisy backwards token is not a recitation repeat. Require the next
  // lexical observation to continue the repeated phrase in canonical order.
  return Boolean(nextToken && nextCanonical
    && recognitionUnitSimilarity(nextCanonical.units, nextToken.units) >= 0.62);
}

function positivePartialBoundary(
  heard: readonly WordOccurrence[],
  wordCount: number,
  edge: "start" | "end",
  audioAnalysis?: AudioAnalysis,
): boolean {
  const direct = heard.filter((word) => word.evidence === "direct-word-alignment");
  const edgeWord = edge === "start" ? direct[0] : direct.at(-1);
  if (!edgeWord) return false;
  if (edge === "start" && edgeWord.canonicalWordIndex <= 1) return false;
  if (edge === "end" && edgeWord.canonicalWordIndex >= wordCount) return false;
  const regions = audioAnalysis ? detectSpeechRegions(audioAnalysis) : [];
  const region = regions.find((item) => edge === "start"
    ? edgeWord.startMs >= item.startMs && edgeWord.startMs <= item.endMs
    : edgeWord.endMs >= item.startMs && edgeWord.endMs <= item.endMs);
  if (!region) return false;
  const missingWords = edge === "start"
    ? edgeWord.canonicalWordIndex - 1
    : wordCount - edgeWord.canonicalWordIndex;
  const availableSpeechMs = edge === "start"
    ? edgeWord.startMs - region.startMs
    : region.endMs - edgeWord.endMs;
  // Positive evidence means actual speech begins/ends too close to the later
  // canonical word for the omitted words to fit. Mere ASR absence is ignored.
  return availableSpeechMs <= Math.max(120, missingWords * 160);
}

function forceAlignPassage(
  selected: ScoredCandidate,
  chunks: readonly TranscriptChunk[],
  verses: readonly QuranCorpusVerse[],
  matches: readonly RecognitionMatch[],
  audioAnalysis?: AudioAnalysis,
  timingRecoveryAttempted = false,
): ForcedAlignment | null {
  const canonical = canonicalPassageTokens(verses.slice(selected.start, selected.end + 1));
  if (!canonical.length) return null;
  const canonicalPassage = canonical.map((word, index) => ({
    verseKey: word.verseKey,
    canonicalWordIndex: word.wordIndex + 1,
    globalWordIndex: index + 1,
    canonicalText: word.displayText,
    normalizedText: word.units.orthographic,
  }));
  const allEvidence = timedTokens(chunks);
  const evidence = allEvidence.some((token) => token.source !== "chunk-coarse")
    ? allEvidence.filter((token) => token.source !== "chunk-coarse")
    : allEvidence;
  const occurrences: WordOccurrence[] = [];
  let cursor = 0;
  for (const [tokenIndex, token] of evidence.entries()) {
    const lower = Math.max(0, cursor - 5);
    const upper = Math.min(canonical.length - 1, cursor + 10);
    let winner: { index: number; similarity: number; value: number } | null = null;
    for (let index = lower; index <= upper; index += 1) {
      const similarity = recognitionUnitSimilarity(canonical[index].units, token.units);
      const movement = index - cursor;
      const value = similarity * 2 - (movement < 0 ? Math.abs(movement) * 0.055 : movement * 0.012);
      if (!winner || value > winner.value) winner = { index, similarity, value };
    }
    if (!winner || winner.similarity < 0.58) continue;
    if (winner.index < cursor && !hasMeaningfulBackwardRepeat(canonical, evidence, tokenIndex, winner.index)) continue;
    const occurrenceIndex = occurrences.filter((item) => item.globalWordIndex === winner.index + 1).length + 1;
    let startMs = Math.round(token.startMs);
    let endMs = Math.max(startMs + 1, Math.round(token.endMs));
    let pcmRefined = false;
    // Segment-level timing may be refined at its edges, but never converted to
    // a synthetic per-word anchor.
    if (audioAnalysis && token.hasWordTimestamp) {
      const refinedStart = refineWordEdgeWithEnergy(audioAnalysis, startMs, "start");
      const refinedEnd = refineWordEdgeWithEnergy(audioAnalysis, endMs, "end");
      if (refinedStart !== null && refinedStart <= endMs) { startMs = refinedStart; pcmRefined = true; }
      if (refinedEnd !== null && refinedEnd >= startMs) { endMs = refinedEnd; pcmRefined = true; }
    }
    occurrences.push({
      ...canonicalPassage[winner.index],
      occurrenceIndex,
      startMs,
      endMs,
      confidence: Number(winner.similarity.toFixed(4)),
      evidence: token.hasWordTimestamp ? "direct-word-alignment" : token.source === "micro-asr" ? "micro-asr" : "chunk-coarse",
      pcmRefined,
      asrText: token.displayText,
    });
    cursor = winner.index;
  }

  const recoveryAttempted = timingRecoveryAttempted || chunks.some((chunk) => chunk.timingSource === "micro-asr");
  const relevantVerseKeys = [...new Set(canonical.map((word) => word.verseKey))];
  const verseTimings = relevantVerseKeys.map((verseKey) => {
    const verseWords = canonicalPassage.filter((word) => word.verseKey === verseKey);
    const heard = occurrences.filter((word) => word.verseKey === verseKey);
    const direct = heard.filter((word) => word.evidence === "direct-word-alignment");
    const recovered = heard.filter((word) => word.evidence === "micro-asr");
    const fallback = matches.find((match) => match.verseKey === verseKey);
    const confidence = direct.length
      ? direct.reduce((sum, word) => sum + word.confidence, 0) / direct.length
      : recovered.length
        ? recovered.reduce((sum, word) => sum + word.confidence, 0) / recovered.length * 0.82
        : (fallback?.confidence ?? 0) * 0.55;
    return {
      verseKey,
      startMs: Math.round(fallback?.startMs ?? heard[0]?.startMs ?? 0),
      endMs: Math.max(Math.round((fallback?.endMs ?? heard.at(-1)?.endMs ?? 1)), Math.round((fallback?.startMs ?? 0) + 1)),
      firstCanonicalWordIndex: 1,
      lastCanonicalWordIndex: verseWords.length,
      partialStart: positivePartialBoundary(heard, verseWords.length, "start", audioAnalysis),
      partialEnd: positivePartialBoundary(heard, verseWords.length, "end", audioAnalysis),
      confidence: Number(confidence.toFixed(4)),
      startEvidence: fallback?.timing.start.source ?? "unknown",
      endEvidence: fallback?.timing.end.source ?? "unknown",
      directWordCount: direct.length,
      recoveredWordCount: recovered.length,
      recoveryAttempted,
    };
  });

  const canonicalWordAlignments: CanonicalWordAlignment[] = canonicalPassage.map((word) => {
    const timing = verseTimings.find((item) => item.verseKey === word.verseKey)!;
    const wordCount = Math.max(1, timing.lastCanonicalWordIndex);
    const duration = Math.max(wordCount, timing.endMs - timing.startMs);
    const estimatedStart = Math.round(timing.startMs + duration * (word.canonicalWordIndex - 1) / wordCount);
    const estimatedEnd = Math.max(estimatedStart + 1, Math.round(timing.startMs + duration * word.canonicalWordIndex / wordCount));
    const observed = occurrences.filter((item) => item.globalWordIndex === word.globalWordIndex).at(-1);
    const directMatch = observed?.evidence === "direct-word-alignment";
    const recoveredMatch = observed?.evidence === "micro-asr";
    return {
      ...word,
      startMs: directMatch ? observed.startMs : estimatedStart,
      endMs: directMatch ? observed.endMs : estimatedEnd,
      timingEvidence: directMatch ? (observed.pcmRefined ? "pcm-refined" : "word-timestamp") : recoveredMatch ? "micro-asr" : "interpolated",
      confidence: Number((directMatch ? observed.confidence : recoveredMatch ? observed.confidence * 0.75 : timing.confidence * 0.55).toFixed(4)),
      directMatch,
      recoveredMatch,
    };
  });

  const pauseCandidates: PauseCandidate[] = [];
  for (let index = 0; index < occurrences.length - 1; index += 1) {
    const previous = occurrences[index];
    const next = occurrences[index + 1];
    if (next.startMs <= previous.endMs || next.globalWordIndex < previous.globalWordIndex) continue;
    const refined = audioAnalysis ? refineTransitionWithEnergy(audioAnalysis, previous.endMs, next.startMs) : null;
    const startMs = refined?.speechOffsetMs ?? previous.endMs;
    const endMs = refined?.speechOnsetMs ?? next.startMs;
    const durationMs = endMs - startMs;
    if (durationMs < 80) continue;
    pauseCandidates.push({
      afterVerseKey: previous.verseKey,
      afterWordIndex: previous.canonicalWordIndex,
      startMs,
      endMs,
      durationMs,
      depth: refined?.foundGap ? 0.6 : 0.3,
      confidence: Math.min(previous.confidence, next.confidence),
      score: Number(Math.min(1, durationMs / 700 + (refined?.foundGap ? 0.2 : 0)).toFixed(4)),
    });
  }

  // Automatic long-ayah splitting stays in the model via pauseCandidates, but
  // is intentionally disabled: one full canonical ayah is one display set.
  const captionSets = verseTimings.map((timing) => ({
    id: `${timing.verseKey}#1-${timing.lastCanonicalWordIndex}`,
    verseKey: timing.verseKey,
    canonicalStartWordIndex: 1,
    canonicalEndWordIndex: timing.lastCanonicalWordIndex,
    startMs: timing.startMs,
    endMs: timing.endMs,
    cutReason: "whole-ayah" as const,
  }));
  for (let index = 0; index < captionSets.length - 1; index += 1) {
    captionSets[index].endMs = Math.max(captionSets[index].startMs + 1, captionSets[index + 1].startMs);
  }
  return { canonicalPassage, canonicalWordAlignments, wordOccurrences: occurrences, verseTimings, pauseCandidates, captionSets };
}

function timingRecoveryPlan(
  forcedAlignment: ForcedAlignment | null,
  matches: readonly RecognitionMatch[],
  audioAnalysis: AudioAnalysis | undefined,
  timestampMode: "word" | "chunk-fallback",
): TimingRecoveryPlan | null {
  if (!forcedAlignment?.verseTimings.length) return null;
  const recoveryAttempted = forcedAlignment.verseTimings.some((item) => item.recoveryAttempted);
  const missingVerseKeys = forcedAlignment.verseTimings
    .filter((item) => item.directWordCount === 0 && item.recoveredWordCount === 0)
    .map((item) => item.verseKey);
  const first = forcedAlignment.verseTimings[0];
  const firstOnsetRequired = timestampMode === "chunk-fallback" || first.startEvidence === "chunk-coarse" || first.startEvidence === "interpolated";
  const required = !recoveryAttempted && (timestampMode === "chunk-fallback" || missingVerseKeys.length > 0 || firstOnsetRequired);
  if (!required) return {
    required: false,
    timestampMode,
    windows: [],
    missingVerseKeys,
    firstOnsetRequired,
  };

  const windows: TimingRecoveryWindow[] = [];
  const addWindow = (startMs: number, endMs: number, verseKeys: string[], reason: TimingRecoveryWindow["reason"]) => {
    const start = Math.max(0, Math.round(startMs));
    const end = Math.max(start + 1, Math.round(endMs));
    if (windows.some((item) => item.reason === reason && Math.abs(item.startMs - start) < 500 && Math.abs(item.endMs - end) < 500)) return;
    windows.push({ startMs: start, endMs: end, verseKeys, reason });
  };
  const allVerseKeys = forcedAlignment.verseTimings.map((item) => item.verseKey);
  const regions = audioAnalysis ? detectSpeechRegions(audioAnalysis, 450) : [];
  if (timestampMode === "chunk-fallback" && regions.length) {
    // The original 30-second chunk can place Quran text anywhere in its
    // interval. Re-read only meaningful speech regions in small overlapping
    // windows, preserving absolute source time and skipping leading quiet.
    for (const region of regions) {
      const windowMs = 8_000;
      const stepMs = 6_000;
      for (let start = region.startMs; start < region.endMs; start += stepMs) {
        addWindow(start, Math.min(region.endMs, start + windowMs), allVerseKeys, start === region.startMs ? "first-onset" : "transition");
      }
    }
  }
  for (const verseKey of missingVerseKeys) {
    const index = forcedAlignment.verseTimings.findIndex((item) => item.verseKey === verseKey);
    const previous = matches[index - 1];
    const next = matches[index + 1];
    const current = matches[index];
    const left = previous?.endMs ?? Math.max(0, (current?.startMs ?? 0) - 4_000);
    const right = next?.startMs ?? Math.min(audioAnalysis?.durationMs ?? current?.endMs ?? left + 8_000, (current?.endMs ?? left + 4_000) + 4_000);
    addWindow(Math.max(0, left - 700), Math.max(left + 1, right + 700), [verseKey], "missing-verse");
  }
  if (firstOnsetRequired && !windows.some((item) => item.reason === "first-onset")) {
    const firstMatch = matches[0];
    addWindow(Math.max(0, (firstMatch?.startMs ?? 0) - 1_000), Math.min(audioAnalysis?.durationMs ?? firstMatch?.endMs ?? 8_000, (firstMatch?.startMs ?? 0) + 7_000), [first.verseKey], "first-onset");
  }
  return { required, timestampMode, windows: windows.slice(0, 16), missingVerseKeys, firstOnsetRequired };
}

type LocalCandidate = {
  start: number;
  end: number;
  score: number;
  textSimilarity: number;
  tokenSequenceSimilarity: number;
};

type ScoredCandidate = LocalCandidate & {
  transcriptCoverage?: number;
  canonicalCoverage?: number;
  consecutiveAyat?: number;
  mappingQuality: number;
  alignment: TokenAlignment;
};

/**
 * Scores one contiguous Quran window against all timestamped ASR evidence.
 * No chunk gets to choose a verse: chunks only help retrieve possible anchors.
 */
function scorePassageCandidate(
  start: number,
  end: number,
  evidence: readonly TimedToken[],
  transcriptUnits: QuranRecognitionUnits,
  verses: readonly QuranCorpusVerse[],
): ScoredCandidate {
  const passage = verses.slice(start, end + 1);
  const canonical = canonicalPassageTokens(passage);
  const alignment = alignTokens(canonical, evidence);
  const matchedAsr = alignment.matchedAsrIndexes;
  const supportedAyat = new Set<number>();
  let similarityTotal = 0;
  let similarityCount = 0;
  alignment.matched.forEach((tokens, canonicalIndex) => {
    if (!tokens.length) return;
    supportedAyat.add(canonical[canonicalIndex].ayah);
    for (const token of tokens) {
      similarityTotal += recognitionUnitSimilarity(canonical[canonicalIndex].units, token.units);
      similarityCount += 1;
    }
  });
  let longestRun = 0;
  let run = 0;
  for (let ayah = 0; ayah < passage.length; ayah += 1) {
    run = supportedAyat.has(ayah) ? run + 1 : 0;
    longestRun = Math.max(longestRun, run);
  }
  const averageSimilarity = similarityCount ? similarityTotal / similarityCount : 0;
  const transcriptCoverage = evidence.length ? matchedAsr.size / evidence.length : 0;
  const spanLength = alignment.firstCanonicalIndex === null || alignment.lastCanonicalIndex === null ? 0 : alignment.lastCanonicalIndex - alignment.firstCanonicalIndex + 1;
  const canonicalCoverage = spanLength ? alignment.matched.size / spanLength : 0;
  const sequenceConsistency = passage.length ? longestRun / passage.length : 0;
  const textSimilarity = combinedTextSimilarity(transcriptUnits, {
    orthographic: passage.map(normalizedVerseText).join(" "),
    recitation: passage.map(recitationVerseText).join(" "),
  });
  const explainedLength = Math.min(1, matchedAsr.size / 6);
  // A clean late subsection cannot beat a longer, slightly noisy explanation:
  // all transcript tokens participate and coverage carries the largest weight.
  const mappingQuality = averageSimilarity === 1 && transcriptCoverage === 1 && canonicalCoverage === 1 && sequenceConsistency === 1 ? 1 : averageSimilarity * 0.3
    + transcriptCoverage * 0.42
    + canonicalCoverage * 0.08
    + sequenceConsistency * 0.1
    + explainedLength * 0.1;
  return { start, end, score: mappingQuality, mappingQuality, textSimilarity, tokenSequenceSimilarity: averageSimilarity, transcriptCoverage, canonicalCoverage, consecutiveAyat: longestRun, alignment };
}

function globalCandidateStarts(
  chunks: readonly TranscriptChunk[],
  transcriptUnits: QuranRecognitionUnits,
  verses: readonly QuranCorpusVerse[],
  maxPassageVerses: number,
  priorityStarts: readonly number[],
): { starts: number[]; path: CandidateStarts["path"] } {
  const priority = [...new Set(priorityStarts)];
  const starts = new Set(priority);
  // Local retrieval commonly lands on the clean second ayah. Expand around it
  // before detailed alignment so the preceding partial ayah is a real option.
  for (const anchor of priority) {
    const surah = verses[anchor]?.verseKey.split(":")[0];
    for (let offset = 1; offset <= 5; offset += 1) {
      const previous = anchor - offset;
      if (previous >= 0 && verses[previous]?.verseKey.split(":")[0] === surah) starts.add(previous);
    }
  }
  const transcriptWordCount = chunks.reduce((count, chunk) => count + normalizeArabic(chunk.text).split(" ").filter(Boolean).length, 0);
  let usedFallback = false;
  if (transcriptWordCount <= 12 || priority.length === 0) {
    const fullResult = candidateStarts(transcriptUnits, verses, maxPassageVerses);
    usedFallback ||= fullResult.path === "character-fallback";
    fullResult.starts.forEach((start) => starts.add(start));
    for (const chunk of chunks) {
      const normalized = normalizeArabic(chunk.text);
      if (!normalized) continue;
      const result = candidateStarts(quranRecognitionUnits(normalized, chunk.text), verses, maxPassageVerses);
      usedFallback ||= result.path === "character-fallback";
      result.starts.forEach((start) => starts.add(start));
    }
  }
  // A long recording already has several locally-ranked anchors. Reserving
  // broad alternatives for short recordings keeps the all-browser pass bounded
  // while preserving ambiguity detection for terse repeated phrases.
  const generic = [...starts].filter((start) => !priority.includes(start)).slice(0, transcriptWordCount <= 12 ? 8 : 0);
  return { starts: [...priority, ...generic], path: usedFallback && starts.size === 0 ? "character-fallback" : "token-retrieval" };
}

function scoreGlobalPassages(
  chunks: readonly TranscriptChunk[],
  verses: readonly QuranCorpusVerse[],
  maxPassageVerses: number,
  priorityStarts: readonly number[],
): { candidates: ScoredCandidate[]; path: CandidateStarts["path"]; evidence: TimedToken[]; transcriptUnits: QuranRecognitionUnits } {
  const transcript = chunks.map((chunk) => chunk.text).join(" ");
  const normalized = normalizeArabic(transcript);
  const transcriptUnits = quranRecognitionUnits(normalized, transcript);
  // Passage matching is textual: timestamp mode and word offsets cannot
  // change its token sequence or its confidence.
  const evidence = transcriptTokens(chunks);
  const starts = globalCandidateStarts(chunks, transcriptUnits, verses, maxPassageVerses, priorityStarts);
  const candidates: ScoredCandidate[] = [];
  const seen = new Set<string>();
  for (const start of starts.starts) {
    const surah = verses[start]?.verseKey.split(":")[0];
    for (let end = start; end < Math.min(verses.length, start + maxPassageVerses); end += 1) {
      if (verses[end].verseKey.split(":")[0] !== surah) break;
      const key = `${start}:${end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(scorePassageCandidate(start, end, evidence, transcriptUnits, verses));
    }
  }
  candidates.sort((left, right) => right.score - left.score || right.transcriptCoverage! - left.transcriptCoverage! || left.start - right.start);
  return { candidates, path: starts.path, evidence, transcriptUnits };
}

function passageDiagnostic(candidate: ScoredCandidate, verses: readonly QuranCorpusVerse[]): PassageCandidateDiagnostic {
  const confidence = confidenceFor(candidate.score, verses.slice(candidate.start, candidate.end + 1).map(normalizedVerseText).join(" "));
  const canonical = canonicalPassageTokens(verses.slice(candidate.start, candidate.end + 1));
  const first = candidate.alignment.firstCanonicalIndex === null ? canonical[0] : canonical[candidate.alignment.firstCanonicalIndex];
  const last = candidate.alignment.lastCanonicalIndex === null ? canonical.at(-1) : canonical[candidate.alignment.lastCanonicalIndex];
  const matchedAsr = [...candidate.alignment.matchedAsrIndexes].sort((left, right) => left - right);
  return {
    startVerseKey: first?.verseKey ?? verses[candidate.start].verseKey,
    endVerseKey: last?.verseKey ?? verses[candidate.end].verseKey,
    firstWordIndex: (first?.wordIndex ?? 0) + 1,
    lastWordIndex: (last?.wordIndex ?? 0) + 1,
    totalScore: Number(candidate.score.toFixed(4)),
    confidence: Number(confidence.toFixed(4)),
    textSimilarity: Number(candidate.textSimilarity.toFixed(4)),
    sequenceConsistency: Number(((candidate.consecutiveAyat ?? 0) / (candidate.end - candidate.start + 1)).toFixed(4)),
    transcriptCoverage: Number((candidate.transcriptCoverage ?? 0).toFixed(4)),
    canonicalCoverage: Number((candidate.canonicalCoverage ?? 0).toFixed(4)),
    consecutiveAyat: candidate.consecutiveAyat ?? 0,
    explainedTranscriptTokens: matchedAsr.length,
    unexplainedTranscriptBefore: matchedAsr[0] ?? 0,
    unexplainedTranscriptAfter: matchedAsr.length ? candidate.alignment.evidenceTokenCount - matchedAsr.at(-1)! - 1 : candidate.alignment.evidenceTokenCount,
  };
}

function canonicalSpan(candidate: ScoredCandidate, verses: readonly QuranCorpusVerse[]): CanonicalSpan | null {
  if (candidate.alignment.firstCanonicalIndex === null || candidate.alignment.lastCanonicalIndex === null) return null;
  const canonical = canonicalPassageTokens(verses.slice(candidate.start, candidate.end + 1));
  const first = canonical[candidate.alignment.firstCanonicalIndex];
  const last = canonical[candidate.alignment.lastCanonicalIndex];
  if (!first || !last) return null;
  const coveredVerseKeys = [...new Set(canonical.slice(candidate.alignment.firstCanonicalIndex, candidate.alignment.lastCanonicalIndex + 1).map((token) => token.verseKey))];
  const lastWordCount = normalizedVerseWords(verses[candidate.start + last.ayah]).length;
  return {
    surah: Number(first.verseKey.split(":")[0]),
    firstVerseKey: first.verseKey,
    firstWordIndex: first.wordIndex + 1,
    firstWordText: first.displayText,
    firstBoundary: first.wordIndex === 0 ? "verse-beginning" : "mid-verse",
    lastVerseKey: last.verseKey,
    lastWordIndex: last.wordIndex + 1,
    lastWordText: last.displayText,
    lastBoundary: last.wordIndex === lastWordCount - 1 ? "verse-end" : "mid-verse",
    coveredVerseKeys,
  };
}

function bestCandidateForStarts(
  units: QuranRecognitionUnits,
  starts: readonly number[],
  verses: readonly QuranCorpusVerse[],
  maxVersesPerChunk: number,
): LocalCandidate | null {
  let best: LocalCandidate | null = null;
  for (const start of starts) {
    let combinedOrthographic = "";
    let combinedRecitation = "";
    for (let end = start; end < Math.min(verses.length, start + maxVersesPerChunk); end += 1) {
      combinedOrthographic = `${combinedOrthographic} ${normalizedVerseText(verses[end])}`.trim();
      combinedRecitation = `${combinedRecitation} ${recitationVerseText(verses[end])}`.trim();
      const candidateUnits = { orthographic: combinedOrthographic, recitation: combinedRecitation };
      const textSimilarity = combinedTextSimilarity(units, candidateUnits);
      const sequenceSimilarity = combinedTokenSequenceSimilarity(units, candidateUnits);
      const score = textSimilarity * 0.45 + sequenceSimilarity * 0.55;
      if (!best || score > best.score || (score === best.score && end - start < best.end - best.start)) {
        best = { start, end, score, textSimilarity, tokenSequenceSimilarity: sequenceSimilarity };
      }
    }
  }
  return best;
}

function diagnosticCandidate(best: LocalCandidate, verses: readonly QuranCorpusVerse[], normalizedText: string) {
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

export type RecognitionOptions = {
  corpus?: readonly QuranCorpusVerse[];
  minConfidence?: number;
  maxVersesPerChunk?: number;
  maxPassageVerses?: number;
  ambiguityMargin?: number;
  /** Local decoded PCM envelope from the same recording, never uploaded. */
  audioAnalysis?: AudioAnalysis;
  /** Chunk fallback is useful lexical evidence but cannot be treated as word
   * timing. The browser passes this directly from its transcriber result. */
  timestampMode?: "word" | "chunk-fallback";
  /**
   * Bounded local ASR output is timing-only evidence for an already-selected
   * passage. It is deliberately excluded from candidate retrieval and passage
   * confidence scoring.
   */
  timingEvidenceChunks?: readonly TranscriptChunk[];
  /** Records an attempted browser recovery even when local ASR returned no
   * usable Arabic text, preventing silent repeated interpolation attempts. */
  timingRecoveryAttempted?: boolean;
};

type PrimaryPassageIdentification = {
  diagnostics: RecognitionDiagnostic[];
  passage: PassageInference;
  best: ScoredCandidate | null;
};

function passageStateFor(
  best: ScoredCandidate | undefined,
  minConfidence: number,
  includeInteriorRecoveryEvidence: boolean,
): PassageAmbiguityState {
  const sufficientEvidence = Boolean(
    best
      && best.score >= minConfidence
      && (best.transcriptCoverage ?? 0) >= 0.35
      && (best.consecutiveAyat ?? 0) >= 1
      && (best.alignment.matchedAsrIndexes.size >= 3 || best.tokenSequenceSimilarity >= 0.75)
      && (best.textSimilarity >= 0.7
        || (best.consecutiveAyat ?? 0) >= 2
        // f0840e7 deliberately retained a weak interior ayah when strong
        // canonical evidence exists on both sides. This is passage evidence,
        // not timing confidence.
        || (includeInteriorRecoveryEvidence
          && best.alignment.matched.size >= 6
          && (best.transcriptCoverage ?? 0) >= 0.7)),
  );
  return sufficientEvidence ? "confident-unique" : "no-reliable-match";
}

function identifyPrimaryTranscript(
  primary: PrimaryTranscript,
  options: RecognitionOptions,
): PrimaryPassageIdentification {
  const verses = options.corpus ?? hafsVerses;
  const minConfidence = options.minConfidence ?? 0.52;
  const maxVersesPerChunk = options.maxVersesPerChunk ?? 5;
  const maxPassageVerses = options.maxPassageVerses ?? Math.max(5, Math.min(14, primary.chunks.length * 3 + 4));
  const ambiguityMargin = options.ambiguityMargin ?? 0.075;
  const orderedChunks = [...primary.chunks].sort((left, right) => left.startMs - right.startMs);
  const diagnostics: RecognitionDiagnostic[] = [];

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
    const units = quranRecognitionUnits(normalizedChunk, chunk.text);
    const candidates = candidateStarts(units, verses, maxVersesPerChunk);
    diagnostic.candidateGenerationPath = candidates.path;
    const best = bestCandidateForStarts(units, candidates.starts, verses, maxVersesPerChunk);
    if (!best) continue;
    const confidence = confidenceFor(best.score, normalizedChunk);
    diagnostic.topCandidate = diagnosticCandidate(best, verses, normalizedChunk);
    const exactSingleVerse = verses.some((verse) => normalizedVerseText(verse) === normalizedChunk);
    if (normalizedChunk.split(" ").length === 1 && candidates.starts.length > 1 && !exactSingleVerse) {
      diagnostics.push({ ...diagnostic, rejectionReason: "ambiguous short phrase" });
      continue;
    }
    if (confidence < minConfidence) {
      diagnostics.push({ ...diagnostic, rejectionReason: "below confidence threshold" });
      continue;
    }
    diagnostics.push(diagnostic);
  }

  const emptyPassage: PassageInference = {
    passageSource: "primary-transcript",
    state: "no-reliable-match", candidates: [], candidateMargin: null, selectedCandidate: null, disambiguatedByLaterChunks: false,
    canonicalSpan: null, mappingQuality: null, transcriptCoverage: null, canonicalSpanCoverage: null, uniquenessMargin: null,
    firstBoundaryConfidence: null, lastBoundaryConfidence: null, boundaryCompletion: { extendedBackward: false, extendedForward: false },
    shadowComparison: {
      stablePreF0840e7: { state: "no-reliable-match", selectedCandidate: null },
      current: { state: "no-reliable-match", selectedCandidate: null },
      regressionDetected: false,
    },
  };
  if (!primary.normalizedTokens.length || orderedChunks.some((chunk) => chunk.endMs < chunk.startMs)) {
    return { diagnostics, passage: emptyPassage, best: null };
  }

  const priorityStarts = diagnostics.flatMap((diagnostic) => {
    const key = diagnostic.topCandidate?.startVerseKey;
    const index = key ? verses.findIndex((verse) => verse.verseKey === key) : -1;
    return index >= 0 ? [index] : [];
  });
  const global = scoreGlobalPassages(orderedChunks, verses, maxPassageVerses, priorityStarts);
  const ranked = global.candidates.slice(0, 5);
  const best = ranked[0];
  const runnerUp = ranked.find((candidate) => candidate.start !== best?.start || candidate.end !== best.end);
  const margin = best && runnerUp ? best.score - runnerUp.score : null;
  const bestDiagnostic = best ? passageDiagnostic(best, verses) : null;
  const currentBaseState = passageStateFor(best, minConfidence, true);
  const sufficientEvidence = currentBaseState !== "no-reliable-match";
  const ambiguous = Boolean(
    sufficientEvidence && runnerUp && (margin ?? 0) < ambiguityMargin && runnerUp.score >= minConfidence
      && (runnerUp.transcriptCoverage ?? 0) >= (best!.transcriptCoverage ?? 0) - 0.02
      && runnerUp.textSimilarity >= best!.textSimilarity - 0.02,
  );
  const state: PassageAmbiguityState = !sufficientEvidence ? "no-reliable-match" : ambiguous ? "plausible-ambiguous" : "confident-unique";
  const stableBaseState = passageStateFor(best, minConfidence, false);
  const stableState: PassageAmbiguityState = stableBaseState === "no-reliable-match" ? stableBaseState : ambiguous ? "plausible-ambiguous" : "confident-unique";
  const selectedCandidate = sufficientEvidence ? bestDiagnostic : null;
  const firstChunkBest = diagnostics.find((diagnostic) => diagnostic.topCandidate)?.topCandidate;
  const disambiguatedByLaterChunks = Boolean(
    selectedCandidate && firstChunkBest
      && (firstChunkBest.startVerseKey !== selectedCandidate.startVerseKey || firstChunkBest.endVerseKey !== selectedCandidate.endVerseKey),
  );
  const strongestLocalAnchor = diagnostics.reduce<RecognitionDiagnostic["topCandidate"]>((strongest, diagnostic) => {
    if (!diagnostic.topCandidate || (strongest && strongest.confidence >= diagnostic.topCandidate.confidence)) return strongest;
    return diagnostic.topCandidate;
  }, undefined);
  const span = best ? canonicalSpan(best, verses) : null;
  const selectedStartIndex = span ? verses.findIndex((verse) => verse.verseKey === span.firstVerseKey) : -1;
  const selectedEndIndex = span ? verses.findIndex((verse) => verse.verseKey === span.lastVerseKey) : -1;
  const anchorStartIndex = strongestLocalAnchor ? verses.findIndex((verse) => verse.verseKey === strongestLocalAnchor.startVerseKey) : -1;
  const anchorEndIndex = strongestLocalAnchor ? verses.findIndex((verse) => verse.verseKey === strongestLocalAnchor.endVerseKey) : -1;
  const passage: PassageInference = {
    passageSource: "primary-transcript",
    state,
    candidates: ranked.map((candidate) => passageDiagnostic(candidate, verses)),
    candidateMargin: margin === null ? null : Number(margin.toFixed(4)),
    selectedCandidate,
    disambiguatedByLaterChunks,
    canonicalSpan: span,
    mappingQuality: best ? Number(best.mappingQuality.toFixed(4)) : null,
    transcriptCoverage: best ? Number((best.transcriptCoverage ?? 0).toFixed(4)) : null,
    canonicalSpanCoverage: best ? Number((best.canonicalCoverage ?? 0).toFixed(4)) : null,
    uniquenessMargin: margin === null ? null : Number(margin.toFixed(4)),
    firstBoundaryConfidence: best && best.alignment.firstCanonicalIndex !== null ? Number(((best.alignment.similarities.get(best.alignment.firstCanonicalIndex)?.[0] ?? 0)).toFixed(4)) : null,
    lastBoundaryConfidence: best && best.alignment.lastCanonicalIndex !== null ? Number(((best.alignment.similarities.get(best.alignment.lastCanonicalIndex)?.at(-1) ?? 0)).toFixed(4)) : null,
    boundaryCompletion: {
      extendedBackward: selectedStartIndex >= 0 && anchorStartIndex >= 0 && selectedStartIndex < anchorStartIndex,
      extendedForward: selectedEndIndex >= 0 && anchorEndIndex >= 0 && selectedEndIndex > anchorEndIndex,
    },
    shadowComparison: {
      stablePreF0840e7: { state: stableState, selectedCandidate: stableBaseState === "no-reliable-match" ? null : bestDiagnostic },
      current: { state, selectedCandidate },
      regressionDetected: stableBaseState !== "no-reliable-match" && state === "no-reliable-match",
    },
  };
  return { diagnostics, passage, best: state === "no-reliable-match" ? null : best ?? null };
}

/** Passage matching is intentionally text-only and independently testable. */
export function identifyQuranPassage(
  primary: PrimaryTranscript,
  options: Pick<RecognitionOptions, "corpus" | "minConfidence" | "maxVersesPerChunk" | "maxPassageVerses" | "ambiguityMargin"> = {},
): Pick<PrimaryPassageIdentification, "diagnostics" | "passage"> {
  const { diagnostics, passage } = identifyPrimaryTranscript(primary, options);
  return { diagnostics, passage };
}

function withTimingEvidence(
  selected: ScoredCandidate,
  timingChunks: readonly TranscriptChunk[],
  verses: readonly QuranCorpusVerse[],
): ScoredCandidate {
  const canonical = canonicalPassageTokens(verses.slice(selected.start, selected.end + 1));
  return { ...selected, alignment: alignTokens(canonical, timedTokens(timingChunks)) };
}

function isPrimaryTranscript(
  input: readonly TranscriptChunk[] | PrimaryTranscript,
): input is PrimaryTranscript {
  return !Array.isArray(input);
}

export function analyzeTranscript(
  input: readonly TranscriptChunk[] | PrimaryTranscript,
  options: RecognitionOptions = {},
): RecognitionAnalysis {
  const primary = isPrimaryTranscript(input)
    ? input
    : createPrimaryTranscript(input, options.timestampMode ?? (input.some((chunk) => chunk.words?.length) ? "word" : "chunk-fallback"));
  const { diagnostics, passage, best } = identifyPrimaryTranscript(primary, options);
  if (!best) return { matches: [], diagnostics, passage, timingTrace: null, forcedAlignment: null, timingRecoveryPlan: null };
  const verses = options.corpus ?? hafsVerses;
  const timingChunks = [...primary.chunks, ...(options.timingEvidenceChunks ?? [])]
    .sort((left, right) => left.startMs - right.startMs);
  const timingCandidate = withTimingEvidence(best, timingChunks, verses);
  const reconstructed = reconstructPassage(timingCandidate, timingChunks, verses, options.audioAnalysis);
  const forcedAlignment = forceAlignPassage(timingCandidate, timingChunks, verses, reconstructed.matches, options.audioAnalysis, options.timingRecoveryAttempted);
  return {
    matches: reconstructed.matches,
    diagnostics,
    passage,
    timingTrace: reconstructed.timingTrace,
    forcedAlignment,
    timingRecoveryPlan: timingRecoveryPlan(forcedAlignment, reconstructed.matches, options.audioAnalysis, primary.timestampMode),
  };
}

export function recognizeTranscript(
  chunks: readonly TranscriptChunk[],
  options: RecognitionOptions = {},
): RecognitionResult {
  return analyzeTranscript(chunks, options).matches;
}
