import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CAPTION_BACKGROUND, DEFAULT_CAPTION_POSITIONING, DEFAULT_TRANSITION_SETTINGS, DEFAULT_TYPOGRAPHY, type CaptionSegment } from "../src/lib/editor/captions.ts";
import { captionStyleFromState, clearCaptionLayerStyleOverrides, patchCaptionLayerStyleOverrides, resolveCaptionLayerStyle } from "../src/lib/editor/styles.ts";
import { hasSelectedCaptionInspector, rightInspectorModeForSelection, selectCaptionLayer, selectTimelineCaption } from "../src/lib/editor/selection.ts";
import { CaptionStyleOverridesSchema } from "../src/lib/schemas/project.ts";

const segment = (id: string, contentKind: "ayah" | "basmalah-prelude" = "ayah"): CaptionSegment => ({
  id,
  contentKind,
  verseKeys: contentKind === "ayah" ? ["74:5"] : [],
  startMs: 1_000,
  endMs: 2_000,
  arabic: "سَأُرْهِقُهُ صَعُودًا",
  translation: "I will cover him with arduous torment.",
  transliteration: null,
  wordStart: 1,
  wordEnd: 2,
  wordCount: 2,
  timingEvidence: { start: { timestampMs: 1_000, source: "fastconformer" }, end: { timestampMs: 2_000, source: "fastconformer" }, derived: false },
});

test("timeline and canvas selection produce a complete inspector for the exact segment", () => {
  const firstPiece = segment("74:5-piece-1");
  const secondPiece = segment("74:5-piece-2");
  const timeline = selectTimelineCaption(secondPiece);
  assert.deepEqual(timeline, { selectedCaptionSegmentId: "74:5-piece-2", selectedCaptionLayer: "arabic" });
  assert.equal(hasSelectedCaptionInspector(timeline, [firstPiece, secondPiece]), true);
  assert.deepEqual(selectCaptionLayer(secondPiece, "arabic"), timeline);
  assert.deepEqual(selectCaptionLayer(firstPiece, "translation"), { selectedCaptionSegmentId: "74:5-piece-1", selectedCaptionLayer: "translation" });
  assert.equal(hasSelectedCaptionInspector(selectTimelineCaption(segment("basmalah", "basmalah-prelude")), [segment("basmalah", "basmalah-prelude")]), true);
});

test("editor selection context chooses an inspector mode without changing caption selection", () => {
  const selected = selectCaptionLayer(segment("55:4"), "translation");
  assert.equal(rightInspectorModeForSelection("caption"), "subtitles");
  assert.equal(rightInspectorModeForSelection("editor-object"), "settings");
  // Toggling is UI state only: selection remains the exact segment/layer.
  assert.deepEqual(selected, { selectedCaptionSegmentId: "55:4", selectedCaptionLayer: "translation" });
  assert.equal(rightInspectorModeForSelection("caption"), "subtitles");
  assert.equal(rightInspectorModeForSelection("editor-object"), "settings");
});

test("layer overrides are property-level, inherit global changes, and reset safely", () => {
  const global = captionStyleFromState(DEFAULT_TYPOGRAPHY, DEFAULT_CAPTION_POSITIONING, DEFAULT_CAPTION_BACKGROUND, DEFAULT_TRANSITION_SETTINGS);
  const overrides = patchCaptionLayerStyleOverrides(undefined, "arabic", { typography: { textColor: "#d4af37" } });
  assert.deepEqual(overrides.arabic?.typography, { textColor: "#d4af37" });
  assert.deepEqual(CaptionStyleOverridesSchema.parse(overrides).arabic?.typography, { textColor: "#d4af37" });
  const inherited = resolveCaptionLayerStyle({ ...global, typography: { ...global.typography, arabicFontSize: 44 } }, overrides, "arabic");
  assert.equal(inherited.typography.arabicFontSize, 44);
  assert.equal(inherited.typography.textColor, "#d4af37");
  assert.equal(resolveCaptionLayerStyle(global, overrides, "translation").typography.translationFontSize, global.typography.translationFontSize);
  assert.equal(clearCaptionLayerStyleOverrides(overrides, "arabic"), undefined);
});

test("highlight intensity can inherit globally or override just one Arabic segment", () => {
  const global = captionStyleFromState({ ...DEFAULT_TYPOGRAPHY, wordHighlightIntensity: 0.85 }, DEFAULT_CAPTION_POSITIONING, DEFAULT_CAPTION_BACKGROUND, DEFAULT_TRANSITION_SETTINGS);
  const overrides = patchCaptionLayerStyleOverrides(undefined, "arabic", { typography: { wordHighlightIntensity: 0.35 } });
  assert.deepEqual(overrides.arabic?.typography, { wordHighlightIntensity: 0.35 });
  assert.equal(resolveCaptionLayerStyle(global, overrides, "arabic").typography.wordHighlightIntensity, 0.35);
  assert.equal(resolveCaptionLayerStyle(global, undefined, "arabic").typography.wordHighlightIntensity, 0.85);
});
