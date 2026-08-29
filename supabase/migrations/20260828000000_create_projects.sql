create table if not exists public.projects (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 200),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  source_filename text,
  source_metadata jsonb,
  project_data jsonb not null,
  schema_version integer not null
);

alter table public.projects enable row level security;

create policy "Users can read their own projects" on public.projects for select using (auth.uid() = user_id);
create policy "Users can insert their own projects" on public.projects for insert with check (auth.uid() = user_id);
create policy "Users can update their own projects" on public.projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their own projects" on public.projects for delete using (auth.uid() = user_id);

create index if not exists projects_user_updated_at_idx on public.projects(user_id, updated_at desc);
