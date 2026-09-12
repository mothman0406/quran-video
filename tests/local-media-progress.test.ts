import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  LocalMediaPreparationProgressCoalescer,
  LocalMediaPreparationProgressController,
} from "../src/lib/recognition/local-media-progress.ts";

const compatibility = readFileSync("src/lib/recognition/local-media-compatibility.ts", "utf8");
const workspace = readFileSync("src/components/editor-workspace.tsx", "utf8");

test("native-compatible preparation never creates a conversion percentage", () => {
  const progress = new LocalMediaPreparationProgressController();
  progress.start(1);
  assert.deepEqual(progress.stage(1, "preparing-editor"), { stage: "preparing-editor" });
});

test("full normalization derives a clamped, monotonic percentage from processed media time", () => {
  const progress = new LocalMediaPreparationProgressController();
  progress.start(1);
  assert.deepEqual(progress.reportProcessedTime(1, "converting-recording", 3_100, 10_000), { stage: "converting-recording", percentage: 31 });
  assert.deepEqual(progress.reportProcessedTime(1, "converting-recording", 3_200, 10_000), { stage: "converting-recording", percentage: 32 });
  assert.deepEqual(progress.reportProcessedTime(1, "converting-recording", 3_180, 10_000), { stage: "converting-recording", percentage: 32 });
  assert.deepEqual(progress.reportProcessedTime(1, "converting-recording", 20_000, 10_000), { stage: "converting-recording", percentage: 100 });
});

test("audio-only fallback has its own measurable preparation stage", () => {
  const progress = new LocalMediaPreparationProgressController();
  progress.start(1, "preparing-converter");
  assert.deepEqual(progress.reportProcessedTime(1, "preparing-audio", 3_700, 10_000), { stage: "preparing-audio", percentage: 37 });
  assert.match(workspace, /Preparing audio for detection/);
  assert.doesNotMatch(compatibility, /decodeRecognitionAudioFallback[\s\S]*?"-c:v", "libx264"/);
});

test("media progress is clamped and remains indeterminate without an authoritative duration", () => {
  const progress = new LocalMediaPreparationProgressController();
  progress.start(1);
  assert.deepEqual(progress.reportProcessedTime(1, "converting-recording", -1_000, 10_000), { stage: "converting-recording", percentage: 0 });
  assert.deepEqual(progress.reportProcessedTime(1, "converting-recording", 1_000, undefined), null);
  assert.deepEqual(progress.stage(1, "inspecting-recording"), { stage: "inspecting-recording" });
  assert.deepEqual(progress.stage(1, "preparing-converter"), { stage: "preparing-converter" });
});

test("replacement media rejects stale progress and cancellation or failure clears it", () => {
  const progress = new LocalMediaPreparationProgressController();
  progress.start(1);
  progress.reportProcessedTime(1, "converting-recording", 4_000, 10_000);
  progress.start(2);
  assert.equal(progress.reportProcessedTime(1, "converting-recording", 9_000, 10_000), null);
  assert.deepEqual(progress.snapshot(), { stage: "checking" });
  assert.equal(progress.clear(2), null);
  assert.equal(progress.snapshot(), null);
});

test("completion reaches 100 before the next truthful stage, and visual updates are throttled", () => {
  const progress = new LocalMediaPreparationProgressController();
  progress.start(1);
  assert.deepEqual(progress.complete(1, "converting-recording", 10_000), { stage: "converting-recording", percentage: 100 });
  assert.deepEqual(progress.stage(1, "preparing-editor"), { stage: "preparing-editor" });
  const coalescer = new LocalMediaPreparationProgressCoalescer();
  assert.equal(coalescer.shouldPublish({ stage: "converting-recording", percentage: 30 }, 0), true);
  assert.equal(coalescer.shouldPublish({ stage: "converting-recording", percentage: 31 }, 50), false);
  assert.equal(coalescer.shouldPublish({ stage: "converting-recording", percentage: 31 }, 150), true);
});

test("FFmpeg progress listeners are scoped to an active command and removed afterward", () => {
  assert.match(compatibility, /runtime\.on\("progress", onFfmpegProgress\)/);
  assert.match(compatibility, /runtime\.off\("progress", onFfmpegProgress\)/);
  assert.match(compatibility, /finally \{[\s\S]*?runtime\.off\("progress", onFfmpegProgress\)/);
  assert.match(compatibility, /time \/ 1_000/);
});

test("media conversion remains visibly separate from Quran recognition progress", () => {
  assert.match(workspace, /busy && progress && !mediaPreparation/);
  assert.match(workspace, /editor-media-preparation-notice/);
  assert.match(workspace, /Preparing converter/);
  assert.match(workspace, /Inspecting recording/);
});
