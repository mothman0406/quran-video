import assert from "node:assert/strict";
import test from "node:test";
import { AutomaticRecognitionController, captionForPlaybackTime, recognitionToVerseAlignments } from "../src/lib/editor/recognition.ts";

const match = {
  verseKey: "93:1",
  startMs: 120,
  endMs: 900,
  confidence: 0.84,
  timing: {
    start: { timestampMs: 120, source: "word-timestamp" as const },
    end: { timestampMs: 900, source: "chunk-interpolated" as const },
    matchedText: "وضحى",
  },
  wordSupport: {
    canonicalStartWordIndex: 1,
    canonicalEndWordIndex: 1,
    matchedCanonicalWordCount: 1,
    canonicalWordCount: 1,
    coverage: 1,
    evidenceQuality: 1,
  },
};

test("converts recognition matches into editor verse alignments with timing evidence", () => {
  assert.deepEqual(recognitionToVerseAlignments([match])[0], {
    verseKey: "93:1",
    surahNumber: 93,
    ayahNumber: 1,
    startMs: 120,
    endMs: 900,
    confidence: 0.84,
    timingEvidence: match.timing,
  });
});

test("selects the caption at a playback time without creating pause-boundary captions", () => {
  const captions = [{ startMs: 0, endMs: 1_000, verseKey: "1:1" }, { startMs: 1_000, endMs: 2_000, verseKey: "1:2" }];
  assert.equal(captionForPlaybackTime(captions, 999)?.verseKey, "1:1");
  assert.equal(captionForPlaybackTime(captions, 1_000)?.verseKey, "1:2");
  assert.equal(captionForPlaybackTime(captions, 2_000), null);
});

test("automatic recognition runs once for a new source, changes source cleanly, and never reruns restored completed work", () => {
  const controller = new AutomaticRecognitionController();
  assert.equal(controller.start("local:video-a", false), true);
  assert.equal(controller.start("local:video-a", false), false);
  assert.equal(controller.start("youtube:audio-b", false), true);
  assert.equal(controller.start("cloud:recognized-c", true), false);
  assert.equal(controller.start("cloud:undetected-c", false), true);
  controller.reset();
  assert.equal(controller.start("local:video-a", false), true);
});
