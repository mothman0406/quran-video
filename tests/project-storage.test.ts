import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CAPTION_BACKGROUND, DEFAULT_CAPTION_POSITIONING, DEFAULT_TRANSITION_SETTINGS, DEFAULT_TYPOGRAPHY } from "../src/lib/editor/captions.ts";
import { DEFAULT_PROJECT_FORMAT } from "../src/lib/editor/formats.ts";
import { createMemoryProjectRepository, sourceFingerprint, validateSavedProject, verifySourceFile } from "../src/lib/project-storage.ts";
import type { SavedProject } from "../src/lib/schemas/project.ts";

function project(overrides: Partial<SavedProject> = {}): SavedProject {
  return { version: 2, id: "project-1", title: "Evening recitation", sourceVideo: { fileName: "recitation.mp4", fileSize: 42, mimeType: "video/mp4", durationSeconds: 12, fingerprint: "recitation.mp4:42:video/mp4" }, format: DEFAULT_PROJECT_FORMAT, verseAlignments: [], captionSegments: [], captions: { arabic: true, translation: true, transliteration: false, translationEdition: "english_saheeh" }, positioning: DEFAULT_CAPTION_POSITIONING, captionBackground: DEFAULT_CAPTION_BACKGROUND, typography: DEFAULT_TYPOGRAPHY, transitionSettings: DEFAULT_TRANSITION_SETTINGS, showVerseNumber: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides };
}

test("save creates metadata, updates by stable id, and stores no media bytes", async () => {
  const repository = createMemoryProjectRepository();
  const saved = project();
  await repository.put(saved);
  await repository.put({ ...saved, title: "Updated", updatedAt: "2026-01-02T00:00:00.000Z" });
  const projects = await repository.list();
  assert.equal(projects.length, 1);
  assert.equal(projects[0].title, "Updated");
  assert.equal(JSON.stringify(projects[0]).includes("blob:"), false);
  assert.equal(JSON.stringify(projects[0]).includes("data:video"), false);
  assert.throws(() => validateSavedProject({ ...saved, media: new ArrayBuffer(2) } as SavedProject & { media: ArrayBuffer }), /media|unsupported/i);
});

test("source verification accepts matching metadata and reports mismatch without attaching it silently", () => {
  const source = project().sourceVideo;
  const matching = { name: "recitation.mp4", size: 42, type: "video/mp4" };
  assert.equal(sourceFingerprint(matching), source?.fingerprint);
  assert.deepEqual(verifySourceFile(matching, source, 12), { matches: true, reasons: [] });
  const mismatch = verifySourceFile({ name: "wrong.mp4", size: 99, type: "video/webm" }, source, 20);
  assert.equal(mismatch.matches, false);
  assert.equal(mismatch.reasons.length, 4);
});

test("deleting a project removes only the local metadata record", async () => {
  const repository = createMemoryProjectRepository([project()]);
  await repository.delete("project-1");
  assert.deepEqual(await repository.list(), []);
});
