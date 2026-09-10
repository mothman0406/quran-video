import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms | Quran AutoCaption" };

export default function TermsPage() {
  return <main className="legal-page">
    <Link href="/">Quran AutoCaption</Link>
    <h1>Terms</h1>
    <p>Last updated: September 9, 2026</p>
    <h2>Service</h2>
    <p>Quran AutoCaption is a browser-based Quran captioning and video-editing service. You are responsible for your account credentials and for keeping your account information accurate.</p>
    <h2>Content and acceptable use</h2>
    <p>You are responsible for the media and content you upload, create, export, or publish, including having the rights and permissions to use it. Do not use the service unlawfully, to infringe rights, or to harm others.</p>
    <h2>Quran captions</h2>
    <p>Automatic detection and timing can be imperfect. Review generated Quran passage selection, captions, translations, and timing before publication. Once a passage is identified, the app uses canonical Quran text as its authoritative text source.</p>
    <h2>Subscriptions</h2>
    <p>Paid plans renew according to the billing interval shown at Stripe Checkout unless cancelled through Stripe&apos;s Customer Portal. Plan access and cancellation timing are determined by Stripe&apos;s verified subscription status. You can manage or cancel an active subscription in Account Settings.</p>
    <h2>Availability and liability</h2>
    <p>The service is provided as available and may change or be interrupted. To the extent permitted by law, the responsible provider is not liable for indirect, incidental, special, or consequential loss arising from use of the service.</p>
    <h2>Applicable law</h2>
    <p>These Terms do not designate a governing jurisdiction. Any legal rights and obligations are determined by applicable law.</p>
    <h2>Provider and contact</h2>
    <p>Quran AutoCaption is operated by Mohammad Othman.</p>
    <p>Contact <a href="mailto:o.e.mohammad@gmail.com">o.e.mohammad@gmail.com</a> with Terms questions or service and support questions.</p>
    <p><Link href="/privacy">Privacy</Link> · <Link href="/account">Account settings</Link></p>
  </main>;
}
