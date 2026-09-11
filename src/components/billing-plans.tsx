"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBillingStatus, openCustomerPortal, openSubscriptionUpdatePortal, startCheckout, type BillingStatus } from "@/lib/billing/client";
import type { BillingInterval } from "@/lib/billing/server";
import { getAuthSession, getSupabaseClient } from "@/lib/cloud-sync";
import { accountEntitlementsForPlan, type AccountEntitlements, type Plan } from "@/lib/entitlements";
import { getAccountEntitlements } from "@/lib/entitlements/client";
import { billingConfigurationState } from "@/lib/billing/presentation";

type PaidPlan = Exclude<Plan, "free">;
const benefits: Record<Plan, readonly string[]> = {
  free: ["720p exports", "Quran AutoCaption watermark", "Up to 3 cloud projects", "Quran caption editing", "No credit card required"],
  pro: ["Up to 1080p exports", "No watermark", "Quran caption editing", "Cloud project access"],
  premium: ["Up to 4K exports", "No watermark", "Quran caption editing", "Cloud project access"],
};

function planName(plan: Plan): string { return plan[0]!.toUpperCase() + plan.slice(1); }

export default function BillingPlans({ initialBillingConfigured }: { initialBillingConfigured: boolean }) {
  const [session, setSession] = useState<Session | null>(null);
  const [entitlements, setEntitlements] = useState<AccountEntitlements>(() => accountEntitlementsForPlan("free"));
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("year");
  const [working, setWorking] = useState<"checkout" | "portal" | "upgrade" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [billingLoadFailed, setBillingLoadFailed] = useState(false);

  useEffect(() => {
    if (!getSupabaseClient()) return;
    let active = true;
    void getAuthSession().then(async (next) => {
      if (!active) return;
      setSession(next);
      if (!next) return;
      const [nextEntitlements, nextBilling] = await Promise.all([
        getAccountEntitlements(next).catch(() => accountEntitlementsForPlan("free")),
        getBillingStatus(next).then((value) => ({ value, failed: false })).catch(() => ({ value: null, failed: true })),
      ]);
      if (active) { setEntitlements(nextEntitlements); setBilling(nextBilling.value); setBillingLoadFailed(nextBilling.failed); if (nextBilling.failed) setMessage("We couldn't load billing information right now."); }
    }).catch(() => { if (active) setMessage("We couldn't load billing information right now."); });
    return () => { active = false; };
  }, []);

  async function choose(plan: PaidPlan) {
    if (!session) { setMessage("Sign in to choose a paid plan."); return; }
    setWorking("checkout"); setMessage(null);
    try { window.location.assign(await startCheckout(session, plan, interval)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Checkout could not be started."); setWorking(null); }
  }
  async function manage() {
    if (!session) { setMessage("Sign in to manage your plan."); return; }
    setWorking("portal"); setMessage(null);
    try { window.location.assign(await openCustomerPortal(session)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Billing management is temporarily unavailable."); setWorking(null); }
  }
  async function upgrade() {
    if (!session) return;
    setWorking("upgrade"); setMessage("Opening secure billing…");
    try { window.location.assign(await openSubscriptionUpdatePortal(session)); }
    catch { setMessage("We couldn't open plan management. Try again."); setWorking(null); }
  }

  const billingConfiguration = billingConfigurationState(billing, initialBillingConfigured, billingLoadFailed);
  const configured = billingConfiguration === "configured";
  const status = billing && billing.status !== "none" ? `${billing.billingInterval === "year" ? "Yearly" : "Monthly"} · ${billing.status.replace(/_/g, " ")}${billing.cancelAtPeriodEnd ? " · Cancels at period end" : ""}` : null;
  const action = (plan: Plan) => {
    if (plan === entitlements.plan) return plan === "free" ? <span className="billing-current">Current plan</span> : <button type="button" className="billing-secondary" disabled={working !== null} onClick={() => void manage()}>{working === "portal" ? "Opening billing…" : "Manage plan"}</button>;
    if (entitlements.plan === "free" && plan !== "free") return <button type="button" className="billing-primary" disabled={!configured || working !== null} onClick={() => void choose(plan)}>{working === "checkout" ? "Opening Checkout…" : `Choose ${planName(plan)}`}</button>;
    if (entitlements.plan === "pro" && plan === "premium") return <button type="button" className="billing-primary" disabled={!configured || working !== null} onClick={() => void upgrade()}>{working === "upgrade" ? "Opening billing…" : "Upgrade to Premium"}</button>;
    return null;
  };

  return <section className="billing-page">
    <header className="billing-header"><p>PLANS &amp; BILLING</p><h1>Choose the plan that fits your workflow</h1><span>Start free. Upgrade when you need higher-quality exports.</span>{status && <small>{status}</small>}</header>
    <div className="billing-toggle" aria-label="Billing interval"><button type="button" className={interval === "month" ? "is-selected" : ""} aria-pressed={interval === "month"} onClick={() => setInterval("month")}>Monthly</button><button type="button" className={interval === "year" ? "is-selected" : ""} aria-pressed={interval === "year"} onClick={() => setInterval("year")}>Yearly <small>Save 17%</small></button></div>
    <div className="billing-cards">{(["free", "pro", "premium"] as const).map((plan) => <article className={`billing-card ${plan === entitlements.plan ? "is-current" : ""} ${plan === "pro" ? "is-featured" : ""}`} key={plan}>
      <div className="billing-card-top"><span>{planName(plan)}</span>{plan === entitlements.plan && <b>Current plan</b>}</div>
      {plan === "free" ? <><strong>$0 <em>/ month</em></strong><p className="billing-annual-space">Free to start</p></> : interval === "month" ? <><strong>{plan === "pro" ? "$9.99" : "$19.99"} <em>/ month</em></strong><p className="billing-annual-space">Billed monthly</p></> : <><strong>{plan === "pro" ? "$8.25" : "$16.58"} <em>/ month</em></strong><p>billed {plan === "pro" ? "$99" : "$199"} yearly</p></>}
      <ul>{benefits[plan].map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
      {action(plan)}
    </article>)}</div>
    {session && billingConfiguration === "unconfigured" ? <p className="billing-message" role="status">Stripe billing is not configured for this environment yet.</p> : billingConfiguration === "loading" ? <p className="billing-message" role="status">Loading billing options…</p> : message && <p className="billing-message" role="status">{message}</p>}
    <div className="billing-trust" aria-label="Billing information"><span>Secure checkout with Stripe</span><span>Cancel anytime</span><span>No hidden upgrade fees</span></div>
    <section className="billing-faq" aria-labelledby="billing-faq-title"><div><p>HELPFUL DETAILS</p><h2 id="billing-faq-title">Frequently asked questions</h2></div>{[
      ["Is there a free plan?", "Yes. You can create and edit Quran caption projects without a subscription. Free exports are available in 720p with a Quran AutoCaption watermark, and Free accounts can save up to 3 cloud projects."],
      ["What does Pro include?", "Pro includes watermark-free exports up to 1080p for $9.99/month or $99/year."],
      ["What does Premium include?", "Premium includes watermark-free exports up to 4K for $19.99/month or $199/year."],
      ["Does Quran AutoCaption upload my recitation?", "Normal editing, Quran recognition, and rendering happen locally in your browser. Media is uploaded privately only when you explicitly save a project to the cloud."],
      ["Can I cancel anytime?", "Yes. Subscriptions can be managed or cancelled through the billing portal. When cancellation is scheduled for the end of a billing period, paid access remains active until that period ends."],
      ["How are payments handled?", "Payments and subscription management are handled through Stripe. Available payment methods are shown during checkout."],
    ].map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>
  </section>;
}
