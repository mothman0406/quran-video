import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CAPTION_BACKGROUND, DEFAULT_CAPTION_POSITIONING, DEFAULT_TRANSITION_SETTINGS, DEFAULT_TYPOGRAPHY } from "../src/lib/editor/captions.ts";
import { DEFAULT_PROJECT_FORMAT } from "../src/lib/editor/formats.ts";
import { fromCloudProjectRow, hasProjectConflict, toCloudProjectPayload, type CloudProjectRow } from "../src/lib/cloud-sync.ts";
import { FREE_CLOUD_PROJECT_LIMIT, projectMediaPath, quranProjectMetadata } from "../src/lib/cloud-projects.ts";
import type { SavedProject } from "../src/lib/schemas/project.ts";

function project(overrides: Partial<SavedProject> = {}): SavedProject {
  return { version: 2, id: "project-1", title: "Evening recitation", sourceMedia: { kind: "video", hasVideo: true, hasAudio: true, fileName: "recitation.mp4", fileSize: 42, mimeType: "video/mp4", durationMs: 12_000, fingerprint: "recitation.mp4:42:video/mp4" }, mediaTrim: { startMs: 0, endMs: 12_000 }, format: DEFAULT_PROJECT_FORMAT, verseAlignments: [], captionSegments: [], captions: { arabic: true, translation: true, transliteration: false, translationEdition: "english_saheeh" }, positioning: DEFAULT_CAPTION_POSITIONING, captionBackground: DEFAULT_CAPTION_BACKGROUND, typography: DEFAULT_TYPOGRAPHY, transitionSettings: DEFAULT_TRANSITION_SETTINGS, showVerseNumber: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides, playbackRate: overrides.playbackRate ?? 1, projectAssets: overrides.projectAssets ?? [], activeMediaAssetId: overrides.activeMediaAssetId ?? null };
}

test("cloud payload maps stable identity and contains metadata only", () => {
  const payload = toCloudProjectPayload(project());
  assert.equal(payload.id, "project-1");
  assert.equal("user_id" in payload, false);
  assert.equal(payload.source_filename, "recitation.mp4");
  assert.equal(JSON.stringify(payload).includes("blob:"), false);
  assert.equal(JSON.stringify(payload).includes("data:video"), false);
  assert.equal(JSON.stringify(payload).includes("ArrayBuffer"), false);
});

test("cloud rows restore the project schema and reject unsupported versions", () => {
  const saved = project({ updatedAt: "2026-01-02T00:00:00.000Z" });
  const payload = toCloudProjectPayload(saved);
  const row: CloudProjectRow = { ...payload, user_id: "user-1", save_complete: true, source_media_path: null, source_media_type: null, source_media_name: null, source_media_size_bytes: null, thumbnail_path: null, thumbnail_size_bytes: null, last_export_quality: null, last_exported_at: null };
  assert.deepEqual(fromCloudProjectRow(row), saved);
  assert.throws(() => fromCloudProjectRow({ ...row, schema_version: 99 }), /schema version/);
});

test("conflict detection requires the same project identity and different timestamps", () => {
  const local = project();
  assert.equal(hasProjectConflict(local, { ...local, updatedAt: "2026-01-02T00:00:00.000Z" }), true);
  assert.equal(hasProjectConflict(local, { ...local, id: "other" }), false);
  assert.equal(hasProjectConflict(local, local), false);
  assert.equal(hasProjectConflict(null, local), false);
});

test("cloud project metadata derives a deterministic canonical Quran range", () => {
  const caption = { id: "c", contentKind: "ayah" as const, verseKeys: ["70:1", "70:7"], startMs: 0, endMs: 1_000, arabic: "x", translation: null, transliteration: null, wordStart: 0, wordEnd: 1, wordCount: 1 };
  const metadata = quranProjectMetadata(project({ captionSegments: [caption] }));
  assert.equal(metadata.autoTitle, "Al-Ma'arij 1–7");
  assert.equal(metadata.passageLabel, "Surah Al-Ma'arij · 70:1–7");
});

test("private media paths are scoped by user and project and Free is three projects", () => {
  assert.match(projectMediaPath("user-a", "project-a", "source", "mp4", "nonce"), /^user-a\/project-a\/source-nonce\.mp4$/);
  assert.equal(FREE_CLOUD_PROJECT_LIMIT, 3);
});
