import assert from "node:assert/strict";
import test from "node:test";
import { createLocalExportConfiguration, snapshotLocalExportConfiguration } from "../src/lib/export/config.ts";
import { DEFAULT_CAPTION_BACKGROUND, DEFAULT_CAPTION_POSITIONING, DEFAULT_TRANSITION_SETTINGS, DEFAULT_TYPOGRAPHY, captionVisualStatesAtTime } from "../src/lib/editor/captions.ts";
import { DEFAULT_PROJECT_FORMAT, PROJECT_FORMATS, SAFE_AREA_OVERLAY_METADATA, mediabunnyVideoTransform, sourceVideoFitForMediabunny, sourceVideoFitForPreview } from "../src/lib/editor/formats.ts";
import { audioOutputIsValid, selectOutputProfile, sourceAudioRequiresOutput } from "../src/lib/export/output.ts";
import { DEFAULT_LOCAL_RENDERER_ID } from "../src/lib/export/offline-webcodecs.ts";
import { containPlacement, durationMatches, frameTimeline, onceCleanup, resolveExportFrameRate } from "../src/lib/export/timeline.ts";
import { DEFAULT_EXPORT_QUALITY, EXPORT_QUALITY_PRESETS, exportFormatForQuality, exportQualityPreset } from "../src/lib/export/quality.ts";
import { generateExportFileName } from "../src/lib/export/filename.ts";
import { ExportCoordinator } from "../src/lib/export/lifecycle.ts";
import { validateExportProjectFormat, validateLocalExportInputs } from "../src/lib/export/validation.ts";
import { exportOutputDurationMs, exportOutputTimeToSourceTime, projectDurationMs } from "../src/lib/editor/media.ts";
import { applyPlaybackRate } from "../src/lib/editor/playback-rate.ts";

const segment = { id: "93:1#1", contentKind: "ayah" as const, verseKeys: ["93:1"], startMs: 1_000, endMs: 2_000, arabic: "وَالضُّحَى", translation: "By the morning brightness", transliteration: "Wa ad-duha", wordStart: 0, wordEnd: 1, wordCount: 1, timingEvidence: { start: { timestampMs: 1_000, source: "direct-asr-word" as const }, end: { timestampMs: 2_000, source: "chunk-text-alignment" as const }, derived: false } };

function config(overrides = {}) { return createLocalExportConfiguration({ format: DEFAULT_PROJECT_FORMAT, segments: [segment], typography: DEFAULT_TYPOGRAPHY, captionBackground: DEFAULT_CAPTION_BACKGROUND, positioning: DEFAULT_CAPTION_POSITIONING, transitionSettings: DEFAULT_TRANSITION_SETTINGS, showVerseNumber: false, ...overrides }); }

test("export mapping keeps project render state and excludes editor-only safe areas", () => {
  const value = config();
  assert.deepEqual(value.format, { preset: "vertical", width: 1080, height: 1920 });
  assert.equal("safeAreaGuides" in value, false);
  assert.equal(value.watermarkRequired, false);
  assert.deepEqual(SAFE_AREA_OVERLAY_METADATA, { editorOnly: true, exportable: false });
});

test("quality, rather than commercial entitlements, controls dimensions and watermarking", () => {
  assert.deepEqual(config({ quality: "basic" }).format, { preset: "vertical", width: 720, height: 1280 });
  assert.equal(config({ quality: "basic" }).watermarkRequired, true);
  assert.deepEqual(config({ quality: "ultra" }).format, { preset: "vertical", width: 2160, height: 3840 });
  assert.equal(config({ quality: "ultra" }).watermarkRequired, false);
});

test("export mapping preserves manual timings, translation visibility, and verse-number presentation", () => {
  const value = config({ segments: [{ ...segment, startMs: 1_125, endMs: 1_875 }], typography: { ...DEFAULT_TYPOGRAPHY, translationVisible: false }, showVerseNumber: true });
  assert.equal(value.segments[0].startMs, 1_125);
  assert.equal(value.segments[0].endMs, 1_875);
  assert.equal(value.typography.translationVisible, false);
  assert.equal(value.showVerseNumber, true);
});

test("speed maps output time back to source time without changing caption or word timing", () => {
  const timed = { ...segment, wordTimings: [{ canonicalWordIndex: 1, sourceWordStart: 0, sourceWordEnd: 1, startMs: 1_200, endMs: 1_800 }] };
  const value = config({ segments: [timed], playbackRate: 2, mediaTrim: { startMs: 10_000, endMs: 40_000 } });
  assert.equal(value.playbackRate, 2);
  assert.equal(exportOutputDurationMs(value.mediaTrim!, 60_000, value.playbackRate), 15_000);
  assert.equal(exportOutputTimeToSourceTime(7_500, value.mediaTrim!, 60_000, value.playbackRate), 25_000);
  assert.deepEqual(value.segments[0].wordTimings, timed.wordTimings);
  assert.deepEqual(captionVisualStatesAtTime(value.segments, exportOutputTimeToSourceTime(625, { startMs: 0, endMs: 2_000 }, 2_000, 2), value.transitionSettings).map((state) => state.segment.id), [segment.id]);
});

test("speed duration follows trim source time for both slow and fast exports", () => {
  assert.equal(exportOutputDurationMs({ startMs: 0, endMs: 60_000 }, 60_000, 2), 30_000);
  assert.equal(exportOutputDurationMs({ startMs: 0, endMs: 60_000 }, 60_000, 0.5), 120_000);
  assert.equal(exportOutputDurationMs({ startMs: 10_000, endMs: 40_000 }, 60_000, 2), 15_000);
  assert.equal(projectDurationMs({ kind: "video", hasVideo: true, hasAudio: true, fileName: "source.mp4", mimeType: "video/mp4", durationMs: 60_000 }), 60_000);
});

test("preview media rate changes preserve source currentTime and pitch where supported", () => {
  const media = { currentTime: 12.345, playbackRate: 1, defaultPlaybackRate: 1, paused: false, preservesPitch: false };
  applyPlaybackRate(media, 2);
  assert.deepEqual(media, { currentTime: 12.345, playbackRate: 2, defaultPlaybackRate: 2, paused: false, preservesPitch: true });
  media.paused = true;
  applyPlaybackRate(media, 0.5);
  assert.equal(media.currentTime, 12.345);
  assert.equal(media.playbackRate, 0.5);
});

test("export reuses the preview transition interpolation without a second timing model", () => {
  const value = config();
  assert.deepEqual(captionVisualStatesAtTime(value.segments, 1_112, value.transitionSettings), captionVisualStatesAtTime([segment], 1_112, DEFAULT_TRANSITION_SETTINGS));
  assert.deepEqual(captionVisualStatesAtTime(value.segments, 1_112, value.transitionSettings).map(({ opacity, blurPx }) => ({ opacity, blurPx })), [{ opacity: 112 / 225, blurPx: 0 }]);
});

test("export snapshots preserve the exact basmalah display segment used by preview and timeline", () => {
  const prelude = { ...segment, id: "basmalah-prelude#1", contentKind: "basmalah-prelude" as const, verseKeys: [], startMs: 500, endMs: 900, arabic: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ", translation: null, transliteration: null };
  const value = config({ segments: [prelude] });
  assert.deepEqual(value.segments[0], prelude);
  assert.equal(captionVisualStatesAtTime(value.segments, 700, value.transitionSettings)[0]?.segment.id, prelude.id);
  assert.equal(captionVisualStatesAtTime(value.segments, 900, value.transitionSettings).length, 0);
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
  assert.ok(exportQualityPreset("basic").videoBitrate < exportQualityPreset("standard").videoBitrate);
  assert.ok(exportQualityPreset("ultra").videoBitrate > exportQualityPreset("standard").videoBitrate);
  assert.deepEqual(Object.keys(EXPORT_QUALITY_PRESETS), ["basic", "standard", "ultra"]);
  assert.deepEqual(exportFormatForQuality({ preset: "landscape" }, "basic"), { preset: "landscape", width: 1280, height: 720 });
  assert.deepEqual(exportFormatForQuality({ preset: "square" }, "ultra"), { preset: "square", width: 2160, height: 2160 });
});

test("export filenames are safe and use the Quran passage range", () => {
  assert.equal(generateExportFileName([{ verseKeys: ["18:57"] }, { verseKeys: ["18:58"] }], { extension: ".mp4" }, "standard"), "al-kahf-57-58-1080p.mp4");
  assert.equal(generateExportFileName([], { extension: ".webm" }, "basic"), "quran-video.webm");
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
  const valid = config({ segments: [] });
  const errors = validateLocalExportInputs(null, { ...valid, format: { ...valid.format, width: 1 } });
  assert.equal(errors.length, 3);
});

test("renderer validation accepts every quality-ladder project format", () => {
  for (const format of [
    { preset: "vertical" as const, width: 720, height: 1280 },
    { preset: "vertical" as const, width: 1080, height: 1920 },
    { preset: "vertical" as const, width: 2160, height: 3840 },
    { preset: "landscape" as const, width: 1280, height: 720 },
    { preset: "landscape" as const, width: 1920, height: 1080 },
    { preset: "landscape" as const, width: 3840, height: 2160 },
    { preset: "square" as const, width: 720, height: 720 },
    { preset: "square" as const, width: 1080, height: 1080 },
    { preset: "square" as const, width: 2160, height: 2160 },
  ]) assert.equal(validateExportProjectFormat(format), null);
  assert.equal(validateExportProjectFormat({ preset: "vertical", width: 1, height: 1 }), "The selected project format is invalid.");
  for (const quality of ["basic", "standard", "ultra"] as const) assert.equal(validateLocalExportInputs({ size: 1, type: "video/mp4" } as File, config({ quality })).length, 0);
});

test("all supported aspect ratios retain their output dimensions", () => {
  assert.deepEqual(Object.values(PROJECT_FORMATS).map(({ width, height }) => [width, height]), [[1080, 1920], [1920, 1080], [1080, 1080]]);
});

test("preview and export use the same source contain mapping and exclude safe-area overlays", () => {
  assert.deepEqual(containPlacement(1920, 1080, 1080, 1920), { x: 0, y: 656.25, width: 1080, height: 607.5 });
  assert.equal(sourceVideoFitForPreview(), "contain");
  assert.equal(sourceVideoFitForMediabunny(), "contain");
  assert.equal(SAFE_AREA_OVERLAY_METADATA.exportable, false);
});

test("Mediabunny transforms contain every source frame without stretching", () => {
  for (const format of Object.values(PROJECT_FORMATS)) {
    const transform = mediabunnyVideoTransform(format);
    assert.deepEqual(transform, { width: format.width, height: format.height, fit: "contain" });
    assert.notEqual(transform.fit, "fill");
    assert.equal(format.width / format.height, PROJECT_FORMATS[format.preset].aspectRatio);
    const placement = containPlacement(1920, 1080, format.width, format.height);
    assert.ok(Math.abs(placement.width / placement.height - 16 / 9) < 1e-12);
    assert.ok(placement.width <= format.width && placement.height <= format.height, "contain never crops the source frame");
  }
});

test("cancellation cleanup runs once and MediaRecorder is not the default export path", () => {
  let calls = 0;
  const cleanup = onceCleanup(() => { calls += 1; });
  cleanup(); cleanup();
  assert.equal(calls, 1);
  assert.equal(DEFAULT_LOCAL_RENDERER_ID, "offline-webcodecs");
});
