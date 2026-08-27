import assert from "node:assert/strict";
import test from "node:test";
import { LOCAL_WHISPER_MODEL, splitPcmAudio } from "../src/lib/recognition/local-whisper.ts";

test("uses a multilingual Whisper model and bounded overlapping audio chunks", () => {
  assert.equal(LOCAL_WHISPER_MODEL, "onnx-community/whisper-base");
  const chunks = splitPcmAudio(new Float32Array(16_000 * 61));
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].offsetSeconds, 0);
  assert.equal(chunks[1].offsetSeconds, 27);
  assert.equal(chunks[2].offsetSeconds, 54);
  assert.equal(chunks[1].trimBeforeSeconds, 3);
});
