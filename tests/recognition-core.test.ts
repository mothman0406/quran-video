import assert from "node:assert/strict";
import test from "node:test";
import { performance } from "node:perf_hooks";
import { analyzeTranscript, createPrimaryTranscript, hafsVerses, identifyQuranPassage, normalizeArabic, recognizeTranscript, resolveFirstQuranOnset } from "../src/lib/recognition/core.ts";
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
  assert.equal(v74.timing.start.source, "chunk-coarse");
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
  assert.equal(analysis.matches[0]?.wordSupport.canonicalStartWordIndex, 1);
  assert.equal(analysis.matches.at(-1)?.wordSupport.canonicalEndWordIndex, canonicalWords("6:77").length);
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

test("primary transcript identifies the same passage with word and chunk-fallback timestamps", () => {
  const text = `${verse("93:1").text} ${verse("93:2").text}`;
  const wordPrimary = createPrimaryTranscript([{
    startMs: 0,
    endMs: 4_000,
    text,
    // A runtime may supply a sentence-level timestamp unit. Its shape must
    // not change the text-only passage matcher.
    words: [{ text, startMs: 0, endMs: 3_900 }],
  }], "word");
  const fallbackPrimary = createPrimaryTranscript([{ startMs: 0, endMs: 4_000, text }], "chunk-fallback");
  const wordPassage = identifyQuranPassage(wordPrimary);
  const fallbackPassage = identifyQuranPassage(fallbackPrimary);
  assert.deepEqual(wordPassage.passage.canonicalSpan, fallbackPassage.passage.canonicalSpan);
  assert.equal(fallbackPassage.passage.passageSource, "primary-transcript");
});

test("empty or contradictory micro-ASR evidence cannot replace the primary passage", () => {
  const corpus = [
    { verseKey: "1:1", text: "الف باء جيم دال هاء واو" },
    { verseKey: "1:2", text: "زاي حاء طاء ياء" },
    { verseKey: "2:1", text: "نون سين عين فاء صاد قاف" },
  ];
  const primary = createPrimaryTranscript([{
    startMs: 1_000,
    endMs: 5_000,
    text: `${corpus[0].text} ${corpus[1].text}`,
  }], "chunk-fallback");
  const initial = analyzeTranscript(primary, { corpus, minConfidence: 0.55 });
  const emptyRecovery = analyzeTranscript(primary, {
    corpus,
    minConfidence: 0.55,
    timingEvidenceChunks: [],
    timingRecoveryAttempted: true,
  });
  const contradictoryRecovery = analyzeTranscript(primary, {
    corpus,
    minConfidence: 0.55,
    timingEvidenceChunks: [{ startMs: 2_000, endMs: 3_000, text: corpus[2].text, timingSource: "micro-asr" }],
    timingRecoveryAttempted: true,
  });
  assert.deepEqual(emptyRecovery.passage.canonicalSpan, initial.passage.canonicalSpan);
  assert.deepEqual(contradictoryRecovery.passage.canonicalSpan, initial.passage.canonicalSpan);
  assert.deepEqual(contradictoryRecovery.matches.map((match) => match.verseKey), ["1:1", "1:2"]);
  assert.equal(contradictoryRecovery.passage.passageSource, "primary-transcript");
  assert.equal(contradictoryRecovery.passage.shadowComparison.regressionDetected, false);
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

test("direct next-ayah word evidence remains the boundary when PCM finds a nearby gap", () => {
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
  assert.equal(first?.endMs, 1_000);
  assert.equal(second?.startMs, 1_000);
  assert.equal(first!.endMs, second!.startMs, "direct timestamped next-word evidence is the shared boundary");
});

test("connected ayat use the first spoken next-ayah word as the shared boundary", () => {
  const corpus = [{ verseKey: "1:1", text: "الف باء" }, { verseKey: "1:2", text: "جيم دال" }];
  const analysis = analyzeTranscript([{
    startMs: 100,
    endMs: 900,
    text: "الف باء جيم دال",
    words: [
      { text: "الف", startMs: 100, endMs: 280 }, { text: "باء", startMs: 280, endMs: 500 },
      { text: "جيم", startMs: 500, endMs: 700 }, { text: "دال", startMs: 700, endMs: 900 },
    ],
  }], { corpus, minConfidence: 0.6, speechRegions: [{ startMs: 100, endMs: 900, durationMs: 800, confidence: 0.95 }] });
  assert.equal(analysis.matches[1]?.startMs, 500);
  assert.equal(analysis.matches[0]?.endMs, 500);
  assert.equal(analysis.timingTrace?.transitions[0]?.selectedTransitionMs, 500);
  assert.equal(analysis.timingRecoveryPlan?.required, false, "word-timestamp mode does not schedule broad transition recovery");
});

test("a late clean next-ayah anchor recovers the local missing prefix instead of becoming the ayah start", () => {
  const corpus = [{ verseKey: "1:1", text: "الف باء جيم" }, { verseKey: "1:2", text: "دال هاء واو زاي" }];
  const analysis = analyzeTranscript([{
    startMs: 100,
    endMs: 4_000,
    text: "الف باء جيم واو زاي",
    words: [
      { text: "الف", startMs: 100, endMs: 700 }, { text: "باء", startMs: 700, endMs: 1_400 }, { text: "جيم", startMs: 1_400, endMs: 2_200 },
      { text: "واو", startMs: 3_400, endMs: 3_700 }, { text: "زاي", startMs: 3_900, endMs: 4_000 },
    ],
  }], { corpus, minConfidence: 0.55, speechRegions: [{ startMs: 100, endMs: 4_000, durationMs: 3_900, confidence: 0.95 }] });
  assert.ok((analysis.matches[1]?.startMs ?? Infinity) < 3_400, "the two missing prefix words are recovered backward from word three");
  assert.equal(analysis.matches[0]?.endMs, analysis.matches[1]?.startMs);
  assert.equal(analysis.timingTrace?.transitions[0]?.firstNextCanonicalWordSupported, 3);
});

test("a clear pause keeps the previous ayah visible until next Quran speech begins", () => {
  const corpus = [{ verseKey: "1:1", text: "الف" }, { verseKey: "1:2", text: "باء" }];
  const pcm = new Float32Array(2_000);
  for (let index = 100; index < 720; index += 1) pcm[index] = 0.2;
  for (let index = 1_060; index < 1_700; index += 1) pcm[index] = 0.2;
  const analysis = analyzeTranscript([{
    startMs: 100,
    endMs: 1_700,
    text: "الف باء",
    words: [{ text: "الف", startMs: 100, endMs: 760 }, { text: "باء", startMs: 1_000, endMs: 1_700 }],
  }], { corpus, minConfidence: 0.6, audioAnalysis: analyzeMonoPcm(pcm, 1_000), speechRegions: [
    { startMs: 100, endMs: 720, durationMs: 620, confidence: 0.95 },
    { startMs: 1_060, endMs: 1_700, durationMs: 640, confidence: 0.95 },
  ] });
  assert.equal(analysis.matches[1]?.startMs, 1_000);
  assert.equal(analysis.matches[0]?.endMs, 1_000);
});

test("an early 6:77 word one at a VAD onset beats a later internal-word pause", () => {
  const nextWords = ["فلمّا", "رأى", "الشمس", "بازغة", "قال", "هذا", "ربي", "هذا", "أكبر", "فلمّا", "أفلت", "قال", "يا", "قوم", "إني", "بريء", "مما", "تشركون"];
  const corpus = [{ verseKey: "6:76", text: "قال" }, { verseKey: "6:77", text: nextWords.join(" ") }];
  const words = [
    { text: "قال", startMs: 42_864, endMs: 44_864 },
    ...nextWords.map((text, index) => ({
      text,
      startMs: index === 0 ? 44_832 : index === 17 ? 55_584 : 45_100 + index * 550,
      endMs: index === 0 ? 45_050 : index === 17 ? 55_900 : 45_500 + index * 550,
    })),
  ];
  const analysis = analyzeTranscript([{ startMs: 42_864, endMs: 55_900, text: words.map((word) => word.text).join(" "), words }], {
    corpus,
    minConfidence: 0.5,
    speechRegions: [
      { startMs: 32_064, endMs: 44_256, durationMs: 12_192, confidence: 0.95 },
      { startMs: 44_832, endMs: 55_104, durationMs: 10_272, confidence: 0.95 },
      { startMs: 55_584, endMs: 56_000, durationMs: 416, confidence: 0.95 },
    ],
  });
  const transition = analysis.timingTrace?.transitions[0];
  assert.equal(analysis.matches[0]?.endMs, 44_832);
  assert.equal(analysis.matches[1]?.startMs, 44_832);
  assert.equal(transition?.selectedTransitionMs, 44_832);
  assert.equal(transition?.candidateNextAyahEvidence.find((item) => item.canonicalWordIndex === 1)?.accepted, true);
  assert.equal(transition?.candidateNextAyahEvidence.find((item) => item.canonicalWordIndex === 18)?.accepted, false);
});

test("real Surah 93 timestamp fixture aligns split Arabic tokens without VAD rewind", () => {
  const corpus = hafsVerses.filter((item) => /^93:[1-5]$/.test(item.verseKey));
  const words = [
    ["و", 1_640, 1_900], ["الضحى", 1_900, 2_800],
    ["والليل", 2_670, 2_860], ["اذا", 2_860, 3_300], ["سجى", 3_300, 3_800],
    ["ما", 4_000, 4_500], ["ودعك", 4_500, 5_400], ["ربك", 5_400, 6_200], ["وما", 6_200, 7_000], ["قلى", 7_000, 9_420],
    ["خير", 11_520, 12_100], ["لك", 12_100, 12_600], ["من", 12_600, 13_000], ["الاولى", 13_000, 14_000],
    ["ولسوف", 14_640, 15_000], ["يعطيك", 15_000, 15_500], ["ربك", 15_500, 16_000], ["فترضى", 16_000, 17_000],
  ].map(([text, startMs, endMs]) => ({ text: text as string, startMs: startMs as number, endMs: endMs as number }));
  const primary = createPrimaryTranscript([{ startMs: 0, endMs: 20_362, text: words.map((word) => word.text).join(" "), words }], "word");
  const analysis = analyzeTranscript(primary, {
    corpus,
    minConfidence: 0.45,
    audioAnalysis: analyzeMonoPcm(new Float32Array(20_362), 1_000),
    speechRegions: [{ startMs: 0, endMs: 20_362, durationMs: 20_362, confidence: 0.95 }],
  });
  assert.deepEqual(analysis.matches.map((match) => [match.verseKey, match.startMs, match.endMs]), [
    ["93:1", 1_640, 2_670], ["93:2", 2_670, 4_000], ["93:3", 4_000, 9_420], ["93:4", 9_420, 14_640], ["93:5", 14_640, 20_362],
  ]);
  assert.ok((analysis.matches[0]?.endMs ?? 0) - (analysis.matches[0]?.startMs ?? 0) > 1, "93:1 cannot collapse to 1 ms");
  assert.equal(analysis.forcedAlignment?.wordOccurrences.find((word) => word.verseKey === "93:1" && word.canonicalWordIndex === 1)?.startMs, 1_640);
  assert.equal(analysis.forcedAlignment?.wordOccurrences.find((word) => word.verseKey === "93:1" && word.canonicalWordIndex === 1)?.asrTokenEndIndex, 1);
  assert.equal(analysis.matches[2]?.endMs, 9_420);
  assert.equal(analysis.matches[3]?.startMs, 9_420, "missing 93:4 word one is bounded by 93:3 final lexical evidence");
  assert.equal(analysis.matches[4]?.startMs, 14_640);
  assert.ok(analysis.matches.every((match) => match.endMs <= 20_362 && match.endMs > match.startMs));
  assert.equal(analysis.timingRecoveryPlan?.required, false);
  assert.deepEqual(corpus.map((item) => item.text), hafsVerses.filter((item) => /^93:[1-5]$/.test(item.verseKey)).map((item) => item.text));
});

test("timestamped first caption ignores a zero-start token inside a merged first Quran word", () => {
  const corpus = hafsVerses.filter((item) => /^93:[1-5]$/.test(item.verseKey));
  const words = [
    ["و", 0, 1_700], ["الضحى", 1_700, 2_800],
    ["والليل", 2_670, 2_860], ["اذا", 2_860, 3_300], ["سجى", 3_300, 3_800],
    ["ما", 4_000, 4_500], ["ودعك", 4_500, 5_400], ["ربك", 5_400, 6_200], ["وما", 6_200, 7_000], ["قلى", 7_000, 9_420],
    ["خير", 11_520, 12_100], ["لك", 12_100, 12_600], ["من", 12_600, 13_000], ["الاولى", 13_000, 14_000],
    ["ولسوف", 14_640, 15_000], ["يعطيك", 15_000, 15_500], ["ربك", 15_500, 16_000], ["فترضى", 16_000, 17_000],
  ].map(([text, startMs, endMs]) => ({ text: text as string, startMs: startMs as number, endMs: endMs as number }));
  const pcm = new Float32Array(20_362);
  for (let index = 1_640; index < pcm.length; index += 1) pcm[index] = 0.2;
  const analysis = analyzeTranscript(createPrimaryTranscript([{
    startMs: 0,
    endMs: 20_362,
    text: words.map((word) => word.text).join(" "),
    words,
  }], "word"), {
    corpus,
    minConfidence: 0.45,
    audioAnalysis: analyzeMonoPcm(pcm, 1_000),
    speechRegions: [{ startMs: 672, endMs: 20_362, durationMs: 19_690, confidence: 0.95 }],
  });
  const rawFirstWord = analysis.forcedAlignment?.wordOccurrences.find((word) => word.verseKey === "93:1" && word.canonicalWordIndex === 1);
  assert.equal(rawFirstWord?.startMs, 0, "the raw merged ASR group remains available as diagnostics");
  assert.equal(analysis.timingTrace?.rawVerseAlignmentStartMs, 1_700);
  assert.equal(analysis.timingTrace?.pcmLocalOnsetCandidateMs, 1_640);
  assert.equal(analysis.matches[0]?.startMs, 1_640, "the authoritative first caption starts at verified Quran onset");
  assert.deepEqual(analysis.matches.slice(1).map((match) => [match.verseKey, match.startMs]), [
    ["93:2", 2_670], ["93:3", 4_000], ["93:4", 9_420], ["93:5", 14_640],
  ]);
});

test("first Quran onset accepts immediate recitation but rejects an acoustically implausible raw zero", () => {
  assert.deepEqual(resolveFirstQuranOnset({
    lexicalEvidence: { firstAlignedMs: 1_700, strongAnchorMs: 1_700 },
    speechRegions: [{ startMs: 672, endMs: 20_362, durationMs: 19_690, confidence: 0.95 }],
    pcmEvidence: 1_640,
    rawTimestampEvidence: 0,
  }), { onsetMs: 1_640, source: "pcm-refined" });
  assert.deepEqual(resolveFirstQuranOnset({
    lexicalEvidence: { firstAlignedMs: 40, strongAnchorMs: 40 },
    speechRegions: [{ startMs: 0, endMs: 20_000, durationMs: 20_000, confidence: 0.95 }],
    rawTimestampEvidence: 0,
  }), { onsetMs: 0, source: "word-timestamp" });
});

test("a long final ayah remains displayed through its Quran-aligned VAD speech region", () => {
  const corpus = [{ verseKey: "1:1", text: "الف باء جيم" }];
  const analysis = analyzeTranscript([{
    startMs: 100,
    endMs: 2_000,
    text: "الف باء جيم",
    words: [{ text: "الف", startMs: 100, endMs: 700 }, { text: "باء", startMs: 700, endMs: 1_400 }, { text: "جيم", startMs: 1_400, endMs: 2_000 }],
  }], { corpus, minConfidence: 0.6, speechRegions: [{ startMs: 100, endMs: 15_000, durationMs: 14_900, confidence: 0.94 }] });
  assert.equal(analysis.matches[0]?.endMs, 15_000);
  assert.equal(analysis.timingTrace?.finalAyahEnd?.lastCanonicalAsrEvidenceMs, 2_000);
  assert.equal(analysis.timingTrace?.finalAyahEnd?.selectedFinalEndMs, 15_000);
  assert.equal(analysis.timingRecoveryPlan?.required, false);
});

test("a final long madd extends beyond the last lexical ASR anchor to voice completion", () => {
  const corpus = [{ verseKey: "1:1", text: "الف باء" }];
  const pcm = new Float32Array(4_000);
  for (let index = 100; index < 4_000; index += 1) pcm[index] = 0.2;
  const analysis = analyzeTranscript([{
    startMs: 100,
    endMs: 2_000,
    text: "الف باء",
    words: [{ text: "الف", startMs: 100, endMs: 900 }, { text: "باء", startMs: 900, endMs: 2_000 }],
  }], { corpus, minConfidence: 0.6, audioAnalysis: analyzeMonoPcm(pcm, 1_000), speechRegions: [{ startMs: 100, endMs: 4_000, durationMs: 3_900, confidence: 0.94 }] });
  assert.equal(analysis.matches[0]?.endMs, 4_000);
});

test("a video cut during the final ayah keeps its caption through the video duration", () => {
  const corpus = [{ verseKey: "1:1", text: "الف باء" }];
  const pcm = new Float32Array(7_000);
  for (let index = 100; index < 7_000; index += 1) pcm[index] = 0.2;
  const analysis = analyzeTranscript([{
    startMs: 100,
    endMs: 1_800,
    text: "الف باء",
    words: [{ text: "الف", startMs: 100, endMs: 900 }, { text: "باء", startMs: 900, endMs: 1_800 }],
  }], { corpus, minConfidence: 0.6, audioAnalysis: analyzeMonoPcm(pcm, 1_000), speechRegions: [{ startMs: 100, endMs: 7_000, durationMs: 6_900, confidence: 0.94 }] });
  assert.equal(analysis.matches[0]?.endMs, 7_000);
  assert.equal(analysis.timingTrace?.finalAyahEnd?.videoDurationMs, 7_000);
});

test("first Quran onset ignores early audio and a lone Whisper-like aligned token", () => {
  const corpus = [
    { verseKey: "6:75", text: "الف باء جيم" },
    { verseKey: "6:76", text: "دال هاء واو" },
    { verseKey: "6:77", text: "زاي حاء طاء" },
  ];
  const pcm = new Float32Array(15_000);
  // Handling noise at 2.6s is deliberately outside the later Quran corridor.
  for (let index = 2_600; index < 2_900; index += 1) pcm[index] = 0.2;
  for (let index = 9_500; index < 14_000; index += 1) pcm[index] = 0.2;
  const analysis = analyzeTranscript([{
    startMs: 2_630,
    endMs: 14_000,
    text: "الف الف باء جيم دال هاء واو زاي حاء طاء",
    words: [
      { text: "الف", startMs: 2_630, endMs: 2_800 }, // isolated hallucination
      { text: "الف", startMs: 9_700, endMs: 9_850 },
      { text: "باء", startMs: 9_850, endMs: 10_100 },
      { text: "جيم", startMs: 10_100, endMs: 10_350 },
      { text: "دال", startMs: 10_900, endMs: 11_100 },
      { text: "هاء", startMs: 11_100, endMs: 11_300 },
      { text: "واو", startMs: 11_300, endMs: 11_500 },
      { text: "زاي", startMs: 12_000, endMs: 12_200 },
      { text: "حاء", startMs: 12_200, endMs: 12_400 },
      { text: "طاء", startMs: 12_400, endMs: 12_600 },
    ],
  }], {
    corpus,
    minConfidence: 0.6,
    audioAnalysis: analyzeMonoPcm(pcm, 1_000),
    speechRegions: [{ startMs: 9_500, endMs: 14_000, durationMs: 4_500, confidence: 0.94 }],
  });
  assert.deepEqual(analysis.matches.map((match) => match.verseKey), ["6:75", "6:76", "6:77"]);
  assert.ok((analysis.matches[0]?.startMs ?? 0) >= 9_400, "caption must not begin at generic early activity");
  assert.ok((analysis.matches[0]?.startMs ?? Infinity) <= 10_100, "the timestamped branch stays inside direct late Quran evidence");
  assert.ok((analysis.timingTrace?.firstAsrWordAlignedToDetectedQuranMs ?? 0) >= 9_700, "only accepted Quran alignment is timing evidence");
  assert.ok((analysis.timingTrace?.firstStrongAlignmentAnchorMs ?? 0) >= 9_700);
  assert.equal(analysis.timingTrace?.firstQuranVadSpeechRegion?.startMs, 9_500);
  assert.ok((analysis.timingTrace?.verseAlignmentStartMs ?? 0) >= 9_500);
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

test("timestamped alignment consumes repeated local ASR tokens monotonically", () => {
  const corpus = [{ verseKey: "1:1", text: "الف باء جيم دال هاء واو زاي حاء طاء ياء كاف لام" }];
  const sequence = ["الف", "باء", "جيم", "دال", "باء", "جيم", "دال", "هاء", "واو", "زاي", "حاء", "طاء", "ياء", "كاف", "لام"];
  const words = sequence.map((text, index) => ({ text, startMs: index * 300, endMs: index * 300 + 220 }));
  const analysis = analyzeTranscript([{ startMs: 0, endMs: 4_500, text: sequence.join(" "), words }], { corpus, minConfidence: 0.55 });
  const forced = analysis.forcedAlignment;
  assert.ok(forced);
  assert.equal(forced!.wordOccurrences.filter((item) => item.canonicalWordIndex === 2).length, 1);
  assert.ok(forced!.wordOccurrences.every((item, index, all) => index === 0 || item.globalWordIndex > all[index - 1].globalWordIndex));
  assert.equal(forced!.verseTimings[0]?.firstCanonicalWordIndex, 1);
  assert.equal(forced!.verseTimings[0]?.lastCanonicalWordIndex, 12);
  assert.equal(forced!.captionSets.length, 1, "automatic output remains one complete ayah");
  assert.deepEqual(forced!.captionSets[0] && [forced!.captionSets[0].canonicalStartWordIndex, forced!.captionSets[0].canonicalEndWordIndex], [1, 12]);
});

test("timestamped alignment keeps partial-ayah timing truthful without promoting pause timing", () => {
  const corpus = [{ verseKey: "1:1", text: "الف باء جيم دال هاء واو" }];
  const pcm = new Float32Array(3_000);
  for (let index = 200; index < 780; index += 1) pcm[index] = 0.2;
  for (let index = 1_120; index < 1_750; index += 1) pcm[index] = 0.2;
  const analysis = analyzeTranscript([{
    startMs: 200,
    endMs: 1_750,
    text: "باء جيم دال",
    words: [{ text: "باء", startMs: 200, endMs: 450 }, { text: "جيم", startMs: 500, endMs: 780 }, { text: "دال", startMs: 1_120, endMs: 1_500 }],
  }], {
    corpus,
    minConfidence: 0.55,
    audioAnalysis: analyzeMonoPcm(pcm, 1_000),
    speechRegions: [
      { startMs: 200, endMs: 780, durationMs: 580, confidence: 0.93 },
      { startMs: 1_120, endMs: 1_750, durationMs: 630, confidence: 0.9 },
    ],
  });
  const forced = analysis.forcedAlignment;
  assert.ok(forced);
  assert.equal(forced!.verseTimings[0]?.partialStart, true);
  assert.equal(forced!.verseTimings[0]?.partialEnd, true);
  assert.deepEqual(forced!.pauseCandidates, []);
});

test("chunk fallback retains complete canonical ayat and recovers a missing middle verse locally", () => {
  const corpus = [
    { verseKey: "6:74", text: "الف باء جيم دال هاء واو زاي حاء طاء ياء كاف لام ميم نون" },
    { verseKey: "6:75", text: "سين عين فاء صاد قاف راء شين تاء ثاء" },
    { verseKey: "6:76", text: "خاء ذال ضاد ظاء غين ياء الف" },
  ];
  const pcm = new Float32Array(22_000);
  for (let index = 2_630; index < 2_880; index += 1) pcm[index] = 0.2;
  for (let index = 9_500; index < 20_000; index += 1) pcm[index] = 0.2;
  const coarse = [{
    startMs: 2_630,
    endMs: 20_000,
    text: "جيم دال واو زاي حاء طاء خاء ذال ضاد ظاء غين ياء الف",
  }];
  const primary = createPrimaryTranscript(coarse, "chunk-fallback");
  const initial = analyzeTranscript(primary, {
    corpus,
    minConfidence: 0.55,
    audioAnalysis: analyzeMonoPcm(pcm, 1_000),
    speechRegions: [{ startMs: 9_500, endMs: 20_000, durationMs: 10_500, confidence: 0.94 }],
    timestampMode: "chunk-fallback",
  });
  assert.equal(initial.forcedAlignment?.captionSets.length, 3);
  assert.deepEqual(initial.forcedAlignment?.captionSets.map((set) => [set.verseKey, set.canonicalStartWordIndex, set.canonicalEndWordIndex]), [["6:74", 1, 14], ["6:75", 1, 9], ["6:76", 1, 7]]);
  assert.ok(initial.timingRecoveryPlan?.required);
  assert.ok(initial.timingRecoveryPlan?.missingVerseKeys.includes("6:75"));
  assert.ok(initial.timingRecoveryPlan?.windows.every((window) => window.startMs >= 9_500 && window.endMs <= 20_000));

  const recovered = analyzeTranscript(primary, {
    timingEvidenceChunks: [{
    startMs: 9_500,
    endMs: 12_000,
    timingSource: "micro-asr" as const,
    text: "جيم دال واو زاي حاء طاء",
  }, {
    startMs: 12_100,
    endMs: 14_700,
    timingSource: "micro-asr" as const,
    text: corpus[1].text,
  }, {
    startMs: 14_800,
    endMs: 18_000,
    timingSource: "micro-asr" as const,
    text: corpus[2].text,
  }],
    corpus,
    minConfidence: 0.55,
    audioAnalysis: analyzeMonoPcm(pcm, 1_000),
    speechRegions: [{ startMs: 9_500, endMs: 20_000, durationMs: 10_500, confidence: 0.94 }],
    timestampMode: "chunk-fallback",
  });
  const forced = recovered.forcedAlignment!;
  assert.ok(recovered.matches[0]!.startMs >= 9_500, "coarse 2.63s text cannot become Quran onset after micro recovery");
  assert.equal(forced.verseTimings.find((item) => item.verseKey === "6:75")?.directWordCount, 0);
  assert.ok((forced.verseTimings.find((item) => item.verseKey === "6:75")?.recoveredWordCount ?? 0) > 0);
  assert.equal(forced.verseTimings.find((item) => item.verseKey === "6:75")?.recoveryAttempted, true);
  assert.equal(recovered.timingRecoveryPlan?.required, false, "a recovery run prevents a confident synthetic retry loop");
  const firstVerseWords = forced.canonicalWordAlignments!.filter((item) => item.verseKey === "6:74");
  assert.deepEqual(firstVerseWords.map((item) => item.canonicalWordIndex), Array.from({ length: 14 }, (_, index) => index + 1));
  assert.ok(firstVerseWords.every((item) => !item.directMatch), "chunk fallback exposes no fake direct word timestamps");
  assert.equal(forced.captionSets.length, 3);
  assert.ok(forced.captionSets.every((set) => set.cutReason === "whole-ayah"));
});
