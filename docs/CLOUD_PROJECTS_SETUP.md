# Cloud projects setup

## LIVE SUPABASE MIGRATION STEPS

The reported PostgREST 400 means the live `public.projects` table does not have `save_complete`. The application deliberately filters on that column so a row reserved before its media finishes uploading cannot appear as a saved project. Apply these repository migrations to the same Supabase project, in this exact order, using the Supabase CLI or the Dashboard SQL Editor:

1. `supabase/migrations/20260828000000_create_projects.sql`
2. `supabase/migrations/20260908000000_production_cloud_projects.sql`

Do not create a second `projects` table and do not remove the `save_complete=eq.true` REST filter. If the first migration is already present, apply only the second migration; it is written with `if not exists` additions.

The first migration creates `public.projects` with `id`, `user_id`, `name`, `created_at`, `updated_at`, `source_filename`, `source_metadata`, `project_data`, and `schema_version`.

The production migration adds the authoritative cloud-project columns: `auto_title`, `surah_start`, `ayah_start`, `surah_end`, `ayah_end`, `duration_ms`, `aspect_ratio`, `source_media_path`, `source_media_type`, `source_media_name`, `source_media_size_bytes`, `thumbnail_path`, `thumbnail_size_bytes`, `last_export_quality`, `last_exported_at`, and `save_complete boolean not null default true`.

Quran fields and `auto_title` are nullable. An undetected project is valid; the app stores `auto_title`, `surah_start`, `ayah_start`, `surah_end`, and `ayah_end` as `null` until detection succeeds. `name` remains user-controlled. Only an untouched default name falls back to `My project`; detection never overwrites a custom name.

The second migration creates these RPCs:

- `begin_cloud_project_save`
- `complete_cloud_project_save`
- `rename_cloud_project`
- `cleanup_replaced_cloud_media`
- `cancel_cloud_project_save`
- `delete_cloud_project`
- `cloud_project_storage_summary`
- internal helper `cloud_project_path_is_owned`

`begin_cloud_project_save` inserts `save_complete = false`, takes the per-user quota lock, and reserves the project before browser uploads. `complete_cloud_project_save` writes media metadata and sets `save_complete = true`. The project library and single-project read both filter for completed rows. Failed first saves are cancelled and therefore never become valid project cards.

The migration creates (or makes private) the exact Storage bucket `project-media` with `public = false`. It adds these Storage policies on `storage.objects`, each scoped to `<auth.uid()>/<project-id>/…`:

- `Cloud project media owner read`
- `Cloud project media owner insert`
- `Cloud project media owner update`
- `Cloud project media owner delete`

It enables RLS for `public.projects` and creates the exact table read policy `Cloud project owner can read` for `authenticated` users where `auth.uid() = user_id`. Direct `insert`, `update`, and `delete` privileges are revoked from `authenticated`; the owner-validating `SECURITY DEFINER` RPCs above are granted to `authenticated` instead. The migration also creates `projects_user_complete_updated_at_idx` and retains the owner/update index.

No Dashboard action is required to create the bucket, RLS policy, Storage policies, indexes, or RPCs: the SQL migration does all of that. The only separate Dashboard configuration is Supabase Auth: allow local and deployed callback URLs ending in `/auth/callback`.

Set only these browser-safe values in the application environment:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

Never add a service-role key to the browser and do not make `project-media` public.

## Save and recognition behavior

Saving is independent from Quran detection. A project with ready source media, thumbnail, editor state, and no captions can save before detection starts, while it runs, after a detection failure, or when passage correction is still needed. A later successful detection makes the editor dirty; the next Save updates the same cloud project ID with its Quran metadata.

New local video, local audio, and completed YouTube imports each start one automatic recognition run after their source is accepted. A stable identity combining the media asset and fingerprint prevents rerender duplicates. A genuinely different source gets a new run. Restored projects that already have caption segments skip automatic recognition; restored undetected projects may start one run once their source is available. **Detect again** and **Try again** remain recovery actions, and **Correct detection** remains the manual passage authority.

In development, cloud failures include a safe stage and PostgREST/Supabase code when available. A missing `save_complete` schema-cache/column error explicitly instructs the operator to apply `20260908000000_production_cloud_projects.sql`.

## Manual verification

1. Apply the migrations above and sign in.
2. Import audio or video and confirm recognition begins without pressing a Detect button. Save while it runs; then save again after it completes.
3. Save a project before detection and verify `/projects` displays its name and **Passage not detected yet**.
4. Open a detected project and confirm its saved captions restore without rerunning recognition. Open an undetected project with its source available and confirm it begins one recognition run.
5. Change the source and save; verify the new source remains available before old private objects are cleaned up.
6. With two test users, verify neither can read the other's row or `project-media` objects.

Source media and thumbnails are private user content. Completed exports remain local downloads and are never placed in this bucket. A stale incomplete reservation is reclaimed on the same user's next save after one hour; a production operator may additionally schedule compatible cleanup.
