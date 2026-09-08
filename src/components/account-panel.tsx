"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabaseClient, sendMagicLink, signInWithGoogle, signOut } from "@/lib/cloud-sync";
import { accountPlanForAuthenticatedUser } from "@/lib/auth-flow";

type AccountPanelProps = { session: Session | null; onClose: () => void; onBeforeAuthenticate?: () => Promise<void> };

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

export default function AccountPanel({ session, onClose, onBeforeAuthenticate }: AccountPanelProps) {
  const configured = getSupabaseClient() !== null;
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [startingGoogle, setStartingGoogle] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
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

  async function continueWithGoogle() {
    setStartingGoogle(true);
    setMessage(null);
    try { await onBeforeAuthenticate?.(); await signInWithGoogle(); }
    catch (error) { setMessage(friendlyAuthError(error)); setStartingGoogle(false); }
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCheckingEmail(true);
    setMessage(null);
    try { await onBeforeAuthenticate?.(); await sendMagicLink(email.trim()); setMessage(`Check ${email.trim()} for a sign-in link. You can close this window while you wait.`); }
    catch (error) { setMessage(friendlyAuthError(error)); }
    finally { setCheckingEmail(false); }
  }

  if (session) {
    const user = session.user;
    const avatar = avatarUrl(user);
    return <div className="editor-account-menu" role="menu" aria-label="Account menu">
      <div className="editor-account-identity">{avatar ? <span aria-label="Account avatar" style={{ backgroundImage: `url(${avatar})` }} /> : <span aria-hidden="true">{displayName(user).slice(0, 1).toUpperCase()}</span>}<div><strong>{displayName(user)}</strong><small>{user.email}</small></div></div>
      <div className="editor-account-plan"><span>Current plan</span><strong>{accountPlanForAuthenticatedUser().replace(/^./, (letter) => letter.toUpperCase())}</strong></div>
      <button type="button" role="menuitem" className="editor-account-menu-item" onClick={onClose}>Manage account</button>
      <button type="button" role="menuitem" className="editor-account-menu-item editor-account-signout" onClick={() => void signOut().then(onClose).catch((error: unknown) => setMessage(friendlyAuthError(error)))}>Sign out</button>
      {message && <p className="editor-auth-message editor-auth-error" role="alert">{message}</p>}
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
