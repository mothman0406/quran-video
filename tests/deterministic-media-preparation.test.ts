import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { writePlanarAudioToCanonicalPcm } from "../src/lib/recognition/local-audio-decode.ts";
import { MediaCompatibilityError, routeMediaCompatibility, type MediaInspection } from "../src/lib/media-compatibility.ts";
import { selectRecognitionAudioPath, selectedAudioMap } from "../src/lib/recognition/local-media-compatibility.ts";
import { runDeterministicRecognitionAudioRouter } from "../src/lib/recognition/media-preparation-router.ts";

test("supported preferred audio decoding is selected without compatibility work", async () => {
  let preferredAttempts = 0;
  let fallbackAttempts = 0;
  const states: string[] = [];
  const result = await runDeterministicRecognitionAudioRouter({
    preferredSupported: true,
    preparePreferred: async () => { preferredAttempts += 1; return "pcm"; },
    prepareFallback: async () => { fallbackAttempts += 1; return "fallback"; },
    onState: (state) => states.push(state),
  });
  assert.deepEqual(result, { value: "pcm", route: "webcodecs", fallbackUsed: false });
  assert.equal(preferredAttempts, 1);
  assert.equal(fallbackAttempts, 0);
  assert.deepEqual(states, ["preparing-audio", "ready"]);
});

test("unsupported preferred decoding goes directly to one generic fallback", async () => {
  let preferredAttempts = 0;
  let fallbackAttempts = 0;
  const result = await runDeterministicRecognitionAudioRouter({
    preferredSupported: false,
    preparePreferred: async () => { preferredAttempts += 1; return "preferred"; },
    prepareFallback: async () => { fallbackAttempts += 1; return "pcm"; },
  });
  assert.equal(result.route, "ffmpeg");
  assert.equal(preferredAttempts, 0);
  assert.equal(fallbackAttempts, 1);
});

test("a preferred decoder failure triggers the compatibility fallback exactly once", async () => {
  let preferredAttempts = 0;
  let fallbackAttempts = 0;
  const result = await runDeterministicRecognitionAudioRouter({
    preferredSupported: true,
    preparePreferred: async () => { preferredAttempts += 1; throw new Error("decode failed"); },
    prepareFallback: async () => { fallbackAttempts += 1; return "pcm"; },
  });
  assert.equal(result.fallbackUsed, true);
  assert.equal(preferredAttempts, 1);
  assert.equal(fallbackAttempts, 1);
});

test("fallback failure is terminal and cannot loop", async () => {
  let preferredAttempts = 0;
  let fallbackAttempts = 0;
  const states: string[] = [];
  await assert.rejects(runDeterministicRecognitionAudioRouter({
    preferredSupported: true,
    preparePreferred: async () => { preferredAttempts += 1; throw new Error("preferred failed"); },
    prepareFallback: async () => { fallbackAttempts += 1; throw new Error("fallback failed"); },
    onState: (state) => states.push(state),
  }), /fallback failed/);
  assert.equal(preferredAttempts, 1);
  assert.equal(fallbackAttempts, 1);
  assert.deepEqual(states, ["preparing-audio", "compatibility-fallback", "failed"]);
});

test("cancellation never starts a fallback or publishes stale readiness", async () => {
  const abort = new AbortController();
  let fallbackAttempts = 0;
  await assert.rejects(runDeterministicRecognitionAudioRouter({
    preferredSupported: true,
    signal: abort.signal,
    preparePreferred: async () => { abort.abort(); throw new DOMException("cancelled", "AbortError"); },
    prepareFallback: async () => { fallbackAttempts += 1; return "stale"; },
  }), { name: "AbortError" });
  assert.equal(fallbackAttempts, 0);
});

test("planar audio converges to the canonical mono 16 kHz amplitude contract", () => {
  const output = new Float32Array(4);
  const written = writePlanarAudioToCanonicalPcm(
    output,
    [new Float32Array([1, 1, -1, -1]), new Float32Array([-1, -1, 1, 1])],
    16_000,
    0,
  );
  assert.equal(written, 4);
  assert.deepEqual(Array.from(output), [0, 0, 0, 0]);
});

test("production preparation demuxes audio without a whole-file copy or video decode", () => {
  const decode = readFileSync("src/lib/recognition/local-audio-decode.ts", "utf8");
  const compatibility = readFileSync("src/lib/recognition/local-media-compatibility.ts", "utf8");
  assert.match(decode, /AudioSampleSink/);
  assert.match(decode, /input\.getAudioTracks\(\)/);
  assert.doesNotMatch(decode, /source\.arrayBuffer\(\)/);
  assert.doesNotMatch(decode, /VideoSampleSink|VideoDecoder/);
  assert.match(compatibility, /"-vn"/);
  assert.match(compatibility, /selectedAudioMap\(inspection\)/);
});

test("no audio track fails explicitly before any decoder attempt", () => {
  const inspection: MediaInspection = {
    readable: true, kind: "video", hasVideo: true, hasAudio: false,
    browserPlayback: true, nativeRecognitionAudio: false,
  };
  assert.throws(() => routeMediaCompatibility(1, inspection), new MediaCompatibilityError("noAudio"));
});

test("multiple audio tracks retain the deterministic inspected primary selection", () => {
  const inspection: MediaInspection = {
    readable: true, kind: "video", hasVideo: true, hasAudio: true,
    browserPlayback: true, nativeRecognitionAudio: true,
    audioStreamCount: 3, selectedAudioTrackId: 42, selectedAudioTrackNumber: 2,
  };
  assert.equal(selectedAudioMap(inspection), "0:a:1");
  assert.deepEqual(selectRecognitionAudioPath(inspection), { decodePath: "webcodecs", reason: "native-safe" });
});

test("unsupported video never blocks independently decodable recognition audio", () => {
  const inspection: MediaInspection = {
    readable: true, kind: "video", hasVideo: true, hasAudio: true,
    browserPlayback: true, nativeRecognitionAudio: true,
    videoCodec: "unsupported-video", audioCodec: "aac",
  };
  assert.deepEqual(selectRecognitionAudioPath(inspection), { decodePath: "webcodecs", reason: "native-safe" });
});

test("browser and compatibility waits are bounded and expose terminal UI recovery", () => {
  const compatibility = readFileSync("src/lib/recognition/local-media-compatibility.ts", "utf8");
  const router = readFileSync("src/lib/recognition/media-preparation-router.ts", "utf8");
  const quickCreate = readFileSync("src/components/quick-create.tsx", "utf8");
  assert.match(compatibility, /withMediaPreparationTimeout\("Media inspection", 30_000/);
  assert.match(compatibility, /withMediaPreparationTimeout\("Browser audio decoding", 120_000/);
  assert.match(compatibility, /withMediaPreparationTimeout\("Compatibility audio decoding", 15 \* 60_000/);
  assert.match(router, /controller\.abort\(new MediaPreparationTimeoutError/);
  assert.match(quickCreate, /Preparation failed/);
  assert.match(quickCreate, />Retry<\/button>/);
  assert.match(quickCreate, /Choose another/);
});

test("original source remains authoritative and media preparation never starts recognition", () => {
  const quickCreate = readFileSync("src/components/quick-create.tsx", "utf8");
  const compatibility = readFileSync("src/lib/recognition/local-media-compatibility.ts", "utf8");
  assert.match(quickCreate, /originalSource: next/);
  assert.match(quickCreate, /const \[editorOutcome, recognitionOutcome\] = await Promise\.allSettled/);
  assert.doesNotMatch(compatibility, /worker\.identify|FastConformer|generateVideoCaptions/);
});
