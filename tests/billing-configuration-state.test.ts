import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { billingConfigurationState } from "../src/lib/billing/presentation.ts";

test("an unresolved billing status is loading rather than unconfigured", () => {
  assert.equal(billingConfigurationState(null), "loading");
});

test("the server-derived configured state prevents a hydration flash", () => {
  assert.equal(billingConfigurationState(null, true), "configured");
  assert.equal(billingConfigurationState({ configured: true }, false), "configured");
});

test("a verified unconfigured environment still renders as unconfigured", () => {
  assert.equal(billingConfigurationState(null, false), "unconfigured");
  assert.equal(billingConfigurationState({ configured: false }, true), "unconfigured");
});

test("a billing-status failure remains distinct from configuration", () => {
  assert.equal(billingConfigurationState(null, true, true), "error");
});

test("Billing UI renders the unconfigured copy only for the resolved unconfigured state", () => {
  const page = readFileSync(new URL("../src/app/billing/page.tsx", import.meta.url), "utf8");
  const plans = readFileSync(new URL("../src/components/billing-plans.tsx", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("../src/components/plan-comparison-dialog.tsx", import.meta.url), "utf8");
  assert.match(page, /<BillingPlans initialBillingConfigured=\{stripeCheckoutConfigured\(\)\}/);
  assert.match(plans, /billingConfiguration === "unconfigured"/);
  assert.match(plans, /billingConfiguration === "loading"/);
  assert.match(dialog, /billingConfiguration === "unconfigured"/);
  assert.match(dialog, /billingConfiguration === "loading"/);
  assert.doesNotMatch(plans, /billing\?\.configured \?\? false/);
  assert.doesNotMatch(dialog, /billing\?\.configured \?\? false/);
});

test("no Stripe secret or Price ID is serialized into Billing client components", () => {
  const page = readFileSync(new URL("../src/app/billing/page.tsx", import.meta.url), "utf8");
  const plans = readFileSync(new URL("../src/components/billing-plans.tsx", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("../src/components/plan-comparison-dialog.tsx", import.meta.url), "utf8");
  for (const source of [page, plans, dialog]) assert.doesNotMatch(source, /STRIPE_SECRET_KEY|STRIPE_.*PRICE_ID|sk_(?:test|live)_/);
});
