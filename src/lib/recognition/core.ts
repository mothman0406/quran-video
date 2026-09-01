import hafsCorpus from "../quran/hafs-corpus.json" with { type: "json" };
import { normalizeQuranRecitation, quranRecognitionUnits, type QuranRecognitionUnits } from "./quran-recitation.ts";

export type TranscriptChunk = {
  startMs: number;
  endMs: number;
  text: string;
  /** Optional ASR word offsets. Chunk offsets are used when the runtime does not expose these. */
  words?: Array<{ text: string; startMs: number; endMs: number }>;
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
  timing: {
    start: { timestampMs: number; source: "direct-asr-word" | "chunk-text-alignment" | "interpolation" | "low-confidence" };
    end: { timestampMs: number; source: "direct-asr-word" | "chunk-text-alignment" | "interpolation" | "low-confidence" };
    matchedText: string;
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
  totalScore: number;
  confidence: number;
  textSimilarity: number;
  sequenceConsistency: number;
  transcriptCoverage: number;
  consecutiveAyat: number;
};

export type PassageAmbiguityState = "confident-unique" | "plausible-ambiguous" | "no-reliable-match";

export type PassageInference = {
  state: PassageAmbiguityState;
  candidates: PassageCandidateDiagnostic[];
  candidateMargin: number | null;
  selectedCandidate: PassageCandidateDiagnostic | null;
  disambiguatedByLaterChunks: boolean;
};

export type RecognitionAnalysis = {
  matches: RecognitionResult;
  diagnostics: RecognitionDiagnostic[];
  passage: PassageInference;
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
  /** Original ASR surface text; this is the only token text eligible for UI. */
  displayText: string;
  startMs: number;
  endMs: number;
  source: "direct-asr-word" | "chunk-text-alignment";
};

function timedTokens(chunks: readonly TranscriptChunk[]): TimedToken[] {
  return chunks.reduce<TimedToken[]>((all, chunk) => {
    if (chunk.words?.length) {
      all.push(...chunk.words.flatMap<TimedToken>((word) => {
        const orthographic = normalizeArabic(word.text);
        return orthographic ? [{ units: quranRecognitionUnits(orthographic, word.text), displayText: word.text.trim(), startMs: word.startMs, endMs: word.endMs, source: "direct-asr-word" as const }] : [];
      }));
      return all;
    }
    const words = chunk.text.split(/\s+/).map((displayText) => ({ displayText, orthographic: normalizeArabic(displayText) })).filter((word) => word.orthographic);
    const weight = words.reduce((sum, word) => sum + Math.max(1, word.orthographic.length), 0);
    let cursor = chunk.startMs;
    all.push(...words.map<TimedToken>((word, index) => {
      const endMs = index === words.length - 1 ? chunk.endMs : Math.round(cursor + (chunk.endMs - chunk.startMs) * Math.max(1, word.orthographic.length) / weight);
      const token = { units: quranRecognitionUnits(word.orthographic, word.displayText), displayText: word.displayText, startMs: cursor, endMs, source: "chunk-text-alignment" as const };
      cursor = endMs;
      return token;
    }));
    return all;
  }, []).filter((token) => token.endMs >= token.startMs);
}

/**
 * Monotonic fuzzy alignment of ASR tokens to the canonical passage. It deliberately
 * has no pause or chunk-boundary input: those are timestamps on evidence, never ayah
 * separators. Canonical gaps are inexpensive so clips may begin/end inside an ayah.
 */
function alignTokens(canonical: QuranRecognitionUnits[], asr: TimedToken[]) {
  const rows = canonical.length + 1;
  const columns = asr.length + 1;
  const scores = Array.from({ length: rows }, () => new Float64Array(columns));
  const moves = Array.from({ length: rows }, () => new Uint8Array(columns)); // 1 diag, 2 canonical gap, 3 ASR gap
  for (let i = 1; i < rows; i += 1) { scores[i][0] = 0; moves[i][0] = 2; }
  for (let j = 1; j < columns; j += 1) { scores[0][j] = 0; moves[0][j] = 3; }
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < columns; j += 1) {
      const similarity = recognitionUnitSimilarity(canonical[i - 1], asr[j - 1].units);
      const diagonal = scores[i - 1][j - 1] + (similarity >= 0.58 ? similarity * 2 : -1.2);
      const skipCanonical = scores[i - 1][j] - 0.12;
      const skipAsr = scores[i][j - 1] - 0.35;
      if (diagonal >= skipCanonical && diagonal >= skipAsr) { scores[i][j] = diagonal; moves[i][j] = 1; }
      else if (skipCanonical >= skipAsr) { scores[i][j] = skipCanonical; moves[i][j] = 2; }
      else { scores[i][j] = skipAsr; moves[i][j] = 3; }
    }
  }
  const aligned = new Map<number, TimedToken[]>();
  let i = canonical.length;
  let j = asr.length;
  while (i > 0 || j > 0) {
    const move = moves[i]?.[j] ?? 0;
    if (move === 1) {
      if (recognitionUnitSimilarity(canonical[i - 1], asr[j - 1].units) >= 0.58) {
        const current = aligned.get(i - 1) ?? [];
        current.unshift(asr[j - 1]);
        aligned.set(i - 1, current);
      }
      i -= 1; j -= 1;
    } else if (move === 2) i -= 1;
    else if (move === 3) j -= 1;
    else break;
  }
  return aligned;
}

function reconstructPassage(
  selected: ScoredCandidate,
  confidence: number,
  chunks: readonly TranscriptChunk[],
  verses: readonly QuranCorpusVerse[],
): RecognitionMatch[] {
  const passage = verses.slice(selected.start, selected.end + 1);
  const canonical: Array<{ units: QuranRecognitionUnits; ayah: number }> = [];
  passage.forEach((verse, ayah) => {
    const orthographicWords = normalizedVerseWords(verse);
    const recitationWords = recitationVerseWords(verse);
    orthographicWords.forEach((word, index) => canonical.push({
      units: { orthographic: word, recitation: recitationWords[index] ?? normalizeQuranRecitation(word) },
      ayah,
    }));
  });
  const evidence = timedTokens(chunks);
  const aligned = alignTokens(canonical.map((token) => token.units), evidence);
  const byAyah = passage.map(() => [] as TimedToken[]);
  const textByAyah = passage.map(() => [] as string[]);
  aligned.forEach((tokens, canonicalIndex) => {
    const ayah = canonical[canonicalIndex].ayah;
    byAyah[ayah].push(...tokens);
    textByAyah[ayah].push(...tokens.map((token) => token.displayText));
  });
  // Candidate scoring may retain a harmless trailing canonical verse with no text
  // support. Do not report unsupported outer edges; interior ayat remain intact.
  const firstSupported = byAyah.findIndex((tokens) => tokens.length > 0);
  const lastSupported = byAyah.findLastIndex((tokens) => tokens.length > 0);
  if (firstSupported < 0 || lastSupported < firstSupported) return [];
  const activeStart = firstSupported;
  const activeEnd = lastSupported;
  const sourceDuration = Math.max(0, ...chunks.map((chunk) => chunk.endMs));
  const rawStarts = byAyah.map((tokens) => tokens.length ? Math.min(...tokens.map((token) => token.startMs)) : null);
  const rawEnds = byAyah.map((tokens) => tokens.length ? Math.max(...tokens.map((token) => token.endMs)) : null);
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
  return passage.slice(activeStart, activeEnd + 1).map((verse, offset) => {
    const index = activeStart + offset;
    const tokens = byAyah[index];
    const direct = tokens.some((token) => token.source === "direct-asr-word");
    const source = tokens.length ? (direct ? "direct-asr-word" : "chunk-text-alignment") : "interpolation";
    const startMs = Math.max(0, Math.min(sourceDuration, starts[index] ?? 0));
    const endMs = Math.max(startMs + 1, Math.min(sourceDuration, ends[index] ?? startMs + 1));
    return {
      verseKey: verse.verseKey,
      startMs,
      endMs,
      confidence: Number(confidence.toFixed(4)),
      timing: {
        start: { timestampMs: startMs, source },
        end: { timestampMs: endMs, source },
        matchedText: textByAyah[index].join(" "),
      },
    };
  });
}

type ScoredCandidate = {
  start: number;
  end: number;
  score: number;
  textSimilarity: number;
  tokenSequenceSimilarity: number;
  transcriptCoverage?: number;
  canonicalCoverage?: number;
  consecutiveAyat?: number;
};

function canonicalPassageTokens(passage: readonly QuranCorpusVerse[]) {
  const canonical: Array<{ units: QuranRecognitionUnits; ayah: number }> = [];
  passage.forEach((verse, ayah) => {
    const orthographicWords = normalizedVerseWords(verse);
    const recitationWords = recitationVerseWords(verse);
    orthographicWords.forEach((word, index) => canonical.push({
      units: { orthographic: word, recitation: recitationWords[index] ?? normalizeQuranRecitation(word) },
      ayah,
    }));
  });
  return canonical;
}

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
  const aligned = alignTokens(canonical.map((token) => token.units), [...evidence]);
  const matchedAsr = new Set<TimedToken>();
  const supportedAyat = new Set<number>();
  let similarityTotal = 0;
  let similarityCount = 0;
  aligned.forEach((tokens, canonicalIndex) => {
    if (!tokens.length) return;
    supportedAyat.add(canonical[canonicalIndex].ayah);
    for (const token of tokens) {
      matchedAsr.add(token);
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
  const canonicalCoverage = canonical.length ? aligned.size / canonical.length : 0;
  const sequenceConsistency = passage.length ? longestRun / passage.length : 0;
  const textSimilarity = combinedTextSimilarity(transcriptUnits, {
    orthographic: passage.map(normalizedVerseText).join(" "),
    recitation: passage.map(recitationVerseText).join(" "),
  });
  // Coverage is deliberately stronger than a locally plausible phrase. A short,
  // distinctive ayah can still win when it explains its complete transcript.
  const score = averageSimilarity * 0.34
    + transcriptCoverage * 0.34
    + canonicalCoverage * 0.12
    + sequenceConsistency * 0.16
    + textSimilarity * 0.04;
  return { start, end, score, textSimilarity, tokenSequenceSimilarity: averageSimilarity, transcriptCoverage, canonicalCoverage, consecutiveAyat: longestRun };
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
  const evidence = timedTokens(chunks);
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
  return {
    startVerseKey: verses[candidate.start].verseKey,
    endVerseKey: verses[candidate.end].verseKey,
    totalScore: Number(candidate.score.toFixed(4)),
    confidence: Number(confidence.toFixed(4)),
    textSimilarity: Number(candidate.textSimilarity.toFixed(4)),
    sequenceConsistency: Number(((candidate.consecutiveAyat ?? 0) / (candidate.end - candidate.start + 1)).toFixed(4)),
    transcriptCoverage: Number((candidate.transcriptCoverage ?? 0).toFixed(4)),
    consecutiveAyat: candidate.consecutiveAyat ?? 0,
  };
}

function bestCandidateForStarts(
  units: QuranRecognitionUnits,
  starts: readonly number[],
  verses: readonly QuranCorpusVerse[],
  maxVersesPerChunk: number,
): ScoredCandidate | null {
  let best: ScoredCandidate | null = null;
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
  options: { corpus?: readonly QuranCorpusVerse[]; minConfidence?: number; maxVersesPerChunk?: number; maxPassageVerses?: number; ambiguityMargin?: number } = {},
): RecognitionAnalysis {
  const verses = options.corpus ?? hafsVerses;
  const minConfidence = options.minConfidence ?? 0.64;
  const maxVersesPerChunk = options.maxVersesPerChunk ?? 5;
  const maxPassageVerses = options.maxPassageVerses ?? Math.max(5, Math.min(14, chunks.length * 3 + 4));
  const ambiguityMargin = options.ambiguityMargin ?? 0.075;
  const orderedChunks = [...chunks].sort((left, right) => left.startMs - right.startMs);
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
  const fullTranscript = normalizeArabic(orderedChunks.map((chunk) => chunk.text).join(" "));
  const emptyPassage: PassageInference = {
    state: "no-reliable-match", candidates: [], candidateMargin: null, selectedCandidate: null, disambiguatedByLaterChunks: false,
  };
  if (!fullTranscript || orderedChunks.some((chunk) => chunk.endMs < chunk.startMs)) return { matches: [], diagnostics, passage: emptyPassage };

  const priorityStarts = diagnostics.flatMap((diagnostic) => {
    const key = diagnostic.topCandidate?.startVerseKey;
    const index = key ? verses.findIndex((verse) => verse.verseKey === key) : -1;
    return index >= 0 ? [index] : [];
  });
  const global = scoreGlobalPassages(orderedChunks, verses, maxPassageVerses, priorityStarts);
  const ranked = global.candidates.slice(0, 3);
  const best = ranked[0];
  const runnerUp = ranked.find((candidate) => candidate.start !== best?.start || candidate.end !== best.end);
  const margin = best && runnerUp ? best.score - runnerUp.score : null;
  const bestDiagnostic = best ? passageDiagnostic(best, verses) : null;
  const sufficientEvidence = Boolean(
    best
      && best.score >= minConfidence
      && (best.transcriptCoverage ?? 0) >= 0.45
      && (best.consecutiveAyat ?? 0) >= 1
      && (best.textSimilarity >= 0.7 || (best.consecutiveAyat ?? 0) >= 2),
  );
  // A shorter contained window often matches the later ayat of a correct
  // passage. It is not a real ambiguity when it leaves meaningful transcript
  // evidence unexplained. Reserve ambiguity for candidates that explain the
  // same evidence almost equally well at a different Quran location.
  const ambiguous = Boolean(
    sufficientEvidence && runnerUp && (margin ?? 0) < ambiguityMargin && runnerUp.score >= minConfidence
      && (runnerUp.transcriptCoverage ?? 0) >= (best!.transcriptCoverage ?? 0) - 0.02
      && runnerUp.textSimilarity >= best!.textSimilarity - 0.02,
  );
  const state: PassageAmbiguityState = !sufficientEvidence ? "no-reliable-match" : ambiguous ? "plausible-ambiguous" : "confident-unique";
  const selectedCandidate = state === "confident-unique" ? bestDiagnostic : null;
  const firstChunkBest = diagnostics.find((diagnostic) => diagnostic.topCandidate)?.topCandidate;
  const disambiguatedByLaterChunks = Boolean(
    selectedCandidate && firstChunkBest
      && (firstChunkBest.startVerseKey !== selectedCandidate.startVerseKey || firstChunkBest.endVerseKey !== selectedCandidate.endVerseKey),
  );
  const passage: PassageInference = {
    state,
    candidates: ranked.map((candidate) => passageDiagnostic(candidate, verses)),
    candidateMargin: margin === null ? null : Number(margin.toFixed(4)),
    selectedCandidate,
    disambiguatedByLaterChunks,
  };
  if (state !== "confident-unique" || !best) return { matches: [], diagnostics, passage };
  return {
    matches: reconstructPassage(best, bestDiagnostic!.confidence, orderedChunks, verses),
    diagnostics,
    passage,
  };
}

export function recognizeTranscript(
  chunks: readonly TranscriptChunk[],
  options: { corpus?: readonly QuranCorpusVerse[]; minConfidence?: number; maxVersesPerChunk?: number; maxPassageVerses?: number; ambiguityMargin?: number } = {},
): RecognitionResult {
  return analyzeTranscript(chunks, options).matches;
}
