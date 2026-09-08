import assert from "node:assert/strict";
import test from "node:test";
import { WORKSPACE_LAYOUT_DEFAULTS, clampWorkspacePanelWidth, clampWorkspaceTimelineHeight, workspaceCenterRect } from "../src/lib/editor/workspace-layout.ts";

test("the timeline's horizontal region is only the center workspace", () => {
  const center = workspaceCenterRect(1_440, 360, 420, false, false);
  assert.deepEqual(center, { left: 370, width: 640, right: 1_010 });
  assert.ok(center.left > 360, "the left sidebar is outside the timeline");
  assert.ok(1_440 - center.right > 420, "the right inspector is outside the timeline");
});

test("collapsed rails enlarge the center without discarding remembered widths", () => {
  const expanded = workspaceCenterRect(1_440, 470, 520, false, false);
  const collapsed = workspaceCenterRect(1_440, 470, 520, true, true);
  assert.equal(expanded.width, 430);
  assert.equal(collapsed.width, 1_360);
  assert.equal(WORKSPACE_LAYOUT_DEFAULTS.leftPanelWidth, 238, "panel widths are independent UI values, not collapse state");
});

test("side panel resizing preserves a usable center at desktop widths", () => {
  assert.equal(clampWorkspacePanelWidth("left", 900, 1_280, 600, false), 240);
  assert.equal(clampWorkspacePanelWidth("right", 900, 1_280, 500, false), 340);
  assert.equal(clampWorkspacePanelWidth("left", 100, 1_440, 286, false), 220);
  assert.equal(clampWorkspacePanelWidth("right", 100, 1_440, 238, false), 280);
  assert.equal(clampWorkspacePanelWidth("right", 600, 1_440, 238, true), 600);
});

test("timeline resizing is continuous and preserves preview room", () => {
  assert.equal(clampWorkspaceTimelineHeight(390, 900), 390);
  assert.equal(clampWorkspaceTimelineHeight(10, 900), 180);
  assert.equal(clampWorkspaceTimelineHeight(2_000, 768), 618);
});
