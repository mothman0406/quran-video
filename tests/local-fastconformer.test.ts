import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCtcWords, forceAlignCtc } from "../src/lib/recognition/ctc-forced-alignment.ts";
import {
  encodeFastConformerWords,
  FASTCONFORMER_SHADOW_MODEL_ARTIFACT,
  FASTCONFORMER_SHADOW_MODEL_BYTES,
  FASTCONFORMER_SHADOW_MODEL_URL,
  FASTCONFORMER_SHADOW_ORT_IMPORT,
  FASTCONFORMER_SHADOW_ORT_VERSION,
  FASTCONFORMER_SHADOW_RUNTIME,
  loadFastConformerAsset,
} from "../src/lib/recognition/local-fastconformer.ts";

function installAssetCache() {
  const entries = new Map<string, Response>();
  const cache = {
    match: async (url: string) => entries.get(url)?.clone(),
    put: async (url: string, response: Response) => { entries.set(url, response.clone()); },
    delete: async (url: string) => entries.delete(url),
  };
  const originalCaches = globalThis.caches;
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { open: async () => cache } });
  return {
    entries,
    restore: () => Object.defineProperty(globalThis, "caches", { configurable: true, value: originalCaches }),
  };
}

test("FastConformer shadow builds exact known-passage BPE targets with canonical word ownership", () => {
  const canonical = canonicalCtcWords([{ verseKey: "1:1", text: "السَّلَامُ عَلَيْكُمْ" }]);
  const encoded = encodeFastConformerWords(
    canonical,
    { "1:1:1": [10, 11, 12] },
    { "10": "▁السلام", "11": "▁علي", "12": "كم" },
  );
  assert.deepEqual(encoded.canonicalWords.map((word) => word.alignmentText), ["السلام", "عليكم"]);
  assert.deepEqual(encoded.targetTokens.map((token) => [token.token, token.globalWordIndex]), [["▁السلام", 1], ["▁علي", 2], ["كم", 2]]);
});

test("FastConformer shadow preserves Tilawa table token 0 even though vocab labels it <unk>", () => {
  const canonical = canonicalCtcWords([{ verseKey: "6:74", text: "وَإِذْ" }]);
  const encoded = encodeFastConformerWords(
    canonical,
    { "6:74:74": [10, 0, 11] },
    { "0": "<unk>", "1": "ة", "10": "▁", "11": "▁واذ", "1024": "<blank>" },
  );
  assert.deepEqual(encoded.targetTokens.map((token) => token.tokenId), [10, 0, 11]);
  assert.deepEqual(encoded.targetTokenMapping.map((token) => [token.tokenId, token.canonicalWordIndex]), [[10, 1], [0, 1], [11, 1]]);
  assert.deepEqual(encoded.targetValidation, [{ verseKey: "6:74", tokenCount: 3, firstTokenIds: [10, 0, 11], lastTokenIds: [10, 0, 11], invalidTokenIds: [] }]);
});

test("FastConformer shadow constructs complete 93:1–5 targets from the real pinned Tilawa assets", () => {
  const canonical = canonicalCtcWords([
    { verseKey: "93:1", text: "وَٱلضُّحَىٰ" },
    { verseKey: "93:2", text: "وَٱلَّيْلِ إِذَا سَجَىٰ" },
    { verseKey: "93:3", text: "مَا وَدَّعَكَ رَبُّكَ وَمَا قَلَىٰ" },
    { verseKey: "93:4", text: "وَلَلْـَٔاخِرَةُ خَيْرٌ لَّكَ مِنَ ٱلْأُولَىٰ" },
    { verseKey: "93:5", text: "وَلَسَوْفَ يُعْطِيكَ رَبُّكَ فَتَرْضَىٰٓ" },
  ]);
  const encoded = encodeFastConformerWords(canonical, {
    "93:1:1": [351, 7, 59, 982, 986, 63, 47, 29, 2],
    "93:2:2": [63, 123, 49, 186, 75, 38, 2],
    "93:3:3": [70, 9, 15, 13, 4, 245, 4, 492, 380, 2],
    "93:4:4": [266, 14, 512, 6, 325, 3, 769, 232, 21, 170, 96, 2],
    "93:5:5": [266, 26, 220, 22, 13, 40, 2, 4, 245, 4, 494, 205, 2],
  }, {
    "2": "ي", "3": "ه", "4": "ك", "6": "ا", "7": "م", "9": "▁و", "13": "ع", "14": "ل", "15": "د", "21": "▁من", "22": "▁ي", "26": "س", "29": "ح", "38": "ج", "40": "ط", "47": "ض", "49": "▁ا", "59": "▁الله", "63": "▁وال", "70": "▁ما", "75": "▁س", "96": "ول", "123": "يل", "170": "▁الا", "186": "ذا", "205": "رض", "220": "وف", "232": "▁لك", "245": "▁رب", "266": "▁ول", "325": "خر", "351": "▁بس", "380": "▁قل", "492": "▁وما", "494": "▁فت", "512": "ء", "769": "▁خير", "982": "▁الرحمن", "986": "▁الرحيم",
  }, {
    "93:1": "بسم الله الرحمن الرحيم والضحي",
    "93:2": "واليل اذا سجي",
    "93:3": "ما ودعك ربك وما قلي",
    "93:4": "وللءاخره خير لك من الاولي",
    "93:5": "ولسوف يعطيك ربك فترضي",
  });
  const first = encoded.targetTokenMapping.filter((token) => token.verseKey === "93:1");
  assert.equal(first.length, 9);
  assert.equal(first[0]?.canonicalWordIndex, 1);
  assert.equal(first.at(-1)?.canonicalWordIndex, 1);
  assert.equal(encoded.canonicalWords.find((word) => word.verseKey === "93:1")?.alignmentText, "والضحي");
  for (const verseKey of ["93:1", "93:2", "93:3", "93:4", "93:5"]) {
    const wordCount = encoded.canonicalWords.filter((word) => word.verseKey === verseKey).length;
    const owners = new Set(encoded.targetTokenMapping.filter((token) => token.verseKey === verseKey).map((token) => token.canonicalWordIndex));
    assert.deepEqual([...owners], Array.from({ length: wordCount }, (_, index) => index + 1), verseKey);
    assert.ok(encoded.targetTokenMapping.filter((token) => token.verseKey === verseKey).length > 0, verseKey);
  }
});

test("FastConformer shadow uses frame-exact endpoints without one-millisecond repair", () => {
  const canonical = canonicalCtcWords([{ verseKey: "1:1", text: "ا ب" }]);
  const target = [{ tokenId: 1, token: "▁ا", globalWordIndex: 1 }, { tokenId: 2, token: "▁ب", globalWordIndex: 2 }];
  const logits = new Float32Array([
    0, 9, 0,
    0, 0, 9,
  ]);
  const result = forceAlignCtc(canonical, target, { values: logits, frames: 2, vocabularySize: 3 }, {
    blankTokenId: 0,
    startMs: 0,
    endMs: 1,
    frameExactEndpoints: true,
  });
  assert.equal(result.status, "complete");
  assert.deepEqual(result.words.map((word) => [word.startMs, word.endMs]), [[0, 1], [1, 1]]);
});

test("FastConformer shadow pins the public CC-BY artifact revision and measured size", () => {
  assert.equal(FASTCONFORMER_SHADOW_MODEL_ARTIFACT, "fastconformer_full_mixed.onnx");
  assert.equal(FASTCONFORMER_SHADOW_MODEL_BYTES, 88_307_366);
  assert.match(FASTCONFORMER_SHADOW_MODEL_URL, /acibZ\/tilawa-quran-onnx\/resolve\/0cd79471524bc9cfa1c9296055242a935a1873e4\/fastconformer_full_mixed\.onnx$/);
});

test("FastConformer shadow uses Tilawa's isolated WASM-only runtime", () => {
  assert.equal(FASTCONFORMER_SHADOW_ORT_IMPORT, "fastconformer-onnxruntime-web/wasm");
  assert.equal(FASTCONFORMER_SHADOW_ORT_VERSION, "1.24.2");
  assert.match(FASTCONFORMER_SHADOW_RUNTIME, /WASM only/);
  assert.doesNotMatch(FASTCONFORMER_SHADOW_RUNTIME, /WebGPU/);
});

test("FastConformer asset loading is cache-first and validates the pinned bytes", async () => {
  const assetCache = installAssetCache();
  const originalFetch = globalThis.fetch;
  const url = "https://assets.example.test/pinned-cache-hit";
  try {
    assetCache.entries.set(url, new Response(new Uint8Array([1, 2, 3])));
    globalThis.fetch = async () => { throw new Error("cache hit must not fetch"); };
    const asset = await loadFastConformerAsset(url, 3);
    assert.equal(asset.diagnostic.cacheStatus, "browser-cache");
    assert.equal(asset.diagnostic.downloadBytes, 0);
    assert.equal(asset.diagnostic.attemptCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
    assetCache.restore();
  }
});

test("FastConformer asset loading shares one download and retries a 429 once", async () => {
  const assetCache = installAssetCache();
  const originalFetch = globalThis.fetch;
  const url = "https://assets.example.test/pinned-single-flight";
  let requests = 0;
  try {
    globalThis.fetch = async () => {
      requests += 1;
      return requests === 1
        ? new Response("rate limited", { status: 429, headers: { "Retry-After": "0" } })
        : new Response(new Uint8Array([4, 5, 6]));
    };
    const [first, second] = await Promise.all([loadFastConformerAsset(url, 3), loadFastConformerAsset(url, 3)]);
    assert.equal(requests, 2);
    assert.strictEqual(first, second);
    assert.equal(first.diagnostic.attemptCount, 2);
    assert.equal(first.diagnostic.httpStatus, 200);
    assert.equal(first.diagnostic.retryAfterMs, 0);
    assert.equal(first.diagnostic.cacheStatus, "cold-download");
  } finally {
    globalThis.fetch = originalFetch;
    assetCache.restore();
  }
});
