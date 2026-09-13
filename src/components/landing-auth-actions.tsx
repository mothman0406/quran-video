"use client";

import { useState } from "react";
import Link from "next/link";
import AccountPanel from "@/components/account-panel";

type LandingAuthActionsProps = { authenticated: boolean };

/** Keeps the public landing header guest-first while reusing the editor's auth UI. */
export default function LandingAuthActions({ authenticated }: LandingAuthActionsProps) {
  const [authOpen, setAuthOpen] = useState(false);

  return <div className="landing-auth-actions">
    {authenticated ? <Link className="landing-auth-link" href="/videos">Videos</Link> : <button className="landing-auth-link" type="button" onClick={() => setAuthOpen(true)}>Sign in</button>}
    <Link className="landing-header-cta" href="/create">Start creating <span aria-hidden="true">↗</span></Link>
    {authOpen && <AccountPanel session={null} authReturnPath="/videos" onClose={() => setAuthOpen(false)} />}
  </div>;
}
