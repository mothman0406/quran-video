"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import DashboardShell from "@/components/dashboard-shell";
import { openCustomerPortal } from "@/lib/billing/client";
import { getCloudStorageSummary, getAuthSession, getSupabaseClient, signOut, type CloudStorageSummary } from "@/lib/cloud-sync";
import { accountEntitlementsForPlan, type AccountEntitlements } from "@/lib/entitlements";
import { getAccountEntitlements } from "@/lib/entitlements/client";

function identity(session: Session): string {
  const metadata = session.user.user_metadata;
  return [metadata.full_name, metadata.name, metadata.display_name].find((value): value is string => typeof value === "string" && Boolean(value.trim())) ?? session.user.email ?? "Quran AutoCaption member";
}

export default function AccountSettings() {
  const [session, setSession] = useState<Session | null>(null);
  const [entitlements, setEntitlements] = useState<AccountEntitlements>(accountEntitlementsForPlan("free"));
  const [usage, setUsage] = useState<CloudStorageSummary | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    if (!getSupabaseClient()) { void Promise.resolve().then(() => { if (active) setMessage("Account settings are unavailable because authentication is not configured."); }); return; }
    void getAuthSession().then(async (next) => {
      if (!active) return;
      setSession(next);
      if (!next) return;
      const [nextEntitlements, nextUsage] = await Promise.all([
        getAccountEntitlements(next).catch(() => accountEntitlementsForPlan("free")),
        getCloudStorageSummary().catch(() => null),
      ]);
      if (active) { setEntitlements(nextEntitlements); setUsage(nextUsage); }
    }).catch(() => { if (active) setMessage("We couldn't load your account right now."); });
    return () => { active = false; };
  }, []);

  async function manageBilling() {
    if (!session) return;
    setBusy(true); setMessage(null);
    try { window.location.assign(await openCustomerPortal(session)); }
    catch { setMessage("Billing management is temporarily unavailable. Please try again."); setBusy(false); }
  }

  async function deleteAccount() {
    if (!session || confirmation !== "DELETE") return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/account/delete", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ confirmation }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Account deletion could not be completed.");
      await signOut().catch(() => undefined);
      window.location.assign("/?account=deleted");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account deletion could not be completed. Please retry.");
      setBusy(false);
    }
  }

  if (!session) return <DashboardShell current="account"><section className="account-page"><div className="account-card"><p className="account-eyebrow">ACCOUNT SETTINGS</p><h1>Sign in to manage your account</h1><p>Account settings are available to signed-in Quran AutoCaption members.</p><Link className="account-action" href="/editor">Open editor</Link></div></section></DashboardShell>;
  const planName = entitlements.plan[0]!.toUpperCase() + entitlements.plan.slice(1);
  return <DashboardShell current="account"><section className="account-page"><div className="account-card">
    <p className="account-eyebrow">ACCOUNT SETTINGS</p><h1>Your account</h1>
    <section className="account-profile"><span className="account-avatar" aria-hidden="true">{(session.user.email ?? "Q").slice(0, 1).toUpperCase()}</span><dl><div><dt>Name</dt><dd>{identity(session)}</dd></div><div><dt>Email</dt><dd>{session.user.email ?? "Not available"}</dd></div></dl></section>
    <section><h2>Plan &amp; billing</h2><dl><div><dt>Current plan</dt><dd>{planName}</dd></div></dl><div className="account-actions"><button type="button" className="account-action" disabled={busy} onClick={() => void manageBilling()}>Manage billing</button><Link className="account-secondary" href="/billing">Billing &amp; Plans</Link></div></section>
    <section><h2>Projects</h2><dl><div><dt>Cloud projects</dt><dd>{usage ? `${usage.project_count} saved${entitlements.cloudProjectLimit === null ? "" : ` of ${entitlements.cloudProjectLimit}`}` : "Loading saved projects…"}</dd></div>{entitlements.cloudProjectLimit !== null && <div><dt>Free plan</dt><dd>Up to {entitlements.cloudProjectLimit} cloud projects</dd></div>}</dl><Link className="account-secondary account-section-link" href="/projects">View projects</Link></section>
    <section><h2>Legal &amp; privacy</h2><div className="account-legal-links"><Link href="/privacy">Privacy Policy</Link><Link href="/terms">Terms</Link></div></section>
    <section><h2>Session</h2><button type="button" className="account-secondary" disabled={busy} onClick={() => void signOut().then(() => window.location.assign("/"))}>Sign out</button></section>
    <section className="account-danger"><h2>Delete account</h2><p>Deletion is permanent. It cancels active Stripe subscriptions, deletes your saved cloud projects and private project media, and removes your Quran AutoCaption account. Stripe retains only the billing records it is required to keep.</p><label htmlFor="delete-confirmation">Type DELETE to confirm</label><input id="delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" disabled={busy} /><button type="button" className="account-delete" disabled={busy || confirmation !== "DELETE"} onClick={() => void deleteAccount()}>{busy ? "Deleting account…" : "Permanently delete account"}</button></section>
    {message && <p className="account-message" role="alert">{message}</p>}
  </div></section></DashboardShell>;
}
