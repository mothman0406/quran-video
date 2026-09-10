import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Stripe from "stripe";
import { accountEntitlementsForPlan, type Plan } from "../entitlements.ts";
import { applicationOrigin } from "../application-url.ts";

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];
export type PaidPlan = Exclude<Plan, "free">;
export type StripeSubscriptionStatus = "active" | "trialing" | "past_due" | "unpaid" | "canceled" | "incomplete" | "incomplete_expired" | "paused" | string;

export type BillingCustomer = { user_id: string; stripe_customer_id: string };
export type BillingSubscription = {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string | null;
  plan: Plan;
  billing_interval: BillingInterval | null;
  status: StripeSubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

type PriceConfiguration = Record<PaidPlan, Record<BillingInterval, string | undefined>>;
type PriceMatch = { plan: PaidPlan; interval: BillingInterval };
type BillingAdmin = Pick<SupabaseClient, "from" | "rpc">;

let stripeClient: Stripe | undefined;
let adminClient: SupabaseClient | undefined;

function priceConfiguration(env: NodeJS.ProcessEnv = process.env): PriceConfiguration {
  return {
    pro: { month: env.STRIPE_PRO_MONTHLY_PRICE_ID, year: env.STRIPE_PRO_ANNUAL_PRICE_ID },
    premium: { month: env.STRIPE_PREMIUM_MONTHLY_PRICE_ID, year: env.STRIPE_PREMIUM_ANNUAL_PRICE_ID },
  };
}

export function isBillingInterval(value: unknown): value is BillingInterval { return value === "month" || value === "year"; }
export function isPaidPlan(value: unknown): value is PaidPlan { return value === "pro" || value === "premium"; }

/** Maps only application-owned plan and interval values to server-configured Stripe Price IDs. */
export function priceIdForPlan(plan: PaidPlan, interval: BillingInterval, env: NodeJS.ProcessEnv = process.env): string | null {
  return priceConfiguration(env)[plan][interval] ?? null;
}

/** The inverse allowlist used only after Stripe has signed the webhook delivery. */
export function planForPriceId(priceId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): PriceMatch | null {
  if (!priceId) return null;
  for (const plan of ["pro", "premium"] as const) for (const interval of BILLING_INTERVALS) {
    if (priceConfiguration(env)[plan][interval] === priceId) return { plan, interval };
  }
  return null;
}

export type StripeBillingEnvironment = "sandbox" | "live";

function keyBillingEnvironment(key: string | undefined): StripeBillingEnvironment | null {
  if (key?.startsWith("sk_test_")) return "sandbox";
  if (key?.startsWith("sk_live_")) return "live";
  return null;
}

function deploymentIsPreview(env: NodeJS.ProcessEnv): boolean {
  return env.VERCEL_ENV === "preview" || env.CONTEXT === "deploy-preview" || env.CONTEXT === "branch-deploy";
}

/**
 * Environment policy is intentionally stricter than a key-presence check.
 * STRIPE_BILLING_ENV is optional for the current sandbox deployment, but when
 * supplied it must match the secret-key mode. Live credentials are never valid
 * in local development or preview deployments.
 */
export function stripeEnvironmentIsSafe(env: NodeJS.ProcessEnv = process.env): boolean {
  const mode = keyBillingEnvironment(env.STRIPE_SECRET_KEY);
  if (!env.STRIPE_SECRET_KEY) return true;
  if (!mode) return false;
  if (env.STRIPE_BILLING_ENV && env.STRIPE_BILLING_ENV !== mode) return false;
  if (mode === "live" && (env.NODE_ENV !== "production" || deploymentIsPreview(env))) return false;
  return true;
}

export function stripeCheckoutConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(stripeEnvironmentIsSafe(env) && keyBillingEnvironment(env.STRIPE_SECRET_KEY) && priceIdForPlan("pro", "month", env) && priceIdForPlan("pro", "year", env) && priceIdForPlan("premium", "month", env) && priceIdForPlan("premium", "year", env));
}

/** Checks Stripe's own Price mode before Checkout so test and live resources cannot be mixed. */
export async function assertStripePricesMatchEnvironment(stripe: Stripe = getStripeClient(), env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const expectedLiveMode = keyBillingEnvironment(env.STRIPE_SECRET_KEY) === "live";
  const prices = [priceIdForPlan("pro", "month", env), priceIdForPlan("pro", "year", env), priceIdForPlan("premium", "month", env), priceIdForPlan("premium", "year", env)];
  if (prices.some((price): price is null => !price)) throw new Error("Stripe Price configuration is incomplete.");
  const configured = await Promise.all((prices as string[]).map((price) => stripe.prices.retrieve(price)));
  if (configured.some((price) => price.livemode !== expectedLiveMode)) throw new Error("Stripe Price IDs do not match the configured billing environment.");
}

/** Conservative launch policy: only active/trialing subscriptions on known prices are paid; past_due and every terminal/incomplete status resolve Free. */
export function effectivePlanForSubscription(status: StripeSubscriptionStatus, priceId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): Plan {
  const match = planForPriceId(priceId, env);
  return match && (status === "active" || status === "trialing") ? match.plan : "free";
}

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;
  if (!process.env.STRIPE_SECRET_KEY || !stripeEnvironmentIsSafe()) throw new Error("Stripe billing is not configured.");
  stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripeClient;
}

function billingAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Billing storage is not configured.");
  adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return adminClient;
}

export function safeApplicationOrigin(request: Request): string | null {
  return applicationOrigin(process.env.NEXT_PUBLIC_APP_URL, request.url);
}

export async function getBillingCustomer(userId: string, admin: BillingAdmin = billingAdminClient()): Promise<BillingCustomer | null> {
  const { data, error } = await admin.from("billing_customers").select("user_id,stripe_customer_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as BillingCustomer | null;
}

export async function getBillingSubscription(userId: string, admin: BillingAdmin = billingAdminClient()): Promise<BillingSubscription | null> {
  const { data, error } = await admin.from("billing_subscriptions").select("user_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,plan,billing_interval,status,current_period_end,cancel_at_period_end").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as BillingSubscription | null;
}

export function hasPaidSubscription(subscription: BillingSubscription | null, env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(subscription && effectivePlanForSubscription(subscription.status, subscription.stripe_price_id, env) !== "free");
}

/** Returns only the signed-webhook subscription recorded for this account's mapped Stripe Customer. */
export function subscriptionUpdateTarget(subscription: BillingSubscription | null, customer: BillingCustomer | null, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!subscription || !customer || subscription.user_id !== customer.user_id || subscription.stripe_customer_id !== customer.stripe_customer_id || !hasPaidSubscription(subscription, env)) return null;
  return subscription.stripe_subscription_id;
}

async function persistCustomerMapping(userId: string, customerId: string, admin: BillingAdmin = billingAdminClient()): Promise<void> {
  const { error } = await admin.from("billing_customers").upsert({ user_id: userId, stripe_customer_id: customerId, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
}

/** Uses a stable Stripe idempotency key so retried Checkout starts cannot create more than one Stripe Customer. */
export async function getOrCreateCustomer(user: User, dependencies: { admin?: BillingAdmin; stripe?: Stripe } = {}): Promise<string> {
  const admin = dependencies.admin ?? billingAdminClient();
  const existing = await getBillingCustomer(user.id, admin);
  if (existing) return existing.stripe_customer_id;
  const stripe = dependencies.stripe ?? getStripeClient();
  const name = ["full_name", "name", "display_name"].map((key) => user.user_metadata[key]).find((value): value is string => typeof value === "string" && Boolean(value.trim()));
  const customer = await stripe.customers.create({ email: user.email ?? undefined, name, metadata: { user_id: user.id } }, { idempotencyKey: `quran-video-customer:${user.id}` });
  await persistCustomerMapping(user.id, customer.id, admin);
  return customer.id;
}

function customerId(value: string | Stripe.Customer | Stripe.DeletedCustomer): string { return typeof value === "string" ? value : value.id; }
function isoTimestamp(seconds: number | undefined): string | null { return typeof seconds === "number" ? new Date(seconds * 1_000).toISOString() : null; }

async function userIdForSubscription(subscription: Stripe.Subscription, admin: BillingAdmin): Promise<string> {
  const stripeCustomerId = customerId(subscription.customer);
  const { data, error } = await admin.from("billing_customers").select("user_id").eq("stripe_customer_id", stripeCustomerId).maybeSingle();
  if (error) throw error;
  const mappedUserId = (data as { user_id?: string } | null)?.user_id;
  const metadataUserId = subscription.metadata.user_id;
  if (mappedUserId && metadataUserId && mappedUserId !== metadataUserId) throw new Error("Stripe subscription identity does not match the customer mapping.");
  if (mappedUserId) return mappedUserId;
  if (!metadataUserId) throw new Error("Stripe subscription has no verified application user identity.");
  await persistCustomerMapping(metadataUserId, stripeCustomerId, admin);
  return metadataUserId;
}

/** Projects Stripe's signed subscription state into billing records, then into the canonical entitlement projection. */
export async function syncStripeSubscription(subscription: Stripe.Subscription, admin: BillingAdmin = billingAdminClient()): Promise<void> {
  const stripeCustomerId = customerId(subscription.customer);
  const { data: deletion, error: deletionError } = await admin.from("billing_customer_deletions").select("stripe_customer_id").eq("stripe_customer_id", stripeCustomerId).maybeSingle();
  if (deletionError) throw deletionError;
  // A deletion tombstone prevents late Stripe webhooks from recreating an
  // application mapping for an account that has already been removed.
  if (deletion) return;
  const userId = await userIdForSubscription(subscription, admin);
  const item = subscription.items.data[0];
  const priceId = item?.price.id ?? null;
  const price = planForPriceId(priceId);
  const plan = effectivePlanForSubscription(subscription.status, priceId);
  const now = new Date().toISOString();
  const { error: subscriptionError } = await admin.from("billing_subscriptions").upsert({
    user_id: userId, stripe_customer_id: stripeCustomerId, stripe_subscription_id: subscription.id, stripe_price_id: priceId,
    plan, billing_interval: price?.interval ?? null, status: subscription.status, current_period_end: isoTimestamp(item?.current_period_end),
    cancel_at_period_end: subscription.cancel_at_period_end, updated_at: now,
  }, { onConflict: "user_id" });
  if (subscriptionError) throw subscriptionError;
  const { error: entitlementError } = await admin.from("account_entitlements").upsert({ user_id: userId, plan, source: "stripe", source_reference: subscription.id, effective_at: now, updated_at: now }, { onConflict: "user_id" });
  if (entitlementError) throw entitlementError;
}

export async function ensureCheckoutCustomerMapping(session: Stripe.Checkout.Session, admin: BillingAdmin = billingAdminClient()): Promise<void> {
  const userId = session.client_reference_id ?? session.metadata?.user_id;
  const stripeCustomerId = session.customer ? customerId(session.customer) : null;
  if (!userId || !stripeCustomerId) throw new Error("Checkout session has no verified application customer identity.");
  await persistCustomerMapping(userId, stripeCustomerId, admin);
}

/** Database-backed webhook claim. A duplicate is ignored only after a successful prior processing pass. */
export async function claimWebhookEvent(event: Pick<Stripe.Event, "id" | "type">, admin: BillingAdmin = billingAdminClient()): Promise<boolean> {
  const { data, error } = await admin.rpc("claim_stripe_webhook_event", { p_event_id: event.id, p_event_type: event.type });
  if (error) throw error;
  return data === true;
}

export async function finishWebhookEvent(eventId: string, admin: BillingAdmin = billingAdminClient()): Promise<void> {
  const { error } = await admin.from("stripe_webhook_events").update({ status: "processed", processed_at: new Date().toISOString(), failed_at: null, failure_summary: null }).eq("stripe_event_id", eventId);
  if (error) throw error;
}

export async function failWebhookEvent(eventId: string, admin: BillingAdmin = billingAdminClient()): Promise<void> {
  const { error } = await admin.from("stripe_webhook_events").update({ status: "failed", failed_at: new Date().toISOString() }).eq("stripe_event_id", eventId);
  if (error) throw error;
}

export function subscriptionStatusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function billingSummary(subscription: BillingSubscription | null) {
  return {
    configured: stripeCheckoutConfigured(),
    plan: subscription?.plan ?? accountEntitlementsForPlan("free").plan,
    status: subscription?.status ?? "none",
    billingInterval: subscription?.billing_interval ?? null,
    currentPeriodEnd: subscription?.current_period_end ?? null,
    cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false,
  };
}
