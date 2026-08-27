import assert from "node:assert/strict";
import test from "node:test";
import { analyzeTranscript, hafsVerses, normalizeArabic, recognizeTranscript } from "../src/lib/recognition/core.ts";

const verse = (key: string) => hafsVerses.find((item) => item.verseKey === key)!;

test("matches clean exact text and keeps canonical display text separate", () => {
  const result = recognizeTranscript([{ startMs: 100, endMs: 1_100, text: verse("93:1").text }]);
  assert.equal(result[0]?.verseKey, "93:1");
  assert.equal(result[0]?.startMs, 100);
  assert.equal(result[0]?.endMs, 1_100);
  assert.equal(result[0]?.confidence, 1);
  assert.notEqual(verse("93:1").text, normalizeArabic(verse("93:1").text));
});

test("matches missing diacritics and conservative orthographic variants", () => {
  const result = recognizeTranscript([{ startMs: 0, endMs: 900, text: "والضحي" }]);
  assert.equal(result[0]?.verseKey, "93:1");
});

test("tolerates a minor transcription error", () => {
  const result = recognizeTranscript([{ startMs: 0, endMs: 1_000, text: "الحمد لله رب العلمين" }]);
  assert.equal(result[0]?.verseKey, "1:2");
  assert.ok((result[0]?.confidence ?? 0) > 0.7);
});

test("matches the first real Whisper Ad-Duha transcript across five contiguous ayat", () => {
  const result = recognizeTranscript([{
    startMs: 0,
    endMs: 20_000,
    text: "وضحى واللي إذا اسجى ما ودعك ربك وما قلى والآخرة خير لك من الأولات ولسوف يعطيك ربك فترضى",
  }]);
  assert.deepEqual(result.map((item) => item.verseKey), ["93:1", "93:2", "93:3", "93:4", "93:5"]);
  assert.ok((result[0]?.confidence ?? 0) >= 0.52);
});

test("prefers monotonic contiguous ayat for consecutive chunks", () => {
  const result = recognizeTranscript([
    { startMs: 0, endMs: 700, text: verse("112:1").text },
    { startMs: 700, endMs: 1_400, text: verse("112:2").text },
    { startMs: 1_400, endMs: 2_100, text: verse("112:3").text },
  ]);
  assert.deepEqual(result.map((item) => item.verseKey), ["112:1", "112:2", "112:3"]);
});

test("splits one timestamped chunk containing multiple consecutive ayat", () => {
  const result = recognizeTranscript([
    { startMs: 0, endMs: 1_400, text: `${verse("112:1").text} ${verse("112:2").text}` },
  ]);
  assert.deepEqual(result.map((item) => item.verseKey), ["112:1", "112:2"]);
  assert.equal(result[0]?.startMs, 0);
  assert.equal(result[1]?.endMs, 1_400);
});

test("maps a clip beginning mid-ayah to the containing ayah", () => {
  const result = recognizeTranscript([{ startMs: 250, endMs: 800, text: "رب العالمين" }]);
  assert.equal(result[0]?.verseKey, "1:2");
  assert.equal(result[0]?.startMs, 250);
});

test("maps a clip ending mid-ayah to the containing ayah", () => {
  const result = recognizeTranscript([{ startMs: 0, endMs: 420, text: "الحمد لله" }]);
  assert.equal(result[0]?.verseKey, "1:2");
  assert.equal(result[0]?.endMs, 420);
});

test("does not overclaim an ambiguous short phrase", () => {
  const result = recognizeTranscript([{ startMs: 0, endMs: 300, text: "الله" }]);
  assert.deepEqual(result, []);
});

test("reports the best rejected candidate for developer recognition diagnostics", () => {
  const analysis = analyzeTranscript([{ startMs: 0, endMs: 500, text: "الحمد لله رب العلمين" }], { minConfidence: 1.01 });
  assert.deepEqual(analysis.matches, []);
  assert.equal(analysis.diagnostics[0]?.topCandidate?.startVerseKey, "1:2");
  assert.equal(analysis.diagnostics[0]?.rejectionReason, "below confidence threshold");
});
