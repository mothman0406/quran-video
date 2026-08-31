import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import Stripe from "stripe";
import { resolvePlan, type Plan } from "../entitlements.ts";

export const PAID_PLANS = ["Creator", "Pro"] as const;
export type PaidPlan = (typeof PAID_PLANS)[number];
export type SubscriptionStatus = "active" | "trialing" | "past_due" | "unpaid" | "canceled" | "incomplete" | "incomplete_expired" | "none" | string;
export type SubscriptionRecord = {
  user_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  plan: Plan;
  status: SubscriptionStatus;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export function paidPlanFromInput(value: unknown): PaidPlan | null {
  return value === "Creator" || value === "Pro" ? value : null;
}
export function customerIdForPortal(record: Pick<SubscriptionRecord, "stripe_customer_id">): string {
  if (!record.stripe_customer_id) throw new Error("No billing customer exists for this account.");
  return record.stripe_customer_id;
}

let stripeClient: Stripe | null | undefined;
let adminClient: SupabaseClient | null | undefined;

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe is not configured.");
  stripeClient = new Stripe(key);
  return stripeClient;
}

function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Subscription storage is not configured.");
  adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return adminClient;
}

export function priceIdForPlan(plan: PaidPlan): string {
  const priceId = plan === "Creator" ? process.env.STRIPE_CREATOR_PRICE_ID : process.env.STRIPE_PRO_PRICE_ID;
  if (!priceId) throw new Error(`Stripe price for ${plan} is not configured.`);
  return priceId;
}

export function planForPriceId(priceId: string | null | undefined): PaidPlan | null {
  if (priceId && priceId === process.env.STRIPE_CREATOR_PRICE_ID) return "Creator";
  if (priceId && priceId === process.env.STRIPE_PRO_PRICE_ID) return "Pro";
  return null;
}

export function isEntitledSubscriptionStatus(status: string): boolean {
  return status === "active" || status === "trialing";
}

export function planFromSubscription(record: Pick<SubscriptionRecord, "plan" | "status" | "stripe_price_id">): Plan {
  const mappedPlan = planForPriceId(record.stripe_price_id);
  if (!mappedPlan || !isEntitledSubscriptionStatus(record.status)) return "Free";
  return resolvePlan({ authenticated: true, subscriptionPlan: record.plan === mappedPlan ? mappedPlan : "Free" });
}

export async function getSubscription(userId: string): Promise<SubscriptionRecord | null> {
  const { data, error } = await getAdminClient().from("subscriptions").select("user_id,stripe_customer_id,stripe_subscription_id,stripe_price_id,plan,status,current_period_end,cancel_at_period_end").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data as SubscriptionRecord | null;
}

export async function getCurrentUserPlan(userId: string): Promise<Plan> {
  const record = await getSubscription(userId);
  return record ? planFromSubscription(record) : "Free";
}

export async function authenticatedUser(request: Request): Promise<User | null> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) return null;
  const authClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data } = await authClient.auth.getUser(token);
  return data.user ?? null;
}

export async function getOrCreateCustomer(user: User): Promise<string> {
  const existing = await getSubscription(user.id);
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;
  const customer = await getStripeClient().customers.create({ email: user.email ?? undefined, metadata: { user_id: user.id } });
  const query = existing
    ? getAdminClient().from("subscriptions").update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() }).eq("user_id", user.id)
    : getAdminClient().from("subscriptions").insert({ user_id: user.id, stripe_customer_id: customer.id, plan: "Free", status: "none" });
  const { error } = await query;
  if (error) throw error;
  return customer.id;
}

export async function syncStripeSubscription(subscription: Stripe.Subscription, fallbackUserId?: string): Promise<void> {
  const priceId = subscription.items.data[0]?.price.id ?? null;
  const mappedPlan = planForPriceId(priceId);
  let userId = subscription.metadata.user_id || fallbackUserId;
  if (!userId) {
    const customer = typeof subscription.customer === "string" ? await getStripeClient().customers.retrieve(subscription.customer) : subscription.customer;
    if (!customer.deleted) userId = customer.metadata.user_id;
  }
  if (!userId) throw new Error("Stripe subscription is missing internal user identity.");
  const plan: Plan = mappedPlan && isEntitledSubscriptionStatus(subscription.status) ? mappedPlan : "Free";
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  const { error } = await getAdminClient().from("subscriptions").upsert({
    user_id: userId,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscription.id,
    stripe_price_id: priceId,
    plan,
    status: subscription.status,
    current_period_end: new Date((subscription.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1_000)) * 1_000).toISOString(),
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function ensureCustomerRecord(userId: string, customerId: string): Promise<void> {
  const existing = await getSubscription(userId);
  if (existing) return;
  const { error } = await getAdminClient().from("subscriptions").insert({ user_id: userId, stripe_customer_id: customerId, plan: "Free", status: "none" });
  if (error) throw error;
}

export async function recordWebhookEvent(event: Pick<Stripe.Event, "id" | "type">): Promise<boolean> {
  const { error } = await getAdminClient().from("stripe_webhook_events").insert({ event_id: event.id, event_type: event.type });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}
