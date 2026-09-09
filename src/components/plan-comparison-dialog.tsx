"use client";

import { useEffect, useRef } from "react";
import type { AccountEntitlements, Plan } from "@/lib/entitlements";

type PlanComparisonDialogProps = { entitlements: AccountEntitlements; onClose: () => void };

const PLAN_DETAILS: Record<Plan, { name: string; benefits: readonly string[] }> = {
  free: { name: "Free", benefits: ["720p export", "Watermark on exports", "Up to 3 cloud projects"] },
  pro: { name: "Pro", benefits: ["Up to 1080p export", "No watermark"] },
  premium: { name: "Premium", benefits: ["Up to 4K export", "No watermark"] },
};

/** A presentation-only comparison. Entitlements remain server-authoritative. */
export default function PlanComparisonDialog({ entitlements, onClose }: PlanComparisonDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>("button")?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); return; }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("keydown", onKeyDown); };
  }, [onClose]);

  return <div className="plan-comparison-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="plan-comparison-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="plan-comparison-title" onKeyDown={(event) => event.stopPropagation()}>
      <header><div><p>QURAN VIDEO PLANS</p><h2 id="plan-comparison-title">Choose the export quality you need</h2></div><button className="plan-comparison-close" type="button" aria-label="Close plan comparison" onClick={onClose}>×</button></header>
      <p className="plan-comparison-intro">Your current access is shown below. Paid checkout and billing management will be available soon.</p>
      <div className="plan-comparison-cards">
        {(Object.keys(PLAN_DETAILS) as Plan[]).map((plan) => {
          const detail = PLAN_DETAILS[plan];
          const active = entitlements.plan === plan;
          return <article className={`plan-comparison-card ${active ? "is-current" : ""}`} key={plan}>
            <div><span>{detail.name.toUpperCase()}</span>{active && <b>Current plan</b>}</div>
            <ul>{detail.benefits.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
            {!active && plan !== "free" && <small>Upgrade available soon</small>}
          </article>;
        })}
      </div>
      <div className="plan-comparison-matrix" role="table" aria-label="Plan capability comparison">
        <div role="row" className="plan-comparison-matrix-head"><span role="columnheader">Capability</span><span role="columnheader">Free</span><span role="columnheader">Pro</span><span role="columnheader">Premium</span></div>
        <div role="row"><span role="cell">Maximum export</span><span role="cell">720p</span><span role="cell">1080p</span><span role="cell">4K</span></div>
        <div role="row"><span role="cell">Export watermark</span><span role="cell">Included</span><span role="cell">None</span><span role="cell">None</span></div>
        <div role="row"><span role="cell">Cloud projects</span><span role="cell">Up to 3</span><span role="cell">TBD</span><span role="cell">TBD</span></div>
      </div>
      <footer><span>Plan changes are not available in this preview.</span><button className="editor-button editor-button-quiet" type="button" onClick={onClose}>Done</button></footer>
    </section>
  </div>;
}
