import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../supabase/migrations/20260908000000_production_cloud_projects.sql", import.meta.url), "utf8");

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
