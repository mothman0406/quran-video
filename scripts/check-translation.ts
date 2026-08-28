import { clearTranslationCacheForTests, getTranslation } from "../src/lib/quran/translations.ts";

if (process.env.LIVE_TRANSLATION_CHECK !== "1") {
  console.log("Set LIVE_TRANSLATION_CHECK=1 to run the opt-in QuranEnc check.");
  process.exit(0);
}

clearTranslationCacheForTests();
const result = await getTranslation("93:1");
if (!result?.text) throw new Error("QuranEnc Saheeh translation for 93:1 was empty.");
console.log(JSON.stringify({ verseKey: "93:1", provider: result.metadata.source, translation: result.text, version: result.metadata.version }, null, 2));
