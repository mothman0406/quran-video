import assert from "node:assert/strict";
import test from "node:test";
import {
  buildQuranWideLexicalIndex,
  comparePassageIdentification,
  ctcForwardScore,
  greedyDecodeCtc,
  identifyQuranWindow,
  retrieveQuranCandidates,
  solveQuranContinuity,
  type IdentificationWindowResult,
  type QuranPassageCandidate,
} from "../src/lib/recognition/fastconformer-identification.ts";

const words = [
  [6, 74, 1, "واذ", 1], [6, 74, 2, "قال", 2], [6, 75, 1, "وكذلك", 3], [6, 75, 2, "نري", 4],
  [6, 76, 1, "فلما", 5], [6, 76, 2, "جن", 6], [6, 77, 1, "فلما", 7], [6, 77, 2, "راي", 8],
  [69, 19, 1, "فاما", 9], [69, 19, 2, "من", 10], [69, 19, 3, "اوتي", 11], [69, 19, 4, "كتابه", 12],
].map(([surah, ayah, canonicalWordIndex, lexicalText, globalWordIndex]) => ({
  surah: surah as number, ayah: ayah as number, canonicalWordIndex: canonicalWordIndex as number, globalWordIndex: globalWordIndex as number,
  canonicalArabic: lexicalText as string, lexicalText: lexicalText as string, ctcTokenIds: [globalWordIndex as number],
}));

const index = buildQuranWideLexicalIndex(words);

test("Quran-wide lexical index retains reversible canonical word mappings", () => {
  assert.equal(index.words[0]?.globalWordIndex, 1);
  assert.deepEqual(index.words[3] && { surah: index.words[3].surah, ayah: index.words[3].ayah, word: index.words[3].canonicalWordIndex }, { surah: 6, ayah: 75, word: 2 });
  assert.deepEqual(index.ctcTokenIds.slice(0, 4), [1, 2, 3, 4]);
});

test("coarse retrieval returns contiguous cross-ayah and mid-ayah candidates from noisy greedy tokens", () => {
  const candidates = retrieveQuranCandidates(index, ["قال", "وكذلك", "نري"]);
  assert.ok(candidates.some((candidate) => candidate.start.surah === 6 && candidate.start.ayah === 74 && candidate.start.canonicalWordIndex <= 2 && candidate.end.ayah >= 75));
  assert.ok(candidates.every((candidate) => candidate.startPosition <= candidate.endPosition));
});

test("candidate construction preserves a long single-ayah range instead of forcing an ayah boundary", () => {
  const lexical = Array.from({ length: 30 }, (_, index) => `ك${String.fromCharCode(0x0621 + index)}`);
  const longAyah = buildQuranWideLexicalIndex(lexical.map((lexicalText, index) => ({
    surah: 18, ayah: 57, canonicalWordIndex: index + 1, globalWordIndex: index + 1,
    canonicalArabic: lexicalText, lexicalText, ctcTokenIds: [index + 1],
  })));
  const candidates = retrieveQuranCandidates(longAyah, lexical.slice(4, 22));
  assert.ok(candidates.some((candidate) => candidate.start.ayah === 57 && candidate.end.ayah === 57 && candidate.start.canonicalWordIndex > 1 && candidate.end.canonicalWordIndex > 18));
});

test("greedy CTC collapse removes repeats and blank without creating canonical text", () => {
  const decode = greedyDecodeCtc({ values: new Float32Array([
    0, 8, 0, 0,
    0, 8, 0, 0,
    9, 0, 0, 0,
    0, 0, 8, 0,
  ]), frames: 4, vocabularySize: 4 }, { "0": "<blank>", "1": "▁قال", "2": "▁وكذلك", "3": "<unk>" }, 0);
  assert.deepEqual(decode.tokenIds, [1, 2]);
  assert.deepEqual(decode.lexicalTokens, ["قال", "وكذلك"]);
});

test("forward CTC scoring ranks the acoustically supported target and normalizes per frame", () => {
  const logits = { values: new Float32Array([
    0, 9, 0,
    8, 0, 0,
    0, 0, 9,
  ]), frames: 3, vocabularySize: 3 };
  const correct = ctcForwardScore(logits, [1, 2], 0)!;
  const incorrect = ctcForwardScore(logits, [2, 1], 0)!;
  assert.ok(correct > incorrect);
  assert.ok(Number.isFinite(correct / logits.frames));
});

test("window CTC reranking beats lexical-only ambiguity and supports an optional basmalah target", () => {
  const basmalahIndex = buildQuranWideLexicalIndex([
    { ...words[0]!, lexicalText: "قال", ctcTokenIds: [2], optionalPreludeCtcTokenIds: [1] },
    { ...words[1]!, lexicalText: "قال", ctcTokenIds: [3] },
    { ...words[2]!, lexicalText: "اخر", ctcTokenIds: [4] },
  ]);
  const result = identifyQuranWindow(basmalahIndex, {
    index: 0, startMs: 0, endMs: 500, voicedMs: 500,
    logits: { values: new Float32Array([
      0, 9, 0, 0, 0,
      0, 0, 9, 0, 0,
      0, 0, 0, 9, 0,
      9, 0, 0, 0, 0,
      0, 0, 0, 0, 9,
    ]), frames: 5, vocabularySize: 5 },
    vocabulary: { "0": "<blank>", "1": "▁بسم", "2": "▁قال", "3": "▁قال", "4": "▁اخر" }, blankTokenId: 0,
  });
  assert.equal(result.selectedCandidate?.start.globalWordIndex, 1);
  assert.ok(result.selectedCandidate?.normalizedCtcScore !== null);
  assert.ok(result.candidates[0]?.marginFromSecond === null || Number.isFinite(result.candidates[0]?.marginFromSecond));
});

function candidate(startPosition: number, endPosition: number, surah: number, startAyah: number, endAyah: number, score: number): QuranPassageCandidate {
  return {
    start: { surah, ayah: startAyah, canonicalWordIndex: 1, globalWordIndex: startPosition + 1 },
    end: { surah, ayah: endAyah, canonicalWordIndex: 2, globalWordIndex: endPosition + 1 },
    startPosition, endPosition, retrievalScore: 1, ctcScore: score * 10, normalizedCtcScore: score, confidence: 0.8, marginFromSecond: 0.1, ctcTokenCount: 2,
  };
}

function window(index: number, candidates: QuranPassageCandidate[]): IdentificationWindowResult {
  return { index, startMs: index * 6_000, endMs: index * 6_000 + 12_000, voicedMs: 8_000, greedy: { tokenIds: [], lexicalText: "", lexicalTokens: [] }, candidates, selectedCandidate: candidates[0] ?? null, state: candidates.length ? "strong-candidate" : "no-usable-evidence", elapsedMs: 0, performance: { retrievalMs: 0, rerankingMs: 0, candidatesReranked: candidates.length } };
}

test("continuity Viterbi tolerates an unusable window and rejects backward or unrelated surah jumps", () => {
  const solution = solveQuranContinuity([
    window(0, [candidate(0, 3, 6, 74, 74, -0.2)]),
    window(1, [candidate(2, 5, 6, 75, 76, -0.25), candidate(80, 82, 69, 19, 19, -0.1)]),
    window(2, []),
    window(3, [candidate(6, 7, 6, 77, 77, -0.25), candidate(1, 2, 6, 74, 75, -0.05)]),
  ]);
  assert.deepEqual(solution.span && [solution.span.start.surah, solution.span.start.ayah, solution.span.end.surah, solution.span.end.ayah], [6, 74, 6, 77]);
  assert.equal(solution.path[2]?.candidate, null);
  assert.equal(solution.agreeingWindows, 3);
});

test("FastConformer-vs-Whisper comparison is diagnostic and reports word-level agreement separately", () => {
  const shadow = {
    status: "complete" as const, span: { start: { surah: 6, ayah: 74, canonicalWordIndex: 2, globalWordIndex: 2 }, end: { surah: 6, ayah: 75, canonicalWordIndex: 2, globalWordIndex: 4 } }, wordLevelSpan: null,
    windowResults: [], retrievalCandidates: [], normalizedCtcScore: -0.2, margin: 0.1, continuityScore: 1, confidence: { composite: 0.8, normalizedBestCtcScore: -0.2, bestVsSecondMargin: 0.1, agreeingWindows: 2, voicedAudioExplained: 1 }, performance: { inferenceMs: 1, retrievalMs: 1, rerankingMs: 1, candidatesReranked: 2, totalMs: 3 },
  };
  const comparison = comparePassageIdentification({ engine: "whisper-quran-matcher", span: { firstVerseKey: "6:74", lastVerseKey: "6:75", firstWordIndex: 2, lastWordIndex: 2 }, confidence: 0.7 }, shadow);
  assert.deepEqual(comparison.agreement, { sameSurah: true, overlappingAyat: true, exactSpan: true });
});
