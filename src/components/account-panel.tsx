"use client";

import { FormEvent, useEffect, useState } from "react";
import { getAuthSession, getSupabaseClient, signIn, signOut, signUp } from "@/lib/cloud-sync";
import type { Session } from "@supabase/supabase-js";

export default function AccountPanel({ onSessionChange }: { onSessionChange: (session: Session | null) => void }) {
  const configured = getSupabaseClient() !== null;
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!configured) return;
    let active = true;
    void getAuthSession().then((next) => { if (active) { setSession(next); onSessionChange(next); } }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not read account session."));
    const supabase = getSupabaseClient();
    const subscription = supabase?.auth.onAuthStateChange((_event, next) => { setSession(next); onSessionChange(next); });
    return () => { active = false; subscription?.data.subscription.unsubscribe(); };
  }, [configured, onSessionChange]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage(null);
    try {
      const next = mode === "sign-in" ? await signIn(email, password) : await signUp(email, password);
      setSession(next);
      if (next) setMessage(mode === "sign-in" ? "Signed in. Cloud sync is ready." : "Account created. Cloud sync is ready.");
      else setMessage("Check your email to confirm your account, then sign in.");
      setPassword("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Account action failed."); }
    finally { setPending(false); }
  }

  if (!configured) return <p className="mt-2 text-xs text-[#68716a]">Sign in to sync projects (Supabase is not configured yet).</p>;
  if (session) return <div className="mt-3 rounded-xl border border-[#c8d4cc] bg-[#edf4ef] p-3 text-xs text-[#35604f]"><p>Signed in as {session.user.email}</p><button className="mt-2 underline" type="button" onClick={() => void signOut()}>Sign out</button></div>;
  return <div className="mt-3 rounded-xl border border-[#c8d4cc] bg-white p-3"><p className="text-xs text-[#35604f]">Sign in to sync projects</p><form className="mt-2 space-y-2" onSubmit={submit}><input required className="w-full rounded-lg border px-2 py-1.5 text-sm" type="email" placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} /><input required minLength={6} className="w-full rounded-lg border px-2 py-1.5 text-sm" type="password" placeholder="Password" value={password} onChange={(event) => setPassword(event.target.value)} /><button className="rounded-full bg-[#173c32] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50" disabled={pending} type="submit">{mode === "sign-in" ? "Sign in" : "Sign up"}</button><button className="ml-2 text-xs underline" type="button" onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}>{mode === "sign-in" ? "Create account" : "Use existing account"}</button></form>{message && <p className="mt-2 text-xs text-[#984b32]">{message}</p>}</div>;
}
