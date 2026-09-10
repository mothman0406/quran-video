"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getAuthSession, getSupabaseClient, signOut } from "@/lib/cloud-sync";
import { accountEntitlementsForPlan, type AccountEntitlements } from "@/lib/entitlements";
import { getAccountEntitlements } from "@/lib/entitlements/client";

type DashboardSection = "projects" | "billing" | "account";
type DashboardShellProps = { current: DashboardSection; children: React.ReactNode };

function memberName(session: Session): string {
  const metadata = session.user.user_metadata;
  return [metadata.full_name, metadata.name, metadata.display_name].find((value): value is string => typeof value === "string" && Boolean(value.trim())) ?? session.user.email ?? "Quran AutoCaption member";
}

export default function DashboardShell({ current, children }: DashboardShellProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [entitlements, setEntitlements] = useState<AccountEntitlements>(() => accountEntitlementsForPlan("free"));

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    const applySession = (next: Session | null) => {
      if (!active) return;
      setSession(next);
      if (!next) { setEntitlements(accountEntitlementsForPlan("free")); return; }
      void getAccountEntitlements(next).then((value) => { if (active) setEntitlements(value); }).catch(() => { if (active) setEntitlements(accountEntitlementsForPlan("free")); });
    };
    void getAuthSession().then(applySession).catch(() => applySession(null));
    const subscription = supabase.auth.onAuthStateChange((_event, next) => applySession(next));
    return () => { active = false; subscription.data.subscription.unsubscribe(); };
  }, []);

  const planName = entitlements.plan[0]!.toUpperCase() + entitlements.plan.slice(1);
  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar" aria-label="Dashboard navigation">
      <Link className="dashboard-brand" href="/"><span aria-hidden="true">۝</span>Quran AutoCaption</Link>
      <Link className="dashboard-upload" href="/editor"><span aria-hidden="true">+</span>Upload recitation</Link>
      <nav className="dashboard-nav" aria-label="Account sections">
        <Link className={current === "projects" ? "is-active" : ""} href="/projects">Projects</Link>
        <Link className={current === "billing" ? "is-active" : ""} href="/billing">Billing</Link>
        <Link className={current === "account" ? "is-active" : ""} href="/account">Settings</Link>
      </nav>
      <div className="dashboard-member">
        {session ? <><span className="dashboard-avatar" aria-hidden="true">{(session.user.email ?? "Q").slice(0, 1).toUpperCase()}</span><div><strong>{memberName(session)}</strong><small>{planName} plan</small></div><button type="button" onClick={() => void signOut().then(() => window.location.assign("/"))}>Sign out</button></> : <Link href="/editor">Sign in to save projects</Link>}
      </div>
    </aside>
    <main className="dashboard-main">{children}</main>
  </div>;
}
