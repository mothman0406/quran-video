import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCtcWords, forceAlignCtc } from "../src/lib/recognition/ctc-forced-alignment.ts";
import {
  encodeFastConformerWords,
  FASTCONFORMER_SHADOW_MODEL_ARTIFACT,
  FASTCONFORMER_SHADOW_MODEL_BYTES,
  FASTCONFORMER_SHADOW_MODEL_URL,
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
