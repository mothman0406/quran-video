import assert from "node:assert/strict";
import test from "node:test";
import {
  buildVerseContent,
  isQuranScript,
  parseVerseKey,
  quranFontDefinitions,
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

test("exposes the supported font profiles without local font assets", () => {
  assert.equal(isQuranScript("indopak"), true);
  assert.equal(isQuranScript("unsupported"), false);
  assert.deepEqual(Object.keys(quranFontDefinitions).sort(), ["indopak", "kfgqpc", "madinah-qcf", "uthmani"]);
  assert.equal(stripTranslationMarkup("<b>A</b> &amp; B"), "A & B");
});
