import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  evaluateExactTransmuxEnvironment,
  exactTransmuxRequiredHeadroom,
  MAX_EXACT_TRANSMUX_SOURCE_BYTES,
  type ExactTransmuxEnvironment,
} from "../src/lib/media/exact-transmux.ts";

const source = readFileSync("src/lib/media/exact-transmux.ts", "utf8");
const compatibility = readFileSync("src/lib/recognition/local-media-compatibility.ts", "utf8");
const quickCreate = readFileSync("src/components/quick-create.tsx", "utf8");
const editor = readFileSync("src/components/editor-client.tsx", "utf8");
const jobs = readFileSync("src/lib/video-jobs.ts", "utf8");
const worker = readFileSync("public/opfs-media-sw.js", "utf8");
const playback = readFileSync("src/lib/media/opfs-playback.ts", "utf8");

const MiB = 1024 * 1024;
const eligibleEnvironment: ExactTransmuxEnvironment = {
  opfsAsyncWritable: true,
  serviceWorkerRangePlayback: true,
  chromiumValidated: true,
  mp4Playback: true,
  quotaBytes: 2_000 * MiB,
  usageBytes: 100 * MiB,
  abortCleanupOwned: true,
};
const unplayableVideo = { browserPlayback: false, kind: "video" as const };

test("routing gate keeps browser-playable media direct and accepts an eligible unplayable source", () => {
  assert.equal(evaluateExactTransmuxEnvironment(100 * MiB, { ...unplayableVideo, browserPlayback: true }, eligibleEnvironment).reason, "browser-playable");
  assert.deepEqual(evaluateExactTransmuxEnvironment(100 * MiB, unplayableVideo, eligibleEnvironment), {
    eligible: true,
    reason: "eligible",
    quotaHeadroomBytes: 1_900 * MiB,
    requiredHeadroomBytes: 356 * MiB,
  });
});

test("sample rate never participates in the video route", () => {
  for (const audioSampleRate of [44_100, 48_000]) {
    const inspection = { ...unplayableVideo, audioSampleRate };
    assert.equal(evaluateExactTransmuxEnvironment(100 * MiB, inspection, eligibleEnvironment).eligible, true);
  }
});

test("environment, size, quota, and missing quota evidence fail closed", () => {
  assert.equal(evaluateExactTransmuxEnvironment(MAX_EXACT_TRANSMUX_SOURCE_BYTES + 1, unplayableVideo, eligibleEnvironment).reason, "source-too-large");
  assert.equal(evaluateExactTransmuxEnvironment(100 * MiB, unplayableVideo, { ...eligibleEnvironment, opfsAsyncWritable: false }).reason, "unsupported-environment");
  assert.equal(evaluateExactTransmuxEnvironment(100 * MiB, unplayableVideo, { ...eligibleEnvironment, quotaBytes: undefined }).reason, "quota-unavailable");
  assert.equal(evaluateExactTransmuxEnvironment(100 * MiB, unplayableVideo, { ...eligibleEnvironment, quotaBytes: 455 * MiB, usageBytes: 100 * MiB }).reason, "quota-insufficient");
  assert.equal(exactTransmuxRequiredHeadroom(400 * MiB), 656 * MiB);
});

test("exact route is forced copy, bounded-memory, cancellable, and validation-gated", () => {
  assert.match(source, /mode: "forced"/);
  assert.match(source, /shiftTolerance: 0/);
  assert.match(source, /boundaryPolicy: "expand"/);
  assert.match(source, /new BlobSource\(file\)/);
  assert.match(source, /new Mp4OutputFormat\(\{ fastStart: false \}\)/);
  assert.match(source, /new StreamTarget\([^;]+\{ chunked: true \}\)/);
  assert.match(source, /video: \{ codec: "avc", allowTransformationMetadata: true \}/);
  assert.match(source, /audio: \{ codec: "aac" \}/);
  assert.match(source, /conversion\.discardedTracks\.length !== 0/);
  assert.match(source, /editListStartsAtPresentationZero/);
  assert.match(source, /isTransmuxDurationAccepted/);
  assert.match(source, /conversion\?\.cancel/);
  assert.match(source, /removeEphemeralOpfsFile\(temporaryFile\)/);
  assert.doesNotMatch(source, /BufferTarget|in-memory|@ffmpeg|VideoEncoder|AudioEncoder/);
});

test("production range worker exposes only opaque app-owned MP4 identifiers", () => {
  assert.match(worker, /OWNED_NAME/);
  assert.match(worker, /status: 206/);
  assert.match(worker, /status: 416/);
  assert.match(worker, /Content-Range/);
  assert.match(worker, /Content-Length/);
  assert.match(worker, /Content-Type": "video\/mp4"/);
  assert.match(worker, /file\.slice\(start, end \+ 1\)/);
  assert.match(worker, /name\.includes\("\/"\)/);
  assert.doesNotMatch(worker, /arrayBuffer\(/);
  assert.match(playback, /opfs-media-sw\.js\?v=\d+/);
  assert.match(playback, /controller\?\.scriptURL === expectedScriptUrl/);
});

test("quota failure and cancellation both remove partial exact-transmux output", () => {
  assert.match(source, /error\.name === "QuotaExceededError"/);
  assert.match(source, /await conversion\?\.cancel\(\)\.catch/);
  assert.match(source, /await writable\?\.abort\(\)\.catch/);
  assert.match(source, /await removeEphemeralOpfsFile\(temporaryFile\)\.catch/);
  assert.match(source, /if \(isAbort\(error\)\) throw error/);
});

test("failed exact preparation falls through to the existing FFmpeg compatibility route", () => {
  assert.match(compatibility, /exactTransmuxToOpfs/);
  assert.match(compatibility, /if \(exact\)/);
  assert.match(compatibility, /compatibilityRoute: "full-normalization"/);
  assert.match(compatibility, /return runFfmpegJob\(signal/);
});

test("original source remains authoritative while editor media owns playback and cleanup", () => {
  assert.match(jobs, /originalSource: File/);
  assert.match(jobs, /editorMedia: File/);
  assert.match(jobs, /prepareRecognitionAudio\(runtime\.originalSource/);
  assert.match(jobs, /file: runtime\.originalSource/);
  assert.match(jobs, /createProjectThumbnail\(runtime\.editorMedia/);
  assert.match(jobs, /uploadPrivateProjectObject\(sourcePath, runtime\.originalSource/);
  assert.match(jobs, /await runtime\.disposeEditorMedia\(\)/);
  assert.match(editor, /source: originalSourceFile/);
});

test("replacement, deletion, and abandonment dispose only their owned editor representation", () => {
  assert.match(jobs, /if \(previous\)[\s\S]+void previous\.disposeEditorMedia\(\)/);
  assert.match(jobs, /async remove\([\s\S]+await runtime\.disposeEditorMedia\(\)/);
  assert.match(jobs, /abandon\(\): void[\s\S]+void runtime\.disposeEditorMedia\(\)/);
});

test("recognition begins independently from the original and retains one identification call", () => {
  assert.match(quickCreate, /prepareRecognitionAudio\(next, abort\.signal/);
  assert.match(quickCreate, /Promise\.allSettled\(\[editorPromise, recognitionPromise\]\)/);
  assert.match(editor, /prepareRecognitionAudio\(next, abort\.signal/);
  assert.equal((readFileSync("src/lib/video-generation.ts", "utf8").match(/input\.worker\.identify\(input\.jobId/g) ?? []).length, 1);
});
