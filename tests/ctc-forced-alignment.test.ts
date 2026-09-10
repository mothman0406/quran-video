import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalCtcWords,
  coherentCtcRepeatHints,
  expandCtcTargetWithRepeats,
  forceAlignCtc,
  viterbiCtcPath,
  type CtcCanonicalWord,
  type CtcFrameLogits,
  type CtcTargetToken,
} from "../src/lib/recognition/ctc-forced-alignment.ts";

const words: CtcCanonicalWord[] = [
  { verseKey: "6:76", canonicalWordIndex: 1, globalWordIndex: 1, canonicalArabic: "قال", alignmentText: "قال" },
  { verseKey: "6:76", canonicalWordIndex: 2, globalWordIndex: 2, canonicalArabic: "هذا", alignmentText: "هذا" },
  { verseKey: "6:77", canonicalWordIndex: 1, globalWordIndex: 3, canonicalArabic: "ربي", alignmentText: "ربي" },
];
const tokens: CtcTargetToken[] = [
  { tokenId: 1, token: "a", globalWordIndex: 1 }, { tokenId: 2, token: "b", globalWordIndex: 1 },
  { tokenId: 3, token: "c", globalWordIndex: 2 }, { tokenId: 4, token: "d", globalWordIndex: 2 },
  { tokenId: 5, token: "e", globalWordIndex: 3 }, { tokenId: 6, token: "f", globalWordIndex: 3 },
];

function logitsFor(ids: number[], vocabularySize = 7): CtcFrameLogits {
  const values = new Float32Array(ids.length * vocabularySize).fill(-12);
  ids.forEach((id, frame) => { values[frame * vocabularySize + id] = 12; });
  return { values, frames: ids.length, vocabularySize };
}

test("CTC forced alignment gives every canonical word a deterministic acoustic timing", () => {
  const logits = logitsFor([0, 1, 1, 2, 0, 3, 4, 0, 5, 6, 0]);
  const first = forceAlignCtc(words, tokens, logits, { blankTokenId: 0, startMs: 5_000, endMs: 16_000, finalSpeechEndMs: 15_950 });
  const second = forceAlignCtc(words, tokens, logits, { blankTokenId: 0, startMs: 5_000, endMs: 16_000, finalSpeechEndMs: 15_950 });
  assert.equal(first.status, "complete");
  assert.deepEqual({ ...first, performance: undefined }, { ...second, performance: undefined });
  assert.deepEqual(first.words.map((word) => [word.globalWordIndex, word.startMs < word.endMs]), [[1, true], [2, true], [3, true]]);
  assert.equal(first.verses[0]?.endMs, first.verses[1]?.startMs, "non-final end is exactly the following ayah start");
  assert.equal(first.verses.at(-1)?.endMs, 15_950, "final ayah reaches VAD-constrained completion");
});

test("CTC pause association happens after canonical word alignment", () => {
  const result = forceAlignCtc(words, tokens, logitsFor([1, 2, 0, 0, 0, 3, 4, 0, 0, 5, 6]), { blankTokenId: 0, startMs: 0, endMs: 1_100 });
  assert.equal(result.status, "complete");
  assert.ok(result.pauses.some((pause) => pause.canonicalWordBefore === 1 && pause.canonicalWordAfter === 2 && !pause.isAyahBoundary));
  assert.ok(result.pauses.some((pause) => pause.canonicalWordBefore === 2 && pause.canonicalWordAfter === 3 && pause.isAyahBoundary));
});

test("optional prelude tokens never own the first canonical word timing", () => {
  const canonical = canonicalCtcWords([{ verseKey: "93:1", text: "والضحي" }]);
  const result = forceAlignCtc(canonical, [
    { tokenId: 1, token: "▁بس", owner: "optional-prelude" },
    { tokenId: 2, token: "▁وال", globalWordIndex: 1, owner: "canonical" },
    { tokenId: 3, token: "ضحي", globalWordIndex: 1, owner: "canonical" },
  ], logitsFor([1, 2, 3], 4), { blankTokenId: 0, startMs: 0, endMs: 300, frameExactEndpoints: true });
  assert.equal(result.status, "complete");
  assert.equal(result.words[0]?.startMs, 100, "the canonical ayah starts at its own first acoustic token");
  assert.deepEqual(result.optionalPreludeTiming, { startMs: 0, endMs: 100 });
  assert.equal(result.firstCanonicalTokenFrame, 1);
  assert.ok(Number.isFinite(result.normalizedPathScore));
});

test("fully owned optional-basmalah target words retain their forced CTC boundaries", () => {
  const canonical = canonicalCtcWords([{ verseKey: "93:1", text: "والضحي" }]);
  const result = forceAlignCtc(canonical, [
    { tokenId: 1, token: "▁بس", owner: "optional-prelude", optionalPreludeWordIndex: 1 },
    { tokenId: 2, token: "▁الله", owner: "optional-prelude", optionalPreludeWordIndex: 2 },
    { tokenId: 3, token: "▁الرحمن", owner: "optional-prelude", optionalPreludeWordIndex: 3 },
    { tokenId: 4, token: "▁الرحيم", owner: "optional-prelude", optionalPreludeWordIndex: 4 },
    { tokenId: 5, token: "▁وال", globalWordIndex: 1, owner: "canonical" },
    { tokenId: 6, token: "ضحي", globalWordIndex: 1, owner: "canonical" },
  ], logitsFor([1, 2, 3, 4, 5, 6], 7), { blankTokenId: 0, startMs: 1_000, endMs: 1_600, frameExactEndpoints: true });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.optionalPreludeWords, [
    { wordIndex: 1, startMs: 1_000, endMs: 1_100 },
    { wordIndex: 2, startMs: 1_100, endMs: 1_200 },
    { wordIndex: 3, startMs: 1_200, endMs: 1_300 },
    { wordIndex: 4, startMs: 1_300, endMs: 1_400 },
  ]);
  assert.equal(result.words[0]?.startMs, 1_400, "the prelude remains outside canonical ayah ownership");
});

test("connected ayat, weak edge words, long madd, and a final video cut retain complete canonical timing", () => {
  const connected = forceAlignCtc(words, tokens, logitsFor([1, 2, 3, 4, 5, 6]), { blankTokenId: 0, startMs: 4_000, endMs: 4_600, finalSpeechEndMs: 4_600 });
  assert.equal(connected.status, "complete");
  assert.equal(connected.pauses.length, 0, "connected ayat do not need silence to keep the exact verse handoff");
  assert.equal(connected.words[0]?.startMs, 4_000, "background audio before the VAD-selected onset is excluded");
  assert.equal(connected.verses[0]?.endMs, connected.verses[1]?.startMs);

  const weakEdges = new Float32Array(logitsFor([1, 2, 3, 4, 5, 6]).values);
  weakEdges[1] = 0.25;
  weakEdges[weakEdges.length - 1] = 0.25;
  const cut = forceAlignCtc(words, tokens, { values: weakEdges, frames: 6, vocabularySize: 7 }, { blankTokenId: 0, startMs: 0, endMs: 600, finalSpeechEndMs: 540 });
  assert.equal(cut.words.length, 3, "weak first/final words still receive acoustic frames");
  assert.equal(cut.verses.at(-1)?.endMs, 600, "a cut cannot shorten an already aligned final consonant");
  const madd = forceAlignCtc(words, tokens, logitsFor([1, 2, 3, 4, 5, 5, 5, 6]), { blankTokenId: 0, startMs: 0, endMs: 800, finalSpeechEndMs: 800 });
  assert.equal(madd.verses.at(-1)?.endMs, 800, "a VAD-constrained long final vocalization extends the final ayah");
});

test("repeated word and repeated phrase remain audible evidence, not canonical display duplicates", () => {
  const wordRepeat = forceAlignCtc(words, tokens, logitsFor([1, 2, 1, 2, 3, 4, 5, 6]), {
    blankTokenId: 0,
    startMs: 0,
    endMs: 800,
    repeats: [{ startWordIndex: 1, endWordIndex: 1, afterWordIndex: 1 }],
  });
  assert.equal(wordRepeat.status, "complete");
  assert.equal(wordRepeat.words.length, 3);
  assert.equal(wordRepeat.audibleRepetitions.length, 1);
  const phraseRepeat = forceAlignCtc(words, tokens, logitsFor([1, 2, 3, 4, 1, 2, 3, 4, 5, 6]), {
    blankTokenId: 0,
    startMs: 0,
    endMs: 1_000,
    repeats: [{ startWordIndex: 1, endWordIndex: 2, afterWordIndex: 2 }],
  });
  assert.equal(phraseRepeat.words.length, 3);
  assert.equal(phraseRepeat.audibleRepetitions[0]?.startWordIndex, 1);
});

test("bounded repeat expansion retains canonical display indices after coherent repeated evidence", () => {
  const repeated = expandCtcTargetWithRepeats(tokens, [{ startWordIndex: 1, endWordIndex: 1, afterWordIndex: 1 }]);
  assert.deepEqual(repeated.tokens.map((token) => token.globalWordIndex), [1, 1, 1, 1, 2, 2, 3, 3]);
  assert.equal(repeated.repeatedTokenIndexes.size, 2);
  const path = viterbiCtcPath(logitsFor([1, 2, 0, 1, 2, 0, 3, 4, 5, 6]), repeated.tokens, 0);
  assert.ok(path, "a coherent complete repeated phrase has a valid CTC path");
  assert.deepEqual(coherentCtcRepeatHints([1, 2, 1]), [], "a lone backwards event cannot invent a repetition");
  assert.deepEqual(coherentCtcRepeatHints([1, 2, 1, 2, 3]), [{ startWordIndex: 1, endWordIndex: 2, afterWordIndex: 2 }]);
});

test("canonical CTC target preserves every complete ayah word without interpolation", () => {
  const target = canonicalCtcWords([{ verseKey: "1:1", text: "بسم الله الرحمن الرحيم" }, { verseKey: "1:2", text: "الحمد لله" }]);
  assert.deepEqual(target.map((word) => [word.verseKey, word.canonicalWordIndex, word.globalWordIndex]), [
    ["1:1", 1, 1], ["1:1", 2, 2], ["1:1", 3, 3], ["1:1", 4, 4], ["1:2", 1, 5], ["1:2", 2, 6],
  ]);
});
