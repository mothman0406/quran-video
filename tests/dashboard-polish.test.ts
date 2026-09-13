import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync(new URL("../src/components/dashboard-shell.tsx", import.meta.url), "utf8");
const videos = readFileSync(new URL("../src/components/videos-dashboard.tsx", import.meta.url), "utf8");
const billing = readFileSync(new URL("../src/components/billing-plans.tsx", import.meta.url), "utf8");
const account = readFileSync(new URL("../src/components/account-settings.tsx", import.meta.url), "utf8");
const billingPage = readFileSync(new URL("../src/app/billing/page.tsx", import.meta.url), "utf8");

test("dashboard navigation reaches videos, billing, settings, and quick create", () => {
  assert.match(shell, /href="\/create"/);
  assert.match(shell, /Upload recitation/);
  assert.match(shell, /href="\/videos"/);
  assert.match(shell, /href="\/billing"/);
  assert.match(shell, /href="\/account"/);
  assert.match(videos, /<DashboardShell current="videos">/);
  assert.match(account, /<DashboardShell current="account">/);
  assert.match(billingPage, /<DashboardShell current="billing">/);
});

test("videos show a factual Free saved count without invented paid storage limits", () => {
  assert.match(videos, /of 3 saved videos/);
  assert.doesNotMatch(videos, /paid storage quota to be announced|paid video limit/i);
});

test("billing presents exact monthly and yearly prices and retains existing Stripe actions", () => {
  assert.match(billing, /\$9\.99/);
  assert.match(billing, /\$19\.99/);
  assert.match(billing, /\$8\.25/);
  assert.match(billing, /billed \{plan === "pro" \? "\$99" : "\$199"\} yearly/);
  assert.match(billing, /\$16\.58/);
  assert.match(billing, /startCheckout\(session, plan, interval\)/);
  assert.match(billing, /openCustomerPortal\(session\)/);
  assert.match(billing, /openSubscriptionUpdatePortal\(session\)/);
  assert.match(billing, /plan === entitlements\.plan/);
});

test("billing FAQ and account settings retain factual privacy, legal, and deletion routes", () => {
  assert.match(billing, /Is there a free plan\?/);
  assert.match(billing, /Does Quran AutoCaption upload my recitation\?/);
  assert.match(billing, /Payments and subscription management are handled through Stripe/);
  assert.match(billing, /Keep 3 recent saved videos/);
  assert.doesNotMatch(billing, /unlimited (videos|storage)/i);
  assert.match(account, /href="\/privacy"/);
  assert.match(account, /href="\/terms"/);
  assert.match(account, /Permanently delete account/);
});
