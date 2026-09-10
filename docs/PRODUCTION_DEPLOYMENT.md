# Production deployment

This guide prepares Quran Video for a public Netlify deployment while keeping recognition and video rendering local to the browser. It deliberately leaves Stripe in sandbox/test mode. Do not invent a domain in configuration: replace `<production-domain>` only after the domain exists.

## Architecture and deployment blockers

- Vercel serves the Next.js application and lightweight Node.js routes only. It does not receive source video, model inference audio, or rendered video bytes.
- Browser-local FastConformer/Whisper/VAD downloads model and WASM assets over HTTPS. FastConformer uses a pinned Hugging Face revision; Whisper uses Transformers.js caching when available. WebGPU is attempted only for Whisper and falls back to WASM. VAD assets are deployed from `public/ort` at absolute `/ort/` paths.
- Local export uses WebCodecs, Mediabunny, Blob URLs, and a browser download. A browser without the required codec support is shown the existing capability message; no export is proxied through Vercel.
- Cloud source media uploads, downloads, signed thumbnails, replacement cleanup, and deletion go directly between the authenticated browser and the private Supabase `project-media` bucket under owner-scoped RLS. Vercel is not a media proxy.
- Stripe Billing and TikTok are optional integrations. Missing configuration leaves the editor, local recognition, local preview, and local export usable. `npm run check:production-config` and startup logs report only missing variable names, never values.
- The Node.js Stripe webhook already reads the raw `Request` body once with `request.text()` and validates its Stripe signature before processing. It is `runtime = "nodejs"` and `dynamic = "force-dynamic"`; no body parser runs ahead of signature verification.
- The only launch blocker is operational: all required Supabase migrations, dashboard URLs, test-mode Stripe settings, and real-browser checks below must be completed. There is no code-level requirement to send large media through Vercel.

## Environment contract

Set these in `.env.local` for local work and in Vercel Project Settings → Environment Variables for the appropriate environment. Never commit values or use a `NEXT_PUBLIC_` prefix for a secret.

| Classification | Variables | Notes |
| --- | --- | --- |
| Public | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL` | Browser-visible identifiers. `NEXT_PUBLIC_APP_URL` is the exact canonical origin, with no path, query, hash, or trailing route. It is `http://localhost:3000` locally and `https://<production-domain>` in production. It is authoritative for Checkout, Customer Portal, and authentication callbacks. |
| Server only, required for Supabase-backed billing | `SUPABASE_SERVICE_ROLE_KEY` | Used only by server-only entitlement/billing modules and the signed webhook projection. It must never enter client code or logs. |
| Server only, Stripe sandbox initially | `STRIPE_BILLING_ENV=sandbox`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_MONTHLY_PRICE_ID`, `STRIPE_PRO_ANNUAL_PRICE_ID`, `STRIPE_PREMIUM_MONTHLY_PRICE_ID`, `STRIPE_PREMIUM_ANNUAL_PRICE_ID` | Use only `sk_test_…`, the deployed webhook's test signing secret, and four test recurring Price IDs for this milestone. Checkout verifies each Price's Stripe livemode against the secret key. |
| Server only, optional TikTok | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`, optional `TIKTOK_TOKEN_ENCRYPTION_KEY`, optional `TIKTOK_DIRECT_POST_AUDITED=false` | Omit all of these to keep TikTok safely unavailable while downloads/export continue. |
| Server only, optional Quran Foundation API | `QF_CLIENT_ID`, `QF_CLIENT_SECRET`, optional `QF_ENV=prelive` | This optional server-side content integration has no bearing on the local canonical Quran workflow. |

`NEXT_PUBLIC_*` values are compiled into browser assets, so set their production value before the production build and redeploy after changing them. Review `npm run check:production-config` output during builds; it warns about missing integration variables without printing their values.

## Vercel steps

1. Connect the Git repository in Netlify. Use the repository build command, `npm run build`; do not add a media-processing dependency or a Netlify-specific media proxy.
2. Add the production environment variables from the table. Initially use Stripe **test** credentials and Prices. Set `NEXT_PUBLIC_APP_URL=https://<production-domain>` only once that canonical domain is known.
3. For Development, retain `NEXT_PUBLIC_APP_URL=http://localhost:3000` and test-mode Stripe. For Preview, use no Stripe variables or separate test-mode variables; never use a live secret. The server rejects `sk_live_…` when Vercel marks a deployment as Preview.
4. Preview URLs change per deployment. If auth is required in Preview, set `NEXT_PUBLIC_APP_URL` for Preview builds to that deployment's HTTPS Vercel URL and add Supabase's recommended `https://*-<team-or-account-slug>.vercel.app/**` redirect allow-list entry. Keep Preview Stripe unset or test-only; do not point a preview at the production Stripe webhook or live billing. Google OAuth JavaScript origins do not support a wildcard, so use a controlled preview hostname if Google sign-in itself needs testing.
5. Deploy. Copy the final deployed production URL, attach a custom domain later if desired, update `NEXT_PUBLIC_APP_URL` to the final canonical origin, and redeploy after any environment-variable change.
6. Confirm `/`, `/editor`, `/projects`, and `/api/stripe/webhook` resolve through the deployment. The webhook endpoint expects POST and returns a signature/configuration error rather than granting any entitlement without Stripe verification.

## Netlify server-function size check

The modern Netlify Next.js Runtime packages one shared `___netlify-server-handler`. Recognition, VAD, ONNX Runtime Web, Transformers.js, and Mediabunny must stay out of that handler: they are browser-only engines and are loaded only from the client editor boundary.

Before deploying a Netlify production build, run:

```bash
npm exec --yes --package=netlify-cli -- netlify build --offline
npm run analyze:netlify-server
```

The first command creates the local `.netlify` output without deploying. The second reports the handler ZIP size, unpacked size, and its largest files/packages. It should report no `@huggingface/transformers`, `onnxruntime-node`, `onnxruntime-web`, `fastconformer-onnxruntime-web`, `@ricky0123/vad-web`, or `mediabunny` entries. Do not use `serverExternalPackages` to hide a browser engine: externalization can still package its `node_modules` files.

## Supabase and Google OAuth dashboard setup

In Supabase Dashboard → Authentication → URL Configuration:

1. Set **Site URL** to `https://<production-domain>` after production deployment. During local work, use `http://localhost:3000` as the local Site URL or change it temporarily only in the local project.
2. Add these exact **Redirect URLs**:
   - `https://<production-domain>/auth/callback`
   - `http://localhost:3000/auth/callback`
3. For Vercel Preview authentication, Supabase supports the recommended `https://*-<team-or-account-slug>.vercel.app/**` redirect allow-list pattern. Use the exact production callback path in production, and use a controlled preview hostname if Google OAuth itself also needs testing.
4. Enable Google and email magic-link sign-in as applicable. Test both flows after saving the URLs.

In Google Cloud Console for the OAuth client used by Supabase:

1. Add authorized JavaScript origins `https://<production-domain>` and `http://localhost:3000` (plus only a controlled preview origin when needed).
2. Add the Supabase callback URL shown by Supabase's Google provider configuration, normally `https://<supabase-project-ref>.supabase.co/auth/v1/callback`, as an authorized redirect URI. The application’s `/auth/callback` is a Supabase redirect URL, not the Google redirect URI.
3. In Supabase Dashboard → Authentication → Providers → Google, paste the matching Google OAuth client ID and secret. Do not put the Google secret in Vercel or browser variables.

## Stripe sandbox deployment and webhook

1. In the Stripe Dashboard **Test mode**, enter the six Stripe variables and `SUPABASE_SERVICE_ROLE_KEY` in Vercel Production.
2. Create the test-mode endpoint `https://<production-domain>/api/stripe/webhook`. Subscribe only to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
3. Set that endpoint's signing secret as `STRIPE_WEBHOOK_SECRET`. Keep raw-body signature validation unchanged.
4. Activate the test Customer Portal, including cancellation and subscription switching among all four test Prices. Retain the configured SaaS tax code and switch behavior. See [STRIPE_SETUP.md](./STRIPE_SETUP.md) for the validated flow and the separate future live-mode checklist.
5. Verify Free → Pro, Free → Premium, Pro → Premium, monthly/annual switches, cancellation at period end, immediate cancellation to Free, webhook entitlement projection, and export permissions. Redirects do not grant a plan; only the signed webhook projection does.

## Private cloud media verification

With a normal authenticated user, verify that a cloud project can be saved, reopened, its private source restored, its source replaced, and the project deleted. In the Supabase Storage explorer, confirm the objects are in the private `project-media` bucket underneath `<user-id>/<project-id>/`. Verify an unrelated user cannot list, download, overwrite, or delete them. Large source/video blobs must appear in browser-to-Supabase requests, not Vercel route logs.

## Security and logging

The app sends `Referrer-Policy: strict-origin-when-cross-origin`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and a restrictive `Permissions-Policy` for camera, microphone, geolocation, and payment. Server-only billing, entitlement, and TikTok modules are guarded against client imports. Production error paths return safe human-readable messages and avoid logging tokens, signed URLs, Stripe secrets, webhook secrets, and service-role keys.

A Content-Security-Policy is deliberately not enabled in this release. The editor needs tested allowances for Next inline runtime code, WASM compilation/workers, Blob media, Supabase, Stripe redirects, Google auth, TikTok upload URLs, and version-pinned Hugging Face model assets. A speculative static CSP could silently break local recognition or export. Add CSP only as a separately tested report-only → enforced rollout with a real browser/media regression pass.

## Database migration checklist

Apply migrations once, in filename order, using the Supabase CLI or Dashboard SQL editor. First inspect the target project's migration history and schema; do **not** blindly rerun a migration against an unknown database.

1. `20260828000000_create_projects.sql`
2. `20260831000000_create_usage_events.sql`
3. `20260831000001_create_subscriptions.sql`
4. `20260908000000_production_cloud_projects.sql`
5. `20260908000001_storage_api_cloud_media_cleanup.sql`
6. `20260908000002_account_entitlements.sql`
7. `20260909000000_stripe_subscription_billing.sql`
8. `20260909000001_account_deletion_tombstones.sql`

Verify the private `project-media` bucket; `projects` fields including `save_complete`, source/thumbnail paths, and owner RLS; RPCs `begin_cloud_project_save`, `complete_cloud_project_save`, `cancel_cloud_project_save`, `delete_cloud_project`, `cleanup_replaced_cloud_media`, and `cloud_project_storage_summary`; `account_entitlements`; and billing tables `billing_customers`, `billing_subscriptions`, `stripe_webhook_events`, and server-only `billing_customer_deletions`. Confirm ordinary authenticated users have no direct writes to billing tables or service-role functions.

## Final production checklist

1. Deploy to Vercel with the environment contract above.
2. Add Supabase public values and the server-only service role.
3. Add Stripe sandbox credentials, four sandbox Price IDs, and the sandbox webhook secret.
4. Set and redeploy `NEXT_PUBLIC_APP_URL` with the canonical production URL.
5. Update Supabase Site URL and Redirect URLs.
6. Update Google origins and Supabase callback settings.
7. Configure the sandbox Stripe webhook to the deployed URL.
8. Verify Google and magic-link auth.
9. Verify cloud project save/open/restore/replace/delete using private Storage.
10. Verify automatic local detection, including model download over HTTPS and WASM fallback behavior.
11. Verify local export/download in a supported HTTPS browser, including a Blob download and any selected playback rate.
12. Verify sandbox Checkout.
13. Verify the webhook projects the plan before the UI unlocks paid export.
14. Verify Customer Portal and plan/interval switching.
15. Verify both cancellation-at-period-end and immediate cancellation.
16. Only after every sandbox check passes, schedule the separate Stripe live-mode checklist; do not enable live variables during this milestone.
