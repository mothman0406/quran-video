import assert from "node:assert/strict";
import test from "node:test";
import { captionForPlaybackTime, recognitionToVerseAlignments } from "../src/lib/editor/recognition.ts";

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
