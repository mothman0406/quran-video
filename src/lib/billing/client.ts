import type { Session } from "@supabase/supabase-js";
import type { BillingInterval, PaidPlan } from "./server.ts";

export type BillingStatus = { configured: boolean; plan: "free" | "pro" | "premium"; status: string; billingInterval: BillingInterval | null; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean };

async function billingRequest(path: string, session: Session, init?: RequestInit): Promise<unknown> {
  const response = await fetch(path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}`, ...init?.headers } });
  const payload = await response.json() as { error?: string; url?: string };
  if (!response.ok) throw new Error(payload.error ?? "Billing request failed. Please try again.");
  return payload;
}

export async function getBillingStatus(session: Session): Promise<BillingStatus> { return await billingRequest("/api/billing/status", session) as BillingStatus; }
export async function startCheckout(session: Session, plan: PaidPlan, interval: BillingInterval): Promise<string> {
  const payload = await billingRequest("/api/billing/checkout", session, { method: "POST", body: JSON.stringify({ plan, interval }) }) as { url?: string };
  if (!payload.url) throw new Error("Checkout could not be started. Please try again.");
  return payload.url;
}
export async function openCustomerPortal(session: Session): Promise<string> {
  const payload = await billingRequest("/api/billing/portal", session, { method: "POST", body: "{}" }) as { url?: string };
  if (!payload.url) throw new Error("Customer Portal could not be opened. Please try again.");
  return payload.url;
}
export async function openSubscriptionUpdatePortal(session: Session): Promise<string> {
  const payload = await billingRequest("/api/billing/portal/upgrade", session, { method: "POST", body: "{}" }) as { url?: string };
  if (!payload.url) throw new Error("We couldn't open plan management. Try again.");
  return payload.url;
}
