import assert from "node:assert/strict";
import test from "node:test";
import { createLocalExportConfiguration, snapshotLocalExportConfiguration } from "../src/lib/export/config.ts";
import { DEFAULT_CAPTION_BACKGROUND, DEFAULT_CAPTION_POSITIONING, DEFAULT_TRANSITION_SETTINGS, DEFAULT_TYPOGRAPHY, captionVisualStatesAtTime } from "../src/lib/editor/captions.ts";
import { DEFAULT_PROJECT_FORMAT, PROJECT_FORMATS, SAFE_AREA_OVERLAY_METADATA, mediabunnyVideoTransform, sourceVideoFitForMediabunny, sourceVideoFitForPreview } from "../src/lib/editor/formats.ts";
import { audioOutputIsValid, selectOutputProfile, sourceAudioRequiresOutput } from "../src/lib/export/output.ts";
import { DEFAULT_LOCAL_RENDERER_ID } from "../src/lib/export/offline-webcodecs.ts";
import { coverPlacement, durationMatches, frameTimeline, onceCleanup, resolveExportFrameRate } from "../src/lib/export/timeline.ts";
import { DEFAULT_EXPORT_QUALITY, EXPORT_QUALITY_PRESETS, exportQualityPreset } from "../src/lib/export/quality.ts";
import { generateExportFileName } from "../src/lib/export/filename.ts";
import { ExportCoordinator } from "../src/lib/export/lifecycle.ts";
import { validateLocalExportInputs } from "../src/lib/export/validation.ts";

const segment = { id: "93:1#1", verseKeys: ["93:1"], startMs: 1_000, endMs: 2_000, arabic: "وَالضُّحَى", translation: "By the morning brightness", transliteration: "Wa ad-duha", wordStart: 0, wordEnd: 1, wordCount: 1, timingEvidence: { start: { timestampMs: 1_000, source: "direct-asr-word" as const }, end: { timestampMs: 2_000, source: "chunk-text-alignment" as const }, derived: false } };

function config(overrides = {}) { return createLocalExportConfiguration({ format: DEFAULT_PROJECT_FORMAT, segments: [segment], typography: DEFAULT_TYPOGRAPHY, captionBackground: DEFAULT_CAPTION_BACKGROUND, positioning: DEFAULT_CAPTION_POSITIONING, transitionSettings: DEFAULT_TRANSITION_SETTINGS, showVerseNumber: false, ...overrides }); }

test("export mapping keeps project render state and excludes editor-only safe areas", () => {
  const value = config();
  assert.deepEqual(value.format, { preset: "vertical", width: 1080, height: 1920 });
  assert.equal("safeAreaGuides" in value, false);
  assert.deepEqual(SAFE_AREA_OVERLAY_METADATA, { editorOnly: true, exportable: false });
});

test("export mapping preserves manual timings, translation visibility, and verse-number presentation", () => {
  const value = config({ segments: [{ ...segment, startMs: 1_125, endMs: 1_875 }], typography: { ...DEFAULT_TYPOGRAPHY, translationVisible: false }, showVerseNumber: true });
  assert.equal(value.segments[0].startMs, 1_125);
  assert.equal(value.segments[0].endMs, 1_875);
  assert.equal(value.typography.translationVisible, false);
  assert.equal(value.showVerseNumber, true);
});

test("export reuses the preview transition interpolation without a second timing model", () => {
  const value = config();
  assert.deepEqual(captionVisualStatesAtTime(value.segments, 1_112, value.transitionSettings), captionVisualStatesAtTime([segment], 1_112, DEFAULT_TRANSITION_SETTINGS));
  assert.deepEqual(captionVisualStatesAtTime(value.segments, 1_112, value.transitionSettings).map(({ opacity, blurPx }) => ({ opacity, blurPx })), [{ opacity: 112 / 225, blurPx: 0 }]);
});

test("deterministic frame timeline uses timestamps rather than wall-clock playback", () => {
  assert.deepEqual(frameTimeline(1, 4), [
    { timestamp: 0, duration: 0.25 },
    { timestamp: 0.25, duration: 0.25 },
    { timestamp: 0.5, duration: 0.25 },
    { timestamp: 0.75, duration: 0.25 },
  ]);
  assert.equal(resolveExportFrameRate(23.976), 23.976);
  assert.equal(resolveExportFrameRate(null), 30);
  assert.equal(durationMatches(20, 20.08), true);
  assert.equal(durationMatches(20, 20.2), false);
});

test("output selection requires audio whenever the source has audio", () => {
  assert.equal(sourceAudioRequiresOutput(true), true);
  assert.equal(sourceAudioRequiresOutput(false), false);
  assert.deepEqual(selectOutputProfile({ canEncodeAvc: true, canEncodeAac: true, canEncodeVp9: true, canEncodeOpus: true }, true), {
    container: "mp4", videoCodec: "avc", audioCodec: "aac", extension: ".mp4", mimeType: "video/mp4;codecs=avc1,mp4a.40.2", videoBitrate: 8_000_000, audioBitrate: 160_000,
  });
  assert.deepEqual(selectOutputProfile({ canEncodeAvc: false, canEncodeAac: false, canEncodeVp9: true, canEncodeOpus: true }, false), {
    container: "webm", videoCodec: "vp9", audioCodec: null, extension: ".webm", mimeType: "video/webm;codecs=vp9", videoBitrate: 8_000_000, audioBitrate: 160_000,
  });
  assert.equal(selectOutputProfile({ canEncodeAvc: true, canEncodeAac: false, canEncodeVp9: true, canEncodeOpus: false }, true), null);
  assert.equal(audioOutputIsValid(true, false), false);
  assert.equal(audioOutputIsValid(false, false), true);
});

test("quality presets map to deterministic bitrate tiers and Standard is the default", () => {
  assert.equal(DEFAULT_EXPORT_QUALITY, "standard");
  assert.ok(exportQualityPreset("draft").videoBitrate < exportQualityPreset("standard").videoBitrate);
  assert.ok(exportQualityPreset("high").videoBitrate > exportQualityPreset("standard").videoBitrate);
  assert.deepEqual(Object.keys(EXPORT_QUALITY_PRESETS), ["draft", "standard", "high"]);
});

test("export filenames are safe and use the Quran passage range", () => {
  assert.equal(generateExportFileName("my clip!!.mov", [{ verseKeys: ["93:1"] }, { verseKeys: ["93:2", "93:5"] }], { extension: ".mp4" }), "quran-video-93-1-93-5.mp4");
  assert.equal(generateExportFileName("unsafe / title.mov", [], { extension: ".webm" }), "unsafe-title.webm");
});

test("export snapshots are independent from subsequent editor mutations", () => {
  const original = config();
  const snapshot = snapshotLocalExportConfiguration(original);
  (original.segments[0].verseKeys as string[])[0] = "1:1";
  original.positioning.x = 0.1;
  assert.equal(snapshot.segments[0].verseKeys[0], "93:1");
  assert.equal(snapshot.positioning.x, DEFAULT_CAPTION_POSITIONING.x);
});

test("duplicate export prevention and cancellation cleanup are explicit", () => {
  const coordinator = new ExportCoordinator();
  assert.equal(coordinator.start(), true);
  assert.equal(coordinator.start(), false);
  coordinator.finish();
  assert.equal(coordinator.start(), true);
  coordinator.finish();
});

test("validation reports missing source, captions, and invalid format", () => {
  const errors = validateLocalExportInputs(null, config({ segments: [], format: { preset: "vertical", width: 1, height: 1 } }));
  assert.equal(errors.length, 3);
});

test("all supported aspect ratios retain their output dimensions", () => {
  assert.deepEqual(Object.values(PROJECT_FORMATS).map(({ width, height }) => [width, height]), [[1080, 1920], [1920, 1080], [1080, 1080]]);
});

test("export composition uses source cover mapping and excludes safe-area overlays", () => {
  assert.deepEqual(coverPlacement(1920, 1080, 1080, 1920), { x: -1166.6666666666665, y: 0, width: 3413.333333333333, height: 1920 });
  assert.equal(sourceVideoFitForPreview(), "cover");
  assert.equal(sourceVideoFitForMediabunny(), "cover");
  assert.equal(SAFE_AREA_OVERLAY_METADATA.exportable, false);
});

test("Mediabunny transforms include fit for every project canvas without stretching source video", () => {
  for (const format of Object.values(PROJECT_FORMATS)) {
    const transform = mediabunnyVideoTransform(format);
    assert.deepEqual(transform, { width: format.width, height: format.height, fit: "cover" });
    assert.notEqual(transform.fit, "fill");
    assert.equal(format.width / format.height, PROJECT_FORMATS[format.preset].aspectRatio);
    const placement = coverPlacement(1920, 1080, format.width, format.height);
    assert.ok(Math.abs(placement.width / placement.height - 16 / 9) < 1e-12);
  }
});

test("cancellation cleanup runs once and MediaRecorder is not the default export path", () => {
  let calls = 0;
  const cleanup = onceCleanup(() => { calls += 1; });
  cleanup(); cleanup();
  assert.equal(calls, 1);
  assert.equal(DEFAULT_LOCAL_RENDERER_ID, "offline-webcodecs");
});
