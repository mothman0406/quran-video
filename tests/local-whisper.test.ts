import assert from "node:assert/strict";
import test from "node:test";
import {
  LOCAL_WHISPER_CAPABILITY,
  LOCAL_WHISPER_MODEL,
  isWordTimestampRuntimeFailure,
  splitPcmAudio,
  stitchTimestampedChunks,
  validateWordTimestamps,
  withTimestampFallback,
} from "../src/lib/recognition/local-whisper.ts";
import { smoothVadSpeechRegions } from "../src/lib/recognition/speech-regions.ts";
import {
  configureVadRuntime,
  SILERO_MODEL_URL,
  VAD_WASM_MODULE_URL,
  VAD_WASM_URL,
} from "../src/lib/recognition/vad.ts";

test("configures the browser VAD with stable local assets", () => {
  const ort = { env: { wasm: {} as { wasmPaths?: string | { wasm?: string | URL; mjs?: string | URL }; numThreads?: number } } };
  configureVadRuntime(ort);
  assert.deepEqual(ort.env.wasm.wasmPaths, { wasm: VAD_WASM_URL, mjs: VAD_WASM_MODULE_URL });
  assert.equal(ort.env.wasm.numThreads, 1);
  assert.equal(SILERO_MODEL_URL, "/ort/silero_vad_legacy.onnx");
});

test("uses a multilingual Whisper model and bounded overlapping audio chunks", () => {
  assert.equal(LOCAL_WHISPER_MODEL, "onnx-community/whisper-base_timestamped");
  assert.equal(LOCAL_WHISPER_CAPABILITY.wordTimestamps, true);
  assert.notEqual(LOCAL_WHISPER_CAPABILITY.modelId, "onnx-community/whisper-base");
  const chunks = splitPcmAudio(new Float32Array(16_000 * 61));
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].offsetSeconds, 0);
  assert.equal(chunks[1].offsetSeconds, 27);
  assert.equal(chunks[2].offsetSeconds, 54);
  assert.equal(chunks[1].trimBeforeSeconds, 3);
});

test("accepts valid word timestamps while tolerating an isolated zero-duration word", () => {
  const result = validateWordTimestamps([
    { text: "والضحى", timestamp: [0.5, 0.8] },
    { text: "والليل", timestamp: [0.8, 0.8] },
    { text: "اذا", timestamp: [0.8, 1.1] },
  ], 1_500);
  assert.equal(result.valid, true);
  assert.equal(result.diagnostics.zeroDurationCount, 1);
});

test("rejects missing or pathological word timestamps", () => {
  assert.equal(validateWordTimestamps([], 1_000).valid, false);
  assert.equal(validateWordTimestamps([
    { text: "a", timestamp: [0.5, 0.5] },
    { text: "b", timestamp: [0.5, 0.5] },
  ], 1_000).valid, false);
});

test("cross-attention timestamp failures retry once with coarse chunks", async () => {
  let fallbackCalls = 0;
  const result = await withTimestampFallback(
    async () => { throw new Error("Model outputs must contain cross attentions to extract timestamps."); },
    async () => { fallbackCalls += 1; return "coarse"; },
  );
  assert.equal(isWordTimestampRuntimeFailure(new Error("output_attentions=True")), true);
  assert.deepEqual(result, {
    value: "coarse",
    timestampMode: "chunk-fallback",
    fallbackReason: "Model outputs must contain cross attentions to extract timestamps.",
  });
  assert.equal(fallbackCalls, 1);
});

test("keeps absolute word times when stitching overlapping windows", () => {
  const stitched = stitchTimestampedChunks([
    { text: "والضحى", startMs: 28_000, endMs: 28_300, words: [{ text: "والضحى", startMs: 28_000, endMs: 28_300 }] },
    { text: "والضحى", startMs: 28_000, endMs: 28_300, words: [{ text: "والضحى", startMs: 28_000, endMs: 28_300 }] },
    { text: "والليل", startMs: 30_100, endMs: 30_400, words: [{ text: "والليل", startMs: 30_100, endMs: 30_400 }] },
  ]);
  assert.deepEqual(stitched.map((chunk) => [chunk.text, chunk.startMs, chunk.endMs]), [
    ["والضحى", 28_000, 28_300],
    ["والليل", 30_100, 30_400],
  ]);
});

test("smooths only tiny Silero VAD interruptions while retaining meaningful gaps", () => {
  const regions = smoothVadSpeechRegions([
    { startMs: 9_500, endMs: 10_300, durationMs: 800, confidence: 0.91 },
    { startMs: 10_520, endMs: 11_200, durationMs: 680, confidence: 0.83 },
    { startMs: 12_100, endMs: 12_700, durationMs: 600, confidence: 0.88 },
  ], 15_000);
  assert.deepEqual(regions.map((region) => [region.startMs, region.endMs]), [
    [9_500, 11_200],
    [12_100, 12_700],
  ]);
  assert.ok(regions[0]!.confidence > 0.87 && regions[0]!.confidence < 0.92);
});
