import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
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

const liveAdDuhaTranscript = "وضحة واللي إذا أسجى ما ودعك ربك وما قلى والأخرة خير لك من الأولات ولسوفة وعطيك ربك فترضى";

test("matches the exact live Whisper Ad-Duha transcript across five contiguous ayat", () => {
  const result = recognizeTranscript([{
    startMs: 0,
    endMs: 20_000,
    text: liveAdDuhaTranscript,
  }]);
  assert.deepEqual(result.map((item) => item.verseKey), ["93:1", "93:2", "93:3", "93:4", "93:5"]);
  assert.ok((result[0]?.confidence ?? 0) >= 0.52);
});

test("matches the exact live Whisper transcript when timestamped in two chunks", () => {
  const analysis = analyzeTranscript([
    { startMs: 0, endMs: 9_500, text: "وضحة واللي إذا أسجى ما ودعك ربك وما قلى" },
    { startMs: 9_500, endMs: 20_000, text: "والأخرة خير لك من الأولات ولسوفة وعطيك ربك فترضى" },
  ]);
  assert.deepEqual(analysis.matches.map((item) => item.verseKey), ["93:1", "93:2", "93:3", "93:4", "93:5"]);
  assert.equal(analysis.diagnostics[0]?.topCandidate?.startVerseKey, "93:1");
  assert.equal(analysis.diagnostics[0]?.topCandidate?.endVerseKey, "93:3");
  assert.equal(analysis.diagnostics[1]?.topCandidate?.startVerseKey, "93:4");
  assert.equal(analysis.diagnostics[1]?.candidateGenerationPath, "token-retrieval");
  assert.ok((analysis.diagnostics[1]?.topCandidate?.tokenSequenceSimilarity ?? 0) > 0.8);
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

test("rejects unrelated Arabic prose even when approximate retrieval runs", () => {
  const analysis = analyzeTranscript([{
    startMs: 0,
    endMs: 1_000,
    text: "كانت الحافلة متأخرة والطريق مزدحما والطلاب ينتظرون عند المحطة",
  }]);
  assert.deepEqual(analysis.matches, []);
  assert.ok(analysis.diagnostics[0]?.topCandidate);
  assert.equal(analysis.diagnostics[0]?.rejectionReason, "below confidence threshold");
});

test("reports the best rejected candidate for developer recognition diagnostics", () => {
  const analysis = analyzeTranscript([{ startMs: 0, endMs: 500, text: "الحمد لله رب العلمين" }], { minConfidence: 1.01 });
  assert.deepEqual(analysis.matches, []);
  assert.equal(analysis.diagnostics[0]?.topCandidate?.startVerseKey, "1:2");
  assert.equal(analysis.diagnostics[0]?.rejectionReason, "below confidence threshold");
});

test("bounds approximate candidate retrieval for the live-sized noisy transcript", () => {
  const startedAt = performance.now();
  const result = recognizeTranscript([{ startMs: 0, endMs: 20_000, text: liveAdDuhaTranscript }]);
  const elapsedMs = performance.now() - startedAt;
  assert.deepEqual(result.map((item) => item.verseKey), ["93:1", "93:2", "93:3", "93:4", "93:5"]);
  assert.ok(elapsedMs < 1_500, `expected bounded search under 1500ms, received ${elapsedMs.toFixed(1)}ms`);
});
