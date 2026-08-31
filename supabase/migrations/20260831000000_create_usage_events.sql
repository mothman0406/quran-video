create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  operation_id text,
  created_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

alter table public.usage_events enable row level security;

create policy "Users can read their own usage" on public.usage_events
  for select using (auth.uid() = user_id);

create index if not exists usage_events_user_created_at_idx
  on public.usage_events(user_id, created_at desc);
create index if not exists usage_events_user_event_created_at_idx
  on public.usage_events(user_id, event_type, created_at desc);
create unique index if not exists usage_events_user_event_operation_idx
  on public.usage_events(user_id, event_type, operation_id)
  where operation_id is not null;

comment on table public.usage_events is 'Append-only, server-recorded quota events; metadata must not contain media or project contents.';
comment on column public.usage_events.operation_id is 'Optional idempotency key supplied by a trusted server path.';
