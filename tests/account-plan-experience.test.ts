import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const account = readFileSync(new URL("../src/components/account-panel.tsx", import.meta.url), "utf8");
const plans = readFileSync(new URL("../src/components/plan-comparison-dialog.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/editor-workspace.tsx", import.meta.url), "utf8");

test("account menu derives its tier and Free cloud usage from authoritative account data", () => {
  assert.match(account, /entitlements\.plan/);
  assert.match(account, /entitlements\.cloudProjectLimit/);
  assert.match(account, /listCloudProjectRecords\(\)/);
  assert.match(account, /720p exports/);
  assert.match(account, /Watermark on exports/);
  assert.match(account, /Up to 1080p/);
  assert.match(account, /Up to 4K/);
  assert.match(account, /Upgrade plan/);
  assert.match(account, /Manage plan/);
  assert.doesNotMatch(account, /setEntitlements|onPlanChange|plan selector/i);
});

test("the reusable comparison marks the active tier, shows launch pricing, and does not invent paid quotas", () => {
  assert.match(plans, /Current plan/);
  assert.match(plans, /monthly: 9\.99/);
  assert.match(plans, /monthly: 19\.99/);
  assert.match(plans, /Yearly/);
  assert.match(plans, /Upgrade to \$\{detail\.name\}/);
  assert.match(plans, /Manage plan/);
  assert.match(plans, /Plan capability comparison/);
  assert.match(plans, /\$8\.25 \/ month/);
  assert.match(plans, /\$16\.58 \/ month/);
  assert.doesNotMatch(plans, /TBD/);
  assert.doesNotMatch(plans, /unlimited/i);
  assert.doesNotMatch(plans, /Upgrade available soon/);
});

test("account navigation, sign out, Escape, and locked export upgrade use the shared account surfaces", () => {
  assert.match(account, /href="\/projects"/);
  assert.match(account, /Billing &amp; plans/);
  assert.match(account, /signOut\(\)/);
  assert.match(account, /event\.key === "Escape"/);
  assert.match(workspace, /editor-export-upgrade/);
  assert.match(workspace, /<PlanComparisonDialog/);
  assert.match(workspace, /pointerdown/);
});
