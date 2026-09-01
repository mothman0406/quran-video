import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { analyzeTranscript, hafsVerses, normalizeArabic, recognizeTranscript } from "../src/lib/recognition/core.ts";
import { quranRecognitionUnits } from "../src/lib/recognition/quran-recitation.ts";
import { analyzeMonoPcm } from "../src/lib/recognition/audio-analysis.ts";

const verse = (key: string) => hafsVerses.find((item) => item.verseKey === key)!;
const canonicalWords = (key: string) => verse(key).text.split(/\s+/).filter((word) => normalizeArabic(word));

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
  assert.equal(v74.timing.start.source, "chunk-interpolated");
  assert.ok(v75.timing.matchedText.length > 0, "weak interior text should contribute to timing");
});

test("maps a clip beginning mid-ayah to the containing ayah", () => {
  const result = recognizeTranscript([{ startMs: 250, endMs: 800, text: "رب العالمين" }]);
  assert.equal(result[0]?.verseKey, "1:2");
  assert.equal(result[0]?.startMs, 250);
});

test("extends a clean 6:76-77 anchor backward into a noisy 6:75 after initial silence", () => {
  const analysis = analyzeTranscript([
    // The lack of a chunk before 10 s represents silence, not ignored speech.
    { startMs: 10_000, endMs: 18_000, text: "وكذلك نرى ابراهيم ملكات السماوات والارض وليكون من الموقنين" },
    { startMs: 18_000, endMs: 31_000, text: verse("6:76").text },
    { startMs: 31_000, endMs: 45_000, text: verse("6:77").text },
  ]);
  assert.deepEqual(analysis.matches.map((match) => match.verseKey), ["6:75", "6:76", "6:77"]);
  assert.equal(analysis.passage.canonicalSpan?.firstVerseKey, "6:75");
  assert.equal(analysis.matches[0]?.startMs, 10_000, "initial silence must not become Quran timing");
  assert.ok((analysis.passage.transcriptCoverage ?? 0) > 0.8);
  assert.equal(analysis.passage.boundaryCompletion.extendedBackward, true);
});

test("reports exact partial canonical boundaries without claiming unrecorded ayah words", () => {
  const firstWords = canonicalWords("6:75");
  const lastWords = canonicalWords("6:77");
  const analysis = analyzeTranscript([{
    startMs: 10_000,
    endMs: 40_000,
    text: `${firstWords.slice(3).join(" ")} ${verse("6:76").text} ${lastWords.slice(0, 10).join(" ")}`,
  }]);
  assert.deepEqual(analysis.matches.map((match) => match.verseKey), ["6:75", "6:76", "6:77"]);
  assert.equal(analysis.passage.canonicalSpan?.firstWordIndex, 4);
  assert.equal(analysis.passage.canonicalSpan?.lastWordIndex, 10);
  assert.equal(analysis.passage.canonicalSpan?.firstBoundary, "mid-verse");
  assert.equal(analysis.passage.canonicalSpan?.lastBoundary, "mid-verse");
  assert.equal(analysis.matches[0]?.wordSupport.canonicalStartWordIndex, 4);
  assert.equal(analysis.matches.at(-1)?.wordSupport.canonicalEndWordIndex, 10);
});

test("does not force genuine unrelated speech into the preceding Quran boundary", () => {
  const analysis = analyzeTranscript([
    { startMs: 0, endMs: 2_000, text: "كانت الحافلة متأخرة والطريق مزدحما" },
    { startMs: 10_000, endMs: 22_000, text: verse("6:76").text },
    { startMs: 22_000, endMs: 36_000, text: verse("6:77").text },
  ]);
  assert.deepEqual(analysis.matches.map((match) => match.verseKey), ["6:76", "6:77"]);
  assert.equal(analysis.passage.canonicalSpan?.firstVerseKey, "6:76");
  assert.ok((analysis.passage.transcriptCoverage ?? 1) < 1, "speech, unlike silence, remains visible as unexplained evidence");
});

test("canonical span mapping is identical in chunk fallback timing mode", () => {
  const text = `${canonicalWords("6:75").slice(3).join(" ")} ${verse("6:76").text} ${canonicalWords("6:77").slice(0, 10).join(" ")}`;
  const wordTimed = analyzeTranscript([{ startMs: 10_000, endMs: 40_000, text, words: text.split(/\s+/).map((word, index) => ({ text: word, startMs: 10_000 + index * 500, endMs: 10_000 + (index + 1) * 500 })) }]);
  const chunkFallback = analyzeTranscript([{ startMs: 10_000, endMs: 40_000, text }]);
  assert.deepEqual(chunkFallback.passage.canonicalSpan, wordTimed.passage.canonicalSpan);
});

test("returns a usable best candidate while marking an ambiguous short clip", () => {
  const analysis = analyzeTranscript([{ startMs: 0, endMs: 420, text: "الحمد لله" }]);
  assert.ok(analysis.matches.length > 0);
  assert.equal(analysis.passage.state, "plausible-ambiguous");
  assert.ok(analysis.passage.selectedCandidate);
  assert.ok(analysis.passage.candidates.length >= 2);
});

test("keeps a one-word Quran candidate explicitly ambiguous", () => {
  const analysis = analyzeTranscript([{ startMs: 0, endMs: 300, text: "الله" }]);
  assert.equal(analysis.passage.state, "plausible-ambiguous");
  assert.ok(analysis.matches.length > 0);
});

test("uses later contiguous ayat to overturn an early repeated-phrase hypothesis", () => {
  const corpus = [
    { verseKey: "1:1", text: "قال الله" },
    { verseKey: "1:2", text: "ثم ذهب" },
    { verseKey: "2:1", text: "قال الله" },
    { verseKey: "2:2", text: "ثم رجع" },
  ];
  const analysis = analyzeTranscript([
    { startMs: 500, endMs: 1_000, text: "قال الله" },
    { startMs: 1_100, endMs: 1_700, text: "ثم رجع" },
  ], { corpus, minConfidence: 0.6 });
  assert.equal(analysis.passage.state, "confident-unique");
  assert.deepEqual(analysis.matches.map((match) => match.verseKey), ["2:1", "2:2"]);
  assert.equal(analysis.passage.disambiguatedByLaterChunks, true);
  assert.equal(analysis.matches[0]?.startMs, 500, "intro/silence before the first aligned token is not used as an ayah start");
});

test("leaves a repeated short recording ambiguous until subsequent Quran evidence arrives", () => {
  const corpus = [
    { verseKey: "1:1", text: "قال الله" },
    { verseKey: "1:2", text: "ثم ذهب" },
    { verseKey: "2:1", text: "قال الله" },
    { verseKey: "2:2", text: "ثم رجع" },
  ];
  const analysis = analyzeTranscript([{ startMs: 800, endMs: 1_300, text: "قال الله" }], { corpus, minConfidence: 0.6 });
  assert.deepEqual(analysis.matches.map((match) => match.verseKey), ["1:1"]);
  assert.equal(analysis.passage.state, "plausible-ambiguous");
});

test("does not show the first ayah during initial silence before its first aligned word", () => {
  const corpus = [{ verseKey: "1:1", text: "قال الله" }];
  const analysis = analyzeTranscript([{
    startMs: 7_200,
    endMs: 8_000,
    text: "قال الله",
    words: [{ text: "قال", startMs: 7_200, endMs: 7_550 }, { text: "الله", startMs: 7_550, endMs: 8_000 }],
  }], { corpus, minConfidence: 0.6 });
  assert.equal(analysis.matches[0]?.startMs, 7_200);
  assert.equal(analysis.matches[0]?.timing.start.source, "word-timestamp");
});

test("uses canonical word transitions even when two ayat have no acoustic pause", () => {
  const corpus = [{ verseKey: "1:1", text: "قال الله" }, { verseKey: "1:2", text: "ثم رجع" }];
  const analysis = analyzeTranscript([{
    startMs: 100,
    endMs: 1_400,
    text: "قال الله ثم رجع",
    words: [
      { text: "قال", startMs: 100, endMs: 350 }, { text: "الله", startMs: 350, endMs: 700 },
      { text: "ثم", startMs: 700, endMs: 950 }, { text: "رجع", startMs: 950, endMs: 1_400 },
    ],
  }], { corpus, minConfidence: 0.6 });
  assert.deepEqual(analysis.matches.map((match) => match.verseKey), ["1:1", "1:2"]);
  assert.equal(analysis.matches[0]?.endMs, 700);
  assert.equal(analysis.matches[1]?.startMs, 700);
});

test("refines only the expected text boundary with a local PCM energy gap", () => {
  const corpus = [{ verseKey: "1:1", text: "قال" }, { verseKey: "1:2", text: "رجع" }];
  const pcm = new Float32Array(2_000);
  for (let index = 100; index < 750; index += 1) pcm[index] = 0.2;
  for (let index = 1_050; index < 1_600; index += 1) pcm[index] = 0.2;
  const analysis = analyzeTranscript([{
    startMs: 100,
    endMs: 1_600,
    text: "قال رجع",
    words: [{ text: "قال", startMs: 100, endMs: 800 }, { text: "رجع", startMs: 1_000, endMs: 1_600 }],
  }], { corpus, minConfidence: 0.6, audioAnalysis: analyzeMonoPcm(pcm, 1_000) });
  const [first, second] = analysis.matches;
  assert.equal(first?.endMs, 750);
  assert.equal(second?.startMs, 1_050);
  assert.equal(first?.timing.end.source, "word-audio-refined");
  assert.equal(second?.timing.start.source, "word-audio-refined");
  assert.ok(first!.endMs < second!.startMs, "a real ayah pause remains a caption gap");
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
