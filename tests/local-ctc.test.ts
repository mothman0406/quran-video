import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCtcWords } from "../src/lib/recognition/ctc-forced-alignment.ts";
import { hafsVerses } from "../src/lib/recognition/core.ts";
import {
  encodeCtcWords,
  normalizeCtcArabic,
  normalizeWav2Vec2Pcm,
  QURAN_CTC_SHADOW_MODEL_ARTIFACT,
  QURAN_CTC_SHADOW_MODEL_BYTES,
  QURAN_CTC_SHADOW_MODEL_URL,
} from "../src/lib/recognition/local-ctc.ts";

test("Wav2Vec2 CTC normalization preserves original canonical words while making an encodable target", () => {
  const words = canonicalCtcWords([{ verseKey: "1:1", text: "بِسْمِ ٱللَّهِ الرَّحْمَٰنِ الرَّحِيمِ" }]);
  const encoded = encodeCtcWords(words);
  assert.deepEqual(encoded.canonicalWords.map((word) => word.canonicalArabic), ["بِسْمِ", "ٱللَّهِ", "الرَّحْمَٰنِ", "الرَّحِيمِ"]);
  assert.deepEqual(encoded.canonicalWords.map((word) => word.alignmentText), ["بسم", "الله", "الرحمن", "الرحيم"]);
  assert.equal(encoded.targetTokens.filter((token) => token.token === "|").length, 3);
  assert.ok(encoded.targetTokens.every((token) => Number.isInteger(token.tokenId)));
  assert.equal(normalizeCtcArabic("۞ وَٱلضُّحَىٰ۝"), "والضحى");
});

test("CTC target excludes standalone Quran structural glyphs without shifting spoken word indexes", () => {
  const encoded = encodeCtcWords(canonicalCtcWords([{ verseKey: "1:1", text: "كلمة ۖ كلمة" }]));
  assert.deepEqual(encoded.canonicalWords.map((word) => [word.canonicalWordIndex, word.canonicalArabic]), [[1, "كلمة"], [2, "كلمة"]]);
  assert.ok(encoded.targetTokens.every((token) => token.token !== "ۖ"));
});

test("the real 6:74-77 CTC target contains only encodable spoken canonical words", () => {
  const verses = hafsVerses.filter((verse) => ["6:74", "6:75", "6:76", "6:77"].includes(verse.verseKey));
  const encoded = encodeCtcWords(canonicalCtcWords(verses));
  assert.deepEqual(verses.map((verse) => encoded.canonicalWords.filter((word) => word.verseKey === verse.verseKey).length), [14, 9, 15, 18]);
  assert.ok(encoded.targetTokens.length > 0);
  assert.ok(encoded.canonicalWords.every((word) => encoded.targetTokens.some((token) => token.globalWordIndex === word.globalWordIndex)));
});

test("Wav2Vec2 preprocessing is the configured per-utterance zero-mean/unit-variance normalization", () => {
  const normalized = normalizeWav2Vec2Pcm(new Float32Array([1, 2, 3]));
  assert.ok(Math.abs(normalized[0]! + 1.2247448) < 0.0002);
  assert.ok(Math.abs(normalized[1]!) < 0.0002);
  assert.ok(Math.abs(normalized[2]! - 1.2247448) < 0.0002);
  assert.deepEqual([...normalizeWav2Vec2Pcm(new Float32Array([7, 7]))].map((value) => Math.round(value * 10_000)), [0, 0]);
});

test("the browser model uses a pinned public artifact with its exact measured byte size", () => {
  assert.equal(QURAN_CTC_SHADOW_MODEL_ARTIFACT, "model.int8.onnx");
  assert.equal(QURAN_CTC_SHADOW_MODEL_BYTES, 355_026_417);
  assert.match(QURAN_CTC_SHADOW_MODEL_URL, /resolve\/0530f8aabd7a19a152e8476fe94fa6c6b2f38dd3\/model\.int8\.onnx$/);
});
