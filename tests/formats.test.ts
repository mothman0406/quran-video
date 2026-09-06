import assert from "node:assert/strict";
import test from "node:test";
import { CaptionSegmentSchema, ProjectFormatSchema } from "../src/lib/schemas/project.ts";
import { clampCaptionPositioning, DEFAULT_CAPTION_POSITIONING, resetCaptionPositioning } from "../src/lib/editor/captions.ts";
import { DEFAULT_PROJECT_FORMAT, PROJECT_FORMATS, SAFE_AREA_GUIDES, SAFE_AREA_OVERLAY_METADATA, safeAreaGuidesForFormat } from "../src/lib/editor/formats.ts";

test("the default project format is 9:16 vertical", () => {
  assert.deepEqual(DEFAULT_PROJECT_FORMAT, { preset: "vertical", width: 1080, height: 1920 });
  assert.deepEqual(ProjectFormatSchema.parse(DEFAULT_PROJECT_FORMAT), DEFAULT_PROJECT_FORMAT);
});

test("project format presets expose the expected dimensions and aspect ratios", () => {
  assert.deepEqual(PROJECT_FORMATS.vertical, { ...PROJECT_FORMATS.vertical, width: 1080, height: 1920, aspectRatio: 9 / 16 });
  assert.equal(PROJECT_FORMATS.vertical.width / PROJECT_FORMATS.vertical.height, 9 / 16);
  assert.equal(PROJECT_FORMATS.landscape.width / PROJECT_FORMATS.landscape.height, 16 / 9);
  assert.equal(PROJECT_FORMATS.square.width / PROJECT_FORMATS.square.height, 1);
});

test("switching formats preserves a reachable normalized caption position", () => {
  const position = { ...DEFAULT_CAPTION_POSITIONING, x: 0.5, y: 0.58, translationX: 0.5, translationY: 0.7 };
  const switched = clampCaptionPositioning(position, PROJECT_FORMATS.landscape);
  assert.equal(switched.x, position.x);
  assert.equal(switched.y, position.y);
  assert.equal(switched.translationX, position.translationX);
  assert.equal(switched.translationY, position.translationY);
  assert.notEqual(switched, position);
});

test("format-aware clamping keeps caption blocks on canvas and out of vertical social UI space", () => {
  const clamped = clampCaptionPositioning({ ...DEFAULT_CAPTION_POSITIONING, translationPositionLinked: false, x: 0, y: 1, translationX: 1, translationY: 1 }, PROJECT_FORMATS.vertical);
  assert.equal(clamped.x, 0.45);
  assert.equal(clamped.translationX, 0.55);
  assert.equal(clamped.y, 0.82);
  assert.equal(clamped.translationY, 0.82);
});

test("linked translation positioning survives a format change", () => {
  const position = clampCaptionPositioning({ ...DEFAULT_CAPTION_POSITIONING, x: 0.5, y: 0.6 }, PROJECT_FORMATS.square);
  assert.equal(position.translationPositionLinked, true);
  assert.equal(position.translationX, position.x);
  assert.equal(position.translationY, 0.72);
});

test("reset position uses a format-aware lower-middle default", () => {
  assert.deepEqual(resetCaptionPositioning(DEFAULT_PROJECT_FORMAT), DEFAULT_CAPTION_POSITIONING);
  assert.equal(resetCaptionPositioning(PROJECT_FORMATS.landscape).x, 0.5);
  assert.equal(resetCaptionPositioning(PROJECT_FORMATS.landscape).y, 0.68);
});

test("safe-area configuration is centralized for every project format", () => {
  for (const format of Object.values(PROJECT_FORMATS)) {
    const guides = safeAreaGuidesForFormat(format);
    assert.equal(guides, SAFE_AREA_GUIDES[format.preset]);
    assert.ok(guides.some((guide) => guide.id === "title-action"));
    assert.ok(guides.some((guide) => guide.id === "center-vertical"));
    assert.ok(guides.some((guide) => guide.id === "center-horizontal"));
  }
  assert.ok(safeAreaGuidesForFormat(PROJECT_FORMATS.vertical).some((guide) => guide.id === "social-ui"));
  assert.deepEqual(SAFE_AREA_OVERLAY_METADATA, { editorOnly: true, exportable: false });
});

test("format-only changes do not mutate recognition or caption timing data", () => {
  const alignment = { verseKey: "93:1", startMs: 100, endMs: 1_100 };
  const segment = { id: "caption", contentKind: "ayah" as const, verseKeys: ["93:1"], startMs: 100, endMs: 1_100, arabic: "وَالضُّحَى", translation: null, transliteration: null, wordStart: 0, wordEnd: 1, wordCount: 1 };
  const alignmentSnapshot = { ...alignment };
  const segmentSnapshot = { ...segment, verseKeys: [...segment.verseKeys] };
  clampCaptionPositioning({ ...DEFAULT_CAPTION_POSITIONING, x: 0.9 }, PROJECT_FORMATS.square);
  assert.deepEqual(alignment, alignmentSnapshot);
  assert.deepEqual(segment, segmentSnapshot);
  assert.deepEqual(CaptionSegmentSchema.parse(segment), segment);
});

test("a basmalah prelude persists without a fake canonical verse key", () => {
  const prelude = {
    id: "basmalah-prelude#1",
    contentKind: "basmalah-prelude",
    verseKeys: [],
    startMs: 100,
    endMs: 900,
    arabic: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    translation: null,
    transliteration: null,
    wordStart: 0,
    wordEnd: 4,
    wordCount: 4,
  };
  assert.deepEqual(CaptionSegmentSchema.parse(prelude), prelude);
  assert.throws(() => CaptionSegmentSchema.parse({ ...prelude, verseKeys: ["1:1"] }));
});
