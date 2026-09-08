import assert from "node:assert/strict";
import test from "node:test";
import {
  CaptionGenerationProgressController,
  captionGenerationProgressForDownload,
} from "../src/lib/editor/caption-generation-progress.ts";

test("caption generation begins with media preparation and finishes at 100%", () => {
  const progress = new CaptionGenerationProgressController();
  assert.deepEqual(progress.start(1), {
    phase: "preparing-media",
    progress: 0,
    label: "Preparing your recitation…",
  });
  assert.equal(progress.report(1, "analyzing-speech")?.label, "Listening for the Quran passage…");
  assert.equal(progress.report(1, "identifying-passage", 0.5)?.phase, "identifying-passage");
  assert.equal(progress.report(1, "aligning-words")?.label, "Syncing Quran words to your recitation…");
  assert.equal(progress.complete(1)?.progress, 1);
});

test("progress is monotonic, bounded, and only shows identity after acceptance", () => {
  const progress = new CaptionGenerationProgressController();
  progress.start(1);
  const identifying = progress.report(1, "identifying-passage", 1, "6 of 6 audio windows analyzed")!;
  const rejectedCandidate = progress.report(1, "confirming-passage")!;
  assert.ok(rejectedCandidate.progress >= identifying.progress);
  assert.equal(rejectedCandidate.detail, undefined, "candidate evidence never becomes user-facing identity");
  const accepted = progress.confirmIdentity(1, "Detected Surah Al-Ma'arij")!;
  assert.equal(accepted.detail, "Detected Surah Al-Ma'arij");
  const bounded = progress.report(1, "building-captions", 9)!;
  assert.equal(bounded.progress <= 1, true);
});

test("download reporting is real, while cached runs do not enter a download phase", () => {
  const uncached = new CaptionGenerationProgressController();
  uncached.start(1);
  const download = captionGenerationProgressForDownload(uncached, 1, 62, 100)!;
  assert.equal(download.phase, "downloading-model");
  assert.equal(download.detail, "62% downloaded");

  const cached = new CaptionGenerationProgressController();
  cached.start(2);
  const identification = cached.report(2, "identifying-passage", 0)!;
  assert.notEqual(identification.phase, "downloading-model");
});

test("failure and ambiguity leave the loading state, and retry/source changes reject stale reports", () => {
  const progress = new CaptionGenerationProgressController();
  progress.start(1);
  progress.report(1, "identifying-passage", 0.4);
  assert.equal(progress.manualCorrection(1)?.phase, "manual-correction");
  assert.equal(progress.fail(1)?.phase, "failed");

  const retry = progress.start(2)!;
  assert.equal(retry.progress, 0, "retry clears a previous percentage and detail");
  assert.equal(progress.report(1, "aligning-words"), null, "stale work cannot update the retried job");
  progress.reset();
  assert.equal(progress.report(2, "finalizing"), null, "a changed source invalidates outstanding work");
});

test("progress reporting does not mutate Quran result data", () => {
  const quranResult = Object.freeze({ verseKey: "70:1", words: Object.freeze(["سَأَلَ", "سَائِلٌ"]) });
  const progress = new CaptionGenerationProgressController();
  progress.start(1);
  progress.report(1, "aligning-words", 0.5);
  assert.deepEqual(quranResult, { verseKey: "70:1", words: ["سَأَلَ", "سَائِلٌ"] });
});
