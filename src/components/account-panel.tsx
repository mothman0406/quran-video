"use client";

import { FormEvent, useEffect, useState } from "react";
import { getAuthSession, getSupabaseClient, signIn, signOut, signUp } from "@/lib/cloud-sync";
import type { Session } from "@supabase/supabase-js";
import { getBillingStatus, openCustomerPortal, startCheckout, type BillingStatus } from "@/lib/billing/client";

export default function AccountPanel({ onSessionChange, onPlanChange }: { onSessionChange: (session: Session | null) => void; onPlanChange: (plan: "Free" | "Creator" | "Pro") => void }) {
  const configured = getSupabaseClient() !== null;
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [billing, setBilling] = useState<BillingStatus | null>(null);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    void getAuthSession().then((next) => { if (active) { setSession(next); onSessionChange(next); if (next) void getBillingStatus(next).then((status) => { if (active) { setBilling(status); onPlanChange(status.plan); } }).catch(() => undefined); } }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not read account session."));
    const supabase = getSupabaseClient();
    const subscription = supabase?.auth.onAuthStateChange((_event, next) => { setSession(next); onSessionChange(next); if (!next) { setBilling(null); onPlanChange("Free"); } });
    return () => { active = false; subscription?.data.subscription.unsubscribe(); };
  }, [configured, onPlanChange, onSessionChange]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage(null);
    try {
      const next = mode === "sign-in" ? await signIn(email, password) : await signUp(email, password);
      setSession(next);
      if (next) { void getBillingStatus(next).then((status) => { setBilling(status); onPlanChange(status.plan); }).catch(() => undefined); setMessage(mode === "sign-in" ? "Signed in. Cloud sync is ready." : "Account created. Cloud sync is ready."); }
      else setMessage("Check your email to confirm your account, then sign in.");
      setPassword("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Account action failed."); }
    finally { setPending(false); }
  }

  if (!configured) return <p className="mt-2 text-xs text-[#68716a]">Sign in to sync projects (Supabase is not configured yet).</p>;
  async function checkout(plan: "Creator" | "Pro") { if (!session) return; setPending(true); setMessage(null); try { window.location.assign(await startCheckout(session, plan)); } catch (error) { setMessage(error instanceof Error ? error.message : "Checkout could not be started."); } finally { setPending(false); } }
  async function portal() { if (!session) return; setPending(true); setMessage(null); try { window.location.assign(await openCustomerPortal(session)); } catch (error) { setMessage(error instanceof Error ? error.message : "Customer portal could not be opened."); } finally { setPending(false); } }
  if (session) { const currentPlan = billing?.plan ?? "Free"; return <div className="mt-3 rounded-xl border border-[#c8d4cc] bg-[#edf4ef] p-3 text-xs text-[#35604f]"><p>Signed in as {session.user.email}</p><p className="mt-2 font-semibold">Plan: {currentPlan}</p>{billing?.status && billing.status !== "none" && <p className="mt-1">Status: {billing.status}{billing.cancelAtPeriodEnd ? " · cancels at period end" : ""}</p>}<div className="mt-3 flex flex-wrap gap-2">{currentPlan === "Free" && <><button className="rounded-full bg-[#173c32] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={pending} type="button" onClick={() => void checkout("Creator")}>Creator · $7.99/mo</button><button className="rounded-full border border-[#35604f] px-3 py-1.5 text-xs font-semibold disabled:opacity-50" disabled={pending} type="button" onClick={() => void checkout("Pro")}>Pro · $14.99/mo</button></>}{currentPlan === "Creator" && <button className="rounded-full border border-[#35604f] px-3 py-1.5 text-xs font-semibold disabled:opacity-50" disabled={pending} type="button" onClick={() => void checkout("Pro")}>Upgrade to Pro</button>}{currentPlan !== "Free" && <button className="rounded-full border border-[#35604f] px-3 py-1.5 text-xs font-semibold disabled:opacity-50" disabled={pending} type="button" onClick={() => void portal()}>Manage subscription</button>}<button className="px-2 py-1.5 underline" type="button" onClick={() => void signOut()}>Sign out</button></div>{message && <p className="mt-2 text-xs text-[#984b32]">{message}</p>}</div>; }
  return <div className="mt-3 rounded-xl border border-[#c8d4cc] bg-white p-3"><p className="text-xs text-[#35604f]">Sign in to sync projects</p><form className="mt-2 space-y-2" onSubmit={submit}><input required className="w-full rounded-lg border px-2 py-1.5 text-sm" type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} /><input required minLength={6} className="w-full rounded-lg border px-2 py-1.5 text-sm" type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="rounded-full bg-[#173c32] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={pending} type="submit">{mode === "sign-in" ? "Sign in" : "Sign up"}</button><button className="ml-2 text-xs underline" type="button" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}>{mode === "sign-in" ? "Create account" : "Use existing account"}</button></form>{message && <p className="mt-2 text-xs text-[#984b32]">{message}</p>}</div>;
}
