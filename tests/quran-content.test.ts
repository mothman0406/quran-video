import assert from "node:assert/strict";
import test from "node:test";
import corpus from "../src/lib/quran/hafs-corpus.json" with { type: "json" };
import { getVerse, getVerses, getSurah, LOCAL_SURAH_COUNT, LOCAL_VERSE_COUNT } from "../src/lib/quran/local.ts";
import { normalizeArabic, recognizeTranscript } from "../src/lib/recognition/core.ts";
import {
  buildVerseContent,
  isQuranScript,
  parseVerseKey,
  quranFontDefinitions,
  quranDisplayText,
  stripTranslationMarkup,
} from "../src/lib/quran/content.ts";

test("accepts valid verse keys and rejects invalid keys", () => {
  assert.deepEqual(parseVerseKey("93:1"), { surahNumber: 93, ayahNumber: 1 });
  assert.equal(parseVerseKey("115:1"), null);
  assert.equal(parseVerseKey("93"), null);
});

test("normalizes API fields into every supported Quran script", () => {
  const verse = buildVerseContent({
    verseKey: "93:1",
    textUthmani: "وَالضُّحَىٰ",
    textQpcHafs: "وَٱلضُّحَىٰ",
    textIndopak: "وَالضُّحَىٰ",
    translation: "By the morning brightness<sup foot_note=\"1\">1</sup>",
    transliteration: "Waḍ-ḍuḥā",
  });

  assert.equal(verse.arabic.uthmani, "وَالضُّحَىٰ");
  assert.equal(verse.arabic["madinah-qcf"], "وَٱلضُّحَىٰ");
  assert.equal(verse.translation, "By the morning brightness1");
  assert.equal(verse.translationEdition, "Saheeh International");
  assert.equal(verse.font.source.includes("quran.foundation"), true);
});

test("derives marker-free display text without changing canonical source text", () => {
  const markedText = "وَٱلضُّحَىٰ ۝١";
  const verse = buildVerseContent({ verseKey: "93:1", textUthmani: markedText });
  assert.equal(verse.arabic.uthmani, markedText);
  assert.equal(quranDisplayText(verse), "وَٱلضُّحَىٰ");
});

test("exposes the supported font profiles without local font assets", () => {
  assert.equal(isQuranScript("indopak"), true);
  assert.equal(isQuranScript("unsupported"), false);
  assert.deepEqual(Object.keys(quranFontDefinitions).sort(), ["indopak", "kfgqpc", "madinah-qcf", "uthmani"]);
  assert.equal(stripTranslationMarkup("<b>A</b> &amp; B"), "A & B");
});

test("contains the complete immutable Tanzil corpus", () => {
  assert.equal(corpus.length, LOCAL_SURAH_COUNT);
  assert.equal(corpus.reduce((count, surah) => count + surah.verses.length, 0), LOCAL_VERSE_COUNT);
  assert.equal(getSurah(93)?.verseCount, 11);
  for (const key of ["1:1", "2:255", "93:1", "114:6"]) assert.ok(getVerse(key)?.arabic.uthmani, key);
  assert.equal(getVerses("93:1", "93:5").length, 5);
});

test("rejects invalid local verse keys safely", () => {
  for (const key of ["0:1", "115:1", "93", "93:0", "93:x"]) assert.equal(getVerse(key), null);
  assert.deepEqual(getVerses("93:5", "93:1"), []);
  assert.equal(getSurah(115), null);
});

test("recognition resolves 93:1-5 to local canonical Arabic without credentials", () => {
  const asr = "وضحة واللي إذا أسجى ما ودعك ربك وما قلى والأخرة خير لك من الأولات ولسوفة وعطيك ربك فترضى";
  const matches = recognizeTranscript([{ startMs: 0, endMs: 20_000, text: asr }]);
  assert.deepEqual(matches.map((match) => match.verseKey), ["93:1", "93:2", "93:3", "93:4", "93:5"]);
  assert.notEqual(getVerse("93:1")?.arabic.uthmani, asr);
});

test("recognition normalization cannot mutate canonical display data", () => {
  const original = getVerse("93:1")?.arabic.uthmani;
  normalizeArabic(original ?? "");
  assert.equal(getVerse("93:1")?.arabic.uthmani, original);
});
