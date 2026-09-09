import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { applicationOrigin, authCallbackUrl } from "../src/lib/application-url.ts";
import { formatRuntimeConfigurationIssues, runtimeConfigurationIssues } from "../src/lib/runtime-config.ts";
import { stripeCheckoutConfigured, stripeEnvironmentIsSafe } from "../src/lib/billing/server.ts";

const workspace = readFileSync(new URL("../src/components/editor-workspace.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/app/editor/page.tsx", import.meta.url), "utf8");
const cloud = readFileSync(new URL("../src/lib/cloud-sync.ts", import.meta.url), "utf8");
const billingServer = readFileSync(new URL("../src/lib/billing/server.ts", import.meta.url), "utf8");
const entitlementServer = readFileSync(new URL("../src/lib/entitlements/server.ts", import.meta.url), "utf8");
const webhook = readFileSync(new URL("../src/app/api/stripe/webhook/route.ts", import.meta.url), "utf8");
const nextConfig = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");

test("canonical app URLs retain localhost development and reject unsafe production values", () => {
  assert.equal(applicationOrigin("http://localhost:3000", undefined, "development"), "http://localhost:3000");
  assert.equal(applicationOrigin(undefined, "http://127.0.0.1:3000/editor", "development"), "http://127.0.0.1:3000");
  assert.equal(applicationOrigin("http://localhost:3000", undefined, "production"), null);
  assert.equal(applicationOrigin("https://quran.example", "https://attacker.example", "production"), "https://quran.example");
  assert.equal(applicationOrigin("https://quran.example/editor", undefined, "production"), null);
});

test("configured application URL controls billing and authentication return destinations", () => {
  const environment = process.env as Record<string, string | undefined>;
  const previous = environment.NEXT_PUBLIC_APP_URL;
  environment.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  assert.equal(authCallbackUrl("/editor", "http://localhost:3000"), "http://localhost:3000/auth/callback?next=%2Feditor");
  if (previous === undefined) delete environment.NEXT_PUBLIC_APP_URL; else environment.NEXT_PUBLIC_APP_URL = previous;
  assert.match(cloud, /configuredAuthCallbackUrl\(next, window\.location\.origin\)/);
  assert.match(billingServer, /applicationOrigin\(process\.env\.NEXT_PUBLIC_APP_URL, request\.url\)/);
});

test("missing integrations are reported by variable name without blocking local-only editor behavior", () => {
  const messages = formatRuntimeConfigurationIssues(runtimeConfigurationIssues({} as NodeJS.ProcessEnv));
  assert.ok(messages.some((message) => message.startsWith("Stripe billing:")));
  assert.ok(messages.join(" ").includes("STRIPE_SECRET_KEY"));
  assert.equal(stripeCheckoutConfigured({} as NodeJS.ProcessEnv), false);
});

test("Preview cannot use a live Stripe secret", () => {
  assert.equal(stripeEnvironmentIsSafe({ NODE_ENV: "production", VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "sk_live_should_not_run" }), false);
  assert.equal(stripeEnvironmentIsSafe({ NODE_ENV: "production", VERCEL_ENV: "preview", STRIPE_SECRET_KEY: "sk_test_safe" }), true);
});

test("service-role clients remain server-only and webhook stays on raw Node.js requests", () => {
  assert.match(billingServer, /import "server-only"/);
  assert.match(entitlementServer, /import "server-only"/);
  assert.match(webhook, /export const runtime = "nodejs"/);
  assert.match(webhook, /constructEvent\(await request\.text\(\), signature, secret\)/);
  assert.doesNotMatch(cloud, /SUPABASE_SERVICE_ROLE_KEY/);
});

test("cloud media stays browser-direct and production does not expose local yt-dlp controls", () => {
  assert.match(cloud, /storage\.from\(PROJECT_MEDIA_BUCKET\)\.upload/);
  assert.match(cloud, /storage\.from\(PROJECT_MEDIA_BUCKET\)\.download/);
  assert.doesNotMatch(cloud, /\/api\/.*project-media/);
  assert.match(editor, /const youtubeImportAvailable = process\.env\.NODE_ENV !== "production"/);
  assert.match(workspace, /youtubeImportAvailable \? <>/);
  assert.match(workspace, /YouTube import is available only in local development/);
});

test("production headers cover baseline browser hardening without a speculative CSP", () => {
  for (const header of ["Referrer-Policy", "X-Content-Type-Options", "X-Frame-Options", "Permissions-Policy"]) assert.match(nextConfig, new RegExp(header));
  assert.doesNotMatch(nextConfig, /Content-Security-Policy/);
});
