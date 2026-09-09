# Production plan entitlements

## Canonical plans and export policy

| Plan | Basic (720p) | Standard (1080p) | Ultra (4K) | Cloud projects |
| --- | --- | --- | --- | --- |
| Free | Allowed, Quran Video watermark forced | Locked, requires Pro | Locked, requires Premium | 3 saved projects |
| Pro | Allowed, no watermark | Allowed, no watermark | Locked, requires Premium | TBD |
| Premium | Allowed, no watermark | Allowed, no watermark | Allowed, no watermark | TBD |

There is no monthly video or export-count quota. Recognition runs locally and does not consume a plan quota. Paid project/storage limits have not been decided; the application does not market them as unlimited.

`src/lib/entitlements.ts` is the sole plan model: `"free" | "pro" | "premium"`. It derives export quality and watermark policy; no request accepts a caller-selected plan or watermark flag.

## Authority and rendering boundary

`resolveAccountEntitlements(userId)` runs only on the server and reads `public.account_entitlements`. Missing or unknown plan rows resolve safely to Free. `/api/export-authorization` authenticates the Supabase bearer user, resolves the current entitlement again, and authorizes the exact requested quality before every new local render. A lookup failure returns a safe user-facing error; it never grants higher quality.

The resolver needs the existing server-only `SUPABASE_SERVICE_ROLE_KEY` together with `NEXT_PUBLIC_SUPABASE_URL`. It is used only in route handlers, never shipped to the browser.

The renderer is intentionally browser-local. A determined user can modify JavaScript running in their own browser, so this does not make local rendering cryptographically tamper-proof. All supported application entry points use the server authorization path; the browser is not accepted as the source of plan, quality permission, or watermark state.

The resulting watermark state is passed into the immutable render snapshot. The existing export canvas draws the tasteful `Quran Video` watermark only when that authorized state is true. It is never added to the editor preview, project data, source media, cloud media, or thumbnails.

Completed exports remain downloadable even after UI changes. **Export another version**, settings export, preflight retry, and the TikTok prerequisite flow all start a new export and therefore reauthorize. TikTok blocks only completed exports whose actual render has a product watermark: Free Basic is ineligible; paid Basic, Standard, and Ultra exports may use the existing TikTok flow.

## Database and operations

Apply `supabase/migrations/20260908000002_account_entitlements.sql` to the production Supabase project after the existing cloud-project migrations. It adds `account_entitlements` with plan, source, effective timestamp, and audit timestamps. RLS allows a user to read only their own row; all insert/update/delete rights are revoked from ordinary users. Server/admin automation is the only write path.

The migration carries active/trialing historical subscription rows forward once (`Creator → pro`, historical `Pro → premium`) when that old table exists. Historical Stripe checkout, portal, webhook, and `/api/usage` routes are intentionally inactive; a future Stripe milestone should update `account_entitlements` with `source = 'stripe'`, not add a second policy layer.

For local or staging tier verification, run one of these in the Supabase SQL Editor as an admin. Replace the email with the test account; do not expose this through the browser.

```sql
-- Free
insert into public.account_entitlements (user_id, plan, source, effective_at)
select id, 'free', 'manual', now() from auth.users where email = 'test@example.com'
on conflict (user_id) do update set plan = excluded.plan, source = excluded.source, effective_at = excluded.effective_at, updated_at = now();

-- Pro
insert into public.account_entitlements (user_id, plan, source, effective_at)
select id, 'pro', 'manual', now() from auth.users where email = 'test@example.com'
on conflict (user_id) do update set plan = excluded.plan, source = excluded.source, effective_at = excluded.effective_at, updated_at = now();

-- Premium
insert into public.account_entitlements (user_id, plan, source, effective_at)
select id, 'premium', 'manual', now() from auth.users where email = 'test@example.com'
on conflict (user_id) do update set plan = excluded.plan, source = excluded.source, effective_at = excluded.effective_at, updated_at = now();
```

Sign out/in or reopen Export Settings to refresh the displayed account entitlement. The server always rechecks before a new render.

Stripe Checkout, Customer Portal, price IDs, and webhook synchronization are intentionally not part of this milestone.
