import assert from "node:assert/strict";
import test from "node:test";
import { getVerse } from "../src/lib/quran/local.ts";
import { clearTranslationCacheForTests, getTranslation } from "../src/lib/quran/translations.ts";

function mockQuranEncFetch() {
  let surahCalls = 0;
  let metadataCalls = 0;
  const fetchImpl: typeof fetch = async (input) => {
    const url = String(input);
    if (url.includes("translations/list")) {
      metadataCalls += 1;
      return Response.json({ translations: [{ key: "english_saheeh", version: "1.0.9" }] });
    }
    surahCalls += 1;
    return Response.json({ result: [
      { sura: "93", aya: "1", translation: "By the morning brightness" },
      { sura: "93", aya: "2", translation: "And [by] the night when it covers with darkness" },
    ] });
  };
  return { fetchImpl, calls: () => ({ surahCalls, metadataCalls }) };
}

test("93:1 resolves from QuranEnc Saheeh International", async () => {
  clearTranslationCacheForTests();
  const mock = mockQuranEncFetch();
  const result = await getTranslation("93:1", "saheeh-international", mock.fetchImpl);
  assert.deepEqual(result, {
    text: "By the morning brightness",
    metadata: { edition: "Saheeh International", source: "quranenc", translationKey: "english_saheeh", version: "1.0.9" },
  });
});

test("multiple verses from one surah reuse the cached QuranEnc response", async () => {
  clearTranslationCacheForTests();
  const mock = mockQuranEncFetch();
  await getTranslation("93:1", "saheeh-international", mock.fetchImpl);
  await getTranslation("93:2", "saheeh-international", mock.fetchImpl);
  assert.equal(mock.calls().surahCalls, 1);
  assert.equal(mock.calls().metadataCalls, 1);
});

test("Arabic remains available and translation failure is graceful", async () => {
  clearTranslationCacheForTests();
  const failedFetch: typeof fetch = async () => Response.json({}, { status: 503 });
  assert.equal(await getTranslation("93:1", "saheeh-international", failedFetch), null);
  assert.ok(getVerse("93:1")?.arabic.uthmani);
});

test("translation text is not replaced with ASR text", async () => {
  clearTranslationCacheForTests();
  const mock = mockQuranEncFetch();
  const result = await getTranslation("93:1", "saheeh-international", mock.fetchImpl);
  const asr = "وضحى واللي";
  assert.equal(result?.text, "By the morning brightness");
  assert.notEqual(result?.text, asr);
});
