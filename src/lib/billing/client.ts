import type { Session } from "@supabase/supabase-js";
import type { Plan } from "../entitlements.ts";

export type BillingStatus = { plan: Plan; status: string; cancelAtPeriodEnd: boolean; currentPeriodEnd: string | null };

async function billingRequest(path: string, session: Session): Promise<{ url: string } | BillingStatus> {
  const response = await fetch(path, { headers: { authorization: `Bearer ${session.access_token}` } });
  const payload = await response.json() as { error?: string; url?: string } & Partial<BillingStatus>;
  if (!response.ok) throw new Error(payload.error ?? "Billing request failed.");
  return path.endsWith("status") ? payload as BillingStatus : { url: payload.url ?? "" };
}

export async function getBillingStatus(session: Session): Promise<BillingStatus> { return await billingRequest("/api/billing/status", session) as BillingStatus; }
export async function startCheckout(session: Session, plan: "Creator" | "Pro"): Promise<string> {
  const response = await fetch("/api/billing/checkout", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ plan }) });
  const payload = await response.json() as { error?: string; url?: string };
  if (!response.ok || !payload.url) throw new Error(payload.error ?? "Checkout could not be started.");
  return payload.url;
}
export async function openCustomerPortal(session: Session): Promise<string> {
  const result = await billingRequest("/api/billing/portal", session) as { url: string };
  return result.url;
}
