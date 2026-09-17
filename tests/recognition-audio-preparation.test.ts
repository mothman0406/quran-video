import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalizeNativeRecognitionPcm } from "../src/lib/recognition/local-audio-decode.ts";
import { isUsableCanonicalRecognitionPcm, selectRecognitionAudioPath } from "../src/lib/recognition/local-media-compatibility.ts";
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
  assert.match(compatibility, /return \{ pcm, decodePath: "ffmpeg", reason: selection\.reason, inspection \}/);
  assert.match(compatibility, /return \{ pcm, decodePath: "native", reason: "native-safe", inspection \}/);
  assert.doesNotMatch(compatibility, /FastConformer|canonicalSpan/);
});

test("sample rate alone never initializes FFmpeg for browser-decodable media", () => {
  for (const audioSampleRate of [44_100, 22_050, 48_000, 16_000]) {
    assert.deepEqual(selectRecognitionAudioPath(inspection({ audioSampleRate, audioChannels: 2 })), { decodePath: "native", reason: "native-safe" });
  }
});

test("actual native decoder incompatibility selects the single FFmpeg fallback before recognition", () => {
  assert.deepEqual(selectRecognitionAudioPath(inspection({ nativeRecognitionAudio: false, audioSampleRate: 44_100 })), { decodePath: "ffmpeg", reason: "media-audio-fallback" });
  const compatibility = readFileSync("src/lib/recognition/local-media-compatibility.ts", "utf8");
  assert.match(compatibility, /catch \{[\s\S]*?reason: "native-decode-unavailable"/);
  assert.doesNotMatch(compatibility, /non-integral-resample|requiresFfmpegCanonicalPcm/);
});

test("native-safe preparation still hands the recognizer canonical 16 kHz mono PCM", () => {
  const left = new Float32Array([0, 1, 0, -1]);
  const right = new Float32Array([0, -1, 0, 1]);
  const canonical = canonicalizeNativeRecognitionPcm({ sampleRate: 16_000, frameCount: 4, channelBuffers: [left.buffer, right.buffer] });
  assert.equal(canonical.sampleRate, 16_000);
  assert.equal(canonical.frameCount, 4);
  assert.equal(canonical.channelBuffers.length, 1);
  assert.deepEqual(Array.from(new Float32Array(canonical.channelBuffers[0]!)), [0, 0, 0, 0]);
  assert.equal(isUsableCanonicalRecognitionPcm(canonical), true);
});

test("empty, malformed, detached, and non-finite PCM cannot enter recognition", () => {
  assert.equal(isUsableCanonicalRecognitionPcm({ sampleRate: 16_000, frameCount: 0, channelBuffers: [new ArrayBuffer(0)] }), false);
  assert.equal(isUsableCanonicalRecognitionPcm({ sampleRate: 48_000, frameCount: 1, channelBuffers: [new Float32Array([0]).buffer] }), false);
  assert.equal(isUsableCanonicalRecognitionPcm({ sampleRate: 16_000, frameCount: 2, channelBuffers: [new Float32Array([0]).buffer] }), false);
  assert.equal(isUsableCanonicalRecognitionPcm({ sampleRate: 16_000, frameCount: 1, channelBuffers: [new Float32Array([Number.NaN]).buffer] }), false);
  assert.equal(isUsableCanonicalRecognitionPcm({ sampleRate: 16_000, frameCount: 1, channelBuffers: [new Float32Array([Number.POSITIVE_INFINITY]).buffer] }), false);
  assert.throws(() => canonicalizeNativeRecognitionPcm({ sampleRate: 44_100, frameCount: 1, channelBuffers: [new Float32Array([Number.NaN]).buffer] }), /non-finite/);
  const compatibility = readFileSync("src/lib/recognition/local-media-compatibility.ts", "utf8");
  assert.match(compatibility, /"native-pcm-unusable"/);
  assert.match(compatibility, /if \(!isUsableCanonicalRecognitionPcm\(pcm\)\) throw new MediaCompatibilityError\("pcmExtractionFailed"\)/);
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
  assert.match(quickCreate, /prepareRecognitionAudio\(next, abort\.signal/);
  assert.match(jobs, /prepareRecognitionAudio\(runtime\.originalSource, runtime\.abort\.signal\)/);
  assert.match(jobs, /file: runtime\.originalSource/);
});

test("the caller-owned authoritative PCM remains reusable after worker transfer and retry", () => {
  const client = readFileSync("src/lib/recognition/recognition-worker-client.ts", "utf8");
  assert.match(client, /disposableWorkerBuffers/);
  assert.match(client, /channelBuffers\.map\(\(buffer\) => buffer\.slice\(0\)\)/);
  assert.match(client, /caller-owned, reusable PCM/);
});
