-- Blob deletion is performed by the authenticated Supabase Storage API, never
-- by project RPCs writing directly to the Storage internal tables.

create or replace function public.begin_cloud_project_save(
  p_id text, p_name text, p_auto_title text, p_surah_start integer, p_ayah_start integer, p_surah_end integer, p_ayah_end integer,
  p_duration_ms bigint, p_aspect_ratio text, p_project_data jsonb, p_source_filename text, p_source_metadata jsonb, p_schema_version integer
) returns setof public.projects language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_existing public.projects;
begin
  if v_user is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 200 then raise exception 'Project name must be between 1 and 200 characters.' using errcode = '22023'; end if;
  if p_id is null or char_length(p_id) > 200 or p_project_data is null or p_project_data->>'id' <> p_id then raise exception 'Invalid project save request.' using errcode = '22023'; end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  select * into v_existing from public.projects where id = p_id and user_id = v_user;
  if found then return next v_existing; return; end if;
  if (select count(*) from public.projects where user_id = v_user) >= 3 then
    raise exception 'Your free storage is full. Free accounts can save up to 3 projects. Delete a project to free up space, or upgrade for more storage.' using errcode = 'P0001';
  end if;
  insert into public.projects (id, user_id, name, auto_title, surah_start, ayah_start, surah_end, ayah_end, duration_ms, aspect_ratio, project_data, source_filename, source_metadata, schema_version, created_at, updated_at, save_complete)
  values (p_id, v_user, btrim(p_name), p_auto_title, p_surah_start, p_ayah_start, p_surah_end, p_ayah_end, p_duration_ms, p_aspect_ratio, p_project_data, p_source_filename, p_source_metadata, p_schema_version, now(), now(), false)
  returning * into v_existing;
  return next v_existing;
end $$;

-- The browser first removes this exact authenticated user's project prefix
-- through Storage API, then asks this RPC to remove the incomplete row.
create or replace function public.cancel_cloud_project_save(p_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  delete from public.projects where id = p_id and user_id = auth.uid() and not save_complete;
end $$;

-- Kept as a safe no-op for deployed clients while they roll forward. Current
-- clients remove obsolete paths directly with storage.from('project-media').remove.
create or replace function public.cleanup_replaced_cloud_media(p_id text, p_source_path text, p_thumbnail_path text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.projects where id = p_id and user_id = auth.uid()) then
    raise exception 'Project not found.' using errcode = 'P0002';
  end if;
end $$;

-- Current clients fetch the owned project first, delete its Storage objects
-- through the Storage API, then invoke this row-only project mutation.
create or replace function public.delete_cloud_project(p_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  delete from public.projects where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Project not found.' using errcode = 'P0002'; end if;
end $$;

revoke all on function public.begin_cloud_project_save(text, text, text, integer, integer, integer, integer, bigint, text, jsonb, text, jsonb, integer) from public;
revoke all on function public.cancel_cloud_project_save(text) from public;
revoke all on function public.cleanup_replaced_cloud_media(text, text, text) from public;
revoke all on function public.delete_cloud_project(text) from public;
grant execute on function public.begin_cloud_project_save(text, text, text, integer, integer, integer, integer, bigint, text, jsonb, text, jsonb, integer) to authenticated;
grant execute on function public.cancel_cloud_project_save(text) to authenticated;
grant execute on function public.cleanup_replaced_cloud_media(text, text, text) to authenticated;
grant execute on function public.delete_cloud_project(text) to authenticated;
