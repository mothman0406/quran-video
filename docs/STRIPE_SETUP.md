# Stripe subscription billing setup (sandbox/test mode)

Quran Video uses Stripe-hosted Checkout and the Customer Portal. The application never accepts card details. Keep the Stripe Dashboard in **Test mode** until launch approval, and use only `sk_test_…` and test-mode `price_…` values below.

## 1. Create the products and recurring prices

In the Stripe Dashboard test-mode toggle:

1. Open **Product catalog** and create **Quran Video Pro**.
2. Add a recurring USD price of **$9.99**, billed **monthly**. Copy its Price ID into `STRIPE_PRO_MONTHLY_PRICE_ID`.
3. Add a recurring USD price of **$99.00**, billed **yearly**. Copy its Price ID into `STRIPE_PRO_ANNUAL_PRICE_ID`.
4. Create **Quran Video Premium**.
5. Add a recurring USD price of **$19.99**, billed **monthly**. Copy its Price ID into `STRIPE_PREMIUM_MONTHLY_PRICE_ID`.
6. Add a recurring USD price of **$199.00**, billed **yearly**. Copy its Price ID into `STRIPE_PREMIUM_ANNUAL_PRICE_ID`.

Do not create Prices in the browser or place Price IDs in client code. Configure the Customer Portal only after all four Prices exist.

## 2. Configure application variables

Put these in local `.env.local` and in the server-side environment for the deployed app. Never commit any values. Restart `npm run dev` after a change.

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_PRO_ANNUAL_PRICE_ID=price_...
STRIPE_PREMIUM_MONTHLY_PRICE_ID=price_...
STRIPE_PREMIUM_ANNUAL_PRICE_ID=price_...
NEXT_PUBLIC_APP_URL=http://localhost:3000
SUPABASE_SERVICE_ROLE_KEY=your-server-only-supabase-service-role-key
```

`NEXT_PUBLIC_APP_URL` is an origin, not a secret; it must be the exact deployed HTTPS origin in production. Every other value here is server-only. Do not add a `NEXT_PUBLIC_STRIPE_*` key: Checkout is hosted by Stripe and does not need Stripe.js.

Set `STRIPE_BILLING_ENV=sandbox` with `sk_test_…`. The server rejects an unknown key mode or an explicit environment/key mismatch. It also retrieves the four configured Prices immediately before Checkout and rejects them if Stripe reports a different `livemode` from the secret key. This prevents test/live Price mixing without placing Price IDs in the browser. Netlify deploy previews, branch deployments, and local development reject live keys; previews should use isolated sandbox credentials or leave billing unset.

## 3. Apply the Supabase migration

Apply `supabase/migrations/20260909000000_stripe_subscription_billing.sql` after the existing migrations. It adds `billing_customers`, `billing_subscriptions`, and a replay-safe extension of `stripe_webhook_events`. It does not replace `account_entitlements`; the signed webhook is its only Stripe write path.

The launch policy is intentionally conservative: a known Price with `active` or `trialing` grants its matching plan. `past_due`, `unpaid`, `canceled`, `incomplete`, `incomplete_expired`, `paused`, unknown Price IDs, and missing subscriptions resolve to Free. A subscription with `cancel_at_period_end` remains paid until Stripe reports it ended.

## 4. Configure webhooks and Customer Portal

For the deployed app, create a test-mode webhook endpoint at:

```text
https://YOUR_DOMAIN/api/stripe/webhook
```

Subscribe it to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

Copy that endpoint’s signing secret into `STRIPE_WEBHOOK_SECRET`; it is different from the API secret key. In **Settings → Billing → Customer portal**, activate the portal, enable payment-method and invoice history, and enable cancellation. Enable subscription switching and expose all four recurring Prices in its update configuration: Quran Video Pro monthly/yearly and Quran Video Premium monthly/yearly. The Pro-to-Premium action deep-links into Stripe's `subscription_update` flow; the portal configuration controls the allowed plan/interval choices and proration. If subscription switching is disabled or excludes a Price, Stripe rejects the deep link and Quran Video leaves the current entitlement unchanged. [Stripe’s portal configuration guide](https://docs.stripe.com/customer-management/configure-portal) documents these settings.

## 5. Local webhook workflow

Install and authenticate the Stripe CLI yourself (the repository does not install global tools), then run the application in one terminal and the listener in another:

```bash
npm run dev
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the `whsec_…` printed by `stripe listen` into local `STRIPE_WEBHOOK_SECRET`, restart the dev server, and complete Checkout. You can also send representative events with `stripe trigger customer.subscription.updated`. Stripe documents this CLI forwarding workflow in its [webhook guide](https://docs.stripe.com/webhooks?lang=node).

## 6. Test and inspect

1. Sign in to Quran Video and choose Pro or Premium, then Monthly or Annual.
2. Complete Stripe-hosted Checkout with `4242 4242 4242 4242`, any future expiry, any three-digit CVC, and any postal code. Use only test keys and test cards.
3. Check **Developers → Event destinations** in Stripe for a successful webhook delivery.
4. In Supabase, verify the account row in `account_entitlements` changed to `pro` or `premium` with `source = 'stripe'`; inspect `billing_subscriptions` for status/interval without exposing it to browser writes.
5. Open **Manage plan**, verify the general Customer Portal opens, then cancel at period end. The webhook should set `cancel_at_period_end = true` while access remains paid. Use Stripe’s test clock or end/cancel the test subscription to exercise the final downgrade webhook.
6. With an active Pro subscription, open **Billing & plans**, choose **Upgrade to Premium**, and verify Stripe opens the existing subscription's plan-update flow rather than Checkout. After completing it, wait for `customer.subscription.updated`; Quran Video refreshes the signed-webhook entitlement and shows Premium only after that projection completes.

Stripe’s current test-card documentation confirms the `4242` Visa number, a future expiry, and any three-digit CVC for an interactive successful payment. [Stripe test cards](https://docs.stripe.com/testing?numbers-or-method-or-token=tokens)

To reset a sandbox test user safely before real launch: cancel the user’s sandbox subscription in Stripe, wait for the signed `customer.subscription.deleted` delivery, and confirm `account_entitlements` becomes `free`. Then use Account Settings → Delete account (or delete its projects separately if keeping the account). Do not manually assign a paid entitlement or edit a customer mapping. Delete the sandbox Customer only after its subscriptions are resolved; the next Checkout will recreate the mapping through the normal server path. Never carry a sandbox `billing_subscriptions` or `account_entitlements` paid row into a live-billing launch.

## Account deletion policy

When a member confirms account deletion, the server authenticates the caller and works in this order: cancel every nonterminal subscription on that member's mapped Stripe Customer, write a minimal Stripe-customer tombstone to ignore delayed webhooks, remove private project-media objects through the Supabase Storage API, remove project and application billing/entitlement records, then delete the Supabase Auth user last. Stripe retains billing records it is legally required to retain. If any step fails, Auth is not deleted and the signed-in user receives a retry-safe failure instead of a false completion.

## Future live-mode change (do not perform during this milestone)

Live mode is a separate launch change, not an environment-value swap to make ahead of time. When it is explicitly approved:

1. Create or select the live versions of the same Pro/Premium monthly/yearly recurring Prices. Keep the same price structure, SaaS tax code, and portal subscription-switch configuration.
2. Set `STRIPE_BILLING_ENV=live`, replace the test secret with a live `STRIPE_SECRET_KEY`, and replace all four Price IDs with their live recurring IDs. The server will reject a live key with sandbox Prices or a sandbox key with live Prices.
3. Create a live webhook endpoint at `https://<production-domain>/api/stripe/webhook`, subscribe to the same four event types, and set its distinct live `STRIPE_WEBHOOK_SECRET`.
4. Activate and verify the live Customer Portal configuration before allowing paid users into it.
5. Deploy the changed production-only variables, then repeat Checkout, webhook, portal switching, cancellation-at-period-end, and immediate-cancellation validation with a real internal test account.

Never copy live variables to Preview or Development, and do not create live products automatically from this repository.
