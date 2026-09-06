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
  summarizeFastConformerIdentification,
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

// Captured lexical shape of the reported noisy Al-Muddaththir start: the
// basmalah is acoustic-only, followed by distinctive Surah 74 evidence.
const muddaththirBoundaryIndex = buildQuranWideLexicalIndex([
  [73, 20, 72, "اجرا"], [73, 20, 73, "واستغفروا"], [73, 20, 74, "الله"], [73, 20, 75, "ان"], [73, 20, 76, "الله"], [73, 20, 77, "غفور"], [73, 20, 78, "رحيم"],
  [74, 1, 1, "يايها"], [74, 1, 2, "المدثر"], [74, 2, 1, "قم"], [74, 2, 2, "فانذر"], [74, 3, 1, "وربك"], [74, 3, 2, "فكبر"], [74, 4, 1, "وثيابك"], [74, 4, 2, "فطهر"], [74, 5, 1, "والرجز"], [74, 5, 2, "فاهجر"], [74, 6, 1, "ولا"], [74, 6, 2, "تمنن"], [74, 6, 3, "تستكثر"], [74, 7, 1, "ولربك"], [74, 7, 2, "فاصبر"], [74, 8, 1, "فاذا"], [74, 8, 2, "نقر"], [74, 8, 3, "في"], [74, 8, 4, "الناقور"], [74, 9, 1, "فذلك"],
].map(([surah, ayah, canonicalWordIndex, lexicalText], index) => ({
  surah: surah as number, ayah: ayah as number, canonicalWordIndex: canonicalWordIndex as number, globalWordIndex: index + 1,
  canonicalArabic: lexicalText as string, lexicalText: lexicalText as string, ctcTokenIds: [index + 1],
  ...(surah === 74 && ayah === 1 && canonicalWordIndex === 1 ? { optionalPreludeCtcTokenIds: [90, 91, 92, 93], optionalPreludeLexicalText: "بسم الله الرحمن الرحيم" } : {}),
})));

test("Quran-wide lexical index retains reversible canonical word mappings", () => {
  assert.equal(index.words[0]?.globalWordIndex, 1);
  assert.deepEqual(index.words[3] && { surah: index.words[3].surah, ayah: index.words[3].ayah, word: index.words[3].canonicalWordIndex }, { surah: 6, ayah: 75, word: 2 });
  assert.deepEqual(index.ctcTokenIds.slice(0, 4), [1, 2, 3, 4]);
});

test("coarse retrieval returns contiguous same-surah cross-ayah and mid-ayah candidates from noisy greedy tokens", () => {
  const candidates = retrieveQuranCandidates(index, ["قال", "وكذلك", "نري"]);
  assert.ok(candidates.some((candidate) => candidate.start.surah === 6 && candidate.start.ayah === 74 && candidate.start.canonicalWordIndex <= 2 && candidate.end.ayah >= 75));
  assert.ok(candidates.every((candidate) => candidate.startPosition <= candidate.endPosition && candidate.start.surah === candidate.end.surah));
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

test("global indexing stays reversible while candidate expansion rejects the 73:20 to 74 boundary", () => {
  assert.equal(muddaththirBoundaryIndex.words[6]?.surah, 73);
  assert.equal(muddaththirBoundaryIndex.words[7]?.surah, 74);
  assert.ok(!muddaththirBoundaryIndex.ngramPositions.has("رحيم\u0001يايها"));
  const candidates = retrieveQuranCandidates(muddaththirBoundaryIndex, ["بسم", "الله", "الرحمن", "الرحيم", "يايها", "المدثر", "قم", "فانذر", "وربك", "فكبر"]);
  assert.ok(candidates.some((candidate) => candidate.start.surah === 74 && candidate.end.surah === 74));
  assert.ok(candidates.every((candidate) => candidate.start.surah === candidate.end.surah));
  assert.ok(!candidates.some((candidate) => candidate.start.surah === 73 && candidate.end.surah === 74));
});

test("basmalah-only evidence has no Quran-wide location authority, while post-prelude lexical evidence locates Surah 74", () => {
  assert.deepEqual(retrieveQuranCandidates(muddaththirBoundaryIndex, ["بسم", "الله", "الرحمن", "الرحيم"]), []);
  const candidates = retrieveQuranCandidates(muddaththirBoundaryIndex, ["بسم", "الله", "الرحمن", "الرحيم", "يايها", "المدثر", "قم", "فانذر"]);
  assert.ok(candidates.some((candidate) => candidate.start.surah === 74));
});

test("clean known passages remain retrievable without a cross-surah extension", () => {
  const cleanIndex = buildQuranWideLexicalIndex([
    [93, 1, 1, "والضحي"], [93, 2, 1, "والليل"], [93, 2, 2, "اذا"], [93, 2, 3, "سجي"], [93, 3, 1, "ما"], [93, 3, 2, "ودعك"], [93, 3, 3, "ربك"], [93, 3, 4, "وما"], [93, 3, 5, "قلي"], [93, 4, 1, "وللاخره"], [93, 5, 1, "ولسوف"],
    [6, 74, 1, "واذ"], [6, 74, 2, "قال"], [6, 75, 1, "وكذلك"], [6, 76, 1, "فلما"], [6, 77, 1, "فلما"],
    [69, 19, 1, "فاما"], [69, 19, 2, "من"], [69, 19, 3, "اوتي"], [69, 19, 4, "كتابه"], [69, 20, 1, "فهو"], [69, 21, 1, "فهو"], [69, 22, 1, "في"], [69, 23, 1, "في"], [69, 24, 1, "فيقول"], [69, 25, 1, "واما"], [69, 26, 1, "فليس"], [69, 27, 1, "وما"], [69, 28, 1, "هلك"], [69, 29, 1, "هلك"], [69, 30, 1, "خذوه"], [69, 31, 1, "ثم"], [69, 32, 1, "ثم"],
    [3, 33, 1, "ان"], [3, 33, 2, "الله"], [3, 33, 3, "اصطفي"], [3, 33, 4, "ادم"], [3, 33, 5, "ونوحا"], [3, 34, 1, "ذريه"], [3, 35, 1, "اذ"], [3, 35, 2, "قالت"],
  ].map(([surah, ayah, canonicalWordIndex, lexicalText], index) => ({
    surah: surah as number, ayah: ayah as number, canonicalWordIndex: canonicalWordIndex as number, globalWordIndex: index + 1,
    canonicalArabic: lexicalText as string, lexicalText: lexicalText as string, ctcTokenIds: [index + 1],
  })));
  for (const [surah, tokens] of [[93, ["والضحي", "والليل", "اذا", "سجي", "ما", "ودعك"]], [6, ["واذ", "قال", "وكذلك", "فلما"]], [69, ["فاما", "من", "اوتي", "كتابه", "فهو"]], [3, ["ان", "الله", "اصطفي", "ادم", "ونوحا"]]] as const) {
    const candidates = retrieveQuranCandidates(cleanIndex, tokens);
    assert.ok(candidates.some((candidate) => candidate.start.surah === surah));
    assert.ok(candidates.every((candidate) => candidate.start.surah === candidate.end.surah));
  }
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
    { ...words[0]!, lexicalText: "قال", ctcTokenIds: [2], optionalPreludeCtcTokenIds: [1], optionalPreludeLexicalText: "بسم الله الرحمن الرحيم" },
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
  assert.equal(result.selectedCandidate?.optionalPrelude.canonicalFirstWordStart.canonicalWordIndex, 1);
  assert.notEqual(result.selectedCandidate?.optionalPrelude.selected, undefined);
});

test("optional-prelude scoring selects present and absent without changing the canonical candidate start", () => {
  const preludeIndex = buildQuranWideLexicalIndex([
    { surah: 74, ayah: 1, canonicalWordIndex: 1, globalWordIndex: 1, canonicalArabic: "يايها", lexicalText: "يايها", ctcTokenIds: [2], optionalPreludeCtcTokenIds: [1], optionalPreludeLexicalText: "بسم الله الرحمن الرحيم" },
    { surah: 74, ayah: 1, canonicalWordIndex: 2, globalWordIndex: 2, canonicalArabic: "المدثر", lexicalText: "المدثر", ctcTokenIds: [3] },
  ]);
  const input = (values: number[]) => identifyQuranWindow(preludeIndex, {
    index: 0, startMs: 0, endMs: 600, voicedMs: 600,
    logits: { values: new Float32Array(values), frames: 3, vocabularySize: 4 },
    vocabulary: { "0": "<blank>", "1": "▁بسم", "2": "▁يايها", "3": "▁المدثر" }, blankTokenId: 0,
  });
  const present = input([0, 9, 0, 0, 0, 0, 9, 0, 0, 0, 0, 9]).selectedCandidate!;
  const absent = input([0, 0, 9, 0, 0, 0, 0, 9, 9, 0, 0, 0]).selectedCandidate!;
  assert.equal(present.optionalPrelude.selected, "present");
  assert.equal(absent.optionalPrelude.selected, "absent");
  assert.deepEqual(present.start, absent.start);
  assert.equal(present.start.surah, 74);
  assert.equal(present.start.canonicalWordIndex, 1);
});

function candidate(startPosition: number, endPosition: number, surah: number, startAyah: number, endAyah: number, score: number): QuranPassageCandidate {
  return {
    start: { surah, ayah: startAyah, canonicalWordIndex: 1, globalWordIndex: startPosition + 1 },
    end: { surah, ayah: endAyah, canonicalWordIndex: 2, globalWordIndex: endPosition + 1 },
    startPosition, endPosition, retrievalScore: 1, ctcScore: score * 10, normalizedCtcScore: score, confidence: 0.8, marginFromSecond: 0.1, ctcTokenCount: 2,
    optionalPrelude: { available: false, selected: "absent", lexicalText: "", canonicalFirstWordStart: { surah, ayah: startAyah, canonicalWordIndex: 1, globalWordIndex: startPosition + 1 }, canonicalOnlyScore: score * 10, optionalBasmalahPlusCanonicalScore: null },
  };
}

function window(index: number, candidates: QuranPassageCandidate[]): IdentificationWindowResult {
  return { index, startMs: index * 6_000, endMs: index * 6_000 + 12_000, voicedMs: 8_000, greedy: { tokenIds: [], lexicalText: "", lexicalTokens: [] }, candidates, selectedCandidate: candidates[0] ?? null, state: candidates.length ? "strong-candidate" : "no-usable-evidence", elapsedMs: 0, performance: { retrievalMs: 0, rerankingMs: 0, candidatesReranked: candidates.length }, crossSurahCandidatesRejected: 0 };
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

test("Surah 74 consensus prevents one anomalous 73 window from widening the solved canonical span", () => {
  const anomaly = candidate(0, 6, 73, 20, 20, -0.05);
  const first = candidate(7, 14, 74, 1, 4, -0.2);
  first.optionalPrelude = { available: true, selected: "present", lexicalText: "بسم الله الرحمن الرحيم", canonicalFirstWordStart: first.start, canonicalOnlyScore: -3, optionalBasmalahPlusCanonicalScore: -2 };
  const solution = solveQuranContinuity([
    window(0, [first, anomaly]),
    window(1, [candidate(11, 18, 74, 2, 6, -0.22)]),
    window(2, [candidate(17, 25, 74, 5, 8, -0.24)]),
    window(3, [candidate(22, 27, 74, 7, 9, -0.26)]),
  ]);
  const summary = summarizeFastConformerIdentification([
    window(0, [first, anomaly]), window(1, [candidate(11, 18, 74, 2, 6, -0.22)]), window(2, [candidate(17, 25, 74, 5, 8, -0.24)]), window(3, [candidate(22, 27, 74, 7, 9, -0.26)]),
  ], 1);
  assert.equal(solution.selectedSurah, 74);
  assert.deepEqual(solution.span && [solution.span.start.surah, solution.span.start.ayah, solution.span.end.surah, solution.span.end.ayah], [74, 1, 74, 9]);
  assert.deepEqual(solution.path.map((entry) => entry.candidate && [entry.candidate.start.ayah, entry.candidate.end.ayah]), [[1, 4], [2, 6], [5, 8], [7, 9]]);
  assert.equal(summary.canonicalSpan?.start.surah, 74);
  assert.equal(summary.optionalPrelude?.selected, "present");
  assert.equal(summary.CROSS_SURAH_CANDIDATES_REJECTED, 0);
});

test("FastConformer-vs-Whisper comparison is diagnostic and reports word-level agreement separately", () => {
  const shadow = {
    status: "complete" as const, span: { start: { surah: 6, ayah: 74, canonicalWordIndex: 2, globalWordIndex: 2 }, end: { surah: 6, ayah: 75, canonicalWordIndex: 2, globalWordIndex: 4 } }, canonicalSpan: { start: { surah: 6, ayah: 74, canonicalWordIndex: 2, globalWordIndex: 2 }, end: { surah: 6, ayah: 75, canonicalWordIndex: 2, globalWordIndex: 4 } }, wordLevelSpan: null, selectedSurah: 6, optionalPrelude: null, surahConsensus: { selectedSurah: 6, strongWindowCount: 2, agreeingStrongWindows: 2 },
    windowResults: [], retrievalCandidates: [], normalizedCtcScore: -0.2, margin: 0.1, continuityScore: 1, confidence: { composite: 0.8, normalizedBestCtcScore: -0.2, bestVsSecondMargin: 0.1, agreeingWindows: 2, voicedAudioExplained: 1 }, performance: { inferenceMs: 1, retrievalMs: 1, rerankingMs: 1, candidatesReranked: 2, totalMs: 3 }, CROSS_SURAH_CANDIDATES_REJECTED: 0,
  };
  const comparison = comparePassageIdentification({ engine: "whisper-quran-matcher", span: { firstVerseKey: "6:74", lastVerseKey: "6:75", firstWordIndex: 2, lastWordIndex: 2 }, confidence: 0.7 }, shadow);
  assert.deepEqual(comparison.agreement, { sameSurah: true, overlappingAyat: true, exactSpan: true });
});
