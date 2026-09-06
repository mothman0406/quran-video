import assert from "node:assert/strict";
import test from "node:test";
import { CaptionStyleSchema } from "../src/lib/schemas/project.ts";
import { DEFAULT_CAPTION_BACKGROUND, DEFAULT_CAPTION_POSITIONING, DEFAULT_TRANSITION_SETTINGS, DEFAULT_TYPOGRAPHY } from "../src/lib/editor/captions.ts";
import { BUILT_IN_STYLES, captionStyleFromState, captionStyleToState, deleteLocalStyle, loadLocalStyles, renameLocalStyle, saveLocalStyle } from "../src/lib/editor/styles.ts";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

test("built-in preset application returns editable styling state", () => {
  const preset = BUILT_IN_STYLES.Cinematic;
  const applied = captionStyleToState(preset);
  assert.equal(applied.transitionSettings.fadeInMs, 350);
  assert.equal(applied.captionBackground.enabled, true);
  assert.equal(applied.positioning.y, 0.68);
  assert.notEqual(applied, preset);
  applied.typography.arabicFontSize = 51;
  assert.equal(preset.typography.arabicFontSize, 46);
  assert.deepEqual(CaptionStyleSchema.parse(preset), preset);
});

test("style snapshots contain styling only and local styles save, load, rename, and delete", () => {
  const storage = memoryStorage();
  const current = captionStyleFromState(DEFAULT_TYPOGRAPHY, DEFAULT_CAPTION_POSITIONING, DEFAULT_CAPTION_BACKGROUND, DEFAULT_TRANSITION_SETTINGS);
  const saved = saveLocalStyle("Evening", current, storage);
  assert.equal(saved.length, 1);
  const raw = JSON.parse(storage.getItem("quran-video:caption-styles:v1") ?? "[]") as Array<Record<string, unknown>>;
  assert.equal("sourceVideo" in raw[0], false);
  assert.equal("video" in raw[0], false);
  assert.deepEqual(loadLocalStyles(storage), saved);
  const renamed = renameLocalStyle(saved[0].id, "Night", storage);
  assert.equal(renamed[0].name, "Night");
  const deleted = deleteLocalStyle(saved[0].id, storage);
  assert.deepEqual(deleted, []);
  assert.deepEqual(loadLocalStyles(storage), []);
});

test("legacy caption styles without an Arabic text color fall back to the existing default", () => {
  const legacy = captionStyleFromState(DEFAULT_TYPOGRAPHY, DEFAULT_CAPTION_POSITIONING, DEFAULT_CAPTION_BACKGROUND, DEFAULT_TRANSITION_SETTINGS);
  const typographyWithoutColor = Object.fromEntries(Object.entries(legacy.typography).filter(([key]) => key !== "textColor"));
  const migrated = CaptionStyleSchema.parse({ ...legacy, typography: typographyWithoutColor });
  assert.equal(migrated.typography.textColor, "#ffffff");
});
