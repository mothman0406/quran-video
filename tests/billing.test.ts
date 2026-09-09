import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { accountEntitlementsForPlan, authorizeExport, canExportQuality, defaultExportQualityForPlan, normalizePlan, watermarkRequiredForExport } from "../src/lib/entitlements.ts";
import { resolveAccountEntitlements } from "../src/lib/entitlements/server.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260908000002_account_entitlements.sql", import.meta.url), "utf8");

test("missing and unknown server plan records safely resolve Free", async () => {
  const missing = async () => null;
  const unknown = async () => "owner";
  assert.equal((await resolveAccountEntitlements("user-1", missing)).plan, "free");
  assert.equal((await resolveAccountEntitlements("user-1", unknown)).plan, "free");
  assert.equal(normalizePlan("premium"), "premium");
});

test("guest cannot start or authorize an export", () => {
  const entitlementsRoute = readFileSync(new URL("../src/app/api/entitlements/route.ts", import.meta.url), "utf8");
  const exportRoute = readFileSync(new URL("../src/app/api/export-authorization/route.ts", import.meta.url), "utf8");
  assert.match(entitlementsRoute, /if \(!user\).*status: 401/);
  assert.match(exportRoute, /if \(!user\).*status: 401/);
});

test("Free export policy permits only watermarked Basic", () => {
  const free = accountEntitlementsForPlan("free");
  assert.deepEqual(authorizeExport(free, "basic"), { allowed: true, entitlements: free, quality: "basic", watermarkRequired: true });
  assert.equal(authorizeExport(free, "standard").allowed, false);
  assert.equal(authorizeExport(free, "ultra").allowed, false);
  assert.equal(watermarkRequiredForExport(free, "basic"), true);
  assert.equal(watermarkRequiredForExport(free, "standard"), false);
});

test("Pro export policy allows unwatermarked Basic and Standard but blocks Ultra", () => {
  const pro = accountEntitlementsForPlan("pro");
  assert.deepEqual(authorizeExport(pro, "basic"), { allowed: true, entitlements: pro, quality: "basic", watermarkRequired: false });
  assert.deepEqual(authorizeExport(pro, "standard"), { allowed: true, entitlements: pro, quality: "standard", watermarkRequired: false });
  assert.equal(authorizeExport(pro, "ultra").allowed, false);
});

test("Premium export policy allows every unwatermarked quality", () => {
  const premium = accountEntitlementsForPlan("premium");
  for (const quality of ["basic", "standard", "ultra"] as const) {
    const authorization = authorizeExport(premium, quality);
    assert.equal(authorization.allowed, true);
    if (authorization.allowed) assert.equal(authorization.watermarkRequired, false);
  }
});

test("client inputs cannot claim a plan or disable Free watermark", () => {
  const free = accountEntitlementsForPlan("free");
  assert.equal(canExportQuality(free, "ultra"), false);
  assert.equal(authorizeExport(free, "standard").allowed, false);
  assert.equal(watermarkRequiredForExport(free, "basic"), true);
});

test("plan defaults and downgrade normalization remain exportable", () => {
  assert.equal(defaultExportQualityForPlan("free"), "basic");
  assert.equal(defaultExportQualityForPlan("pro"), "standard");
  assert.equal(defaultExportQualityForPlan("premium"), "standard");
  assert.equal(canExportQuality(accountEntitlementsForPlan("free"), "standard"), false);
});

test("canonical entitlement migration is read-only to ordinary users and keeps paid quotas TBD", () => {
  assert.match(migration, /plan in \('free', 'pro', 'premium'\)/);
  assert.match(migration, /revoke all on public\.account_entitlements from anon, authenticated/);
  assert.match(migration, /grant select on public\.account_entitlements to authenticated/);
  assert.doesNotMatch(migration, /grant (insert|update|delete)/i);
  assert.match(migration, /cloud_project_limit_for_current_user/);
  assert.match(migration, /then 3 else null/);
});

test("account and settings UI consume entitlement state rather than a hardcoded Free label", () => {
  const account = readFileSync(new URL("../src/components/account-panel.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../src/components/editor-workspace.tsx", import.meta.url), "utf8");
  assert.match(account, /entitlements\.plan/);
  assert.doesNotMatch(account, /Free plan/);
  assert.match(workspace, /Locked · Requires Pro/);
  assert.match(workspace, /Locked · Requires Premium/);
});
