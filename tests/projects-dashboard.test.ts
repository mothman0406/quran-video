import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("../src/components/projects-dashboard.tsx", import.meta.url), "utf8");

test("projects dashboard gates guests, reads private project records, and supports search", () => {
  assert.match(dashboard, /getAuthSession\(\)/);
  assert.match(dashboard, /authReturnPath="\/projects"/);
  assert.match(dashboard, /listCloudProjectRecords\(\)/);
  assert.match(dashboard, /getPrivateThumbnailUrl/);
  assert.match(dashboard, /Search projects/);
});

test("project cards open editor documents rather than implying cloud export downloads", () => {
  assert.match(dashboard, /\/editor\?project=/);
  assert.match(dashboard, /Open project/);
  assert.doesNotMatch(dashboard, /Download export/);
});

test("undetected projects remain visible with an explicit recovery-safe label", () => {
  assert.match(dashboard, /Passage not detected yet/);
});
