import assert from "node:assert/strict";
import test from "node:test";
import { getActiveCaptionSegment } from "../src/lib/editor/captions.ts";
import { mediaSourceFromFile, projectDurationMs, timeToTimelinePosition, timelinePositionToTime, timelineTracks } from "../src/lib/editor/media.ts";
import { MediaPlaybackClock } from "../src/lib/editor/playback-clock.ts";
import { loadSavedProject } from "../src/lib/project-storage.ts";

const segment = { id: "18:57.1", contentKind: "ayah" as const, verseKeys: ["18:57"], startMs: 1_000, endMs: 3_000, arabic: "قُلْ", translation: null, transliteration: null, wordStart: 0, wordEnd: 1, wordCount: 1, timingEvidence: { start: { timestampMs: 1_000, source: "fastconformer" as const }, end: { timestampMs: 3_000, source: "fastconformer" as const }, derived: false } };

function animationFrames() {
  let nextId = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  return {
    requestFrame(callback: FrameRequestCallback) {
      const id = nextId++;
      callbacks.set(id, callback);
      return id;
    },
    cancelFrame(id: number) {
      callbacks.delete(id);
    },
    runNext() {
      const next = callbacks.entries().next().value as [number, FrameRequestCallback] | undefined;
      assert.ok(next, "a playback frame should be scheduled");
      callbacks.delete(next[0]);
      next[1](0);
    },
    get size() {
      return callbacks.size;
    },
  };
}

test("video source creates distinct video and audio timeline items on one duration", () => {
  const source = mediaSourceFromFile({ name: "recitation.mp4", size: 4, type: "video/mp4" }, "video", { durationMs: 12_000, width: 1920, height: 1080 });
  const tracks = timelineTracks(source, [segment]);
  assert.deepEqual(tracks.map((track) => [track.kind, track.items.length]), [["text", 1], ["video", 1], ["audio", 1]]);
  assert.equal(projectDurationMs(source), 12_000);
});

test("audio-only source creates an empty video track and a local audio track", () => {
  const source = mediaSourceFromFile({ name: "recitation.mp3", size: 4, type: "audio/mpeg" }, "audio", { durationMs: 8_500 });
  const tracks = timelineTracks(source, [segment]);
  assert.deepEqual(tracks.map((track) => [track.kind, track.items.length]), [["text", 1], ["video", 0], ["audio", 1]]);
  assert.equal(tracks[2]?.items[0]?.endMs, 8_500);
});

test("timeline position conversion is shared, accurate, and preserves active half-open captions", () => {
  assert.equal(timeToTimelinePosition(2_500, 10_000), 0.25);
  assert.equal(timelinePositionToTime(0.25, 10_000), 2_500);
  assert.equal(getActiveCaptionSegment([segment], timelinePositionToTime(0.1, 10_000))?.id, segment.id);
  assert.equal(getActiveCaptionSegment([segment], timelinePositionToTime(0.3, 10_000)), null);
});

test("audio playback samples the media clock on animation frames instead of relying on timeupdate", () => {
  const frames = animationFrames();
  const audio = { currentTime: 10.54, paused: false, ended: false };
  const samples: Array<[number, string]> = [];
  const clock = new MediaPlaybackClock({
    onSample: (timeMs, source) => samples.push([timeMs, source]),
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
  });

  clock.setMedia(audio);
  clock.start();
  clock.start();
  assert.equal(frames.size, 1, "play starts exactly one loop");
  assert.deepEqual(samples, [[10_540, "play"]]);

  audio.currentTime = 10.556;
  frames.runNext();
  assert.deepEqual(samples.at(-1), [10_556, "animation-frame"]);
  assert.equal(frames.size, 1, "the loop remains singular while audio is playing");
});

test("playback clock synchronizes immediately on seeks and stops on pause, ended, replacement, and unmount", () => {
  const frames = animationFrames();
  const audio = { currentTime: 2, paused: false, ended: false };
  const nextAudio = { currentTime: 0, paused: true, ended: false };
  const samples: Array<[number, string]> = [];
  const clock = new MediaPlaybackClock({
    onSample: (timeMs, source) => samples.push([timeMs, source]),
    requestFrame: frames.requestFrame,
    cancelFrame: frames.cancelFrame,
  });

  clock.setMedia(audio);
  clock.start();
  audio.currentTime = 2.173;
  clock.sync("seek");
  assert.deepEqual(samples.at(-1), [2_173, "seek"]);

  audio.paused = true;
  clock.stop("pause");
  assert.equal(clock.isRunning, false);
  assert.equal(frames.size, 0);
  assert.deepEqual(samples.at(-1), [2_173, "pause"]);

  audio.paused = false;
  clock.start();
  audio.currentTime = 8.5;
  audio.ended = true;
  clock.stop("ended");
  assert.deepEqual(samples.at(-1), [8_500, "ended"]);

  audio.ended = false;
  clock.start();
  clock.setMedia(nextAudio);
  assert.equal(clock.isRunning, false, "source replacement cancels the old loop");
  clock.setMedia(audio);
  audio.paused = false;
  clock.start();
  clock.dispose();
  assert.equal(clock.isRunning, false, "unmount cancels the pending frame");
});

test("timeline blocks use exact CaptionSegment edges and the shared active segment", () => {
  const first = { ...segment, id: "first", startMs: 10_540, endMs: 21_730 };
  const second = { ...segment, id: "second", startMs: 21_730, endMs: 35_640 };
  const source = mediaSourceFromFile({ name: "recitation.mp3", size: 4, type: "audio/mpeg" }, "audio", { durationMs: 40_000 });
  const items = timelineTracks(source, [first, second])[0]!.items;

  assert.deepEqual(items.map(({ startMs, endMs }) => [startMs, endMs]), [[10_540, 21_730], [21_730, 35_640]]);
  assert.equal(timeToTimelinePosition(first.endMs, 40_000), timeToTimelinePosition(second.startMs, 40_000));
  assert.equal(getActiveCaptionSegment([first, second], 21_729)?.id, "first");
  assert.equal(getActiveCaptionSegment([first, second], 21_730)?.id, "second");
  assert.equal(first.startMs, 10_540, "clock and timeline never mutate CaptionSegment timing");
  assert.equal(second.endMs, 35_640, "clock and timeline never mutate CaptionSegment timing");
});

test("legacy video metadata migrates to the common media source without bytes or object URLs", () => {
  const legacy = {
    version: 2, id: "legacy", title: "Legacy", sourceVideo: { fileName: "old.mp4", mimeType: "video/mp4", durationSeconds: 4, fingerprint: "old" },
    format: { preset: "vertical", width: 1080, height: 1920 }, verseAlignments: [], captionSegments: [], captions: { arabic: true, translation: false, transliteration: false, translationEdition: "english_saheeh" },
    positioning: { anchor: "bottom", x: .5, y: .7, translationX: .5, translationY: .8, translationPositionLinked: true, maxWidthPercent: .8, translationGapPx: 8 }, captionBackground: { enabled: false, color: "#000", opacity: 0, cornerRadius: 0, horizontalPadding: 0, verticalPadding: 0 },
    typography: { quranStyle: "uthmani", arabicFontFamily: "serif", translationFontFamily: "sans", transliterationFontFamily: "sans", arabicFontSize: 30, translationFontSize: 20, transliterationFontSize: 20, arabicOutlineEnabled: false, arabicOutlineWidth: 0, arabicOutlineColor: "#000", arabicShadowEnabled: false, arabicShadowBlur: 0, arabicShadowStrength: 0, arabicOpacity: 1, textAlign: "center", arabicLineSpacing: 1, translationVisible: false, translationTextColor: "#fff", translationOutlineEnabled: false, translationOutlineWidth: 0, translationOutlineColor: "#000", translationShadowEnabled: false, translationShadowBlur: 0, translationShadowStrength: 0, translationOpacity: 1, translationSpacingBelowArabic: 0, translationTextAlign: "center", transliterationVisible: false },
    transitionSettings: { type: "none", fadeInMs: 0, fadeOutMs: 0 }, showVerseNumber: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
  const migrated = loadSavedProject(legacy);
  assert.deepEqual(migrated.sourceMedia && [migrated.sourceMedia.kind, migrated.sourceMedia.durationMs, migrated.sourceMedia.hasVideo, migrated.sourceMedia.hasAudio], ["video", 4_000, true, true]);
  assert.equal(JSON.stringify(migrated).includes("sourceVideo"), false);
});
