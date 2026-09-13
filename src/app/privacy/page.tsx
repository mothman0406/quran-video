import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy | Quran AutoCaption" };

export default function PrivacyPage() {
  return <main className="legal-page">
    <Link href="/">Quran AutoCaption</Link>
    <h1>Privacy</h1>
    <p>Last updated: September 9, 2026</p>
    <h2>What we process</h2>
    <p>We use Supabase for authentication and videos you explicitly save to your account. Google OAuth is used only when you choose Google sign-in. Your account email and basic provider profile information are used to identify your account.</p>
    <p>Unsaved editing, Quran recognition, and video rendering/export run locally in your browser. When you choose cloud Save, the editable project and its source media are privately uploaded to Supabase so you can restore them later. Exports are created locally and are not uploaded by the normal export flow.</p>
    <h2>Payments and connected services</h2>
    <p>Stripe hosts Checkout and billing management and processes payment details. We receive billing status needed to provide your plan. Netlify hosts the application. TikTok is used only when its optional integration is configured and you choose to connect it.</p>
    <h2>Retention and controls</h2>
    <p>You can delete saved videos and their private source media from Videos. Account Settings lets you delete your account, saved video metadata, private project media, and application billing mappings. Active subscriptions are cancelled before account removal; Stripe may retain records it is required to keep.</p>
    <h2>Cookies and storage</h2>
    <p>We use authentication cookies/session storage and browser-local storage needed for the editor, preferences, and local work. Supabase uses cookies to maintain a signed-in session.</p>
    <h2>Contact</h2>
    <p>Quran AutoCaption is operated by Mohammad Othman.</p>
    <p>Contact <a href="mailto:o.e.mohammad@gmail.com">o.e.mohammad@gmail.com</a> with privacy questions, account requests, or other data-related concerns.</p>
    <p><Link href="/terms">Terms</Link> · <Link href="/account">Account settings</Link></p>
  </main>;
}
