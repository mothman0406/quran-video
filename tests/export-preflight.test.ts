import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CAPTION_BACKGROUND, DEFAULT_CAPTION_POSITIONING, DEFAULT_TRANSITION_SETTINGS, DEFAULT_TYPOGRAPHY, type CaptionSegment } from "../src/lib/editor/captions.ts";
import { DEFAULT_PROJECT_FORMAT } from "../src/lib/editor/formats.ts";
import { getVerse } from "../src/lib/quran/local.ts";
import { quranDisplayText } from "../src/lib/quran/content.ts";
import { runExportPreflight, type ExportPreflightRuntimeContext } from "../src/lib/export/preflight.ts";
import { createLocalExportConfiguration } from "../src/lib/export/config.ts";
import type { Project } from "../src/lib/schemas/project.ts";

const verse = getVerse("93:1")!;
const arabic = quranDisplayText(verse);
const wordCount = arabic.split(/\s+/u).length;

function caption(overrides: Partial<CaptionSegment> = {}): CaptionSegment {
  return {
    id: "93:1#1",
    contentKind: "ayah",
    verseKeys: ["93:1"],
    startMs: 1_000,
    endMs: 2_000,
    arabic,
    translation: "By the morning brightness",
    transliteration: null,
    wordStart: 0,
    wordEnd: wordCount,
    wordCount,
    showVerseNumberAtEnd: true,
    timingEvidence: { start: { timestampMs: 1_000, source: "fastconformer" }, end: { timestampMs: 2_000, source: "fastconformer" }, derived: false },
    ...overrides,
  };
}

function project(overrides: Partial<Project> = {}): Project {
  const segment = caption();
  return {
    version: 2,
    id: "project",
    title: "Preflight fixture",
    sourceMedia: { kind: "video", hasVideo: true, hasAudio: true, fileName: "source.mp4", mimeType: "video/mp4", durationMs: 10_000, width: 1920, height: 1080 },
    projectAssets: [{ id: "asset", type: "video", name: "source.mp4", sourceOrigin: "local-file", createdAt: "2026-01-01", durationMs: 10_000, width: 1920, height: 1080, mimeType: "video/mp4", availability: "available" }],
    activeMediaAssetId: "asset",
    mediaTrim: { startMs: 0, endMs: 10_000 },
    format: DEFAULT_PROJECT_FORMAT,
    verseAlignments: [{ verseKey: "93:1", surahNumber: 93, ayahNumber: 1, startMs: 1_000, endMs: 2_000, confidence: 1 }],
    captionSegments: [segment],
    captions: { arabic: true, translation: true, transliteration: false, translationEdition: "english_saheeh" },
    positioning: DEFAULT_CAPTION_POSITIONING,
    captionBackground: DEFAULT_CAPTION_BACKGROUND,
    typography: { ...DEFAULT_TYPOGRAPHY, wordHighlightMode: "off" },
    transitionSettings: DEFAULT_TRANSITION_SETTINGS,
    playbackRate: 1,
    showVerseNumber: true,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

const runtime: ExportPreflightRuntimeContext = { sourceAvailable: true, exporterSupport: { supported: true, reason: "ok" }, outputProfileAvailable: true };

test("valid Quran project is ready without mutating project state", () => {
  const value = project();
  const before = JSON.stringify(value);
  assert.deepEqual(runExportPreflight(value, runtime), { status: "ready", checks: [] });
  assert.equal(JSON.stringify(value), before);
});

test("preflight and renderer share accepted export configuration rules", () => {
  const value = project();
  const configuration = createLocalExportConfiguration({
    format: value.format,
    segments: value.captionSegments as CaptionSegment[],
    typography: value.typography,
    captionBackground: value.captionBackground,
    positioning: value.positioning,
    transitionSettings: value.transitionSettings,
    showVerseNumber: value.showVerseNumber,
    mediaTrim: value.mediaTrim,
    playbackRate: value.playbackRate,
    watermarkRequired: false,
  });
  assert.equal(configuration.format.width, 1080, "Standard is the default 9:16 export");
  assert.equal(runExportPreflight(value, { ...runtime, exportConfiguration: configuration, exportQuality: "standard" }).status, "ready");
  const invalid = { ...configuration, format: { ...configuration.format, width: 1 } };
  const result = runExportPreflight(value, { ...runtime, exportConfiguration: invalid });
  assert.equal(result.status, "blocked");
  assert.ok(result.checks.some((check) => check.id === "invalid-project-format"));
});

test("unresolved passage, invalid verse ownership, caption timing, and word timing block export", () => {
  assert.equal(runExportPreflight(project({ verseAlignments: [] }), runtime).status, "blocked");
  assert.equal(runExportPreflight(project({ captionSegments: [caption({ verseKeys: ["114:999"] })] }), runtime).status, "blocked");
  assert.equal(runExportPreflight(project({ captionSegments: [caption({ wordEnd: 0, wordCount: 0 })] }), runtime).status, "blocked");
  assert.equal(runExportPreflight(project({ captionSegments: [caption({ startMs: 3_000, endMs: 2_000 })] }), runtime).status, "blocked");
  assert.equal(runExportPreflight(project({ captionSegments: [caption({ wordTimings: [{ canonicalWordIndex: 1, sourceWordStart: 0, sourceWordEnd: 1, startMs: 1_700, endMs: 1_600 }] })] }), runtime).status, "blocked");
});

test("manual small gaps pass while large Quran overlaps warn", () => {
  const otherVerse = getVerse("93:2")!;
  const otherArabic = quranDisplayText(otherVerse);
  const other = caption({ id: "93:2#1", verseKeys: ["93:2"], arabic: otherArabic, wordEnd: otherArabic.split(/\s+/u).length, wordCount: otherArabic.split(/\s+/u).length, startMs: 2_100, endMs: 2_800 });
  const base = project({ verseAlignments: [...project().verseAlignments, { verseKey: "93:2", surahNumber: 93, ayahNumber: 2, startMs: 2_100, endMs: 2_800, confidence: 1 }], captionSegments: [caption(), other] });
  assert.equal(runExportPreflight(base, runtime).status, "ready");
  const result = runExportPreflight({ ...base, captionSegments: [caption(), { ...other, startMs: 500, endMs: 2_500 }] }, runtime);
  assert.equal(result.status, "warnings");
  assert.ok(result.checks.some((item) => item.id === "large-caption-overlap"));
});

test("translation review, trim exclusion, visual bounds, social collisions, and missing highlight timing warn", () => {
  const segment = caption({ translationSegment: { text: "By the morning brightness", wordStart: 0, wordEnd: wordCount, source: "fallback", reviewStatus: "needs-review" }, wordTimings: undefined });
  const result = runExportPreflight(project({ captionSegments: [segment], mediaTrim: { startMs: 4_000, endMs: 8_000 }, typography: { ...DEFAULT_TYPOGRAPHY, wordHighlightMode: "current-word" } }), {
    ...runtime,
    platformPreview: "tiktok",
    captionBounds: [{ segmentId: segment.id, kind: "arabic", linked: true, x: 0.82, y: 0.4, width: 0.1, height: 0.08 }],
  });
  assert.equal(result.status, "warnings");
  for (const id of ["translation-needs-review", "word-highlight-unavailable", "trim-excludes-quran", "social-safe-zone-collision"]) assert.ok(result.checks.some((item) => item.id === id));
});

test("manual translations and audio-only sources remain valid, while malformed trims block", () => {
  const manuallyTranslated = project({ captionSegments: [caption({ translationSegment: { text: "A reviewed manual translation", wordStart: 0, wordEnd: wordCount, source: "manual", reviewStatus: "manual" } })] });
  assert.equal(runExportPreflight(manuallyTranslated, { ...runtime, platformPreview: "none" }).status, "ready");
  const audioOnly = project({ sourceMedia: { kind: "audio", hasVideo: false, hasAudio: true, fileName: "source.mp3", mimeType: "audio/mpeg", durationMs: 10_000 }, projectAssets: [{ id: "asset", type: "audio", name: "source.mp3", sourceOrigin: "local-file", createdAt: "2026-01-01", durationMs: 10_000, mimeType: "audio/mpeg", availability: "available" }] });
  assert.equal(runExportPreflight(audioOnly, runtime).status, "ready");
  assert.equal(runExportPreflight(project({ mediaTrim: { startMs: 9_000, endMs: 8_000 } }), runtime).status, "blocked");
});

test("a recheck reads current state rather than retaining resolved warnings", () => {
  const stale = project({ captionSegments: [caption({ translationSegment: { text: "fallback", wordStart: 0, wordEnd: wordCount, source: "fallback", reviewStatus: "needs-review" } })] });
  assert.equal(runExportPreflight(stale, runtime).status, "warnings");
  const fixed = { ...stale, captionSegments: [caption({ translationSegment: { text: "manual", wordStart: 0, wordEnd: wordCount, source: "manual", reviewStatus: "manual" } })] };
  assert.equal(runExportPreflight(fixed, runtime).status, "ready");
});

test("active media and exporter capabilities block, while unused unavailable assets do not", () => {
  const unavailable = runExportPreflight(project(), { ...runtime, sourceAvailable: false });
  assert.equal(unavailable.status, "blocked");
  assert.ok(unavailable.checks.some((item) => item.id === "source-unavailable"));
  const unused = project({ projectAssets: [...project().projectAssets, { id: "unused", type: "audio", name: "old.mp3", sourceOrigin: "local-file", createdAt: "2026-01-01", availability: "needs-relink" }] });
  assert.equal(runExportPreflight(unused, runtime).status, "ready");
  assert.equal(runExportPreflight(project(), { ...runtime, exporterSupport: { supported: false, reason: "WebCodecs unavailable" } }).status, "blocked");
  assert.equal(runExportPreflight(project({ playbackRate: 2 }), { ...runtime, playbackRateExportSupported: false }).status, "blocked");
});
