import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CAPTION_BACKGROUND, DEFAULT_CAPTION_POSITIONING, DEFAULT_TRANSITION_SETTINGS, DEFAULT_TYPOGRAPHY } from "../src/lib/editor/captions.ts";
import { DEFAULT_PROJECT_FORMAT } from "../src/lib/editor/formats.ts";
import { fromCloudProjectRow, hasProjectConflict, toCloudProjectPayload } from "../src/lib/cloud-sync.ts";
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
  assert.deepEqual(fromCloudProjectRow({ ...payload, user_id: "user-1", schema_version: 1 }), saved);
  assert.throws(() => fromCloudProjectRow({ ...payload, user_id: "user-1", schema_version: 99 }), /schema version/);
});

test("conflict detection requires the same project identity and different timestamps", () => {
  const local = project();
  assert.equal(hasProjectConflict(local, { ...local, updatedAt: "2026-01-02T00:00:00.000Z" }), true);
  assert.equal(hasProjectConflict(local, { ...local, id: "other" }), false);
  assert.equal(hasProjectConflict(local, local), false);
  assert.equal(hasProjectConflict(null, local), false);
});
