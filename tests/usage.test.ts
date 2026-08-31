import assert from "node:assert/strict";
import test from "node:test";
import { currentUsagePeriod } from "../src/lib/usage/period.ts";
import { canPerform, getPlanLimits, PLAN_LIMITS } from "../src/lib/usage/quota.ts";

test("monthly usage periods use UTC calendar boundaries", () => {
  const period = currentUsagePeriod(new Date("2026-08-31T23:59:00.000Z"));
  assert.equal(period.start.toISOString(), "2026-08-01T00:00:00.000Z");
  assert.equal(period.end.toISOString(), "2026-09-01T00:00:00.000Z");
  assert.equal(period.resetAt.toISOString(), period.end.toISOString());
});

test("plan limits are centralized and provisional plans are conservative", () => {
  assert.deepEqual(getPlanLimits("Free"), PLAN_LIMITS.Free);
  assert.equal(PLAN_LIMITS.Free.monthlyExports, null);
  assert.equal(PLAN_LIMITS.Creator.monthlyCloudProjectSaves, null);
});

test("quota results handle unlimited and finite boundary behavior", () => {
  assert.deepEqual(canPerform("export", "Free", { export: 999, cloud_project_save: 0 }), { allowed: true, currentUsage: 999, limit: null, resetAt: null, reason: "unlimited" });
  const limited = { ...PLAN_LIMITS.Free, monthlyExports: 2 };
  Object.assign(PLAN_LIMITS, { Free: limited });
  assert.equal(canPerform("export", "Free", { export: 1, cloud_project_save: 0 }).allowed, true);
  assert.equal(canPerform("export", "Free", { export: 2, cloud_project_save: 0 }).allowed, false);
  Object.assign(PLAN_LIMITS, { Free: { monthlyExports: null, monthlyCloudProjectSaves: null } });
});

test("usage event model does not accept media or project payloads in the client request", () => {
  const requestBody = { event_type: "export_completed", operation_id: "export-1" };
  assert.deepEqual(Object.keys(requestBody).sort(), ["event_type", "operation_id"]);
  assert.equal(JSON.stringify(requestBody).includes("video"), false);
  assert.equal(JSON.stringify(requestBody).includes("project"), false);
});
