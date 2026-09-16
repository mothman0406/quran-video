import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalizeNativeRecognitionPcm } from "../src/lib/recognition/local-audio-decode.ts";
import { requiresFfmpegCanonicalPcm } from "../src/lib/recognition/local-media-compatibility.ts";
import type { MediaInspection } from "../src/lib/media-compatibility.ts";

function inspection(overrides: Partial<MediaInspection> = {}): MediaInspection {
  return {
    readable: true,
    kind: "video",
    hasVideo: true,
    hasAudio: true,
    browserPlayback: true,
    nativeRecognitionAudio: true,
    audioCodec: "aac",
    videoCodec: "avc",
    ...overrides,
  };
}

test("media preparation selects one canonical PCM before Quran recognition", () => {
  const compatibility = readFileSync("src/lib/recognition/local-media-compatibility.ts", "utf8");
  assert.match(compatibility, /export async function prepareRecognitionAudio/);
  assert.match(compatibility, /Decoder choice is based solely on inspected media and native decoder/);
  assert.match(compatibility, /return \{ pcm, decodePath: "ffmpeg", reason: initialReason, inspection \}/);
  assert.match(compatibility, /return \{ pcm, decodePath: "native", reason: "native-safe", inspection \}/);
  assert.doesNotMatch(compatibility, /FastConformer|canonicalSpan/);
});

test("the known non-integral native resample path uses FFmpeg before inference while integral native media stays efficient", () => {
  assert.equal(requiresFfmpegCanonicalPcm(inspection({ audioSampleRate: 44_100, audioChannels: 2 })), true);
  assert.equal(requiresFfmpegCanonicalPcm(inspection({ audioSampleRate: 48_000, audioChannels: 2 })), false);
  assert.equal(requiresFfmpegCanonicalPcm(inspection({ audioSampleRate: 16_000, audioChannels: 1 })), false);
});

test("native-safe preparation still hands the recognizer canonical 16 kHz mono PCM", () => {
  const left = new Float32Array([0, 1, 0, -1]);
  const right = new Float32Array([0, -1, 0, 1]);
  const canonical = canonicalizeNativeRecognitionPcm({ sampleRate: 16_000, frameCount: 4, channelBuffers: [left.buffer, right.buffer] });
  assert.equal(canonical.sampleRate, 16_000);
  assert.equal(canonical.frameCount, 4);
  assert.equal(canonical.channelBuffers.length, 1);
  assert.deepEqual(Array.from(new Float32Array(canonical.channelBuffers[0]!)), [0, 0, 0, 0]);
});

test("editor and route-persistent generation pass one authoritative PCM into one top-level Quran identification", () => {
  const editor = readFileSync("src/components/editor-client.tsx", "utf8");
  const generation = readFileSync("src/lib/video-generation.ts", "utf8");
  const jobs = readFileSync("src/lib/video-jobs.ts", "utf8");
  const quickCreate = readFileSync("src/components/quick-create.tsx", "utf8");

  assert.match(editor, /prepareRecognitionAudio\(sourceFile, abort\.signal/);
  assert.equal((editor.match(/worker\.identify\(job/g) ?? []).length, 1);
  assert.doesNotMatch(editor, /extractRecognitionPcm|pcm-recovery|recoveryArbitration/);
  assert.match(generation, /authoritativePcm: DecodedAudioChannels/);
  assert.equal((generation.match(/input\.worker\.identify\(input\.jobId/g) ?? []).length, 1);
  assert.doesNotMatch(generation, /extractRecognitionPcm|pcm-recovery|recoverySelection/);
  assert.match(quickCreate, /prepareRecognitionAudio\(result\.file, abort\.signal/);
  assert.match(jobs, /prepareRecognitionAudio\(runtime\.file, runtime\.abort\.signal\)/);
});

test("the caller-owned authoritative PCM remains reusable after worker transfer and retry", () => {
  const client = readFileSync("src/lib/recognition/recognition-worker-client.ts", "utf8");
  assert.match(client, /disposableWorkerBuffers/);
  assert.match(client, /channelBuffers\.map\(\(buffer\) => buffer\.slice\(0\)\)/);
  assert.match(client, /caller-owned, reusable PCM/);
});
