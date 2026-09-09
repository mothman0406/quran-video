-- Canonical account-plan projection. A future Stripe webhook may update this table,
-- but browser clients can only read their own effective state.
create table if not exists public.account_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro', 'premium')),
  source text not null default 'manual' check (source in ('manual', 'stripe', 'migration')),
  source_reference text,
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_entitlements enable row level security;
revoke all on public.account_entitlements from anon, authenticated;
grant select on public.account_entitlements to authenticated;
drop policy if exists "Users can read their own account entitlements" on public.account_entitlements;
create policy "Users can read their own account entitlements" on public.account_entitlements
  for select to authenticated using (auth.uid() = user_id);

comment on table public.account_entitlements is 'Canonical server-administered plan state. Stripe synchronization is intentionally deferred.';
comment on column public.account_entitlements.source_reference is 'Optional verified external reference; ordinary clients cannot write it.';

-- Existing historical subscription rows are migrated once without preserving any
-- old price IDs as entitlement authority. Creator maps to Pro; legacy Pro maps
-- to Premium. Only active/trialing rows are entitled.
do $$
begin
  if to_regclass('public.subscriptions') is not null then
    insert into public.account_entitlements (user_id, plan, source, effective_at)
    select user_id,
      case when plan = 'Creator' then 'pro' when plan = 'Pro' then 'premium' else 'free' end,
      'migration', now()
    from public.subscriptions
    where status in ('active', 'trialing')
    on conflict (user_id) do nothing;
  end if;
end $$;

-- Paid project/storage limits are TBD. The only enforced cap is the Free 3-project limit.
create or replace function public.cloud_project_limit_for_current_user()
returns integer language sql stable security definer set search_path = public, pg_temp as $$
  select case when coalesce((select plan from public.account_entitlements where user_id = auth.uid()), 'free') = 'free' then 3 else null end
$$;

create or replace function public.begin_cloud_project_save(
  p_id text, p_name text, p_auto_title text, p_surah_start integer, p_ayah_start integer, p_surah_end integer, p_ayah_end integer,
  p_duration_ms bigint, p_aspect_ratio text, p_project_data jsonb, p_source_filename text, p_source_metadata jsonb, p_schema_version integer
) returns setof public.projects language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_existing public.projects; v_limit integer;
begin
  if v_user is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 200 then raise exception 'Project name must be between 1 and 200 characters.' using errcode = '22023'; end if;
  if p_id is null or char_length(p_id) > 200 or p_project_data is null or p_project_data->>'id' <> p_id then raise exception 'Invalid project save request.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  delete from public.projects where user_id = v_user and not save_complete and updated_at < now() - interval '1 hour';
  select * into v_existing from public.projects where id = p_id and user_id = v_user;
  if found then return next v_existing; return; end if;
  v_limit := public.cloud_project_limit_for_current_user();
  if v_limit is not null and (select count(*) from public.projects where user_id = v_user) >= v_limit then raise exception 'Free accounts can save up to 3 cloud projects. Delete a project to save another.' using errcode = 'P0001'; end if;
  insert into public.projects (id, user_id, name, auto_title, surah_start, ayah_start, surah_end, ayah_end, duration_ms, aspect_ratio, project_data, source_filename, source_metadata, schema_version, created_at, updated_at, save_complete)
  values (p_id, v_user, btrim(p_name), p_auto_title, p_surah_start, p_ayah_start, p_surah_end, p_ayah_end, p_duration_ms, p_aspect_ratio, p_project_data, p_source_filename, p_source_metadata, p_schema_version, now(), now(), false)
  returning * into v_existing;
  return next v_existing;
end $$;

revoke all on function public.cloud_project_limit_for_current_user() from public;
grant execute on function public.cloud_project_limit_for_current_user() to authenticated;
