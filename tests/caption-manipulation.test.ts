import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { captionPositioningFromPointer, CAPTION_MANIPULATION_WIDTH_MAX, CAPTION_MANIPULATION_WIDTH_MIN } from "../src/lib/editor/caption-manipulation.ts";
import { DEFAULT_CAPTION_POSITIONING, type CaptionPositioning } from "../src/lib/editor/captions.ts";
import { PROJECT_FORMATS } from "../src/lib/editor/formats.ts";

const preview = readFileSync(new URL("../src/components/caption-preview.tsx", import.meta.url), "utf8");
const quickCreate = readFileSync(new URL("../src/components/quick-create.tsx", import.meta.url), "utf8");
const editorClient = readFileSync(new URL("../src/components/editor-client.tsx", import.meta.url), "utf8");

const linked = (): CaptionPositioning => ({ ...DEFAULT_CAPTION_POSITIONING, x: 0.5, y: 0.52, translationX: 0.5, translationY: 0.64, translationPositionLinked: true, maxWidthPercent: 0.9, translationMaxWidthPercent: 0.9 });

test("caption width slider captures its value before the deferred state updater", () => {
  assert.match(quickCreate, /const width = Number\(event\.currentTarget\.value\) \/ 100; setPresentation\(\(current\) => presentationWithCaptionWidth\(current, width\)\)/);
  assert.doesNotMatch(quickCreate, /presentationWithCaptionWidth\(current, Number\(event\.currentTarget\.value\)/);
  assert.match(editorClient, /aria-label="Caption width"/);
});

test("linked selection box exposes all eight editor-only handles and pointer cleanup", () => {
  assert.match(preview, /\["left", "right", "top", "bottom", "top-left", "top-right", "bottom-left", "bottom-right"\]/);
  assert.match(preview, /caption-selection-box/);
  assert.match(preview, /onLostPointerCapture=\{onPointerUp\}/);
  assert.match(preview, /onPointerCancel=\{onPointerUp\}/);
});

test("dragging a linked block changes its normalized x/y while preserving its link", () => {
  const next = captionPositioningFromPointer({ positioning: linked(), mode: "drag", deltaX: 0.04, deltaY: -0.08, format: PROJECT_FORMATS.landscape, kind: "arabic" });
  assert.equal(next.x, 0.54);
  assert.equal(next.y, 0.44);
  assert.equal(next.translationPositionLinked, true);
  assert.equal(next.translationX, next.x);
});

test("side and corner resize are center-anchored width-only gestures with safe clamps", () => {
  const left = captionPositioningFromPointer({ positioning: linked(), mode: "resize", edge: "left", deltaX: 0.04, deltaY: 0.3, format: PROJECT_FORMATS.square, kind: "arabic" });
  assert.ok(Math.abs(left.maxWidthPercent - 0.82) < 1e-9);
  assert.equal(left.x, 0.5);
  assert.equal(left.y, 0.52);
  assert.equal(left.translationMaxWidthPercent, left.maxWidthPercent);
  const corner = captionPositioningFromPointer({ positioning: linked(), mode: "resize", edge: "bottom-right", deltaX: -0.3, deltaY: 0.4, format: PROJECT_FORMATS.square, kind: "arabic" });
  assert.equal(corner.maxWidthPercent, CAPTION_MANIPULATION_WIDTH_MIN);
  assert.equal(corner.y, 0.52);
  const widest = captionPositioningFromPointer({ positioning: linked(), mode: "resize", edge: "right", deltaX: 1, deltaY: 0, format: PROJECT_FORMATS.square, kind: "arabic" });
  assert.equal(widest.maxWidthPercent, CAPTION_MANIPULATION_WIDTH_MAX);
});

test("top and bottom handles move only the vertical anchor in every logical format", () => {
  for (const format of Object.values(PROJECT_FORMATS)) {
    const top = captionPositioningFromPointer({ positioning: linked(), mode: "resize", edge: "top", deltaX: 0.4, deltaY: 0.1, format, kind: "arabic" });
    const bottom = captionPositioningFromPointer({ positioning: linked(), mode: "resize", edge: "bottom", deltaX: -0.4, deltaY: -0.1, format, kind: "arabic" });
    assert.equal(top.maxWidthPercent, 0.9);
    assert.equal(bottom.maxWidthPercent, 0.9);
    assert.ok(top.y > 0.52);
    assert.ok(bottom.y < 0.52);
  }
});

test("invalid legacy width cannot poison positioning with NaN", () => {
  const next = captionPositioningFromPointer({ positioning: { ...linked(), maxWidthPercent: Number.NaN }, mode: "resize", edge: "right", deltaX: 0, deltaY: 0, format: PROJECT_FORMATS.vertical, kind: "arabic" });
  assert.ok(Number.isFinite(next.maxWidthPercent));
  assert.ok(Number.isFinite(next.x));
  assert.ok(Number.isFinite(next.y));
});
