import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SUPABASE_JWT_CLOCK_SKEW_RETRY_DELAY_MS, retrySupabaseJwtClockSkew } from "../src/lib/supabase/clock-skew.ts";

const timingRejection = { code: "PGRST303", message: "JWT issued at future" };

test("a valid Supabase-authenticated read succeeds without a retry", async () => {
  let calls = 0;
  const value = await retrySupabaseJwtClockSkew(async () => { calls += 1; return "verified"; }, async () => { throw new Error("should not wait"); });
  assert.equal(value, "verified");
  assert.equal(calls, 1);
});

test("a small transient future-iat rejection is retried once after the bounded delay", async () => {
  let calls = 0;
  const waits: number[] = [];
  const value = await retrySupabaseJwtClockSkew(async () => {
    calls += 1;
    if (calls === 1) throw timingRejection;
    return "verified";
  }, async (milliseconds) => { waits.push(milliseconds); });
  assert.equal(value, "verified");
  assert.equal(calls, 2);
  assert.deepEqual(waits, [SUPABASE_JWT_CLOCK_SKEW_RETRY_DELAY_MS]);
});

test("a timing rejection that persists beyond the one retry remains rejected", async () => {
  let calls = 0;
  await assert.rejects(
    () => retrySupabaseJwtClockSkew(async () => { calls += 1; throw timingRejection; }, async () => undefined),
    (error: unknown) => error === timingRejection,
  );
  assert.equal(calls, 2);
});

test("expired and invalid-signature rejections are never retried", async () => {
  for (const rejection of [{ code: "PGRST301", message: "JWT expired" }, { code: "PGRST301", message: "JWT signature is invalid" }]) {
    let calls = 0;
    await assert.rejects(
      () => retrySupabaseJwtClockSkew(async () => { calls += 1; throw rejection; }, async () => { throw new Error("should not wait"); }),
      (error: unknown) => error === rejection,
    );
    assert.equal(calls, 1);
  }
});

test("Account reads retry the Data API timing failure while server authorization remains auth.getUser", () => {
  const cloudSync = readFileSync(new URL("../src/lib/cloud-sync.ts", import.meta.url), "utf8");
  const entitlements = readFileSync(new URL("../src/lib/entitlements/server.ts", import.meta.url), "utf8");
  const billing = readFileSync(new URL("../src/lib/billing/server.ts", import.meta.url), "utf8");
  assert.match(cloudSync, /retrySupabaseJwtClockSkew\(\(\) => requireClient\(\)\.rpc\("cloud_project_storage_summary"\)\)/);
  assert.match(cloudSync, /retrySupabaseJwtClockSkew\(\(\) => requireClient\(\)\.from\("projects"\)/);
  assert.match(entitlements, /authClient\.auth\.getUser\(token\)/);
  assert.match(entitlements, /retrySupabaseJwtClockSkew\(\(\) => entitlementAdminClient\(\)\.from\("account_entitlements"\)/);
  assert.match(billing, /retrySupabaseJwtClockSkew\(\(\) => admin\.from\("billing_customers"\)/);
  assert.match(billing, /retrySupabaseJwtClockSkew\(\(\) => admin\.from\("billing_subscriptions"\)/);
});

test("the retry helper neither logs nor includes token material in its error handling", () => {
  const helper = readFileSync(new URL("../src/lib/supabase/clock-skew.ts", import.meta.url), "utf8");
  assert.doesNotMatch(helper, /console\.|access_token|refresh_token|raw JWT|Bearer/i);
  assert.match(helper, /candidate\.code === "PGRST303" && candidate\.message === "JWT issued at future"/);
});
