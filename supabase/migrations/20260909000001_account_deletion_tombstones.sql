-- Retains no application user identity. This minimal server-only record stops
-- delayed Stripe webhooks from recreating mappings for deleted Supabase users.
create table if not exists public.billing_customer_deletions (
  stripe_customer_id text primary key,
  deleted_at timestamptz not null default now()
);

alter table public.billing_customer_deletions enable row level security;
revoke all on public.billing_customer_deletions from anon, authenticated;

comment on table public.billing_customer_deletions is 'Minimal Stripe-customer deletion tombstones. Retained to ignore delayed verified webhooks after account removal.';
