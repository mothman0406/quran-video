import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CAPTION_LOGICAL_WIDTH,
  captionLogicalFormat,
  captionScaleForWidth,
  captionTypographyMetrics,
  measureCaptionLayout,
  wrapArabicCaptionWords,
  wrapCaptionText,
  type CaptionMeasureContext,
} from "../src/lib/editor/caption-layout.ts";
import { DEFAULT_CAPTION_POSITIONING, DEFAULT_TYPOGRAPHY, linkedCaptionStackLayout, type ArabicPresentationWord } from "../src/lib/editor/captions.ts";
import { PROJECT_FORMATS } from "../src/lib/editor/formats.ts";
import type { ProjectFormat } from "../src/lib/schemas/project.ts";

function proportionalContext(): CaptionMeasureContext {
  let font = "16px sans-serif";
  return {
    get font() { return font; },
    set font(value: string) { font = value; },
    measureText(text: string) {
      const size = Number(/([\d.]+)px/u.exec(font)?.[1] ?? 16);
      return { width: [...text].length * size * 0.5 } as TextMetrics;
    },
  };
}

function words(value: string): ArabicPresentationWord[] {
  return value.split(" ").map((text) => ({ text, highlighted: false, state: "read", kind: "quran-word" }));
}

test("Quran size is one logical-pixel value shared by preview and every export resolution", () => {
  const positioning = { ...DEFAULT_CAPTION_POSITIONING, maxWidthPercent: 0.9 };
  for (const size of [38, 30, 25]) {
    const typography = { ...DEFAULT_TYPOGRAPHY, arabicFontSize: size };
    const preview = captionTypographyMetrics(captionLogicalFormat(PROJECT_FORMATS.landscape), typography, positioning);
    const exportMetrics = captionTypographyMetrics(PROJECT_FORMATS.landscape, typography, positioning);
    assert.equal(preview.arabicFontSize, size);
    assert.ok(Math.abs(exportMetrics.arabicFontSize / exportMetrics.scale - size) < 1e-9);
    assert.equal(exportMetrics.scale, PROJECT_FORMATS.landscape.width / CAPTION_LOGICAL_WIDTH);
  }
});

test("38 > 30 > 25 produces monotonic font sizes, line boxes, and spacing without a 38px fallback", () => {
  const metrics = [38, 30, 25].map((arabicFontSize) => captionTypographyMetrics(PROJECT_FORMATS.landscape, { ...DEFAULT_TYPOGRAPHY, arabicFontSize }, DEFAULT_CAPTION_POSITIONING));
  assert.ok(metrics[0]!.arabicFontSize > metrics[1]!.arabicFontSize);
  assert.ok(metrics[1]!.arabicFontSize > metrics[2]!.arabicFontSize);
  assert.ok(metrics[0]!.arabicLineHeight > metrics[1]!.arabicLineHeight);
  assert.ok(metrics[1]!.arabicLineHeight > metrics[2]!.arabicLineHeight);
  assert.equal(metrics[1]!.arabicFontSize / metrics[1]!.scale, 30);
  assert.ok(Math.abs(metrics[2]!.arabicFontSize / metrics[2]!.scale - 25) < 1e-9);
});

test("logical preview and export produce identical Arabic and translation line grouping", () => {
  const context = proportionalContext();
  const typography = { ...DEFAULT_TYPOGRAPHY, arabicFontSize: 30, translationFontSize: 15, translationSpacingBelowArabic: 8 };
  const arabicWords = words("وَأَقِيمُوا الْوَزْنَ بِالْقِسْطِ وَلَا تُخْسِرُوا الْمِيزَانَ");
  const translation = "And establish weight in justice and do not make deficient the balance.";
  const make = (format: ProjectFormat) => measureCaptionLayout({ context, format, typography, positioning: DEFAULT_CAPTION_POSITIONING, arabicFontFamily: "UthmanicHafs", arabicWords, translation, translationTypography: typography, translationPositioning: DEFAULT_CAPTION_POSITIONING, transliteration: null });
  const preview = make(captionLogicalFormat(PROJECT_FORMATS.landscape));
  const exported = make(PROJECT_FORMATS.landscape);
  assert.deepEqual(preview.arabicLines.map((line) => line.words.map((word) => word.text)), exported.arabicLines.map((line) => line.words.map((word) => word.text)));
  assert.deepEqual(preview.translationLines.map((line) => line.text), exported.translationLines.map((line) => line.text));
  assert.equal(exported.metrics.maxWidth / exported.metrics.scale, preview.metrics.maxWidth);
  assert.equal(exported.metrics.translationGap / exported.metrics.scale, preview.metrics.translationGap);
  assert.equal(exported.metrics.arabicLineHeight / exported.metrics.scale, preview.metrics.arabicLineHeight);
});

test("caption width, line height, spacing, and center anchor are format-independent logical semantics", () => {
  for (const format of Object.values(PROJECT_FORMATS)) {
    const logical = captionLogicalFormat(format);
    const metrics = captionTypographyMetrics(logical, DEFAULT_TYPOGRAPHY, DEFAULT_CAPTION_POSITIONING);
    assert.equal(logical.width, CAPTION_LOGICAL_WIDTH);
    assert.equal(metrics.maxWidth, CAPTION_LOGICAL_WIDTH * DEFAULT_CAPTION_POSITIONING.maxWidthPercent);
    assert.equal(metrics.arabicLineHeight, DEFAULT_TYPOGRAPHY.arabicFontSize * DEFAULT_TYPOGRAPHY.arabicLineSpacing);
    assert.equal(metrics.translationGap, DEFAULT_TYPOGRAPHY.translationSpacingBelowArabic);
    const stack = linkedCaptionStackLayout(logical, 0.78, logical.height, 100);
    assert.ok(stack.topY <= 0.78 && stack.bottomY >= 0.78);
  }
});

test("responsive stage scaling changes display size without changing logical wrapping", () => {
  assert.equal(captionScaleForWidth(360), 1);
  assert.equal(captionScaleForWidth(720), 2);
  assert.equal(captionScaleForWidth(180), 0.5);
  const value = "one two three four five";
  const groups = [180, 360, 720].map(() => wrapCaptionText(value, 10, (text) => text.length));
  assert.deepEqual(groups[0], groups[1]);
  assert.deepEqual(groups[1], groups[2]);
});

test("Arabic wrapping preserves canonical words and combining marks", () => {
  const canonical = words("وَأَقِيمُوا الْوَزْنَ بِالْقِسْطِ وَلَا تُخْسِرُوا الْمِيزَانَ");
  const lines = wrapArabicCaptionWords(canonical, 17, (text) => [...text].length);
  assert.deepEqual(lines.flatMap((line) => line.words.map((word) => word.text)), canonical.map((word) => word.text));
  assert.equal(lines.flatMap((line) => line.words.map((word) => word.text)).join(" "), canonical.map((word) => word.text).join(" "));
  assert.match(lines.flatMap((line) => line.words.map((word) => word.text)).join(" "), /[\u064b-\u065f]/u);
});

test("preview, Watch, Create, and export use the shared logical stage and font gate", () => {
  const preview = readFileSync(new URL("../src/components/caption-preview.tsx", import.meta.url), "utf8");
  const create = readFileSync(new URL("../src/components/quick-create.tsx", import.meta.url), "utf8");
  const watch = readFileSync(new URL("../src/components/composed-video-preview.tsx", import.meta.url), "utf8");
  const exporter = readFileSync(new URL("../src/lib/export/offline-webcodecs.ts", import.meta.url), "utf8");
  assert.match(preview, /CaptionLogicalStage/);
  assert.match(create, /CaptionLogicalStage/);
  assert.match(watch, /CaptionPreview/);
  assert.match(preview, /ensurePresentationFontsLoaded/);
  assert.match(create, /ensurePresentationFontsLoaded/);
  assert.match(exporter, /await loadArabicFont/);
  assert.match(exporter, /ensurePresentationFontsLoaded/);
});
