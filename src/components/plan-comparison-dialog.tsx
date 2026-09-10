"use client";

import { useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBillingStatus, openCustomerPortal, openSubscriptionUpdatePortal, startCheckout, type BillingStatus } from "@/lib/billing/client";
import type { BillingInterval } from "@/lib/billing/server";
import type { AccountEntitlements, Plan } from "@/lib/entitlements";

type BillingReturn = "checkout" | "plan-update";
type PlanComparisonDialogProps = { entitlements: AccountEntitlements; session?: Session | null; onClose: () => void; onEntitlementsRefresh?: () => Promise<void>; billingReturn?: BillingReturn | null };

const PLAN_DETAILS: Record<Plan, { name: string; monthly: number; annual: number; benefits: readonly string[] }> = {
  free: { name: "Free", monthly: 0, annual: 0, benefits: ["720p export", "Watermark on exports", "Up to 3 cloud projects"] },
  pro: { name: "Pro", monthly: 9.99, annual: 99, benefits: ["Up to 1080p export", "No watermark"] },
  premium: { name: "Premium", monthly: 19.99, annual: 199, benefits: ["Up to 4K export", "No watermark"] },
};

function priceText(plan: Plan, interval: BillingInterval): string {
  const price = PLAN_DETAILS[plan][interval === "month" ? "monthly" : "annual"];
  return plan === "free" ? "$0" : interval === "month" ? `$${price.toFixed(2)} / month` : `$${price}/year`;
}
function annualSavings(plan: Exclude<Plan, "free">): number { return Math.round((1 - PLAN_DETAILS[plan].annual / (PLAN_DETAILS[plan].monthly * 12)) * 100); }

/** Checkout is hosted by Stripe; this dialog only asks server routes to create sessions. */
export default function PlanComparisonDialog({ entitlements, session = null, onClose, onEntitlementsRefresh, billingReturn = null }: PlanComparisonDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [interval, setInterval] = useState<BillingInterval>("month");
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [message, setMessage] = useState<string | null>(billingReturn ? "Updating your plan…" : null);
  const [working, setWorking] = useState<"checkout" | "portal" | "upgrade" | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>("button")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
      const first = focusable[0]; const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", onKeyDown); };
  }, [onClose]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    void getBillingStatus(session).then((next) => { if (active) setBilling(next); }).catch((error: unknown) => { if (active) setMessage(error instanceof Error ? error.message : "Billing information is unavailable."); });
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (!billingReturn || !session) return;
    let active = true; let attempts = 0;
    const refreshAfterBillingReturn = async () => {
      try {
        await onEntitlementsRefresh?.();
        const next = await getBillingStatus(session);
        if (!active) return;
        setBilling(next);
        if (next.plan !== "free" && (billingReturn !== "plan-update" || next.plan === "premium")) { setMessage("Your plan is active."); return; }
      } catch { /* A retry button remains available if the webhook is delayed. */ }
      attempts += 1;
      if (active && attempts < 6) window.setTimeout(() => { void refreshAfterBillingReturn(); }, 2_000);
      else if (active) setMessage("Stripe is still updating your plan; use Refresh in a moment.");
    };
    void refreshAfterBillingReturn();
    return () => { active = false; };
  }, [billingReturn, onEntitlementsRefresh, session]);

  async function refresh() {
    if (!session) return;
    setMessage("Refreshing your plan…");
    try { await onEntitlementsRefresh?.(); setBilling(await getBillingStatus(session)); setMessage("Plan information refreshed."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "We couldn't refresh your plan."); }
  }
  async function checkout(plan: Exclude<Plan, "free">) {
    if (!session) { setMessage("Sign in to choose a paid plan."); return; }
    setWorking("checkout"); setMessage(null);
    try { window.location.assign(await startCheckout(session, plan, interval)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Checkout could not be started."); setWorking(null); }
  }
  async function portal() {
    if (!session) { setMessage("Sign in to manage your plan."); return; }
    setWorking("portal"); setMessage(null);
    try { window.location.assign(await openCustomerPortal(session)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Customer Portal could not be opened."); setWorking(null); }
  }
  async function upgrade() {
    if (!session) { setMessage("Sign in to choose a paid plan."); return; }
    setWorking("upgrade"); setMessage("Opening secure billing…");
    try { window.location.assign(await openSubscriptionUpdatePortal(session)); }
    catch { setMessage("We couldn't open plan management. Try again."); setWorking(null); }
  }

  const configured = billing?.configured ?? false;
  const subscriptionDetail = billing && billing.status !== "none" ? `${billing.billingInterval === "year" ? "Annual" : billing.billingInterval === "month" ? "Monthly" : ""}${billing.billingInterval ? " · " : ""}${billing.status.replace(/_/g, " ")}${billing.cancelAtPeriodEnd ? " · Cancels at period end" : ""}` : null;
  return <div className="plan-comparison-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="plan-comparison-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="plan-comparison-title" onKeyDown={(event) => event.stopPropagation()}>
    <header><div><p>QURAN AUTOCAPTION PLANS</p><h2 id="plan-comparison-title">Choose the export quality you need</h2></div><button className="plan-comparison-close" type="button" aria-label="Close plan comparison" onClick={onClose}>×</button></header>
    <p className="plan-comparison-intro">Your plan is confirmed by Stripe’s signed webhook before the editor changes access. {subscriptionDetail && <span className="plan-comparison-status">{subscriptionDetail}</span>}</p>
    <div className="plan-comparison-interval" aria-label="Billing interval"><button className={interval === "month" ? "is-selected" : ""} type="button" onClick={() => setInterval("month")}>Monthly</button><button className={interval === "year" ? "is-selected" : ""} type="button" onClick={() => setInterval("year")}>Annual <small>Save about {annualSavings("pro")}%</small></button></div>
    <div className="plan-comparison-cards">{(Object.keys(PLAN_DETAILS) as Plan[]).map((plan) => { const detail = PLAN_DETAILS[plan]; const active = entitlements.plan === plan; const directUpgrade = entitlements.plan === "pro" && plan === "premium"; return <article className={`plan-comparison-card ${active ? "is-current" : ""}`} key={plan}><div><span>{detail.name.toUpperCase()}</span>{active && <b>Current plan</b>}</div><strong className="plan-comparison-price">{priceText(plan, interval)}</strong>{plan !== "free" && interval === "year" && <small className="plan-comparison-saving">Save about {annualSavings(plan)}% annually</small>}<ul>{detail.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>{active ? plan !== "free" && <button className="editor-button editor-button-quiet plan-comparison-action" type="button" disabled={working !== null} onClick={() => void portal()}>{working === "portal" ? "Opening portal…" : "Manage plan"}</button> : directUpgrade ? <button className="editor-button editor-button-accent plan-comparison-action" type="button" disabled={!configured || working !== null} onClick={() => void upgrade()}>{working === "upgrade" ? "Opening secure billing…" : "Upgrade to Premium"}</button> : entitlements.plan === "free" && plan !== "free" && <button className="editor-button editor-button-accent plan-comparison-action" type="button" disabled={!configured || working !== null} onClick={() => void checkout(plan)}>{working === "checkout" ? "Opening Checkout…" : `Upgrade to ${detail.name}`}</button>}</article>; })}</div>
    <div className="plan-comparison-matrix" role="table" aria-label="Plan capability comparison"><div role="row" className="plan-comparison-matrix-head"><span role="columnheader">Capability</span><span role="columnheader">Free</span><span role="columnheader">Pro</span><span role="columnheader">Premium</span></div><div role="row"><span role="cell">Maximum export</span><span role="cell">720p</span><span role="cell">1080p</span><span role="cell">4K</span></div><div role="row"><span role="cell">Export watermark</span><span role="cell">Included</span><span role="cell">None</span><span role="cell">None</span></div><div role="row"><span role="cell">Cloud projects</span><span role="cell">Up to 3</span><span role="cell">TBD</span><span role="cell">TBD</span></div></div>
    {!session ? <p className="plan-comparison-message">Sign in to choose a plan.</p> : !configured ? <p className="plan-comparison-message">Stripe billing is not configured for this environment yet. Add the four server-only Price IDs and Stripe test secret before enabling Checkout.</p> : message && <p className="plan-comparison-message" role="status">{message}</p>}
    <footer><span>Payments and plan changes are securely managed by Stripe.</span><div>{billingReturn && session && <button className="editor-button editor-button-quiet" type="button" onClick={() => void refresh()}>Refresh</button>}<button className="editor-button editor-button-quiet" type="button" onClick={onClose}>Done</button></div></footer>
  </section></div>;
}
