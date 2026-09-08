-- Production cloud projects extend the earlier metadata-only table in place.
-- Media stays in the private `project-media` bucket and is never proxied through Next.js.
alter table public.projects
  add column if not exists auto_title text,
  add column if not exists surah_start integer,
  add column if not exists ayah_start integer,
  add column if not exists surah_end integer,
  add column if not exists ayah_end integer,
  add column if not exists duration_ms bigint,
  add column if not exists aspect_ratio text,
  add column if not exists source_media_path text,
  add column if not exists source_media_type text,
  add column if not exists source_media_name text,
  add column if not exists source_media_size_bytes bigint,
  add column if not exists thumbnail_path text,
  add column if not exists thumbnail_size_bytes bigint,
  add column if not exists last_export_quality text,
  add column if not exists last_exported_at timestamptz,
  add column if not exists save_complete boolean not null default true;

alter table public.projects drop constraint if exists projects_name_length;
alter table public.projects add constraint projects_name_length check (char_length(btrim(name)) between 1 and 200);
create index if not exists projects_user_complete_updated_at_idx on public.projects(user_id, save_complete, updated_at desc);

-- Keep the table private to authenticated owners. Writes happen only through the
-- owner-validating RPCs below so a direct REST insert cannot race the Free limit.
drop policy if exists "Users can read their own projects" on public.projects;
drop policy if exists "Users can insert their own projects" on public.projects;
drop policy if exists "Users can update their own projects" on public.projects;
drop policy if exists "Users can delete their own projects" on public.projects;
create policy "Cloud project owner can read" on public.projects for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.projects from authenticated;
grant select on public.projects to authenticated;

insert into storage.buckets (id, name, public)
values ('project-media', 'project-media', false)
on conflict (id) do update set public = false;

drop policy if exists "Cloud project media owner read" on storage.objects;
drop policy if exists "Cloud project media owner insert" on storage.objects;
drop policy if exists "Cloud project media owner update" on storage.objects;
drop policy if exists "Cloud project media owner delete" on storage.objects;
create policy "Cloud project media owner read" on storage.objects for select to authenticated
  using (bucket_id = 'project-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Cloud project media owner insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Cloud project media owner update" on storage.objects for update to authenticated
  using (bucket_id = 'project-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'project-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Cloud project media owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'project-media' and (storage.foldername(name))[1] = auth.uid()::text);

create or replace function public.cloud_project_path_is_owned(p_path text, p_project_id text)
returns boolean language sql stable set search_path = public, pg_temp as $$
  select p_path is null or p_path like auth.uid()::text || '/' || p_project_id || '/%'
$$;

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
  -- Abandoned reservations are safe to reclaim; their objects are under the same verified prefix.
  delete from storage.objects o using public.projects p
    where p.user_id = v_user and not p.save_complete and p.updated_at < now() - interval '1 hour'
      and o.bucket_id = 'project-media' and o.name like v_user::text || '/' || p.id || '/%';
  delete from public.projects where user_id = v_user and not save_complete and updated_at < now() - interval '1 hour';
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

create or replace function public.complete_cloud_project_save(
  p_id text, p_name text, p_auto_title text, p_surah_start integer, p_ayah_start integer, p_surah_end integer, p_ayah_end integer,
  p_duration_ms bigint, p_aspect_ratio text, p_project_data jsonb, p_source_filename text, p_source_metadata jsonb, p_schema_version integer,
  p_source_media_path text, p_source_media_type text, p_source_media_name text, p_source_media_size_bytes bigint, p_thumbnail_path text, p_thumbnail_size_bytes bigint
) returns setof public.projects language plpgsql security definer set search_path = public, pg_temp as $$
declare v_user uuid := auth.uid(); v_project public.projects;
begin
  if v_user is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 200 or p_project_data is null or p_project_data->>'id' <> p_id then raise exception 'Invalid project save request.' using errcode = '22023'; end if;
  if not public.cloud_project_path_is_owned(p_source_media_path, p_id) or not public.cloud_project_path_is_owned(p_thumbnail_path, p_id) then raise exception 'Project media path is not owned by this project.' using errcode = '42501'; end if;
  update public.projects set name = btrim(p_name), auto_title = p_auto_title, surah_start = p_surah_start, ayah_start = p_ayah_start, surah_end = p_surah_end, ayah_end = p_ayah_end,
    duration_ms = p_duration_ms, aspect_ratio = p_aspect_ratio, project_data = p_project_data, source_filename = p_source_filename, source_metadata = p_source_metadata,
    source_media_path = p_source_media_path, source_media_type = p_source_media_type, source_media_name = p_source_media_name, source_media_size_bytes = p_source_media_size_bytes,
    thumbnail_path = p_thumbnail_path, thumbnail_size_bytes = p_thumbnail_size_bytes, schema_version = p_schema_version, updated_at = now(), save_complete = true
    where id = p_id and user_id = v_user returning * into v_project;
  if not found then raise exception 'Project not found.' using errcode = 'P0002'; end if;
  return next v_project;
end $$;

create or replace function public.rename_cloud_project(p_id text, p_name text)
returns setof public.projects language plpgsql security definer set search_path = public, pg_temp as $$
declare v_project public.projects;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 200 then raise exception 'Project name must be between 1 and 200 characters.' using errcode = '22023'; end if;
  update public.projects set name = btrim(p_name), updated_at = now() where id = p_id and user_id = auth.uid() and save_complete returning * into v_project;
  if not found then raise exception 'Project not found.' using errcode = 'P0002'; end if;
  return next v_project;
end $$;

create or replace function public.cleanup_replaced_cloud_media(p_id text, p_source_path text, p_thumbnail_path text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_project public.projects;
begin
  select * into v_project from public.projects where id = p_id and user_id = auth.uid();
  if not found then raise exception 'Project not found.' using errcode = 'P0002'; end if;
  if p_source_path is not null and p_source_path <> v_project.source_media_path and public.cloud_project_path_is_owned(p_source_path, p_id) then delete from storage.objects where bucket_id = 'project-media' and name = p_source_path; end if;
  if p_thumbnail_path is not null and p_thumbnail_path <> v_project.thumbnail_path and public.cloud_project_path_is_owned(p_thumbnail_path, p_id) then delete from storage.objects where bucket_id = 'project-media' and name = p_thumbnail_path; end if;
end $$;

create or replace function public.cancel_cloud_project_save(p_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  delete from storage.objects where bucket_id = 'project-media' and name like auth.uid()::text || '/' || p_id || '/%';
  delete from public.projects where id = p_id and user_id = auth.uid() and not save_complete;
end $$;

create or replace function public.delete_cloud_project(p_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_exists boolean;
begin
  if auth.uid() is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  select exists(select 1 from public.projects where id = p_id and user_id = auth.uid()) into v_exists;
  if not v_exists then raise exception 'Project not found.' using errcode = 'P0002'; end if;
  delete from storage.objects where bucket_id = 'project-media' and name like auth.uid()::text || '/' || p_id || '/%';
  delete from public.projects where id = p_id and user_id = auth.uid();
end $$;

create or replace function public.cloud_project_storage_summary()
returns table(project_count bigint, total_source_bytes bigint, total_duration_ms bigint) language sql stable security definer set search_path = public, pg_temp as $$
  select count(*), coalesce(sum(source_media_size_bytes), 0), coalesce(sum(duration_ms), 0)
  from public.projects where user_id = auth.uid() and save_complete
$$;

revoke all on function public.begin_cloud_project_save(text, text, text, integer, integer, integer, integer, bigint, text, jsonb, text, jsonb, integer) from public;
revoke all on function public.complete_cloud_project_save(text, text, text, integer, integer, integer, integer, bigint, text, jsonb, text, jsonb, integer, text, text, text, bigint, text, bigint) from public;
revoke all on function public.rename_cloud_project(text, text) from public;
revoke all on function public.cleanup_replaced_cloud_media(text, text, text) from public;
revoke all on function public.cancel_cloud_project_save(text) from public;
revoke all on function public.delete_cloud_project(text) from public;
revoke all on function public.cloud_project_storage_summary() from public;
grant execute on function public.begin_cloud_project_save(text, text, text, integer, integer, integer, integer, bigint, text, jsonb, text, jsonb, integer) to authenticated;
grant execute on function public.complete_cloud_project_save(text, text, text, integer, integer, integer, integer, bigint, text, jsonb, text, jsonb, integer, text, text, text, bigint, text, bigint) to authenticated;
grant execute on function public.rename_cloud_project(text, text) to authenticated;
grant execute on function public.cleanup_replaced_cloud_media(text, text, text) to authenticated;
grant execute on function public.cancel_cloud_project_save(text) to authenticated;
grant execute on function public.delete_cloud_project(text) to authenticated;
grant execute on function public.cloud_project_storage_summary() to authenticated;
