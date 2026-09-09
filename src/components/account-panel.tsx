"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient, listCloudProjectRecords, sendMagicLink, signInWithGoogle, signOut } from "@/lib/cloud-sync";
import { accountEntitlementsForPlan, type AccountEntitlements } from "@/lib/entitlements";
import { openCustomerPortal } from "@/lib/billing/client";
import PlanComparisonDialog from "@/components/plan-comparison-dialog";

type AccountPanelProps = { session: Session | null; entitlements?: AccountEntitlements; onClose: () => void; onBeforeAuthenticate?: () => Promise<void>; authReturnPath?: "/editor" | "/projects"; onOpenPlanComparison?: () => void; onEntitlementsRefresh?: () => Promise<void> };

function displayName(user: User): string {
  const metadata = user.user_metadata;
  for (const key of ["full_name", "name", "display_name"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return user.email ?? "Quran Video member";
}

function avatarUrl(user: User): string | null {
  const metadata = user.user_metadata;
  for (const key of ["avatar_url", "picture"]) {
    const value = metadata[key];
    if (typeof value === "string" && /^https?:\/\//.test(value)) return value;
  }
  return null;
}

function friendlyAuthError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Authentication could not be started.";
  if (/provider.*(?:not enabled|disabled)|unsupported provider|google.*(?:not enabled|disabled)/i.test(message)) return "Google sign-in is not configured for this environment. Use email instead, or enable Google in Supabase.";
  if (/not configured/i.test(message)) return "Authentication is not configured for this environment. Add the Supabase public URL and key to enable it.";
  return message;
}

export default function AccountPanel({ session, entitlements = accountEntitlementsForPlan("free"), onClose, onBeforeAuthenticate, authReturnPath = "/editor", onOpenPlanComparison, onEntitlementsRefresh }: AccountPanelProps) {
  const configured = getSupabaseClient() !== null;
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [startingGoogle, setStartingGoogle] = useState(false);
  const [cloudProjectCount, setCloudProjectCount] = useState<number | null>(null);
  const [planComparisonOpen, setPlanComparisonOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const openPlanComparison = onOpenPlanComparison ?? (() => setPlanComparisonOpen(true));
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (session) return;
    const frame = requestAnimationFrame(() => (emailRef.current ?? dialogRef.current?.querySelector<HTMLElement>("button"))?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), a[href]')];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", onKeyDown); };
  }, [onClose, session]);

  useEffect(() => {
    if (!session || entitlements.plan !== "free") return;
    let active = true;
    void listCloudProjectRecords().then((records) => { if (active) setCloudProjectCount(records.length); }).catch(() => { if (active) setCloudProjectCount(null); });
    return () => { active = false; };
  }, [entitlements.plan, session]);

  useEffect(() => {
    if (!session || planComparisonOpen) return;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector<HTMLElement>("button, a[href]")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [planComparisonOpen, session]);

  async function continueWithGoogle() {
    setStartingGoogle(true);
    setMessage(null);
    try { await onBeforeAuthenticate?.(); await signInWithGoogle(authReturnPath); }
    catch (error) { setMessage(friendlyAuthError(error)); setStartingGoogle(false); }
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckingEmail(true);
    setMessage(null);
    try { await onBeforeAuthenticate?.(); await sendMagicLink(email.trim(), authReturnPath); setMessage(`Check ${email.trim()} for a sign-in link. You can close this window while you wait.`); }
    catch (error) { setMessage(friendlyAuthError(error)); }
    finally { setCheckingEmail(false); }
  }

  async function managePlan() {
    if (!session) return;
    setMessage(null);
    try { window.location.assign(await openCustomerPortal(session)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Customer Portal could not be opened. Please try again."); }
  }

  if (session) {
    const user = session.user;
    const avatar = avatarUrl(user);
    const planName = entitlements.plan.toUpperCase();
    const freeUsage = cloudProjectCount === null ? "Loading project usage…" : `${cloudProjectCount} of ${entitlements.cloudProjectLimit} cloud projects`;
    const paidBenefits = entitlements.plan === "pro" ? ["Up to 1080p", "No watermark"] : ["Up to 4K", "No watermark"];
    return <div className="editor-account-menu" ref={menuRef} role="menu" aria-label="Account menu" onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); onClose(); } }}>
      <div className="editor-account-identity">{avatar ? <span aria-label="Account avatar" style={{ backgroundImage: `url(${avatar})` }} /> : <span aria-hidden="true">{displayName(user).slice(0, 1).toUpperCase()}</span>}<div><strong>{displayName(user)}</strong><small>{user.email}</small></div></div>
      <section className="editor-account-plan-card" aria-label={`${planName} plan`}>
        <div><span>{planName} PLAN</span><b>{entitlements.plan === "free" ? "Editor essentials" : "Active access"}</b></div>
        {entitlements.plan === "free" ? <ul><li>720p exports</li><li>Watermark on exports</li><li>{freeUsage}</li></ul> : <ul>{paidBenefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>}
        <button type="button" className="editor-account-plan-action" onClick={entitlements.plan === "free" ? openPlanComparison : () => void managePlan()}>{entitlements.plan === "free" ? "Upgrade plan" : "Manage plan"}</button>
      </section>
      <div className="editor-account-menu-links"><a role="menuitem" className="editor-account-menu-item" href="/projects" onClick={onClose}>Projects</a><button type="button" role="menuitem" className="editor-account-menu-item" onClick={openPlanComparison}>Billing &amp; plans</button></div>
      <button type="button" role="menuitem" className="editor-account-menu-item editor-account-signout" onClick={() => void signOut().then(onClose).catch((error: unknown) => setMessage(friendlyAuthError(error)))}>Sign out</button>
      {message && <p className="editor-auth-message editor-auth-error" role="alert">{message}</p>}
      {planComparisonOpen && <PlanComparisonDialog entitlements={entitlements} session={session} onEntitlementsRefresh={onEntitlementsRefresh} onClose={() => setPlanComparisonOpen(false)} />}
    </div>;
  }

  return <div className="editor-auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="editor-auth-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="auth-title" aria-describedby="auth-description">
      <button className="editor-auth-close" type="button" aria-label="Close sign in" onClick={onClose}>×</button>
      <div className="editor-auth-mark" aria-hidden="true">۞</div><p className="editor-auth-brand">Quran Video</p>
      <h2 id="auth-title">Welcome to Quran Video</h2><p id="auth-description">Save your work and export your videos.</p>
      {!configured ? <p className="editor-auth-message editor-auth-error" role="alert">Authentication is not configured in this environment. Add the Supabase public URL and key to enable sign-in.</p> : <>
        <button className="editor-auth-google" type="button" disabled={startingGoogle || checkingEmail} onClick={() => void continueWithGoogle()}><span aria-hidden="true">G</span>{startingGoogle ? "Opening Google…" : "Continue with Google"}</button>
        <div className="editor-auth-divider"><span>or</span></div>
        <form onSubmit={submitEmail}><label htmlFor="auth-email">Email</label><input ref={emailRef} id="auth-email" required type="email" autoComplete="email" placeholder="you@example.com" value={email} disabled={startingGoogle || checkingEmail} onChange={(event) => setEmail(event.target.value)} /><button className="editor-auth-email-button" type="submit" disabled={startingGoogle || checkingEmail}>{checkingEmail ? "Sending link…" : "Continue with email"}</button></form>
      </>}
      {message && <p className={`editor-auth-message ${message.startsWith("Check ") ? "editor-auth-success" : "editor-auth-error"}`} role="status">{message}</p>}
      <p className="editor-auth-legal">By continuing, you agree to the Terms and Privacy Policy.</p>
    </div>
  </div>;
}
