import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_CAPTION_EFFECTS, DEFAULT_TYPOGRAPHY, effectiveTranslationColor } from "../src/lib/editor/captions.ts";
import { CANONICAL_BASMALAH_ARABIC, CANONICAL_BASMALAH_TRANSLATION } from "../src/lib/quran/content.ts";
import { PROJECT_FORMATS } from "../src/lib/editor/formats.ts";
import {
  DEFAULT_PRE_GENERATION_PRESENTATION_SECTION,
  FULL_AYAH_DISPLAY_INHERENT,
  PRE_GENERATION_PRESENTATION_SECTIONS,
  CREATE_CAPTION_WIDTH_MAX_PERCENT,
  CREATE_CAPTION_WIDTH_MIN_PERCENT,
  defaultCaptionPresentationSettings,
  presentationForFormat,
  presentationWithCaptionWidth,
  videoDimOpacity,
} from "../src/lib/editor/presentation-settings.ts";
import { exportFormatForQuality } from "../src/lib/export/quality.ts";

const quickCreate = readFileSync(new URL("../src/components/quick-create.tsx", import.meta.url), "utf8");
const editorWorkspace = readFileSync(new URL("../src/components/editor-workspace.tsx", import.meta.url), "utf8");
const editorClient = readFileSync(new URL("../src/components/editor-client.tsx", import.meta.url), "utf8");
const composedPreview = readFileSync(new URL("../src/components/composed-video-preview.tsx", import.meta.url), "utf8");
const videosDashboard = readFileSync(new URL("../src/components/videos-dashboard.tsx", import.meta.url), "utf8");
const offlineRenderer = readFileSync(new URL("../src/lib/export/offline-webcodecs.ts", import.meta.url), "utf8");
const exportConfig = readFileSync(new URL("../src/lib/export/config.ts", import.meta.url), "utf8");

test("Layout is the default and the five pre-generation sections stay ordered", () => {
  assert.equal(DEFAULT_PRE_GENERATION_PRESENTATION_SECTION, "layout");
  assert.deepEqual(PRE_GENERATION_PRESENTATION_SECTIONS, ["layout", "quran", "translation", "effects", "toggles"]);
  assert.match(quickCreate, /PRE_GENERATION_PRESENTATION_SECTIONS\.map/);
  assert.match(quickCreate, /activeSection === "layout"/);
  assert.match(quickCreate, /activeSection === "quran"/);
  assert.match(quickCreate, /activeSection === "translation"/);
  assert.match(quickCreate, /activeSection === "effects"/);
  assert.match(quickCreate, /activeSection === "toggles"/);
});

test("new Create projects and presentation reset default verse numbers on", () => {
  const value = defaultCaptionPresentationSettings();
  assert.equal(value.projectFormat.preset, "vertical");
  assert.equal(value.positioning.maxWidthPercent, 0.9);
  assert.equal(value.positioning.translationMaxWidthPercent, 0.9);
  assert.equal(value.typography.quranStyle, "uthmani");
  assert.equal(value.typography.arabicFontSize, DEFAULT_TYPOGRAPHY.arabicFontSize);
  assert.equal(value.typography.textColor, "#ffffff");
  assert.equal(value.typography.translationVisible, true);
  assert.equal(value.typography.wordHighlightMode, "read-so-far");
  assert.equal(value.typography.wordHighlightColor, "#ffffff");
  assert.equal(value.typography.translationTextColor, "#ffffff");
  assert.equal(value.typography.translationOpacity, 1);
  assert.equal(value.typography.translationMatchHighlightColor, false);
  assert.equal(value.showVerseNumber, true);
  assert.deepEqual(value.captionEffects, DEFAULT_CAPTION_EFFECTS);
  assert.equal(value.transitionSettings.fadeInMs, 225);
  assert.equal(value.transitionSettings.type, "blur-fade");
  assert.equal(value.transitionSettings.blurFadeMaxPx, 4);
  assert.equal(FULL_AYAH_DISPLAY_INHERENT, true);
});

test("switching sections and formats preserves presentation values and adds 4:5 output", () => {
  const customized = defaultCaptionPresentationSettings();
  customized.typography.arabicFontSize = 52;
  customized.typography.translationItalic = true;
  customized.typography.translationSpacingBelowArabic = 17;
  customized.positioning.maxWidthPercent = 0.94;
  customized.positioning.translationMaxWidthPercent = 0.94;
  customized.captionEffects.videoDimLevel = 24;
  customized.showVerseNumber = true;
  const portrait = presentationForFormat(customized, PROJECT_FORMATS.portrait);
  assert.equal(portrait.typography.arabicFontSize, 52);
  assert.equal(portrait.typography.translationItalic, true);
  assert.equal(portrait.typography.translationSpacingBelowArabic, 17);
  assert.equal(portrait.positioning.maxWidthPercent, 0.94);
  assert.equal(portrait.positioning.translationMaxWidthPercent, 0.94);
  assert.equal(portrait.captionEffects.videoDimLevel, 24);
  assert.equal(portrait.showVerseNumber, true);
  assert.deepEqual(portrait.projectFormat, { preset: "portrait", width: 1080, height: 1350, label: "4:5 portrait", aspectRatio: 4 / 5 });
  assert.deepEqual(exportFormatForQuality(portrait.projectFormat, "basic"), { preset: "portrait", width: 720, height: 900 });
  assert.deepEqual(exportFormatForQuality(portrait.projectFormat, "ultra"), { preset: "portrait", width: 2160, height: 2700 });
});

test("all requested controls write the one shared presentation state", () => {
  for (const label of ["Caption vertical position", "Caption width", "Text spacing", "Quran font", "Quran caption size", "Quran color", "Word highlight color", "Translation language", "Translation font", "Translation size", "Translation weight", "Italic", "Translation color", "Match highlight color", "Video dim level", "Outline width", "Outline color picker", "Shadow intensity", "Caption fade duration", "Translation", "Ayah numbers", "Full Ayah is always enabled", "Word highlighting", "Reset presentation defaults"]) {
    assert.match(quickCreate, new RegExp(label));
  }
  assert.match(quickCreate, /\["vertical", "square", "portrait", "landscape"\]/);
  assert.match(quickCreate, /setPresentation\(defaultCaptionPresentationSettings\(\)\)/);
});

test("Create caption width uses the existing normalized positioning fields and clamps to its safe range", () => {
  assert.equal(CREATE_CAPTION_WIDTH_MIN_PERCENT, 0.7);
  assert.equal(CREATE_CAPTION_WIDTH_MAX_PERCENT, 0.96);
  const initial = defaultCaptionPresentationSettings();
  const selected = presentationWithCaptionWidth(initial, 0.94);
  assert.equal(selected.positioning.maxWidthPercent, 0.94);
  assert.equal(selected.positioning.translationMaxWidthPercent, 0.94);
  assert.equal(presentationWithCaptionWidth(initial, 0.1).positioning.maxWidthPercent, 0.7);
  assert.equal(presentationWithCaptionWidth(initial, 2).positioning.maxWidthPercent, 0.96);
  assert.equal(presentationWithCaptionWidth(selected, Number.NaN).positioning.maxWidthPercent, 0.94);
  assert.match(quickCreate, /width: `\$\{positioning\.maxWidthPercent \* 100\}%`/);
  assert.doesNotMatch(quickCreate, /createCaptionWidth|exportCaptionWidth|previewCaptionWidth/);
});

test("create sample uses canonical Basmallah and demonstrates every highlight state", () => {
  assert.equal(CANONICAL_BASMALAH_ARABIC, "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ");
  assert.equal(CANONICAL_BASMALAH_TRANSLATION, "In the name of Allah, the Entirely Merciful, the Especially Merciful.");
  assert.match(quickCreate, /CANONICAL_BASMALAH_ARABIC\.split/);
  assert.match(quickCreate, /index === 0 \? "read" : index === 1 \? "current" : "unread"/);
  assert.match(quickCreate, /wordHighlightMode === "off" \? "read"/);
  assert.match(quickCreate, /data-sample-word-state/);
  assert.doesNotMatch(quickCreate, /getVerse\("93:1"\)|By the morning brightness/);
});

test("validated spectrum and hex controls preserve independent translation color while linked", () => {
  assert.match(quickCreate, /type="color"/);
  assert.ok(quickCreate.includes('pattern="#[0-9A-Fa-f]{6}"'));
  assert.match(quickCreate, /HEX_COLOR\.test\(next\)/);
  const linked = { ...DEFAULT_TYPOGRAPHY, translationTextColor: "#112233", wordHighlightColor: "#abcdef", translationMatchHighlightColor: true };
  assert.equal(effectiveTranslationColor(linked), "#abcdef");
  assert.equal(effectiveTranslationColor({ ...linked, translationMatchHighlightColor: false }), "#112233");
});

test("style changes are visual-only and cannot restart preparation or recognition", () => {
  const start = quickCreate.indexOf("function updateTypography");
  const end = quickCreate.indexOf("const kind =", start);
  const styleHandlers = quickCreate.slice(start, end);
  assert.ok(styleHandlers.length > 0);
  assert.doesNotMatch(styleHandlers, /prepare\(|prepareLocalMedia|prepareRecognitionAudio|generateVideoCaptions|FastConformer/i);
  assert.equal((quickCreate.match(/prepareLocalMedia\(/g) ?? []).length, 1);
  assert.equal((quickCreate.match(/prepareRecognitionAudio\(/g) ?? []).length, 1);
});

test("Generate receives the exact preview presentation fields and all render paths consume them", () => {
  for (const field of ["positioning", "captionBackground: presentation.captionBackground", "typography", "transitionSettings", "captionEffects", "showVerseNumber"]) assert.match(quickCreate, new RegExp(field));
  assert.match(quickCreate, /videoDimOpacity\(captionEffects\)/);
  assert.match(composedPreview, /videoDimOpacity\(project\.captionEffects\)/);
  assert.match(offlineRenderer, /videoDimOpacity\(request\.captionEffects\)/);
  assert.match(editorWorkspace, /videoDimOpacity\(captionEffects\)/);
  assert.match(editorClient, /setCaptionEffects\(project\.captionEffects\)/);
  assert.match(editorClient, /setPositioning\(project\.positioning\)/);
  assert.match(editorClient, /value=\{positioning\.maxWidthPercent\}/);
  assert.match(videosDashboard, /positioning: card\.project\.positioning/);
  assert.match(composedPreview, /positioning=\{project\.positioning\}/);
  assert.match(exportConfig, /positioning: \{ \.\.\.input\.positioning \}/);
  assert.match(offlineRenderer, /drawExportCaptions\(context, request,/);
});

test("Create, editor, Watch, and export consume the same verse-number field", () => {
  assert.match(quickCreate, /const \{ positioning, typography, transitionSettings, captionEffects, showVerseNumber \} = presentation/);
  assert.match(editorClient, /DEFAULT_CAPTION_PRESENTATION\.showVerseNumber/);
  assert.match(editorClient, /showVerseNumber=\{showVerseNumber\}/);
  assert.match(composedPreview, /showVerseNumber=\{project\.showVerseNumber\}/);
  assert.match(exportConfig, /showVerseNumber: input\.showVerseNumber/);
});

test("the advanced editor keeps its original navigation and does not receive pre-generation panels", () => {
  assert.doesNotMatch(editorWorkspace, /PRE_GENERATION_PRESENTATION_SECTIONS|Caption customization sections/);
  assert.doesNotMatch(editorClient, /PRE_GENERATION_PRESENTATION_SECTIONS|DEFAULT_PRE_GENERATION_PRESENTATION_SECTION/);
  assert.match(editorWorkspace, /Inspector mode/);
  assert.match(editorWorkspace, /Settings/);
  assert.match(editorWorkspace, /Subtitles/);
  assert.deepEqual((editorWorkspace.match(/const EDITOR_FORMAT_PRESETS[^;]+/u)?.[0] ?? "").match(/vertical|square|landscape/gu), ["vertical", "square", "landscape"]);
});

test("dimming clamps to a safe compositing opacity", () => {
  assert.equal(videoDimOpacity({ videoDimLevel: 0 }), 0);
  assert.equal(videoDimOpacity({ videoDimLevel: 35 }), 0.35);
  assert.equal(videoDimOpacity({ videoDimLevel: 100 }), 1);
  assert.equal(videoDimOpacity({ videoDimLevel: 150 }), 1);
});
