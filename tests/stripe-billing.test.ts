import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { User } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { assertStripePricesMatchEnvironment, effectivePlanForSubscription, getOrCreateCustomer, hasPaidSubscription, logCheckoutFailure, planForPriceId, priceIdForPlan, safeApplicationOrigin, subscriptionUpdateTarget } from "../src/lib/billing/server.ts";

const prices: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  STRIPE_SECRET_KEY: "sk_test_unit",
  STRIPE_PRO_MONTHLY_PRICE_ID: "price_pro_month",
  STRIPE_PRO_ANNUAL_PRICE_ID: "price_pro_year",
  STRIPE_PREMIUM_MONTHLY_PRICE_ID: "price_premium_month",
  STRIPE_PREMIUM_ANNUAL_PRICE_ID: "price_premium_year",
};
const checkoutRoute = readFileSync(new URL("../src/app/api/billing/checkout/route.ts", import.meta.url), "utf8");
const portalRoute = readFileSync(new URL("../src/app/api/billing/portal/route.ts", import.meta.url), "utf8");
const portalUpgradeRoute = readFileSync(new URL("../src/app/api/billing/portal/upgrade/route.ts", import.meta.url), "utf8");
const webhookRoute = readFileSync(new URL("../src/app/api/stripe/webhook/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../supabase/migrations/20260909000000_stripe_subscription_billing.sql", import.meta.url), "utf8");

test("only the four configured app plan/interval pairs map to Stripe Prices", () => {
  assert.equal(priceIdForPlan("pro", "month", prices), "price_pro_month");
  assert.equal(priceIdForPlan("pro", "year", prices), "price_pro_year");
  assert.equal(priceIdForPlan("premium", "month", prices), "price_premium_month");
  assert.equal(priceIdForPlan("premium", "year", prices), "price_premium_year");
  assert.deepEqual(planForPriceId("price_pro_year", prices), { plan: "pro", interval: "year" });
  assert.deepEqual(planForPriceId("price_premium_month", prices), { plan: "premium", interval: "month" });
  assert.equal(planForPriceId("price_attacker", prices), null);
});

test("only known active/trialing Stripe subscriptions can change the effective plan", () => {
  assert.equal(effectivePlanForSubscription("active", "price_pro_month", prices), "pro");
  assert.equal(effectivePlanForSubscription("trialing", "price_premium_year", prices), "premium");
  for (const status of ["past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"]) assert.equal(effectivePlanForSubscription(status, "price_pro_month", prices), "free");
  assert.equal(effectivePlanForSubscription("active", "price_unknown", prices), "free");
  assert.equal(hasPaidSubscription({ user_id: "user", stripe_customer_id: "cus", stripe_subscription_id: "sub", stripe_price_id: "price_unknown", plan: "pro", billing_interval: "month", status: "active", current_period_end: null, cancel_at_period_end: false }), false);
});

test("Checkout customer mappings are never reused across Stripe environments", async () => {
  const user = { id: "user-1", email: "member@example.com", user_metadata: { full_name: "Member" } } as unknown as User;
  const mappings = new Map([["live", { user_id: user.id, stripe_customer_id: "cus_live", billing_environment: "live" }]]);
  const created: string[] = [];
  const admin = { from: (table: string) => ({
    select: () => ({ eq: (_column: string, userId: string) => ({ eq: (_environmentColumn: string, environment: string) => ({ maybeSingle: async () => ({ data: table === "billing_customers" && userId === user.id ? mappings.get(environment) ?? null : null, error: null }) }) }) }),
    upsert: async (value: { stripe_customer_id: string; billing_environment: string }) => { mappings.set(value.billing_environment, { user_id: user.id, ...value }); return { error: null }; },
  }) } as never;
  const stripe = { customers: { create: async () => { const id = `cus_${created.length + 1}`; created.push(id); return { id }; } } } as unknown as Stripe;
  assert.equal(await getOrCreateCustomer(user, { admin, stripe, billingEnvironment: "sandbox" }), "cus_1");
  assert.equal(await getOrCreateCustomer(user, { admin, stripe, billingEnvironment: "live" }), "cus_live");
  assert.equal(await getOrCreateCustomer(user, { admin, stripe, billingEnvironment: "sandbox" }), "cus_1");
  assert.deepEqual(created, ["cus_1"]);
});

test("configured live Prices are verified as live before Checkout", async () => {
  const livePrices: NodeJS.ProcessEnv = { ...prices, NODE_ENV: "production", STRIPE_BILLING_ENV: "live", STRIPE_SECRET_KEY: "sk_live_unit" };
  const stripe = { prices: { retrieve: async () => ({ livemode: true }) } } as unknown as Stripe;
  await assert.doesNotReject(assertStripePricesMatchEnvironment(stripe, livePrices));
  const mixedStripe = { prices: { retrieve: async () => ({ livemode: false }) } } as unknown as Stripe;
  await assert.rejects(assertStripePricesMatchEnvironment(mixedStripe, livePrices), /Price IDs do not match/);
});

test("Checkout failures leave entitlements untouched and log only safe Stripe diagnostics", () => {
  const entries: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { entries.push(args); };
  try {
    logCheckoutFailure({ type: "invalid_request_error", code: "resource_missing", statusCode: 400, requestId: "req_123", message: "sk_live_should_not_appear", secret: "whsec_should_not_appear" }, { billingEnvironment: "live", customerMappingExisted: true });
  } finally {
    console.error = original;
  }
  assert.deepEqual(entries, [["Stripe Checkout creation failed.", { stripeErrorType: "invalid_request_error", stripeErrorCode: "resource_missing", httpStatus: 400, stripeRequestId: "req_123", billingEnvironment: "live", customerMappingExisted: true }]]);
  assert.match(checkoutRoute, /Checkout is temporarily unavailable\. Your plan has not changed\./);
  assert.doesNotMatch(checkoutRoute, /account_entitlements|syncStripeSubscription|error\.message/);
});

test("routes enforce authentication, server allowlists, portal ownership, and signed webhook processing", () => {
  assert.match(checkoutRoute, /if \(!user\).*status: 401/);
  assert.match(checkoutRoute, /isPaidPlan\(body\.plan\).*isBillingInterval\(body\.interval\)/);
  assert.doesNotMatch(checkoutRoute, /body\.price|price_id/i);
  assert.match(checkoutRoute, /hasPaidSubscription/);
  assert.match(portalRoute, /getBillingCustomer\(user\.id\)/);
  assert.match(portalUpgradeRoute, /getBillingCustomer\(user\.id\)/);
  assert.match(portalUpgradeRoute, /getBillingSubscription\(user\.id\)/);
  assert.match(portalUpgradeRoute, /flow_data: \{ type: "subscription_update", subscription_update: \{ subscription: subscriptionId \} \}/);
  assert.doesNotMatch(portalUpgradeRoute, /request\.json/);
  assert.match(webhookRoute, /constructEvent\(await request\.text\(\), signature, secret\)/);
  assert.match(webhookRoute, /claimWebhookEvent/);
  assert.match(webhookRoute, /finishWebhookEvent/);
});

test("only the authenticated account's mapped paid subscription can enter the update flow", () => {
  const paid = { user_id: "user-a", stripe_customer_id: "cus_a", stripe_subscription_id: "sub_a", stripe_price_id: "price_pro_month", plan: "pro" as const, billing_interval: "month" as const, status: "active", current_period_end: null, cancel_at_period_end: false };
  assert.equal(subscriptionUpdateTarget(paid, { user_id: "user-a", stripe_customer_id: "cus_a", billing_environment: "sandbox" }, prices), "sub_a");
  assert.equal(subscriptionUpdateTarget(paid, { user_id: "user-b", stripe_customer_id: "cus_a", billing_environment: "sandbox" }, prices), null);
  assert.equal(subscriptionUpdateTarget(paid, { user_id: "user-a", stripe_customer_id: "cus_b", billing_environment: "sandbox" }, prices), null);
  assert.equal(subscriptionUpdateTarget({ ...paid, status: "past_due" }, { user_id: "user-a", stripe_customer_id: "cus_a", billing_environment: "sandbox" }, prices), null);
});

test("the client uses Checkout only from Free and refreshes an update after its webhook projection", () => {
  const plans = readFileSync(new URL("../src/components/plan-comparison-dialog.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../src/components/editor-workspace.tsx", import.meta.url), "utf8");
  assert.match(plans, /entitlements\.plan === "pro" && plan === "premium"/);
  assert.match(plans, /openSubscriptionUpdatePortal\(session\)/);
  assert.match(plans, /entitlements\.plan === "free" && plan !== "free"/);
  assert.match(plans, /billingReturn !== "plan-update" \|\| next\.plan === "premium"/);
  assert.match(workspace, /billing === "plan-update"/);
});

test("billing migration is server-write-only and records webhook work only after processing", () => {
  assert.match(migration, /create table if not exists public\.billing_customers/);
  assert.match(migration, /create table if not exists public\.billing_subscriptions/);
  assert.match(migration, /rename column event_id to stripe_event_id/);
  assert.match(migration, /revoke all on public\.billing_customers from anon, authenticated/);
  assert.match(migration, /revoke all on public\.billing_subscriptions from anon, authenticated/);
  assert.match(migration, /status = 'processed'/);
  assert.match(migration, /grant execute on function public\.claim_stripe_webhook_event\(text, text\) to service_role/);
});

test("historical customer mappings are marked sandbox and only same-mode rows are reusable", () => {
  const customerEnvironmentMigration = readFileSync(new URL("../supabase/migrations/20260909000002_billing_customer_environment.sql", import.meta.url), "utf8");
  assert.match(customerEnvironmentMigration, /set billing_environment = 'sandbox'/);
  assert.match(customerEnvironmentMigration, /billing_environment in \('sandbox', 'live'\)/);
  assert.match(checkoutRoute, /getBillingCustomer\(user\.id\)/);
  assert.match(checkoutRoute, /customerMapping\?\.stripe_customer_id/);
});

test("return URLs are fixed to the configured application origin", () => {
  const mutableEnv = process.env as Record<string, string | undefined>;
  const previous = mutableEnv.NEXT_PUBLIC_APP_URL;
  mutableEnv.NEXT_PUBLIC_APP_URL = "https://quran.video";
  assert.equal(safeApplicationOrigin(new Request("https://attacker.example/api/billing/checkout")), "https://quran.video");
  mutableEnv.NEXT_PUBLIC_APP_URL = "https://quran.video/unsafe-path";
  assert.equal(safeApplicationOrigin(new Request("https://quran.video/api/billing/checkout")), null);
  if (previous === undefined) delete mutableEnv.NEXT_PUBLIC_APP_URL; else mutableEnv.NEXT_PUBLIC_APP_URL = previous;
});
