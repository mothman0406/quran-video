import assert from "node:assert/strict";
import test from "node:test";
import { createPrimaryTranscript, hafsVerses, identifyQuranPassage, normalizeArabic, recognizeTranscript, type TranscriptChunk } from "../src/lib/recognition/core.ts";
import { quranRecognitionUnits } from "../src/lib/recognition/quran-recitation.ts";

const verse = (key: string) => hafsVerses.find((item) => item.verseKey === key)!;

test("passage matching preserves canonical display text", () => {
  const result = recognizeTranscript([{ startMs: 100, endMs: 1_100, text: verse("93:1").text }]);
  assert.equal(result[0]?.verseKey, "93:1");
  assert.notEqual(verse("93:1").text, normalizeArabic(verse("93:1").text));
});

test("passage identity is unchanged by Whisper timestamp quality", () => {
  const text = `${verse("93:1").text} ${verse("93:2").text} ${verse("93:3").text}`;
  const word: TranscriptChunk[] = [{ startMs: 1_000, endMs: 8_000, text, words: text.split(/\s+/u).map((token, index) => ({ text: token, startMs: 1_000 + index * 100, endMs: 1_080 + index * 100 })) }];
  const coarse: TranscriptChunk[] = [{ startMs: 1_000, endMs: 8_000, text }];
  const wordPassage = identifyQuranPassage(createPrimaryTranscript(word, "word"));
  const coarsePassage = identifyQuranPassage(createPrimaryTranscript(coarse, "chunk-fallback"));
  assert.deepEqual(wordPassage.passage.canonicalSpan?.coveredVerseKeys, ["93:1", "93:2", "93:3"]);
  assert.deepEqual(coarsePassage.passage.canonicalSpan?.coveredVerseKeys, wordPassage.passage.canonicalSpan?.coveredVerseKeys);
});

test("recitation-aware matching keeps connected speech while rejecting unrelated Arabic", () => {
  const connected = quranRecognitionUnits(normalizeArabic("قل دعوا"), "قل دعوا");
  const canonical = quranRecognitionUnits(normalizeArabic("قُلِ ٱدۡعُواْ"), "قُلِ ٱدۡعُواْ");
  assert.equal(connected.recitation, canonical.recitation);
  assert.deepEqual(recognizeTranscript([{ startMs: 0, endMs: 700, text: "وشم الحافلة" }]), []);
});
