import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { POST as checkout } from "../src/app/api/billing/checkout/route.ts";
import { POST as webhook } from "../src/app/api/stripe/webhook/route.ts";
import { customerIdForPortal, isEntitledSubscriptionStatus, paidPlanFromInput, planForPriceId, planFromSubscription } from "../src/lib/billing/server.ts";
import { getPlanEntitlements, resolveClientPlan } from "../src/lib/entitlements.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260831000001_create_subscriptions.sql", import.meta.url), "utf8");

test("unauthenticated checkout is rejected before any Stripe call", async () => {
  const response = await checkout(new Request("http://localhost/api/billing/checkout", { method: "POST", body: JSON.stringify({ plan: "Creator" }) }));
  assert.equal(response.status, 401);
});

test("checkout input is an allowlisted internal plan, never an arbitrary price id", () => {
  assert.equal(paidPlanFromInput("Creator"), "Creator");
  assert.equal(paidPlanFromInput("Pro"), "Pro");
  assert.equal(paidPlanFromInput("price_attacker_supplied"), null);
  assert.equal(paidPlanFromInput({ price: "price_attacker_supplied" }), null);
});

test("configured Stripe prices map only to their internal plans", () => {
  const previousCreator = process.env.STRIPE_CREATOR_PRICE_ID;
  const previousPro = process.env.STRIPE_PRO_PRICE_ID;
  process.env.STRIPE_CREATOR_PRICE_ID = "price_creator_test";
  process.env.STRIPE_PRO_PRICE_ID = "price_pro_test";
  try {
    assert.equal(planForPriceId("price_creator_test"), "Creator");
    assert.equal(planForPriceId("price_pro_test"), "Pro");
    assert.equal(planForPriceId("price_unknown"), null);
  } finally {
    if (previousCreator === undefined) delete process.env.STRIPE_CREATOR_PRICE_ID; else process.env.STRIPE_CREATOR_PRICE_ID = previousCreator;
    if (previousPro === undefined) delete process.env.STRIPE_PRO_PRICE_ID; else process.env.STRIPE_PRO_PRICE_ID = previousPro;
  }
});

test("only verified active or trialing subscriptions receive paid plans", () => {
  const previousCreator = process.env.STRIPE_CREATOR_PRICE_ID;
  process.env.STRIPE_CREATOR_PRICE_ID = "price_creator_test";
  try {
    assert.equal(planFromSubscription({ plan: "Creator", status: "active", stripe_price_id: "price_creator_test" }), "Creator");
    assert.equal(planFromSubscription({ plan: "Pro", status: "active", stripe_price_id: "price_creator_test" }), "Free");
    assert.equal(planFromSubscription({ plan: "Creator", status: "canceled", stripe_price_id: "price_creator_test" }), "Free");
    assert.equal(planFromSubscription({ plan: "Creator", status: "active", stripe_price_id: "price_unknown" }), "Free");
    assert.equal(getPlanEntitlements(planFromSubscription({ plan: "Creator", status: "active", stripe_price_id: "price_creator_test" })).maxExportResolution, "1080p");
    assert.equal(isEntitledSubscriptionStatus("past_due"), false);
    assert.equal(isEntitledSubscriptionStatus("trialing"), true);
  } finally {
    if (previousCreator === undefined) delete process.env.STRIPE_CREATOR_PRICE_ID; else process.env.STRIPE_CREATOR_PRICE_ID = previousCreator;
  }
});

test("customer portal gets only the server-resolved customer id", () => {
  assert.equal(customerIdForPortal({ stripe_customer_id: "cus_server_value" }), "cus_server_value");
  assert.throws(() => customerIdForPortal({ stripe_customer_id: null }), /No billing customer/);
});

test("production cannot use the development plan override", () => {
  const env = process.env as Record<string, string | undefined>;
  const previousNodeEnv = process.env.NODE_ENV;
  const previousOverride = process.env.NEXT_PUBLIC_DEV_PLAN_OVERRIDE;
  env.NODE_ENV = "production";
  process.env.NEXT_PUBLIC_DEV_PLAN_OVERRIDE = "Pro";
  try { assert.equal(resolveClientPlan(true), "Free"); }
  finally {
    if (previousNodeEnv === undefined) delete env.NODE_ENV; else env.NODE_ENV = previousNodeEnv;
    if (previousOverride === undefined) delete process.env.NEXT_PUBLIC_DEV_PLAN_OVERRIDE; else process.env.NEXT_PUBLIC_DEV_PLAN_OVERRIDE = previousOverride;
  }
});

test("subscription RLS is read-only to clients and downgrade preserves user work", () => {
  assert.match(migration, /for select using \(auth\.uid\(\) = user_id\)/);
  assert.doesNotMatch(migration, /subscriptions[\s\S]*for (insert|update|delete)/i);
  assert.doesNotMatch(migration, /delete from public\.projects/i);
  assert.match(migration, /event_id text primary key/);
});

test("malformed webhook signatures are rejected", async () => {
  const previousKey = process.env.STRIPE_SECRET_KEY;
  const previousSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_SECRET_KEY = "sk_test_billing_unit";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_billing_unit";
  try {
    const response = await webhook(new Request("http://localhost/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "t=1,v1=invalid" }, body: "{}" }));
    assert.equal(response.status, 400);
  } finally {
    if (previousKey === undefined) delete process.env.STRIPE_SECRET_KEY; else process.env.STRIPE_SECRET_KEY = previousKey;
    if (previousSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET; else process.env.STRIPE_WEBHOOK_SECRET = previousSecret;
  }
});
