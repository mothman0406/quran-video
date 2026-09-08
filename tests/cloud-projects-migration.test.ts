import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260908000000_production_cloud_projects.sql", import.meta.url), "utf8");
const storageCleanupMigration = readFileSync(new URL("../supabase/migrations/20260908000001_storage_api_cloud_media_cleanup.sql", import.meta.url), "utf8");
const sync = readFileSync(new URL("../src/lib/cloud-sync.ts", import.meta.url), "utf8");

test("cloud-project migration keeps project media private and owner-scoped", () => {
  assert.match(migration, /'project-media', 'project-media', false/);
  assert.match(migration, /storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/);
  assert.match(migration, /revoke insert, update, delete on public\.projects from authenticated/i);
  assert.match(migration, /security definer/gi);
});

test("Free project creation is locked and atomically limited to three", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /count\(\*\) from public\.projects where user_id = v_user\) >= 3/);
  assert.match(migration, /begin_cloud_project_save/);
  assert.match(migration, /delete_cloud_project/);
});

test("project deletion and replacement cleanup operate only in the owned project prefix", () => {
  assert.match(migration, /name like auth\.uid\(\)::text \|\| '\/' \|\| p_id \|\| '\/%'/);
  assert.match(migration, /cloud_project_path_is_owned/);
  assert.match(migration, /source_media_size_bytes/);
  assert.match(migration, /cloud_project_storage_summary/);
});

test("latest cloud-project RPC definitions never delete Storage internal rows", () => {
  assert.doesNotMatch(storageCleanupMigration, /delete\s+from\s+storage\.objects/i);
  assert.match(storageCleanupMigration, /create or replace function public\.cleanup_replaced_cloud_media/);
  assert.match(storageCleanupMigration, /create or replace function public\.cancel_cloud_project_save/);
  assert.match(storageCleanupMigration, /create or replace function public\.delete_cloud_project/);
  assert.match(sync, /storage\.from\(PROJECT_MEDIA_BUCKET\)\.remove\(owned\)/);
  assert.match(sync, /ownedProjectMediaPath/);
  assert.match(sync, /cleanupAbandonedCloudProjectSaves/);
});

test("application cloud-row contract matches the production migration and keeps incomplete saves hidden", () => {
  for (const column of ["id", "user_id", "name", "auto_title", "project_data", "source_filename", "source_metadata", "schema_version", "created_at", "updated_at", "surah_start", "ayah_start", "surah_end", "ayah_end", "duration_ms", "aspect_ratio", "source_media_path", "source_media_type", "source_media_name", "source_media_size_bytes", "thumbnail_path", "thumbnail_size_bytes", "last_export_quality", "last_exported_at", "save_complete"]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`));
  }
  assert.match(sync, /\.eq\("save_complete", true\)/);
  assert.match(migration, /save_complete boolean not null default true/);
  assert.match(migration, /now\(\), now\(\), false\)/);
  assert.match(migration, /save_complete = true/);
});
