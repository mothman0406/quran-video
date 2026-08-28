import assert from "node:assert/strict";
import test from "node:test";
import { createLocalExportConfiguration } from "../src/lib/export/config.ts";
import { DEFAULT_CAPTION_BACKGROUND, DEFAULT_CAPTION_POSITIONING, DEFAULT_TRANSITION_SETTINGS, DEFAULT_TYPOGRAPHY, captionVisualStatesAtTime } from "../src/lib/editor/captions.ts";
import { DEFAULT_PROJECT_FORMAT, SAFE_AREA_OVERLAY_METADATA } from "../src/lib/editor/formats.ts";

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
});
