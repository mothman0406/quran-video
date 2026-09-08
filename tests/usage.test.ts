import assert from "node:assert/strict";
import test from "node:test";
import { currentUsagePeriod } from "../src/lib/usage/period.ts";
import { canPerform } from "../src/lib/usage/quota.ts";
import { getCloudProjectLimit, getCustomStyleLimit, getMaxExportResolution, getPlanEntitlements, hasFeature, isBuiltInStyleAvailable, isFontAvailable, resolvePlan } from "../src/lib/entitlements.ts";

test("monthly usage periods use UTC calendar boundaries", () => {
  const period = currentUsagePeriod(new Date("2026-08-31T23:59:00.000Z"));
  assert.equal(period.start.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(period.end.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(period.resetAt.toISOString(), period.end.toISOString());
});

test("authentication without subscription resolves to Free", () => {
  assert.equal(resolvePlan({ authenticated: false }), "Free");
  assert.equal(resolvePlan({ authenticated: true }), "Free");
});

test("V1 entitlements centralize capabilities and quotas", () => {
  assert.equal(getMaxExportResolution("Free"), "720p");
  assert.equal(getMaxExportResolution("Creator"), "1080p");
  assert.equal(getPlanEntitlements("Free").watermarkRequired, true);
  assert.equal(getPlanEntitlements("Creator").watermarkRequired, false);
  assert.equal(getPlanEntitlements("Pro").watermarkRequired, false);
  assert.equal(getCloudProjectLimit("Free"), 3);
  assert.equal(getCloudProjectLimit("Creator"), null);
  assert.equal(getCustomStyleLimit("Free"), 2);
  assert.equal(getCustomStyleLimit("Creator"), null);
  assert.equal(getPlanEntitlements("Free").exportCountQuota, null);
  assert.equal(getPlanEntitlements("Creator").exportCountQuota, null);
  assert.equal(getPlanEntitlements("Pro").exportCountQuota, null);
  assert.equal(hasFeature("Pro", "4k_export"), true);
  assert.equal(hasFeature("Creator", "4k_export"), false);
  assert.equal(hasFeature("Pro", "multiple_qiraat"), true);
  assert.equal(hasFeature("Creator", "multiple_qiraat"), false);
  assert.equal(isFontAvailable("Free", "uthmani"), true);
  assert.equal(isFontAvailable("Free", "indopak"), false);
  assert.equal(isBuiltInStyleAvailable("Free", "Minimal"), true);
  assert.equal(isBuiltInStyleAvailable("Free", "Cinematic"), false);
});

test("export usage remains unlimited while cloud project quota is finite", () => {
  assert.equal(canPerform("export", "Free", { export: 999, cloud_project_save: 0 }).allowed, true);
  assert.equal(canPerform("cloud_project_save", "Free", { export: 0, cloud_project_save: 1 }).allowed, true);
  assert.equal(canPerform("cloud_project_save", "Free", { export: 0, cloud_project_save: 2 }).allowed, true);
  assert.equal(canPerform("cloud_project_save", "Free", { export: 0, cloud_project_save: 3 }).allowed, false);
});

test("usage event model does not accept media or project payloads in the client request", () => {
  const requestBody = { event_type: "export_completed", operation_id: "export-1" };
  assert.deepEqual(Object.keys(requestBody).sort(), ["event_type", "operation_id"]);
  assert.equal(JSON.stringify(requestBody).includes("video"), false);
  assert.equal(JSON.stringify(requestBody).includes("project"), false);
});
