# Cloud projects setup

Apply the Supabase migrations in order, including `20260908000000_production_cloud_projects.sql`. It evolves the existing `public.projects` metadata table; do not create a second projects table.

The migration creates the private `project-media` Storage bucket and its owner-scoped policies. Browser uploads use paths of the form `<auth-user-id>/<project-id>/source-<nonce>.<ext>` and `<auth-user-id>/<project-id>/thumbnail-<nonce>.webp`. Keep the bucket private. Do not create public URLs or add a service-role key to the browser.

Set only these browser-safe values in the application environment:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

In Supabase Auth, allow both local and deployed callback URLs ending in `/auth/callback`. The callback permits `/`, `/editor`, and `/projects` as first-party return paths.

The database uses RLS for owner reads and owner-scoped Storage object access. Project writes, rename, cleanup, deletion, and the storage summary use authenticated `SECURITY DEFINER` RPCs. `begin_cloud_project_save` obtains a per-user transaction lock, counts project reservations atomically, and blocks a fourth Free project. Direct table insert/update/delete privileges are revoked from `authenticated`, preventing REST or multi-tab writes from bypassing that quota.

Manual local testing:

1. Sign in, edit a project, click **Save**, confirm its suggested name, and wait for source and thumbnail upload.
2. Visit `/projects`, verify the private thumbnail, project metadata, duration, and search.
3. Open the card, reload the editor, and verify its saved source and caption state restore without recognition rerunning.
4. Change the source and save; verify the new source remains available before the old object is removed.
5. Save three projects, verify the fourth shows the Free-storage message, delete one, and save a new project.
6. With two separate test users, verify neither project's row nor `project-media` objects are readable by the other user.

Source media and thumbnails are private user content. Completed exports remain local downloads and are never placed in this bucket. The application records source bytes and duration with each completed save; paid plan project and byte limits are deliberately TBD. A stale incomplete reservation is reclaimed on the same user's next save after one hour; production teams should additionally schedule a periodic call/SQL cleanup suitable for their Supabase operating model.
