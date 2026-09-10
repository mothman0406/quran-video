# Launch QA checklist

Run this on the intended Netlify production URL with sandbox Stripe configured. Do not turn on Stripe live mode during this checklist.

## Public

- [ ] Landing page loads; mobile layout and legal links work.
- [ ] Editor opens, imports media, detects a passage, supports correction/caption editing/timeline edits, exports locally, and downloads the result.
- [ ] Before publishing, review detected passage, timing, generated captions, and any translation warnings.

## Auth and cloud

- [ ] Google login works and survives refresh; logout works; `/projects` requires a signed-in session.
- [ ] Save a project, update the same project, restore it, and delete it.
- [ ] Verify the Free account stops at three saved cloud projects.
- [ ] Confirm a second test user cannot see or fetch the first user's project/media.

## Billing sandbox

- [ ] Free → Pro and Free → Premium Checkout complete only with sandbox credentials.
- [ ] Pro → Premium and monthly → annual switching work in Customer Portal.
- [ ] Customer Portal opens, cancellation at period end retains access, immediate cancellation downgrades after the verified webhook.
- [ ] Confirm no preview/local deployment has live billing credentials.

## Account, legal, and security

- [ ] `/account` displays identity, plan, usage, billing management, sign-out, and deletion confirmation.
- [ ] In a disposable sandbox account, type `DELETE`, confirm Stripe subscription cancellation, project/media removal, and sign-out/account removal.
- [ ] `/privacy`, `/terms`, and 404 page render. Replace the marked business/contact placeholders before public launch.
- [ ] Check `/api/health` exposes only readiness booleans; reject a webhook with an invalid signature.
- [ ] Review browser bundles and Netlify logs for secrets, signed media URLs, or private media content.

## Monitoring handoff

Before adding a monitoring vendor, instrument only safe event metadata (route/action, status, error digest): auth failures, cloud save/restore failures, Checkout creation, Stripe webhook processing, recognition initialization, and export initialization. Never send source media, media URLs, access tokens, Quran-video content, or Stripe/Supabase secrets.

## Sharp advisory review

`@huggingface/transformers@3.8.1` declares optional `sharp@^0.34.1`; the lockfile resolves its nested Sharp package to `0.34.5`. The application imports Transformers.js only from browser recognition code, while server routes are kept free of that recognition graph and the Netlify server bundle check must report no Transformers.js/ONNX packages. This reduces server reachability but does not make an upstream advisory harmless: re-check `npm audit` and the package advisory at launch. Upgrade when Transformers.js publishes a compatible dependency range containing the patched Sharp version; do not force an override without a browser-model and Netlify bundle regression pass.
