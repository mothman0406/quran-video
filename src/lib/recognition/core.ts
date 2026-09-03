import hafsCorpus from "../quran/hafs-corpus.json" with { type: "json" };
import { normalizeQuranRecitation, quranRecognitionUnits, type QuranRecognitionUnits } from "./quran-recitation.ts";
import type { AudioAnalysis } from "./audio-analysis.ts";
import { refineFirstAyahOnsetWithEnergy, refineTransitionWithEnergy, refineWordEdgeWithEnergy } from "./audio-analysis.ts";
import { speechRegionContaining, type VadSpeechRegion } from "./speech-regions.ts";
import type { CtcForcedAlignmentResult } from "./ctc-forced-alignment.ts";

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
  | "merged-token-word1"
  | "bounded-recovery"
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
  /** The automatic timing authority consumed by editor caption generation. */
  verseBoundaries: readonly VerseBoundary[];
  diagnostics: RecognitionDiagnostic[];
  passage: PassageInference;
  timingTrace: RecognitionTimingTrace | null;
  /** Detailed, canonical-first alignment. This deliberately remains separate
   * from the legacy VerseAlignment-shaped matches used by saved projects. */
  forcedAlignment: ForcedAlignment | null;
  /** Browser-local acoustic CTC proposal. It is debug-only in this milestone. */
  ctcShadow: CtcForcedAlignmentResult | null;
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
  /** Inclusive source-token range for deterministic timestamped alignment. */
  asrTokenStartIndex?: number;
  asrTokenEndIndex?: number;
  mappingGroupId?: string;
};

/** The sole generated ayah timing result, derived after passage identity is
 * fixed from the complete canonical WordOccurrence collection. */
export type VerseBoundary = {
  verseKey: string;
  startMs: number;
  endMs: number;
  evidence: {
    source: TimingEvidenceSource;
    selectedWord: Pick<WordOccurrence, "canonicalWordIndex" | "startMs" | "confidence" | "evidence"> | null;
    candidates: Array<{
      timestampMs: number;
      canonicalWordIndex: number;
      confidence: number;
      evidence: WordOccurrence["evidence"];
      accepted: boolean;
      reason: string;
    }>;
  };
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
  asrTokenStartIndex?: number;
  asrTokenEndIndex?: number;
  mappingGroupId?: string;
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
  reason: "first-onset" | "missing-verse" | "transition" | "final-end";
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

export type TransitionTimingTrace = {
  previousVerseKey: string;
  nextVerseKey: string;
  searchCorridor: { startMs: number; endMs: number };
  vadRegions: VadSpeechRegion[];
  firstPreviousAyahEvidenceMs: number | null;
  firstNextAyahEvidenceMs: number | null;
  firstNextCanonicalWordSupported: number | null;
  /** Canonical next-ayah candidates, retained in chronological order for diagnosis. */
  candidateNextAyahEvidence: Array<{
    timestampMs: number;
    canonicalWordIndex: number;
    confidence: number;
    evidenceType: "direct-word-1" | "coherent-early-words" | "backward-recovery";
    vadSpeechOnsetNearby: boolean;
    accepted: boolean;
    reason: string;
  }>;
  selectedTransitionMs: number;
  evidence: TimingEvidenceSource;
};

export type FinalAyahEndTrace = {
  verseKey: string;
  lastCanonicalAsrEvidenceMs: number | null;
  lastQuranAlignedVadRegion: VadSpeechRegion | null;
  detectedSpeechEndMs: number | null;
  videoDurationMs: number;
  selectedFinalEndMs: number;
};

export type RecognitionTimingTrace = {
  /** Silero—not energy—defines whether a voice is actually present. */
  firstVadSpeechRegionMs: number | null;
  firstQuranVadSpeechRegion: VadSpeechRegion | null;
  firstAsrChunkStartMs: number | null;
  firstAsrTimestampedWordMs: number | null;
  firstAsrWordAlignedToDetectedQuranMs: number | null;
  firstCanonicalQuranWordSupported: number | null;
  firstStrongAlignmentAnchorMs: number | null;
  pcmLocalOnsetCandidateMs: number | null;
  rawVerseAlignmentStartMs: number | null;
  verseAlignmentStartMs: number | null;
  verses: VerseTimingTrace[];
  transitions: TransitionTimingTrace[];
  finalAyahEnd: FinalAyahEndTrace | null;
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

export type FirstQuranOnsetLexicalEvidence = {
  /** Earliest accepted aligned Quran word evidence for the selected passage. */
  firstAlignedMs: number | null;
  /** Strong local anchor used to reject an isolated early ASR token. */
  strongAnchorMs: number | null;
};

export type FirstQuranOnsetResolution = {
  onsetMs: number | null;
  source: TimingEvidenceSource | null;
};

/**
 * Resolves the first visible Quran onset independently from a merged ASR
 * token-group start. A VAD region is usable only when it begins close to
 * selected Quran lexical evidence; a generic early speech region cannot pull
 * a caption into an unrelated prefix. PCM is already corridor-bounded by the
 * caller, but the lexical checks here keep this helper safe when reused by
 * either timing mode.
 */
export function resolveFirstQuranOnset({
  lexicalEvidence,
  speechRegions,
  pcmEvidence,
  rawTimestampEvidence,
}: {
  lexicalEvidence: FirstQuranOnsetLexicalEvidence;
  speechRegions?: readonly VadSpeechRegion[];
  pcmEvidence?: number | null;
  rawTimestampEvidence?: number | null;
}): FirstQuranOnsetResolution {
  const finiteMs = (value: number | null | undefined) => value !== null && value !== undefined && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : null;
  const firstAlignedMs = finiteMs(lexicalEvidence.firstAlignedMs);
  const strongAnchorMs = finiteMs(lexicalEvidence.strongAnchorMs);
  const lexicalMs = strongAnchorMs ?? firstAlignedMs;
  const regions = speechRegions ?? [];
  const quranRegion = lexicalMs === null
    ? null
    : regions.find((region) => lexicalMs < region.endMs && lexicalMs >= region.startMs) ?? null;
  const pcmMs = finiteMs(pcmEvidence);

  // A PCM candidate is authoritative only when it remains near the selected
  // Quran evidence and inside its verified speech region, if one exists.
  if (pcmMs !== null && lexicalMs !== null
    && Math.abs(pcmMs - lexicalMs) <= 2_800
    && (!quranRegion || (pcmMs >= quranRegion.startMs && pcmMs < quranRegion.endMs))) {
    return { onsetMs: pcmMs, source: "pcm-refined" };
  }

  // VAD can include isti'adhah, basmalah, or unrelated speech. Treat its
  // onset as Quran onset only when lexical evidence follows closely enough to
  // associate the region with the selected passage.
  if (quranRegion && lexicalMs !== null && lexicalMs - quranRegion.startMs <= 400) {
    return { onsetMs: Math.round(quranRegion.startMs), source: "word-timestamp" };
  }

  const rawMs = finiteMs(rawTimestampEvidence);
  const rawInSpeech = rawMs !== null && (!regions.length || regions.some((region) => rawMs < region.endMs && rawMs + 1 >= region.startMs));
  const rawNearLexicalEvidence = rawMs !== null && (lexicalMs === null || Math.abs(rawMs - lexicalMs) <= 400);
  if (rawMs !== null && rawInSpeech && rawNearLexicalEvidence) {
    return { onsetMs: rawMs, source: "word-timestamp" };
  }

  // If raw ASR starts before the first credible Quran evidence, it is padding
  // or a weak/hallucinated token rather than a display onset.
  if (lexicalMs !== null) return { onsetMs: lexicalMs, source: "word-timestamp" };
  return { onsetMs: null, source: null };
}

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

type TimestampedTokenGroup = {
  canonicalStart: number;
  canonicalCount: 1 | 2;
  asrStart: number;
  asrCount: 1 | 2 | 3;
  similarity: number;
};

type TimestampedTokenAlignment = {
  matched: Map<number, TimestampedTokenGroup>;
  matchedAsrIndexes: Set<number>;
};

function joinedUnits(words: readonly { units: QuranRecognitionUnits }[]): QuranRecognitionUnits {
  return {
    orthographic: words.map((word) => word.units.orthographic).join(""),
    recitation: words.map((word) => word.units.recitation).join(""),
  };
}

function isShortCanonicalWord(word: CanonicalToken): boolean {
  return word.units.orthographic.length <= 3 || word.units.recitation.length <= 3;
}

/**
 * Timestamped Whisper output is aligned to the already-selected passage, not
 * searched against the corpus. The DP permits Arabic tokenization differences
 * while preserving both token order and the exact Whisper word spans.
 */
function alignTimestampedTokens(
  canonical: readonly CanonicalToken[],
  asr: readonly TimedToken[],
): TimestampedTokenAlignment {
  type Move = TimestampedTokenGroup | { canonicalCount: 1; asrCount: 0 } | { canonicalCount: 0; asrCount: 1 } | null;
  const rows = canonical.length + 1;
  const columns = asr.length + 1;
  const scores = Array.from({ length: rows }, () => new Float64Array(columns));
  const moves = Array.from({ length: rows }, () => Array<Move>(columns).fill(null));
  for (let i = 1; i < rows; i += 1) { scores[i][0] = scores[i - 1][0] - 0.12; moves[i][0] = { canonicalCount: 1, asrCount: 0 }; }
  for (let j = 1; j < columns; j += 1) { scores[0][j] = scores[0][j - 1] - 0.78; moves[0][j] = { canonicalCount: 0, asrCount: 1 }; }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      let bestScore = scores[i - 1][j] - 0.12;
      let bestMove: Move = { canonicalCount: 1, asrCount: 0 };
      const skipAsr = scores[i][j - 1] - 0.78;
      if (skipAsr > bestScore) { bestScore = skipAsr; bestMove = { canonicalCount: 0, asrCount: 1 }; }
      const candidates: Array<{ canonicalCount: 1 | 2; asrCount: 1 | 2 | 3 }> = [
        { canonicalCount: 1, asrCount: 1 },
        { canonicalCount: 1, asrCount: 2 },
        { canonicalCount: 1, asrCount: 3 },
      ];
      if (i >= 2 && isShortCanonicalWord(canonical[i - 2]!) && isShortCanonicalWord(canonical[i - 1]!)) {
        candidates.push({ canonicalCount: 2, asrCount: 1 });
      }
      for (const candidate of candidates) {
        if (i < candidate.canonicalCount || j < candidate.asrCount) continue;
        const canonicalGroup = canonical.slice(i - candidate.canonicalCount, i);
        const asrGroup = asr.slice(j - candidate.asrCount, j);
        const similarity = recognitionUnitSimilarity(joinedUnits(canonicalGroup), joinedUnits(asrGroup));
        const threshold = candidate.canonicalCount === 1 && candidate.asrCount === 1 ? 0.58 : 0.64;
        if (similarity < threshold) continue;
        const value = scores[i - candidate.canonicalCount][j - candidate.asrCount] + similarity * 2.25 - (candidate.asrCount + candidate.canonicalCount - 2) * 0.03;
        if (value > bestScore) {
          bestScore = value;
          bestMove = {
            canonicalStart: i - candidate.canonicalCount,
            canonicalCount: candidate.canonicalCount,
            asrStart: j - candidate.asrCount,
            asrCount: candidate.asrCount,
            similarity,
          };
        }
      }
      scores[i][j] = bestScore;
      moves[i][j] = bestMove;
    }
  }

  let endRow = 0;
  for (let i = 1; i < rows; i += 1) if (scores[i][columns - 1] > scores[endRow][columns - 1]) endRow = i;
  const matched = new Map<number, TimestampedTokenGroup>();
  const matchedAsrIndexes = new Set<number>();
  let i = endRow;
  let j = asr.length;
  while (i > 0 || j > 0) {
    const move = moves[i]?.[j];
    if (!move) break;
    if (move.canonicalCount > 0 && move.asrCount > 0) {
      const group = move as TimestampedTokenGroup;
      for (let canonicalIndex = group.canonicalStart; canonicalIndex < group.canonicalStart + group.canonicalCount; canonicalIndex += 1) matched.set(canonicalIndex, group);
      for (let asrIndex = group.asrStart; asrIndex < group.asrStart + group.asrCount; asrIndex += 1) matchedAsrIndexes.add(asrIndex);
    }
    i -= move.canonicalCount;
    j -= move.asrCount;
  }
  return { matched, matchedAsrIndexes };
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
  // The transition is the beginning of a known next ayah, not a best-match
  // search over its entire duration. A later dense cluster must never evict a
  // credible word-one observation merely because it has more support.
  const candidates = evidence.slice().sort((left, right) => left.token.startMs - right.token.startMs || left.canonicalWordIndex - right.canonicalWordIndex);
  const directWordOne = candidates.find((item) => item.canonicalWordIndex === 0 && item.similarity >= 0.62);
  if (directWordOne) return directWordOne;
  const earlyCoherent = candidates.find((item, index) => {
    if (item.similarity < 0.62 || item.canonicalWordIndex > 2) return false;
    const following = candidates[index + 1];
    return Boolean(following && following.canonicalWordIndex === item.canonicalWordIndex + 1
      && following.similarity >= 0.62 && following.token.startMs - item.token.endMs <= 1_800);
  });
  if (earlyCoherent) return earlyCoherent;
  return candidates.find((item) => item.similarity >= 0.7) ?? candidates[0]!;
}

function selectFirstQuranSpeechRegion(
  evidence: readonly AlignedAyahEvidence[],
  speechRegions: readonly VadSpeechRegion[] | undefined,
): VadSpeechRegion | null {
  if (!speechRegions?.length) return null;
  // Text still chooses the passage, while Silero rejects non-speech. A clip
  // may start mid-ayah, so even one strongly aligned canonical word inside a
  // credible VAD region is valid onset evidence.
  const requiredWords = 1;
  for (const region of speechRegions) {
    const supportedWords = new Set(evidence
      .filter((item) => item.similarity >= 0.62
        && item.token.startMs < region.endMs
        && item.token.endMs >= region.startMs)
      .map((item) => item.canonicalWordIndex));
    if (supportedWords.size >= requiredWords) return region;
  }
  return null;
}

/**
 * A later clean lexical anchor proves the ayah identity, but it is not itself
 * the ayah onset. Estimate the short unobserved prefix from the local word
 * cadence and keep that estimate inside the VAD-approved speech corridor.
 * A subsequent bounded micro-ASR pass normally replaces this recovery with
 * direct evidence for the first canonical word.
 */
function recoverAyahOnsetFromLocalAnchor(
  anchor: AlignedAyahEvidence | null,
  evidence: readonly AlignedAyahEvidence[],
  region: VadSpeechRegion | null,
): { onsetMs: number; source: TimingEvidenceSource } | null {
  if (!anchor) return null;
  if (anchor.canonicalWordIndex === 0) return { onsetMs: anchor.token.startMs, source: anchor.token.source === "micro-asr" ? "micro-asr" : "word-timestamp" };
  const ordered = evidence
    .filter((item) => item.token.startMs <= anchor.token.startMs && item.canonicalWordIndex <= anchor.canonicalWordIndex)
    .sort((left, right) => left.canonicalWordIndex - right.canonicalWordIndex || left.token.startMs - right.token.startMs);
  const cadences = ordered.slice(1).flatMap((item, index) => {
    const previous = ordered[index];
    const wordsApart = item.canonicalWordIndex - previous.canonicalWordIndex;
    return wordsApart > 0 ? [(item.token.startMs - previous.token.startMs) / wordsApart] : [];
  }).filter((value) => value >= 120 && value <= 1_100);
  const cadenceMs = cadences.length
    ? cadences.slice().sort((left, right) => left - right)[Math.floor(cadences.length / 2)]!
    : 480;
  const lookbackMs = Math.min(2_800, Math.max(320, anchor.canonicalWordIndex * cadenceMs));
  const lowerBound = region?.startMs ?? Math.max(0, anchor.token.startMs - lookbackMs);
  return {
    onsetMs: Math.max(Math.round(lowerBound), Math.round(anchor.token.startMs - lookbackMs)),
    source: anchor.token.source === "micro-asr" ? "micro-asr" : "word-timestamp",
  };
}

function timestampedForcedAlignment(
  selected: ScoredCandidate,
  chunks: readonly TranscriptChunk[],
  verses: readonly QuranCorpusVerse[],
): ForcedAlignment | null {
  const canonical = canonicalPassageTokens(verses.slice(selected.start, selected.end + 1));
  const asr = timedTokens(chunks).filter((token) => token.hasWordTimestamp && token.source === "direct-asr-word");
  if (!canonical.length || !asr.length) return null;
  const alignment = alignTimestampedTokens(canonical, asr);
  const canonicalPassage = canonical.map((word, index) => ({
    verseKey: word.verseKey,
    canonicalWordIndex: word.wordIndex + 1,
    globalWordIndex: index + 1,
    canonicalText: word.displayText,
    normalizedText: word.units.orthographic,
  }));
  const occurrences = [...alignment.matched.entries()]
    .sort(([left], [right]) => left - right)
    .map(([canonicalIndex, group]) => {
      const tokens = asr.slice(group.asrStart, group.asrStart + group.asrCount);
      const first = tokens[0]!;
      const last = tokens.at(-1)!;
      return {
        ...canonicalPassage[canonicalIndex]!,
        occurrenceIndex: 1,
        startMs: Math.round(first.startMs),
        endMs: Math.max(Math.round(first.startMs) + 1, Math.round(last.endMs)),
        confidence: Number(group.similarity.toFixed(4)),
        evidence: "direct-word-alignment" as const,
        pcmRefined: false,
        asrText: tokens.map((token) => token.displayText).join(" "),
        asrTokenStartIndex: group.asrStart,
        asrTokenEndIndex: group.asrStart + group.asrCount - 1,
        mappingGroupId: `timestamp-${group.canonicalStart}-${group.asrStart}`,
      };
    });
  const canonicalWordAlignments = canonicalPassage.map((word, canonicalIndex) => {
    const occurrence = occurrences.find((item) => item.globalWordIndex === canonicalIndex + 1);
    return {
      ...word,
      startMs: occurrence?.startMs ?? 0,
      endMs: occurrence?.endMs ?? 0,
      timingEvidence: occurrence ? "word-timestamp" as const : "interpolated" as const,
      confidence: occurrence?.confidence ?? 0,
      directMatch: Boolean(occurrence),
      recoveredMatch: false,
      asrTokenStartIndex: occurrence?.asrTokenStartIndex,
      asrTokenEndIndex: occurrence?.asrTokenEndIndex,
      mappingGroupId: occurrence?.mappingGroupId,
    };
  });
  const verseTimings = [...new Set(canonical.map((word) => word.verseKey))].map((verseKey) => {
    const verseWords = canonicalPassage.filter((word) => word.verseKey === verseKey);
    const heard = occurrences.filter((word) => word.verseKey === verseKey);
    const confidence = heard.length ? heard.reduce((sum, word) => sum + word.confidence, 0) / heard.length : 0;
    return {
      verseKey,
      startMs: heard[0]?.startMs ?? 0,
      endMs: Math.max((heard.at(-1)?.endMs ?? 0), (heard[0]?.startMs ?? 0) + 1),
      firstCanonicalWordIndex: 1,
      lastCanonicalWordIndex: verseWords.length,
      partialStart: !heard.some((word) => word.canonicalWordIndex === 1),
      partialEnd: !heard.some((word) => word.canonicalWordIndex === verseWords.length),
      confidence: Number(confidence.toFixed(4)),
      startEvidence: heard.length ? "word-timestamp" as const : "interpolated" as const,
      endEvidence: heard.length ? "word-timestamp" as const : "interpolated" as const,
      directWordCount: heard.length,
      recoveredWordCount: 0,
      recoveryAttempted: false,
    };
  });
  return {
    canonicalPassage,
    canonicalWordAlignments,
    wordOccurrences: occurrences,
    verseTimings,
    pauseCandidates: [],
    captionSets: verseTimings.map((timing) => ({
      id: `auto-${timing.verseKey}`,
      verseKey: timing.verseKey,
      canonicalStartWordIndex: 1,
      canonicalEndWordIndex: timing.lastCanonicalWordIndex,
      cutReason: "whole-ayah" as const,
    })),
  };
}

/** Timestamp-first resolver. The first ayah uses the shared verified-onset
 * result; all subsequent ayah starts remain direct timestamp evidence. */
function resolveTimestampedVerseBoundaries({
  verseKeys,
  wordOccurrences,
  speechRegions,
  firstOnset,
  finalSpeechEnd,
  durationMs,
}: {
  verseKeys: readonly string[];
  wordOccurrences: readonly WordOccurrence[];
  speechRegions?: readonly VadSpeechRegion[];
  firstOnset?: FirstQuranOnsetResolution | null;
  finalSpeechEnd: number;
  durationMs: number;
}): VerseBoundary[] {
  const maximum = Math.max(1, Math.round(durationMs));
  const inSpeech = (word: WordOccurrence) => !speechRegions?.length || Boolean(speechRegionContaining(speechRegions, word.startMs, word.endMs));
  const verseWords = verseKeys.map((verseKey) => wordOccurrences
    .filter((word) => word.verseKey === verseKey && word.evidence === "direct-word-alignment" && inSpeech(word))
    .sort((left, right) => left.canonicalWordIndex - right.canonicalWordIndex || left.startMs - right.startMs));
  const starts: number[] = [];
  const sources: TimingEvidenceSource[] = [];
  const selected: Array<WordOccurrence | null> = [];
  const candidates: Array<VerseBoundary["evidence"]["candidates"]> = [];
  for (let index = 0; index < verseKeys.length; index += 1) {
    const words = verseWords[index]!;
    const wordOne = words.find((word) => word.canonicalWordIndex === 1) ?? null;
    const earliest = words[0] ?? null;
    let start: number;
    let source: TimingEvidenceSource;
    let picked: WordOccurrence | null = wordOne ?? earliest;
    if (wordOne) {
      start = wordOne.startMs;
      source = wordOne.asrTokenStartIndex === wordOne.asrTokenEndIndex ? "word-timestamp" : "merged-token-word1";
    } else if (index > 0 && earliest) {
      // Missing-word recovery is deliberately closed over only adjacent known
      // lexical evidence: previous ayah completion through this ayah's first
      // observed word. A VAD-region onset is never a candidate here.
      const previousEnd = Math.max(...verseWords[index - 1]!.map((word) => word.endMs), starts[index - 1]!);
      start = Math.min(earliest.startMs, Math.max(previousEnd, starts[index - 1]!));
      source = "bounded-recovery";
    } else if (earliest) {
      start = earliest.startMs;
      source = "word-timestamp";
    } else {
      start = index ? starts[index - 1]! : 0;
      source = "interpolated";
      picked = null;
    }
    starts[index] = index === 0 && firstOnset?.onsetMs !== null && firstOnset?.onsetMs !== undefined
      ? Math.max(0, Math.min(maximum - 1, Math.round(firstOnset.onsetMs)))
      : Math.max(0, Math.min(maximum - 1, Math.round(start)));
    sources[index] = index === 0 ? firstOnset?.source ?? source : source;
    selected.push(picked);
    candidates.push(words.map((word) => ({
      timestampMs: word.startMs,
      canonicalWordIndex: word.canonicalWordIndex,
      confidence: word.confidence,
      evidence: word.evidence,
      accepted: word === picked,
      reason: word === picked
        ? wordOne ? "timestamped canonical word 1" : "bounded recovery interval from previous final word to earliest observed next word"
        : "monotonic timestamped alignment selected an earlier canonical onset",
    })));
  }
  const boundaries = verseKeys.map((verseKey, index) => {
    const startMs = starts[index]!;
    const endMs = index < verseKeys.length - 1
      ? starts[index + 1]!
      : Math.max(startMs + 1, Math.min(maximum, Math.round(Math.max(finalSpeechEnd, ...verseWords[index]!.map((word) => word.endMs)))));
    return { verseKey, startMs, endMs, evidence: { source: sources[index]!, selectedWord: selected[index] && {
      canonicalWordIndex: selected[index]!.canonicalWordIndex,
      startMs: selected[index]!.startMs,
      confidence: selected[index]!.confidence,
      evidence: selected[index]!.evidence,
    }, candidates: candidates[index]! } };
  });
  assertTimestampedBoundaryInvariants(boundaries, verseWords, maximum);
  return boundaries;
}

function assertTimestampedBoundaryInvariants(
  boundaries: readonly VerseBoundary[],
  verseWords: readonly (readonly WordOccurrence[])[],
  maximum: number,
): void {
  for (const [index, boundary] of boundaries.entries()) {
    if (boundary.startMs < 0 || boundary.endMs > maximum || boundary.endMs <= boundary.startMs) throw new Error(`Impossible timestamped Quran boundary for ${boundary.verseKey}.`);
    const words = verseWords[index]!;
    if (!words.length) continue;
    const earliest = Math.min(...words.map((word) => word.startMs));
    const latest = Math.max(...words.map((word) => word.endMs));
    // The first merged Whisper group may begin before phonation. Its raw
    // start remains useful diagnostics, but the verified first onset is the
    // visible boundary. Interior ayat must still be bounded by their own
    // canonical evidence.
    if (index > 0 && boundary.startMs > earliest) throw new Error(`Timestamped boundary starts after canonical evidence for ${boundary.verseKey}.`);
    if (index === 0 && boundary.startMs >= latest) throw new Error(`Timestamped first boundary starts after canonical evidence for ${boundary.verseKey}.`);
    const isNonFinal = index < boundaries.length - 1;
    if (!isNonFinal && boundary.endMs < latest) throw new Error(`Timestamped boundary ends before canonical evidence for ${boundary.verseKey}.`);
    if (isNonFinal && boundary.endMs < latest && boundaries[index + 1]!.startMs >= latest) throw new Error(`Timestamped boundary truncates canonical evidence for ${boundary.verseKey}.`);
  }
}

/**
 * Resolves the one generated timing interval for each known ayah. This is
 * deliberately independent from guessed RecognitionMatch/VerseAlignment
 * boundaries: complete WordOccurrence evidence and VAD are its inputs.
 */
export function resolveVerseBoundaries({
  verseKeys,
  wordOccurrences,
  speechRegions,
  firstOnset,
  finalSpeechEnd,
  durationMs,
}: {
  verseKeys: readonly string[];
  wordOccurrences: readonly WordOccurrence[];
  speechRegions?: readonly VadSpeechRegion[];
  firstOnset: number;
  finalSpeechEnd: number;
  durationMs: number;
}): VerseBoundary[] {
  if (!verseKeys.length) return [];
  const maximum = Math.max(1, Math.round(durationMs));
  const containsSpeech = (occurrence: WordOccurrence) => !speechRegions?.length
    || Boolean(speechRegionContaining(speechRegions, occurrence.startMs, occurrence.endMs));
  const sourceFor = (occurrence: WordOccurrence | null): TimingEvidenceSource => {
    if (!occurrence) return "interpolated";
    if (occurrence.evidence === "micro-asr") return "micro-asr";
    if (occurrence.pcmRefined) return "pcm-refined";
    return occurrence.evidence === "chunk-coarse" ? "chunk-coarse" : "word-timestamp";
  };
  const starts = new Array<number>(verseKeys.length).fill(0);
  const selected = new Array<WordOccurrence | null>(verseKeys.length).fill(null);
  const candidateLists: Array<VerseBoundary["evidence"]["candidates"]> = Array.from(
    { length: verseKeys.length },
    () => [],
  );
  starts[0] = Math.max(0, Math.min(maximum - 1, Math.round(firstOnset)));

  for (let index = 1; index < verseKeys.length; index += 1) {
    // Do not substitute a filtered alignment derivative here. Every observed
    // occurrence for the known next ayah is a diagnostic candidate.
    const all = wordOccurrences
      .filter((occurrence) => occurrence.verseKey === verseKeys[index])
      .slice()
      .sort((left, right) => left.startMs - right.startMs || left.canonicalWordIndex - right.canonicalWordIndex || left.occurrenceIndex - right.occurrenceIndex);
    const credible = (occurrence: WordOccurrence) => occurrence.confidence >= 0.62
      && occurrence.evidence !== "chunk-coarse" && containsSpeech(occurrence);
    const directWordOne = all.filter((occurrence) => occurrence.canonicalWordIndex === 1 && credible(occurrence));
    const coherentWordOne = directWordOne.find((occurrence) => all.some((following) => following.startMs >= occurrence.startMs
      && following.startMs - occurrence.startMs <= 3_000
      && following.canonicalWordIndex > 1
      && following.canonicalWordIndex <= 4
      && credible(following))) ?? directWordOne[0] ?? null;
    const early = all.find((occurrence) => occurrence.canonicalWordIndex >= 2 && occurrence.canonicalWordIndex <= 4 && credible(occurrence)) ?? null;
    const later = all.find(credible) ?? null;
    const coarseFallback = all.find(containsSpeech) ?? null;
    const chosen = coherentWordOne ?? early ?? later ?? coarseFallback;
    selected[index] = chosen;
    const chosenPriority = coherentWordOne ? "credible canonical word 1" : early ? "early-word recovery to VAD onset" : later ? "later-word recovery because no credible early evidence exists" : coarseFallback ? "coarse fallback because no credible word occurrence exists" : "no credible occurrence; retained deterministic fallback";
    const chosenRegion = chosen ? speechRegionContaining(speechRegions, chosen.startMs, chosen.endMs) : null;
    const recoveredStart = chosen && coherentWordOne
      ? Math.max(chosen.startMs, chosenRegion?.startMs ?? 0)
      : chosen && !coherentWordOne && early === chosen
      ? chosenRegion?.startMs ?? chosen.startMs
      : chosen?.startMs ?? starts[index - 1] + 1;
    starts[index] = Math.max(starts[index - 1] + 1, Math.min(maximum - 1, Math.round(recoveredStart)));
    candidateLists[index] = all.map((occurrence) => {
      const isChosen = occurrence === chosen;
      const valid = credible(occurrence);
      const reason = isChosen ? chosenPriority
        : !containsSpeech(occurrence) ? "rejected: occurrence lies outside VAD speech"
        : occurrence.confidence < 0.62 ? "rejected: confidence below deterministic credibility threshold"
        : occurrence.evidence === "chunk-coarse" ? "rejected: coarse chunk timing cannot override word evidence"
        : chosen && occurrence.canonicalWordIndex >= 16 && coherentWordOne ? "rejected: later internal word cannot override credible canonical word 1"
        : valid ? "rejected: lower deterministic priority than selected earlier onset evidence"
        : "rejected: not credible";
      return {
        timestampMs: occurrence.startMs,
        canonicalWordIndex: occurrence.canonicalWordIndex,
        confidence: occurrence.confidence,
        evidence: occurrence.evidence,
        accepted: isChosen,
        reason,
      };
    });
  }

  return verseKeys.map((verseKey, index) => {
    const startMs = starts[index];
    const endMs = index < verseKeys.length - 1
      ? starts[index + 1]
      : Math.max(startMs + 1, Math.min(maximum, Math.round(finalSpeechEnd)));
    return {
      verseKey,
      startMs,
      endMs,
      evidence: {
        source: index === 0 ? "word-timestamp" : sourceFor(selected[index]),
        selectedWord: selected[index] && {
          canonicalWordIndex: selected[index].canonicalWordIndex,
          startMs: selected[index].startMs,
          confidence: selected[index].confidence,
          evidence: selected[index].evidence,
        },
        candidates: candidateLists[index],
      },
    };
  });
}

function regionsInCorridor(
  speechRegions: readonly VadSpeechRegion[] | undefined,
  startMs: number,
  endMs: number,
): VadSpeechRegion[] {
  return (speechRegions ?? []).filter((region) => region.startMs < endMs && region.endMs > startMs);
}

function reconstructPassage(
  selected: ScoredCandidate,
  chunks: readonly TranscriptChunk[],
  verses: readonly QuranCorpusVerse[],
  audioAnalysis?: AudioAnalysis,
  speechRegions?: readonly VadSpeechRegion[],
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
      firstVadSpeechRegionMs: speechRegions?.[0]?.startMs ?? null,
      firstQuranVadSpeechRegion: null,
      firstAsrChunkStartMs: chunks.length ? Math.min(...chunks.map((chunk) => chunk.startMs)) : null,
      firstAsrTimestampedWordMs: null,
      firstAsrWordAlignedToDetectedQuranMs: null,
      firstCanonicalQuranWordSupported: null,
      firstStrongAlignmentAnchorMs: null,
      pcmLocalOnsetCandidateMs: null,
      rawVerseAlignmentStartMs: null,
      verseAlignmentStartMs: null,
      verses: [],
      transitions: [],
      finalAyahEnd: null,
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
  const sourceDuration = Math.max(0, audioAnalysis?.durationMs ?? 0, ...chunks.map((chunk) => chunk.endMs), ...(speechRegions ?? []).map((region) => region.endMs));
  // Once local recovery or word offsets are available, a whole-recording
  // coarse chunk must not pull a verse back into its leading silence.
  const temporalTokensByAyah = byAyah.map((tokens) => {
    const temporal = tokens.filter((token) => token.source !== "chunk-coarse");
    const candidates = temporal.length ? temporal : tokens;
    // A word timestamp outside every Silero speech region is temporally
    // impossible. It may still have helped the immutable text-only passage
    // lookup, but cannot anchor a displayed Quran boundary.
    return speechRegions === undefined
      ? candidates
      : candidates.filter((token) => Boolean(speechRegionContaining(speechRegions, token.startMs, token.endMs)));
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

  // Refine only expected canonical verse transitions. The next ayah's Quran
  // evidence chooses the transition; PCM/VAD only constrain and sharpen its
  // local search corridor. A pause is therefore held by the previous ayah.
  const transitionTraces: TransitionTimingTrace[] = [];
  for (let index = activeStart; index < activeEnd; index += 1) {
    const previous = temporalTokensByAyah[index];
    const next = temporalTokensByAyah[index + 1];
    const previousLast = previous.length ? Math.max(...previous.map((token) => token.endMs)) : null;
    const nextEvidence = alignedEvidenceByAyah[index + 1]
      .filter((item) => item.token.source !== "chunk-coarse"
        && (!speechRegions || Boolean(speechRegionContaining(speechRegions, item.token.startMs, item.token.endMs))));
    const nextAnchor = selectFirstAyahOnsetAnchor(nextEvidence);
    const nextFirst = nextAnchor?.token.startMs ?? (next.length ? Math.min(...next.map((token) => token.startMs)) : null);
    // This corridor must be derived from observed passage evidence, not the
    // mutable verse start it is about to correct. In particular, retain the
    // earliest next-ayah observation even when a later internal word formed
    // the old estimated start.
    const earliestNextEvidenceMs = nextEvidence.length ? Math.min(...nextEvidence.map((item) => item.token.startMs)) : nextFirst;
    const latestNextEvidenceMs = nextEvidence.length ? Math.max(...nextEvidence.map((item) => item.token.endMs)) : nextFirst;
    const corridorStart = Math.max(0, Math.round(Math.min(previousLast ?? earliestNextEvidenceMs ?? 0, earliestNextEvidenceMs ?? previousLast ?? 0) - 600));
    const corridorEnd = Math.min(sourceDuration, Math.round(Math.max(latestNextEvidenceMs ?? 0, nextFirst ?? 0) + 600));
    const vadRegions = regionsInCorridor(speechRegions, corridorStart, corridorEnd);
    const region = nextAnchor ? speechRegionContaining(speechRegions, nextAnchor.token.startMs, nextAnchor.token.endMs) : null;
    const candidateNextAyahEvidence = nextEvidence
      .slice()
      .sort((left, right) => left.token.startMs - right.token.startMs || left.canonicalWordIndex - right.canonicalWordIndex)
      .map((item) => {
        const isSelected = item === nextAnchor;
        const nearbyOnset = (speechRegions ?? []).some((candidate) => Math.abs(candidate.startMs - item.token.startMs) <= 400);
        const evidenceType = item.canonicalWordIndex === 0
          ? "direct-word-1" as const
          : item.canonicalWordIndex <= 2 ? "coherent-early-words" as const : "backward-recovery" as const;
        return {
          timestampMs: item.token.startMs,
          canonicalWordIndex: item.canonicalWordIndex + 1,
          confidence: Number(item.similarity.toFixed(4)),
          evidenceType,
          vadSpeechOnsetNearby: nearbyOnset,
          accepted: isSelected,
          reason: isSelected
            ? item.canonicalWordIndex === 0 ? "earliest credible direct evidence for next ayah word 1" : "earliest credible early-word evidence for backward onset recovery"
            : "later next-ayah evidence cannot override the earliest credible onset candidate",
        };
      });
    const recovered = recoverAyahOnsetFromLocalAnchor(nextAnchor, nextEvidence, region);
    let transition = recovered?.onsetMs ?? nextFirst ?? starts[index + 1] ?? ends[index] ?? 0;
    let evidenceSource = recovered?.source ?? startSources[index + 1];
    const refined = audioAnalysis && previousLast !== null && nextFirst !== null
      ? refineTransitionWithEnergy(audioAnalysis, previousLast, nextFirst)
      : null;
    if (refined?.foundGap) {
      // The onset after a text-derived corridor is the next ayah boundary.
      transition = refined.speechOnsetMs;
      evidenceSource = "pcm-refined";
    }
    if (region) transition = Math.max(region.startMs, Math.min(region.endMs - 1, transition));
    transition = Math.round(Math.max(starts[index] ?? 0, transition));
    starts[index + 1] = transition;
    ends[index] = transition;
    startSources[index + 1] = evidenceSource;
    endSources[index] = evidenceSource;
    transitionTraces.push({
      previousVerseKey: passage[index].verseKey,
      nextVerseKey: passage[index + 1].verseKey,
      searchCorridor: { startMs: corridorStart, endMs: corridorEnd },
      vadRegions,
      firstPreviousAyahEvidenceMs: previous.length ? Math.min(...previous.map((token) => token.startMs)) : null,
      firstNextAyahEvidenceMs: nextFirst,
      firstNextCanonicalWordSupported: nextAnchor ? nextAnchor.canonicalWordIndex + 1 : null,
      candidateNextAyahEvidence,
      selectedTransitionMs: transition,
      evidence: evidenceSource,
    });
  }
  const lastTokens = temporalTokensByAyah[activeEnd];
  const rawFirstStartMs = starts[activeStart] ?? null;
  const directFirstAyahEvidence = alignedEvidenceByAyah[activeStart]
    .filter((item) => item.token.source !== "chunk-coarse");
  // During the pre-recovery chunk fallback, a coarse interval is enough to
  // choose VAD-constrained micro-ASR work, but never enough to claim a word
  // boundary. Recovered output replaces it before captions are presented.
  const firstAyahEvidence = directFirstAyahEvidence.length
    ? directFirstAyahEvidence
    : alignedEvidenceByAyah[activeStart];
  const firstQuranSpeechRegion = selectFirstQuranSpeechRegion(
    firstAyahEvidence,
    speechRegions,
  );
  const firstAnchor = selectFirstAyahOnsetAnchor(firstAyahEvidence
    .filter((item) => !speechRegions || !speechRegions.length || Boolean(speechRegionContaining(speechRegions, item.token.startMs, item.token.endMs))));
  const firstCanonicalWordSupported = firstAnchor ? firstAnchor.canonicalWordIndex + 1 : null;
  const onsetLookbackMs = firstAnchor
    ? Math.min(1_600, Math.max(360, 280 + firstAnchor.canonicalWordIndex * 160))
    : 0;
  const onsetAnchorMs = firstAnchor ? Math.max(firstAnchor.token.startMs, firstQuranSpeechRegion?.startMs ?? 0) : null;
  const boundedLookbackMs = onsetAnchorMs === null ? 0 : Math.min(onsetLookbackMs, onsetAnchorMs - (firstQuranSpeechRegion?.startMs ?? 0));
  const onsetCorridorStartMs = onsetAnchorMs === null ? null : Math.max(firstQuranSpeechRegion?.startMs ?? 0, onsetAnchorMs - boundedLookbackMs);
  const onsetCorridorEndMs = onsetAnchorMs === null ? null : Math.min(firstQuranSpeechRegion?.endMs ?? sourceDuration, onsetAnchorMs + 180);
  const pcmLocalOnsetCandidateMs = audioAnalysis && firstAnchor
    ? refineFirstAyahOnsetWithEnergy(audioAnalysis, onsetAnchorMs!, boundedLookbackMs, 180, firstQuranSpeechRegion?.startMs)
    : null;
  // Never use generic audio activity here. The anchor is Quran identity; PCM
  // only sharpens it within the bounded local corridor.
  if (firstAnchor) {
    const refinedStart = pcmLocalOnsetCandidateMs ?? onsetAnchorMs!;
    // This is the hard constraint: no Quran caption can be pulled into
    // background audio by a Whisper token or a coarse timestamp.
    starts[activeStart] = Math.max(firstQuranSpeechRegion?.startMs ?? 0, Math.min(refinedStart, ends[activeStart]! - 1));
    if (pcmLocalOnsetCandidateMs !== null) startSources[activeStart] = "pcm-refined";
  }
  let finalAyahEnd: FinalAyahEndTrace | null = null;
  if (lastTokens.length) {
    const lastEvidenceMs = Math.max(...lastTokens.map((token) => token.endMs));
    const finalRegion = speechRegionContaining(speechRegions, lastEvidenceMs, lastEvidenceMs);
    const detectedSpeechEndMs = finalRegion?.endMs ?? null;
    // A final madd or weak final word is still Quran while it remains in the
    // VAD region tied to the last canonical ayah. Do not let the last clean
    // lexical anchor shorten that display interval.
    if (detectedSpeechEndMs !== null && detectedSpeechEndMs > (ends[activeEnd] ?? 0)) {
      ends[activeEnd] = Math.min(sourceDuration, detectedSpeechEndMs);
      endSources[activeEnd] = "pcm-refined";
    }
    if (audioAnalysis) {
    const refined = refineWordEdgeWithEnergy(audioAnalysis, Math.max(...lastTokens.map((token) => token.endMs)), "end");
    if (refined !== null) {
        // Energy may sharpen an observed terminal word, but never pull the
        // caption before continued VAD-approved final recitation.
        ends[activeEnd] = Math.max(ends[activeEnd] ?? 0, starts[activeEnd]! + 1, Math.min(sourceDuration, refined));
        endSources[activeEnd] = "pcm-refined";
      }
    }
    finalAyahEnd = {
      verseKey: passage[activeEnd].verseKey,
      lastCanonicalAsrEvidenceMs: lastEvidenceMs,
      lastQuranAlignedVadRegion: finalRegion,
      detectedSpeechEndMs,
      videoDurationMs: sourceDuration,
      selectedFinalEndMs: Math.round(ends[activeEnd] ?? lastEvidenceMs),
    };
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
  const constrainedMatches = speechRegions !== undefined && !firstQuranSpeechRegion ? [] : matches;
  const verseTrace = constrainedMatches.map((match, offset) => {
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
  return { matches: constrainedMatches, timingTrace: {
    firstVadSpeechRegionMs: speechRegions?.[0]?.startMs ?? null,
    firstQuranVadSpeechRegion: firstQuranSpeechRegion ?? null,
    firstAsrChunkStartMs: chunks.length ? Math.min(...chunks.map((chunk) => chunk.startMs)) : null,
    firstAsrTimestampedWordMs: evidence.length ? Math.min(...evidence.map((token) => token.startMs)) : null,
    firstAsrWordAlignedToDetectedQuranMs: firstAlignedWord,
    firstCanonicalQuranWordSupported: firstCanonicalWordSupported,
    firstStrongAlignmentAnchorMs: firstAnchor?.token.startMs ?? null,
    pcmLocalOnsetCandidateMs,
    rawVerseAlignmentStartMs: rawFirstStartMs,
    verseAlignmentStartMs: constrainedMatches[0]?.startMs ?? null,
    verses: verseTrace,
    transitions: transitionTraces,
    finalAyahEnd,
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
  speechRegions?: readonly VadSpeechRegion[],
): boolean {
  const direct = heard.filter((word) => word.evidence === "direct-word-alignment");
  const edgeWord = edge === "start" ? direct[0] : direct.at(-1);
  if (!edgeWord) return false;
  if (edge === "start" && edgeWord.canonicalWordIndex <= 1) return false;
  if (edge === "end" && edgeWord.canonicalWordIndex >= wordCount) return false;
  const region = speechRegionContaining(speechRegions, edgeWord.startMs, edgeWord.endMs);
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
  speechRegions?: readonly VadSpeechRegion[],
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
      partialStart: positivePartialBoundary(heard, verseWords.length, "start", speechRegions),
      partialEnd: positivePartialBoundary(heard, verseWords.length, "end", speechRegions),
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
    cutReason: "whole-ayah" as const,
  }));
  return { canonicalPassage, canonicalWordAlignments, wordOccurrences: occurrences, verseTimings, pauseCandidates, captionSets };
}

function timingRecoveryPlan(
  forcedAlignment: ForcedAlignment | null,
  matches: readonly RecognitionMatch[],
  audioAnalysis: AudioAnalysis | undefined,
  speechRegions: readonly VadSpeechRegion[] | undefined,
  timestampMode: "word" | "chunk-fallback",
): TimingRecoveryPlan | null {
  if (!forcedAlignment?.verseTimings.length) return null;
  // MODE A is complete timestamped lexical alignment. Missing word-one timing
  // is constrained by adjacent aligned words in resolveTimestampedVerseBoundaries;
  // broad VAD/micro-ASR windows are a MODE B fallback only.
  if (timestampMode === "word") return {
    required: false,
    timestampMode,
    windows: [],
    missingVerseKeys: [],
    firstOnsetRequired: false,
  };
  const recoveryAttempted = forcedAlignment.verseTimings.some((item) => item.recoveryAttempted);
  const missingVerseKeys = forcedAlignment.verseTimings
    .filter((item) => item.directWordCount === 0 && item.recoveredWordCount === 0)
    .map((item) => item.verseKey);
  const first = forcedAlignment.verseTimings[0];
  const firstOnsetRequired = timestampMode === "chunk-fallback" || first.startEvidence === "chunk-coarse" || first.startEvidence === "interpolated";
  // Every expected ayah transition and the terminal ayah get a bounded local
  // ASR read. This is timing-only evidence after passage identity is fixed.
  const hasBoundaryRecovery = matches.length > 1;
  const hasFinalRecovery = matches.length > 0;
  const required = !recoveryAttempted && (timestampMode === "chunk-fallback" || missingVerseKeys.length > 0 || firstOnsetRequired || hasBoundaryRecovery || hasFinalRecovery);
  if (!required) return {
    required: false,
    timestampMode,
    windows: [],
    missingVerseKeys,
    firstOnsetRequired,
  };

  const windows: TimingRecoveryWindow[] = [];
  const addWindow = (startMs: number, endMs: number, verseKeys: string[], reason: TimingRecoveryWindow["reason"]) => {
    const candidates = speechRegions === undefined
      ? [{ startMs, endMs }]
      : speechRegions
        .map((region) => ({ startMs: Math.max(startMs, region.startMs), endMs: Math.min(endMs, region.endMs) }))
        .filter((region) => region.endMs > region.startMs);
    for (const candidate of candidates) {
      const start = Math.max(0, Math.round(candidate.startMs));
      const end = Math.max(start + 1, Math.round(candidate.endMs));
      if (windows.some((item) => item.reason === reason && Math.abs(item.startMs - start) < 500 && Math.abs(item.endMs - end) < 500)) continue;
      windows.push({ startMs: start, endMs: end, verseKeys, reason });
    }
  };
  const addOverlappingWindows = (startMs: number, endMs: number, verseKeys: string[], reason: TimingRecoveryWindow["reason"]) => {
    const windowMs = 4_800;
    const stepMs = 2_800;
    for (let start = startMs; start < endMs; start += stepMs) {
      addWindow(start, Math.min(endMs, start + windowMs), verseKeys, reason);
      if (endMs - start <= windowMs) break;
    }
  };
  const allVerseKeys = forcedAlignment.verseTimings.map((item) => item.verseKey);
  const regions = speechRegions ?? [];
  if (timestampMode === "chunk-fallback" && regions.length) {
    // The original 30-second chunk can place Quran text anywhere in its
    // interval. Re-read only meaningful speech regions in small overlapping
    // windows, preserving absolute source time and skipping leading quiet.
    for (const region of regions) {
      const windowMs = 4_800;
      const stepMs = 3_600;
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
  for (let index = 0; index < matches.length - 1; index += 1) {
    const predicted = matches[index + 1]!.startMs;
    const durationMs = audioAnalysis?.durationMs ?? matches.at(-1)?.endMs ?? predicted + 2_200;
    addOverlappingWindows(
      Math.max(0, predicted - 2_800),
      Math.min(durationMs, predicted + 2_200),
      [matches[index]!.verseKey, matches[index + 1]!.verseKey],
      "transition",
    );
  }
  const lastMatch = matches.at(-1);
  if (lastMatch) {
    const durationMs = audioAnalysis?.durationMs ?? lastMatch.endMs;
    addOverlappingWindows(
      Math.max(0, lastMatch.startMs - 600),
      durationMs,
      [lastMatch.verseKey],
      "final-end",
    );
  }
  if (firstOnsetRequired && !windows.some((item) => item.reason === "first-onset")) {
    const firstMatch = matches[0];
    addWindow(Math.max(0, (firstMatch?.startMs ?? 0) - 1_000), Math.min(audioAnalysis?.durationMs ?? firstMatch?.endMs ?? 8_000, (firstMatch?.startMs ?? 0) + 7_000), [first.verseKey], "first-onset");
  }
  return { required, timestampMode, windows: windows.slice(0, 48), missingVerseKeys, firstOnsetRequired };
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
  /** Browser-local Silero VAD regions from the same recording. Undefined is
   * retained for historical saved/test data; a live recognition run supplies
   * this and therefore enforces the speech-onset hard constraint. */
  speechRegions?: readonly VadSpeechRegion[];
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
  if (!best) return { matches: [], verseBoundaries: [], diagnostics, passage, timingTrace: null, forcedAlignment: null, ctcShadow: null, timingRecoveryPlan: null };
  const verses = options.corpus ?? hafsVerses;
  const timingChunks = [...primary.chunks, ...(options.timingEvidenceChunks ?? [])]
    .sort((left, right) => left.startMs - right.startMs);
  const sourceDurationMs = options.audioAnalysis?.durationMs
    ?? Math.max(1, ...timingChunks.map((chunk) => chunk.endMs), ...(options.speechRegions ?? []).map((region) => region.endMs));
  const durationToleranceMs = 2;
  if (timingChunks.some((chunk) => chunk.startMs < 0 || chunk.endMs > sourceDurationMs + durationToleranceMs)) {
    throw new Error("Recognition timing belongs to a different source duration.");
  }
  if ((options.speechRegions ?? []).some((region) => region.startMs < 0 || region.endMs > sourceDurationMs + durationToleranceMs)) {
    throw new Error("Speech-region timing belongs to a different source duration.");
  }
  const timingCandidate = withTimingEvidence(best, timingChunks, verses);
  const reconstructed = reconstructPassage(timingCandidate, timingChunks, verses, options.audioAnalysis, options.speechRegions);
  const timestampedMode = primary.timestampMode === "word";
  const rawForcedAlignment = timestampedMode
    ? timestampedForcedAlignment(best, primary.chunks, verses)
    : forceAlignPassage(timingCandidate, timingChunks, verses, reconstructed.matches, options.audioAnalysis, options.speechRegions, options.timingRecoveryAttempted);
  const verseKeys = reconstructed.matches.map((match) => match.verseKey);
  const firstRawTimestampEvidence = rawForcedAlignment?.wordOccurrences
    .find((word) => word.verseKey === verseKeys[0] && word.canonicalWordIndex === 1)?.startMs
    ?? rawForcedAlignment?.wordOccurrences.find((word) => word.verseKey === verseKeys[0])?.startMs
    ?? null;
  const firstQuranOnset = resolveFirstQuranOnset({
    lexicalEvidence: {
      firstAlignedMs: reconstructed.timingTrace.firstAsrWordAlignedToDetectedQuranMs,
      strongAnchorMs: reconstructed.timingTrace.firstStrongAlignmentAnchorMs,
    },
    speechRegions: options.speechRegions,
    pcmEvidence: reconstructed.timingTrace.pcmLocalOnsetCandidateMs,
    rawTimestampEvidence: firstRawTimestampEvidence,
  });
  const verseBoundaries = timestampedMode
    ? resolveTimestampedVerseBoundaries({
      verseKeys,
      wordOccurrences: rawForcedAlignment?.wordOccurrences ?? [],
      speechRegions: options.speechRegions,
      firstOnset: firstQuranOnset,
      finalSpeechEnd: reconstructed.matches.at(-1)?.endMs ?? sourceDurationMs,
      durationMs: sourceDurationMs,
    })
    : resolveVerseBoundaries({
      verseKeys,
      wordOccurrences: rawForcedAlignment?.wordOccurrences ?? [],
      speechRegions: options.speechRegions,
      firstOnset: firstQuranOnset.onsetMs ?? reconstructed.matches[0]?.startMs ?? 0,
      finalSpeechEnd: reconstructed.matches.at(-1)?.endMs ?? sourceDurationMs,
      durationMs: sourceDurationMs,
    });
  const boundaryByVerse = new Map(verseBoundaries.map((boundary) => [boundary.verseKey, boundary]));
  const matches = reconstructed.matches.map((match, index) => {
    const boundary = boundaryByVerse.get(match.verseKey);
    if (!boundary) return match;
    return {
      ...match,
      startMs: boundary.startMs,
      endMs: boundary.endMs,
      timing: {
        ...match.timing,
        start: { timestampMs: boundary.startMs, source: index === 0 ? match.timing.start.source : boundary.evidence.source },
        end: { timestampMs: boundary.endMs, source: boundary.evidence.source },
      },
    };
  });
  const forcedAlignment = rawForcedAlignment && {
    ...rawForcedAlignment,
    // These remain diagnostics, but if inspected they are derived from the
    // same boundary result and therefore cannot contradict editor captions.
    verseTimings: rawForcedAlignment.verseTimings.map((timing) => {
      const boundary = boundaryByVerse.get(timing.verseKey);
      return boundary ? { ...timing, startMs: boundary.startMs, endMs: boundary.endMs, startEvidence: boundary.evidence.source, endEvidence: boundary.evidence.source } : timing;
    }),
    captionSets: rawForcedAlignment.captionSets,
  };
  const timingTrace = reconstructed.timingTrace && {
    ...reconstructed.timingTrace,
    verseAlignmentStartMs: verseBoundaries[0]?.startMs ?? reconstructed.timingTrace.verseAlignmentStartMs,
    verses: reconstructed.timingTrace.verses.map((trace) => {
      const boundary = boundaryByVerse.get(trace.verseKey);
      return boundary ? { ...trace, verseAlignmentStartMs: boundary.startMs, verseAlignmentEndMs: boundary.endMs } : trace;
    }),
    transitions: reconstructed.timingTrace.transitions.map((trace) => {
      const boundary = boundaryByVerse.get(trace.nextVerseKey);
      const candidates = boundary?.evidence.candidates ?? [];
      return boundary ? {
        ...trace,
        firstNextAyahEvidenceMs: candidates[0]?.timestampMs ?? null,
        firstNextCanonicalWordSupported: boundary.evidence.selectedWord?.canonicalWordIndex ?? null,
        candidateNextAyahEvidence: candidates.map((candidate) => ({
          timestampMs: candidate.timestampMs,
          canonicalWordIndex: candidate.canonicalWordIndex,
          confidence: candidate.confidence,
          evidenceType: candidate.canonicalWordIndex === 1 ? "direct-word-1" as const : candidate.canonicalWordIndex <= 4 ? "coherent-early-words" as const : "backward-recovery" as const,
          vadSpeechOnsetNearby: (options.speechRegions ?? []).some((region) => Math.abs(region.startMs - candidate.timestampMs) <= 400),
          accepted: candidate.accepted,
          reason: candidate.reason,
        })),
        selectedTransitionMs: boundary.startMs,
        evidence: boundary.evidence.source,
      } : trace;
    }),
  };
  return {
    matches,
    verseBoundaries,
    diagnostics,
    passage,
    timingTrace,
    forcedAlignment,
    ctcShadow: null,
    timingRecoveryPlan: timingRecoveryPlan(forcedAlignment, matches, options.audioAnalysis, options.speechRegions, primary.timestampMode),
  };
}

export function recognizeTranscript(
  chunks: readonly TranscriptChunk[],
  options: RecognitionOptions = {},
): RecognitionResult {
  return analyzeTranscript(chunks, options).matches;
}
