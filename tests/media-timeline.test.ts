import assert from "node:assert/strict";
import test from "node:test";
import { getActiveCaptionSegment, resizeCaptionBoundary } from "../src/lib/editor/captions.ts";
import { CAPTION_PLAYHEAD_SNAP_THRESHOLD_PX, clampMediaTrim, createMediaTrim, createTimelineViewport, exportOutputTimeToSourceTime, mediaSourceFromFile, panTimelineViewport, playbackStartForMediaTrim, projectDurationMs, resizeMediaTrim, shouldStopMediaPlayback, snapCaptionBoundaryToPlayhead, timeToTimelinePosition, timelineContentPosition, timelineItemGeometry, timelinePositionToTime, timelineRulerTicks, timelineTracks, timeToViewportPosition, viewportPositionToTime, zoomTimelineViewport } from "../src/lib/editor/media.ts";
import { MediaPlaybackClock } from "../src/lib/editor/playback-clock.ts";
import { loadSavedProject } from "../src/lib/project-storage.ts";
import { waveformPeaksForViewport, waveformPeaksFromPcm } from "../src/lib/editor/waveform.ts";

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

test("media trim defaults to the source range and remains one linked video/audio range", () => {
  const source = mediaSourceFromFile({ name: "recitation.mp4", size: 4, type: "video/mp4" }, "video", { durationMs: 80_000 });
  const trim = createMediaTrim(80_000);
  assert.deepEqual(trim, { startMs: 0, endMs: 80_000 });
  const tracks = timelineTracks(source, [segment], { startMs: 5_000, endMs: 70_000 });
  assert.deepEqual(tracks.slice(1).map((track) => track.items[0] && [track.items[0].startMs, track.items[0].endMs]), [[5_000, 70_000], [5_000, 70_000]], "video and audio expose the same source trim");
});

test("audio trim, source limits, and minimum duration are clamped without touching captions or waveform", () => {
  const trim = resizeMediaTrim({ startMs: 5_000, endMs: 70_000 }, "start", 69_999, 80_000);
  assert.deepEqual(trim, { startMs: 69_750, endMs: 70_000 });
  assert.deepEqual(resizeMediaTrim(trim, "end", 100_000, 80_000), { startMs: 69_750, endMs: 80_000 });
  assert.deepEqual(clampMediaTrim({ startMs: Number.NaN, endMs: Infinity }, 80_000), { startMs: 0, endMs: 80_000 });
  assert.deepEqual([segment.startMs, segment.endMs], [1_000, 3_000], "trim never rebases caption timestamps");
});

test("trim snapping uses the shared zoomed viewport and leaves the playhead independent", () => {
  const viewport = panTimelineViewport(createTimelineViewport(80_000, 8), 80_000, 20_000);
  const playheadMs = 23_450;
  const playheadX = 50 + timeToViewportPosition(playheadMs, viewport) * 800;
  assert.deepEqual(snapCaptionBoundaryToPlayhead(23_000, playheadX + 8, 50, 800, playheadMs, viewport.visibleEndMs - viewport.visibleStartMs, viewport.visibleStartMs), { timeMs: playheadMs, snapped: true });
  assert.equal(playheadMs, 23_450, "snapping a trim edge never changes the stationary playhead");
});

test("normal playback honors trim while inspection seeks remain source-time based", () => {
  const trim = { startMs: 5_000, endMs: 70_000 };
  assert.equal(playbackStartForMediaTrim(2_000, trim, 80_000), 5_000);
  assert.equal(playbackStartForMediaTrim(22_150, trim, 80_000), 22_150);
  assert.equal(playbackStartForMediaTrim(70_000, trim, 80_000), 5_000);
  assert.equal(shouldStopMediaPlayback(70_000, trim, 80_000), true);
  assert.equal(shouldStopMediaPlayback(69_999, trim, 80_000), false);
  assert.equal(timelinePositionToTime(.025, 80_000), 2_000, "timeline inspection seeking stays outside the trim when requested");
  assert.equal(exportOutputTimeToSourceTime(16_000, trim, 80_000), 21_000, "trimmed export evaluates a 21s source caption at 16s output time");
});

test("timeline position conversion is shared, accurate, and preserves active half-open captions", () => {
  assert.equal(timeToTimelinePosition(2_500, 10_000), 0.25);
  assert.equal(timelinePositionToTime(0.25, 10_000), 2_500);
  assert.equal(getActiveCaptionSegment([segment], timelinePositionToTime(0.1, 10_000))?.id, segment.id);
  assert.equal(getActiveCaptionSegment([segment], timelinePositionToTime(0.3, 10_000)), null);
});

test("playhead, ruler, blocks, and seeking use the timed-content origin in audio and video modes", () => {
  const durationMs = 60_000;
  const contentLeftPx = 50;
  const contentWidthPx = 950;
  const xForTime = (timeMs: number) => contentLeftPx + timeToTimelinePosition(timeMs, durationMs) * contentWidthPx;

  assert.equal(xForTime(0), contentLeftPx, "zero-time playhead and ruler start at the timed-content origin");
  assert.equal(xForTime(durationMs), contentLeftPx + contentWidthPx, "duration-time playhead reaches the timed-content edge");
  assert.equal(xForTime(durationMs / 2), contentLeftPx + contentWidthPx / 2, "half time reaches the content midpoint");
  const videoSource = mediaSourceFromFile({ name: "recitation.mp4", size: 4, type: "video/mp4" }, "video", { durationMs });
  const tracks = timelineTracks(videoSource, [{ ...segment, startMs: 0 }]);
  assert.deepEqual(tracks.map((track) => xForTime(track.items[0]?.startMs ?? 0)), [contentLeftPx, contentLeftPx, contentLeftPx], "Text, Video, and Audio tracks share the content origin");
  assert.equal(xForTime(timelineRulerTicks(createTimelineViewport(durationMs), contentWidthPx)[0]!), xForTime(0), "the zero ruler tick shares the playhead origin");
  assert.equal(timelineContentPosition(contentLeftPx, contentLeftPx, contentWidthPx), 0, "the first content pixel seeks to zero");
  assert.equal(timelineContentPosition(contentLeftPx + contentWidthPx / 2, contentLeftPx, contentWidthPx), .5, "the content midpoint seeks to half time");
  assert.equal(timelineContentPosition(contentLeftPx + contentWidthPx, contentLeftPx, contentWidthPx), 1, "the content edge seeks to duration");
  assert.equal(timelineContentPosition(0, contentLeftPx, contentWidthPx), 0, "the label gutter cannot seek before zero");
  assert.equal(timelineContentPosition(200, 50, contentWidthPx), timelineContentPosition(222, 72, contentWidthPx), "changing gutter width does not change a content-relative position");

  for (const kind of ["audio", "video"] as const) {
    const source = mediaSourceFromFile({ name: `recitation.${kind === "audio" ? "mp3" : "mp4"}`, size: 4, type: kind === "audio" ? "audio/mpeg" : "video/mp4" }, kind, { durationMs });
    assert.equal(timeToTimelinePosition(projectDurationMs(source) / 2, projectDurationMs(source)), .5, `${kind} uses the same timed-content geometry`);
  }
});

test("zoomed viewport maps all timeline geometry through one visible time window", () => {
  const viewport = panTimelineViewport(createTimelineViewport(60_000, 6), 60_000, 20_000);
  assert.deepEqual([viewport.visibleStartMs, viewport.visibleEndMs], [20_000, 30_000]);
  assert.equal(timeToViewportPosition(20_000, viewport), 0);
  assert.equal(timeToViewportPosition(25_000, viewport), .5);
  assert.equal(timeToViewportPosition(30_000, viewport), 1);
  assert.equal(viewportPositionToTime(.5, viewport), 25_000, "zoomed midpoint seeks to its absolute source time");
  assert.deepEqual(timelineItemGeometry(19_000, 21_000, viewport), { left: 0, width: .1 }, "caption/video/audio clips at the same viewport edge");
  assert.ok(timelineRulerTicks(viewport, 800).every((tick) => tick >= 20_000 && tick <= 30_000));
  const anchored = zoomTimelineViewport(viewport, 60_000, 12, 25_000);
  assert.equal(timeToViewportPosition(25_000, anchored), .5, "zoom retains the playhead position when it is visible");
});

test("zoomed screen-space playhead snapping still resolves to the exact stationary time", () => {
  const viewport = panTimelineViewport(createTimelineViewport(60_000, 6), 60_000, 20_000);
  const playheadX = 50 + timeToViewportPosition(22_150, viewport) * 800;
  assert.deepEqual(snapCaptionBoundaryToPlayhead(22_000, playheadX + 8, 50, 800, 22_150, 10_000, 20_000), { timeMs: 22_150, snapped: true });
});

test("waveform envelopes retain local PCM amplitude and choose the visible source subsection", () => {
  const peaks = waveformPeaksFromPcm([new Float32Array([0, .25, -.75, .5, 0, .125, -.125, .875])], 4);
  assert.deepEqual(peaks, [{ min: 0, max: .25 }, { min: -.75, max: .5 }, { min: 0, max: .125 }, { min: -.125, max: .875 }]);
  const viewport = panTimelineViewport(createTimelineViewport(8_000, 2), 8_000, 4_000);
  assert.deepEqual(waveformPeaksForViewport({ peaks, durationMs: 8_000 }, viewport, 2), [{ min: 0, max: .125 }, { min: -.125, max: .875 }]);
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

test("caption edge resize moves a contiguous shared Quran boundary without moving the playhead", () => {
  const first = { ...segment, id: "first", startMs: 10_540, endMs: 21_730 };
  const second = { ...segment, id: "second", startMs: 21_730, endMs: 35_640 };
  const currentTimeMs = 22_150;
  const resized = resizeCaptionBoundary([first, second], second.id, "start", currentTimeMs, 40_000);

  assert.deepEqual(resized.map(({ startMs, endMs }) => [startMs, endMs]), [[10_540, 22_150], [22_150, 35_640]]);
  assert.equal(resized[0]?.endMs, resized[1]?.startMs, "the shared boundary has no gap or overlap");
  assert.equal(currentTimeMs, 22_150, "resizing changes caption timing only; the playhead remains stationary");
});

test("caption playhead snapping is screen-space and uses the exact stationary timestamp", () => {
  const durationMs = 40_000;
  const contentLeftPx = 50;
  const contentWidthPx = 800;
  const currentTimeMs = 22_150;
  const playheadX = contentLeftPx + timeToTimelinePosition(currentTimeMs, durationMs) * contentWidthPx;

  assert.deepEqual(snapCaptionBoundaryToPlayhead(22_000, playheadX + CAPTION_PLAYHEAD_SNAP_THRESHOLD_PX, contentLeftPx, contentWidthPx, currentTimeMs, durationMs), { timeMs: currentTimeMs, snapped: true });
  assert.deepEqual(snapCaptionBoundaryToPlayhead(22_000, playheadX + CAPTION_PLAYHEAD_SNAP_THRESHOLD_PX + 1, contentLeftPx, contentWidthPx, currentTimeMs, durationMs), { timeMs: 22_000, snapped: false });
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
  assert.deepEqual(migrated.mediaTrim, { startMs: 0, endMs: 4_000 });
  assert.equal(JSON.stringify(migrated).includes("sourceVideo"), false);
});
