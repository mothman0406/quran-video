create table if not exists public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text not null default 'Free' check (plan in ('Free', 'Creator', 'Pro')),
  status text not null default 'none',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "Users can read their own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);

create index if not exists subscriptions_customer_idx on public.subscriptions(stripe_customer_id);
create index if not exists subscriptions_status_idx on public.subscriptions(status);

comment on table public.subscriptions is 'Server-authoritative Stripe subscription projection; clients have read-only access through RLS.';
comment on column public.subscriptions.plan is 'Verified internal plan; never populated from client input.';

create table if not exists public.stripe_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

comment on table public.stripe_webhook_events is 'Server-only Stripe webhook idempotency records.';
