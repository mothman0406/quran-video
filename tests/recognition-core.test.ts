import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { analyzeTranscript, hafsVerses, normalizeArabic, recognizeTranscript } from "../src/lib/recognition/core.ts";
import { quranRecognitionUnits } from "../src/lib/recognition/quran-recitation.ts";

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

test("uses a separate Hafs recitation representation for connected and assimilated speech", () => {
  const sunArticle = quranRecognitionUnits(normalizeArabic("وَٱلشَّمۡسِ"), "وَٱلشَّمۡسِ");
  const assimilatedAsr = quranRecognitionUnits(normalizeArabic("وشمس"), "وشمس");
  assert.notEqual(sunArticle.orthographic, assimilatedAsr.orthographic);
  assert.equal(sunArticle.recitation, assimilatedAsr.recitation, "lam shamsiyyah should align in the internal form");

  const wasl = quranRecognitionUnits(normalizeArabic("قُلِ ٱدۡعُواْ"), "قُلِ ٱدۡعُواْ");
  const connectedAsr = quranRecognitionUnits(normalizeArabic("قل دعوا"), "قل دعوا");
  assert.notEqual(wasl.orthographic, connectedAsr.orthographic);
  assert.equal(wasl.recitation, connectedAsr.recitation, "hamzat al-wasl should be optional in connected speech");

  const geminatedAsr = quranRecognitionUnits(normalizeArabic("رببك"), "رببك");
  const canonical = quranRecognitionUnits(normalizeArabic("ربك"), "ربك");
  assert.equal(geminatedAsr.recitation, canonical.recitation, "ASR-expanded shadda should be tolerated internally");

  const hamzaCarrier = quranRecognitionUnits(normalizeArabic("مؤمنين"), "مؤمنين");
  const carrierAsr = quranRecognitionUnits(normalizeArabic("مومنين"), "مومنين");
  assert.equal(hamzaCarrier.recitation, carrierAsr.recitation, "hamza carrier ambiguity should not split a match");
});

test("recitation representation does not make a short unrelated Arabic phrase a Quran match", () => {
  const result = recognizeTranscript([{ startMs: 0, endMs: 700, text: "وشم الحافلة" }]);
  assert.deepEqual(result, []);
});

test("uses recitation-aware evidence to retrieve an assimilated article that orthography alone scores weakly", () => {
  const corpus = [{ verseKey: "x:1", text: "وَٱلشَّمۡسِ" }];
  const result = recognizeTranscript([{ startMs: 0, endMs: 700, text: "وشمس" }], { corpus, minConfidence: 0.7 });
  assert.equal(result[0]?.verseKey, "x:1");
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

test("reconstructs a contiguous passage and aligns ayah timing across mid-ayah breaths", () => {
  const text = (key: string, start?: number, end?: number) => {
    const words = verse(key).text.split(" ");
    return words.slice(start, end).join(" ");
  };
  const analysis = analyzeTranscript([
    // These two adjacent ASR chunks deliberately meet at a breath inside 6:74.
    { startMs: 7_000, endMs: 16_000, text: text("6:74", 0, 7) },
    { startMs: 16_000, endMs: 20_000, text: text("6:74", 7) },
    // Standalone evidence for 6:75 is intentionally weak, but its canonical place
    // is retained between the accepted 6:74 and 6:76 sequence evidence.
    { startMs: 21_000, endMs: 30_000, text: "وكذلك نري ابراهيم" },
    // This boundary is another breath inside 6:76, not an ayah boundary.
    { startMs: 32_000, endMs: 38_000, text: text("6:76", 0, 6) },
    { startMs: 38_000, endMs: 44_000, text: text("6:76", 6) },
    { startMs: 45_000, endMs: 66_000, text: verse("6:77").text },
  ]);
  assert.deepEqual(analysis.matches.map((item) => item.verseKey), ["6:74", "6:75", "6:76", "6:77"]);
  const [v74, v75, v76, v77] = analysis.matches;
  assert.ok(v74.startMs >= 6_500, "initial non-Quran silence must not become 6:74");
  assert.ok(v74.endMs >= 19_000, "the 0:16 breath remains inside 6:74");
  assert.ok(v76.startMs <= 33_000 && v76.endMs >= 43_000, "the 0:38 breath remains inside 6:76");
  assert.ok(v74.endMs <= v75.startMs && v75.endMs <= v76.startMs && v76.endMs <= v77.startMs);
  assert.ok(v74.endMs - v74.startMs !== v77.endMs - v77.startMs, "ayah timing must not be evenly distributed");
  assert.equal(v74.timing.start.source, "chunk-text-alignment");
  assert.ok(v75.timing.matchedText.length > 0, "weak interior text should contribute to timing");
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
