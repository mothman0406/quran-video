import assert from "node:assert/strict";
import test from "node:test";
import { getActiveCaptionSegment } from "../src/lib/editor/captions.ts";
import { mediaSourceFromFile, projectDurationMs, timeToTimelinePosition, timelinePositionToTime, timelineTracks } from "../src/lib/editor/media.ts";
import { loadSavedProject } from "../src/lib/project-storage.ts";

const segment = { id: "18:57.1", contentKind: "ayah" as const, verseKeys: ["18:57"], startMs: 1_000, endMs: 3_000, arabic: "قُلْ", translation: null, transliteration: null, wordStart: 0, wordEnd: 1, wordCount: 1, timingEvidence: { start: { timestampMs: 1_000, source: "fastconformer" as const }, end: { timestampMs: 3_000, source: "fastconformer" as const }, derived: false } };

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
