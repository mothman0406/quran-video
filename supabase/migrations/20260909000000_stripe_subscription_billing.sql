-- Stripe TEST/production billing projections. account_entitlements remains the
-- single effective-plan authority; these tables retain verified Stripe state.

create table if not exists public.billing_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text not null unique,
  stripe_subscription_id text not null unique,
  stripe_price_id text,
  plan text not null default 'free' check (plan in ('free', 'pro', 'premium')),
  billing_interval text check (billing_interval in ('month', 'year')),
  status text not null,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The retired table used event_id and marked rows processed at insert. Rename it
-- additively so existing history remains idempotent, while new deliveries are
-- marked processed only after their projection succeeds.
alter table public.stripe_webhook_events rename column event_id to stripe_event_id;
alter table public.stripe_webhook_events alter column processed_at drop not null;
alter table public.stripe_webhook_events alter column processed_at drop default;
alter table public.stripe_webhook_events add column if not exists status text not null default 'processed' check (status in ('received', 'processing', 'processed', 'failed'));
alter table public.stripe_webhook_events add column if not exists received_at timestamptz not null default now();
alter table public.stripe_webhook_events add column if not exists processing_started_at timestamptz;
alter table public.stripe_webhook_events add column if not exists failed_at timestamptz;
alter table public.stripe_webhook_events add column if not exists failure_summary text;
update public.stripe_webhook_events set status = 'processed', processed_at = coalesce(processed_at, now()) where status is null or processed_at is null;

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.stripe_webhook_events enable row level security;
revoke all on public.billing_customers from anon, authenticated;
revoke all on public.billing_subscriptions from anon, authenticated;
revoke all on public.stripe_webhook_events from anon, authenticated;

create index if not exists billing_subscriptions_status_idx on public.billing_subscriptions(status);
create index if not exists billing_subscriptions_customer_idx on public.billing_subscriptions(stripe_customer_id);
create index if not exists stripe_webhook_events_status_idx on public.stripe_webhook_events(status, received_at);

-- Only the service-role webhook may use this function. A fresh processing claim
-- suppresses concurrent Stripe retries; failed deliveries are explicitly retryable.
create or replace function public.claim_stripe_webhook_event(p_event_id text, p_event_type text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare v_event public.stripe_webhook_events;
begin
  insert into public.stripe_webhook_events (stripe_event_id, event_type, status, received_at)
  values (p_event_id, p_event_type, 'received', now())
  on conflict (stripe_event_id) do nothing;

  select * into v_event from public.stripe_webhook_events where stripe_event_id = p_event_id for update;
  if v_event.status = 'processed' then return false; end if;
  if v_event.status = 'processing' and v_event.processing_started_at > now() - interval '10 minutes' then return false; end if;
  update public.stripe_webhook_events
    set status = 'processing', processing_started_at = now(), failed_at = null, failure_summary = null
    where stripe_event_id = p_event_id;
  return true;
end $$;

revoke all on function public.claim_stripe_webhook_event(text, text) from public;
grant execute on function public.claim_stripe_webhook_event(text, text) to service_role;

comment on table public.billing_customers is 'Server-only mapping of one authenticated application account to one Stripe Customer.';
comment on table public.billing_subscriptions is 'Server-only Stripe subscription projection. account_entitlements remains the effective-plan source.';
comment on table public.stripe_webhook_events is 'Server-only verified Stripe webhook idempotency ledger; processed is written only after projection succeeds.';
comment on column public.account_entitlements.source_reference is 'For source=stripe, the verified Stripe subscription ID that produced the effective plan.';
