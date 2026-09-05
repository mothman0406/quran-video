import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCtcWords, forceAlignCtc } from "../src/lib/recognition/ctc-forced-alignment.ts";
import {
  encodeFastConformerWords,
  FASTCONFORMER_SHADOW_MODEL_ARTIFACT,
  FASTCONFORMER_SHADOW_MODEL_BYTES,
  FASTCONFORMER_SHADOW_MODEL_URL,
} from "../src/lib/recognition/local-fastconformer.ts";

test("FastConformer shadow builds exact known-passage BPE targets with canonical word ownership", () => {
  const canonical = canonicalCtcWords([{ verseKey: "1:1", text: "السَّلَامُ عَلَيْكُمْ" }]);
  const encoded = encodeFastConformerWords(
    canonical,
    { "1:1:1": [10, 11, 12] },
    { "10": "▁السلام", "11": "▁علي", "12": "كم" },
  );
  assert.deepEqual(encoded.canonicalWords.map((word) => word.alignmentText), ["السلام", "عليكم"]);
  assert.deepEqual(encoded.targetTokens.map((token) => [token.token, token.globalWordIndex]), [["▁السلام", 1], ["▁علي", 2], ["كم", 2]]);
});

test("FastConformer shadow uses frame-exact endpoints without one-millisecond repair", () => {
  const canonical = canonicalCtcWords([{ verseKey: "1:1", text: "ا ب" }]);
  const target = [{ tokenId: 1, token: "▁ا", globalWordIndex: 1 }, { tokenId: 2, token: "▁ب", globalWordIndex: 2 }];
  const logits = new Float32Array([
    0, 9, 0,
    0, 0, 9,
  ]);
  const result = forceAlignCtc(canonical, target, { values: logits, frames: 2, vocabularySize: 3 }, {
    blankTokenId: 0,
    startMs: 0,
    endMs: 1,
    frameExactEndpoints: true,
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.words.map((word) => [word.startMs, word.endMs]), [[0, 1], [1, 1]]);
});

test("FastConformer shadow pins the public CC-BY artifact revision and measured size", () => {
  assert.equal(FASTCONFORMER_SHADOW_MODEL_ARTIFACT, "fastconformer_full_mixed.onnx");
  assert.equal(FASTCONFORMER_SHADOW_MODEL_BYTES, 88_307_366);
  assert.match(FASTCONFORMER_SHADOW_MODEL_URL, /acibZ\/tilawa-quran-onnx\/resolve\/0cd79471524bc9cfa1c9296055242a935a1873e4\/fastconformer_full_mixed\.onnx$/);
});
