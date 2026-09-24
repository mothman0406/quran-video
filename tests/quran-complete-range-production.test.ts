import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { FastConformerIdentificationResult, IdentificationWindowResult, QuranPassageCandidate } from "../src/lib/recognition/fastconformer-identification.ts";
import { completeBoundedEdges, type EdgeAcousticEvidence } from "../src/lib/recognition/quran-edge-completion.ts";
import { canonicalSpanFromExactRange, resolveQuranCore, versesForExactRange } from "../src/lib/recognition/quran-complete-range.ts";
import { reconstructCanonicalPassage as productionReconstruct } from "../src/lib/recognition/canonical-passage-reconstruction.ts";
import { reconstructCanonicalPassage as offlineReconstruct } from "../tools/regression/canonical-passage-reconstruction.ts";

function candidate(surah: number, startAyah: number, endAyah: number, startWord: number, endWord: number): QuranPassageCandidate {
  return {
    start: { surah, ayah: startAyah, canonicalWordIndex: 1, globalWordIndex: startWord },
    end: { surah, ayah: endAyah, canonicalWordIndex: 1, globalWordIndex: endWord },
    startPosition: startWord,
    endPosition: endWord,
    retrievalScore: 1,
    lexicalUniqueness: 1,
    lexicalCoverage: 1,
    targetCoverage: 1,
    ctcScore: -1,
    normalizedCtcScore: -0.1,
    confidence: 1,
    marginFromSecond: 1,
    ctcTokenCount: 8,
    origins: ["local"],
    optionalPrelude: {
      available: false,
      selected: "absent",
      lexicalText: "",
      canonicalFirstWordStart: { surah, ayah: startAyah, canonicalWordIndex: 1, globalWordIndex: startWord },
      canonicalOnlyScore: -0.1,
      optionalBasmalahPlusCanonicalScore: null,
    },
  };
}

function identification(local: Array<QuranPassageCandidate | null>, coherent: Array<QuranPassageCandidate | null>): FastConformerIdentificationResult {
  const windows: IdentificationWindowResult[] = local.map((selectedCandidate, index) => ({
    index,
    startMs: index * 6_000,
    endMs: index * 6_000 + 12_000,
    voicedMs: 8_000,
    greedy: { tokenIds: [], lexicalText: "", lexicalTokens: [] },
    candidates: selectedCandidate ? [selectedCandidate] : [],
    selectedCandidate,
    state: selectedCandidate ? "strong-candidate" : "no-usable-evidence",
    elapsedMs: 1,
    performance: { retrievalMs: 0, rerankingMs: 0, candidatesReranked: selectedCandidate ? 1 : 0 },
    crossSurahCandidatesRejected: 0,
    continuation: { anchorActive: Boolean(selectedCandidate), anchorSpan: null, globalCandidateCount: 0, localCandidateCount: selectedCandidate ? 1 : 0, selectedOrigin: selectedCandidate ? "local" : null, event: selectedCandidate ? "anchor-advanced" : "none", reason: null },
  }));
  const path = coherent.map((entry, index) => ({ windowIndex: index, candidate: entry }));
  const selected = coherent.filter((entry): entry is QuranPassageCandidate => entry !== null);
  return {
    status: selected.length ? "complete" : "unavailable",
    span: selected.length ? { start: selected[0]!.start, end: selected.at(-1)!.end } : null,
    canonicalSpan: selected.length ? { start: selected[0]!.start, end: selected.at(-1)!.end } : null,
    wordLevelSpan: selected.length ? { start: selected[0]!.start, end: selected.at(-1)!.end } : null,
    selectedSurah: selected[0]?.start.surah ?? null,
    optionalPrelude: null,
    surahConsensus: { selectedSurah: selected[0]?.start.surah ?? null, strongWindowCount: selected.length, agreeingStrongWindows: selected.length },
    windowResults: windows,
    retrievalCandidates: local.filter((entry): entry is QuranPassageCandidate => entry !== null),
    normalizedCtcScore: selected[0]?.normalizedCtcScore ?? null,
    margin: 1,
    continuityScore: 1,
    globalHypotheses: selected.length ? [{ surah: selected[0]!.start.surah, span: { start: selected[0]!.start, end: selected.at(-1)!.end }, path, acousticScore: -0.1, lexicalUniqueness: 1, continuityScore: 1, voicedCoverage: 1, localSharedPhraseScore: 0, finalScore: 1, agreeingWindows: selected.length }] : [],
    confidence: { composite: 1, normalizedBestCtcScore: -0.1, bestVsSecondMargin: 1, agreeingWindows: selected.length, voicedAudioExplained: 1 },
    performance: { inferenceMs: 1, retrievalMs: 0, rerankingMs: 0, candidatesReranked: local.length, totalMs: 1 },
    CROSS_SURAH_CANDIDATES_REJECTED: 0,
  };
}

test("production core orchestration prefers coherent canonical reconstruction and is deterministic", () => {
  const path = [candidate(91, 1, 4, 100, 120), candidate(91, 3, 7, 112, 135), candidate(91, 6, 10, 128, 150), candidate(91, 9, 15, 145, 170)];
  const first = resolveQuranCore(identification(path, path));
  const second = resolveQuranCore(identification(path, path));
  assert.equal(first.accepted, true);
  assert.equal(first.source, "canonical");
  assert.deepEqual(first.core && [first.core.surah, first.core.startAyah, first.core.endAyah], [91, 1, 15]);
  assert.deepEqual(first, second);
});

test("offline evaluators and production import the identical frozen decision function", () => {
  assert.strictEqual(offlineReconstruct, productionReconstruct);
});

test("all-null coherent path exposes a provisional local core but still requires integrity", () => {
  const local = [candidate(101, 2, 4, 200, 220), candidate(101, 4, 7, 215, 240), candidate(101, 7, 9, 235, 255), candidate(101, 9, 11, 250, 270)];
  const result = resolveQuranCore(identification(local, local.map(() => null)));
  assert.equal(result.accepted, true);
  assert.equal(result.source, "provisional");
  assert.deepEqual(result.core && [result.core.startAyah, result.core.endAyah], [2, 11]);
});

test("repeated tail and backward/out-of-order evidence cannot become a production passage", () => {
  const forward = [1, 3, 5, 7, 9, 11].map((ayah, index) => candidate(82, ayah, Math.min(19, ayah + 3), 100 + index * 12, 120 + index * 12));
  const reset = [candidate(82, 1, 3, 100, 120), candidate(82, 3, 6, 112, 135)];
  const repeated = resolveQuranCore(identification([...forward, ...reset], [...forward, ...reset]));
  assert.equal(repeated.accepted, false);
  assert.equal(repeated.whisperFallbackEligible, false);
  assert.match(repeated.reason ?? "", /whole-recording-integrity/);

  const outOfOrder = [candidate(84, 16, 20, 400, 430), candidate(84, 20, 25, 425, 460), candidate(84, 1, 5, 100, 130), candidate(84, 5, 10, 125, 160)];
  const rejectedOrder = resolveQuranCore(identification(outOfOrder, outOfOrder));
  assert.equal(rejectedOrder.accepted, false);
  assert.equal(rejectedOrder.whisperFallbackEligible, false);
});

test("bounded edge verification recovers only a proven missing start and rejects false extensions", () => {
  const winningStart: EdgeAcousticEvidence = { edge: "start", candidateAyah: 1, voicedDurationMs: 920, candidateTokenCount: 4, alignedTokenCount: 4, candidateLogLikelihoodPerFrame: -4.7, noExtensionLogLikelihoodPerFrame: -7.1, alignmentComplete: true, temporallyOrderedOutsideCore: true, overlapsCoreAudio: false, optionalBasmalahOnly: false };
  const losingEnd: EdgeAcousticEvidence = { edge: "end", candidateAyah: 12, voicedDurationMs: 900, candidateTokenCount: 4, alignedTokenCount: 4, candidateLogLikelihoodPerFrame: -8, noExtensionLogLikelihoodPerFrame: -2, alignmentComplete: true, temporallyOrderedOutsideCore: true, overlapsCoreAudio: false, optionalBasmalahOnly: false };
  const completed = completeBoundedEdges({ core: { surah: 101, startAyah: 2, endAyah: 11 }, surahAyahCount: 11, startEvidence: winningStart, endEvidence: losingEnd });
  assert.deepEqual(completed.range, { surah: 101, startAyah: 1, endAyah: 11 });
  assert.equal(completed.start.extended, true);
  assert.equal(completed.end.extended, false);
});

test("exact-range expansion supplies every canonical ayah once to the final target", () => {
  const range = { surah: 86, startAyah: 1, endAyah: 12 };
  const verses = versesForExactRange(range);
  const span = canonicalSpanFromExactRange(range);
  assert.deepEqual(verses.map((verse) => verse.verseKey), Array.from({ length: 12 }, (_, index) => `86:${index + 1}`));
  assert.deepEqual(span?.coveredVerseKeys, verses.map((verse) => verse.verseKey));
  assert.equal(new Set(span?.coveredVerseKeys).size, 12);
});

test("production uses one global identification and the reused final forced alignment", () => {
  const worker = readFileSync(new URL("../src/lib/recognition/recognition-worker.ts", import.meta.url), "utf8");
  const fastConformer = readFileSync(new URL("../src/lib/recognition/local-fastconformer.ts", import.meta.url), "utf8");
  const generation = readFileSync(new URL("../src/lib/video-generation.ts", import.meta.url), "utf8");
  const editor = readFileSync(new URL("../src/components/editor-client.tsx", import.meta.url), "utf8");
  assert.equal((worker.match(/createFastConformerIdentificationRunner\(/g) ?? []).length, 1);
  assert.match(worker, /job\.identification = result/);
  assert.match(worker, /createCompleteRangeFastConformerRunner\(job\.audio, job\.speechRegions/);
  assert.match(fastConformer, /globalQuranSearches: 1 as const/);
  assert.match(fastConformer, /const finalVerses = versesForExactRange\(exactRange\)/);
  assert.match(fastConformer, /const finalLogits = sliceCtcLogits\(fullLogits/);
  assert.match(fastConformer, /forceAlignCtc\(encoded\.canonicalWords, encoded\.targetTokens, finalLogits/);
  for (const source of [generation, editor]) {
    assert.match(source, /worker\.completeRange\(/);
    assert.match(source, /useFastConformer[^\n]*completeRange\.alignment/);
    assert.match(source, /allowWhisperFallback = completeRange\.coreDecision\.whisperFallbackEligible/);
  }
});
