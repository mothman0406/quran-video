import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CAPTION_BACKGROUND, DEFAULT_CAPTION_POSITIONING, DEFAULT_TRANSITION_SETTINGS, DEFAULT_TYPOGRAPHY } from "../src/lib/editor/captions.ts";
import { DEFAULT_PROJECT_FORMAT } from "../src/lib/editor/formats.ts";
import { createMemoryProjectRepository, loadSavedProject, serializeSavedProject, sourceFingerprint, validateSavedProject, verifySourceFile } from "../src/lib/project-storage.ts";
import type { SavedProject } from "../src/lib/schemas/project.ts";
import { projectAssetFromMediaSource, projectTextAssets } from "../src/lib/editor/project-assets.ts";
import { mediaSourceFromFile } from "../src/lib/editor/media.ts";

function project(overrides: Partial<SavedProject> = {}): SavedProject {
  return { version: 2, id: "project-1", title: "Evening recitation", sourceMedia: { kind: "video", hasVideo: true, hasAudio: true, fileName: "recitation.mp4", fileSize: 42, mimeType: "video/mp4", durationMs: 12_000, fingerprint: "recitation.mp4:42:video/mp4" }, mediaTrim: { startMs: 0, endMs: 12_000 }, format: DEFAULT_PROJECT_FORMAT, verseAlignments: [], captionSegments: [], captions: { arabic: true, translation: true, transliteration: false, translationEdition: "english_saheeh" }, positioning: DEFAULT_CAPTION_POSITIONING, captionBackground: DEFAULT_CAPTION_BACKGROUND, typography: DEFAULT_TYPOGRAPHY, transitionSettings: DEFAULT_TRANSITION_SETTINGS, showVerseNumber: false, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...overrides, projectAssets: overrides.projectAssets ?? [], activeMediaAssetId: overrides.activeMediaAssetId ?? null };
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

test("project assets persist metadata only and group project text by source", () => {
  const source = mediaSourceFromFile({ name: "recitation.mp3", size: 42, type: "audio/mpeg" }, "audio", { assetId: "asset-a", durationMs: 12_000 });
  const asset = projectAssetFromMediaSource(source, "asset-a", "2026-01-01T00:00:00.000Z");
  const saved = project({ projectAssets: [asset], activeMediaAssetId: asset.id, sourceMedia: source });
  const serialized = serializeSavedProject(saved);
  assert.equal(serialized.includes("blob:"), false);
  assert.deepEqual(loadSavedProject(serialized).projectAssets, [asset]);
  assert.deepEqual(projectTextAssets(8, true, true).map((item) => item.name), ["Quran Captions", "Translation", "Transliteration"]);
});

test("current verse alignments round-trip through serialization, validation, and loading", async () => {
  const alignments = Array.from({ length: 5 }, (_, index) => ({
    verseKey: `93:${index + 1}`,
    surahNumber: 93,
    ayahNumber: index + 1,
    startMs: 1_000 + index * 1_234,
    endMs: 2_000 + index * 1_234,
    confidence: 0.71 + index / 100,
    timingEvidence: {
      start: { timestampMs: 1_000 + index * 1_234, source: "direct-asr-word" as const },
      end: { timestampMs: 2_000 + index * 1_234, source: "chunk-text-alignment" as const },
      matchedText: `matched ${index + 1}`,
    },
  }));
  const saved = project({ verseAlignments: alignments });
  const loaded = loadSavedProject(serializeSavedProject(saved));
  assert.deepEqual(loaded.verseAlignments, alignments);
  const repository = createMemoryProjectRepository();
  await repository.put(saved);
  assert.deepEqual((await repository.get(saved.id))?.verseAlignments, alignments);
  assert.equal(serializeSavedProject(saved).includes("File"), false);
  assert.equal(serializeSavedProject(saved).includes("Blob"), false);
});

test("legacy seconds alignment payloads migrate to exact milliseconds once", () => {
  const legacy = project({
    verseAlignments: [{
      surahNumber: 93,
      ayahNumber: 1,
      startSeconds: 1.234,
      endSeconds: 2.5,
      timingEvidence: {
        start: { timestampMs: 1_234, source: "interpolation" },
        end: { timestampMs: 2_500, source: "interpolation" },
        matchedText: "legacy evidence",
      },
    } as unknown as SavedProject["verseAlignments"][number]],
  });
  const migrated = loadSavedProject(legacy);
  assert.deepEqual(migrated.verseAlignments[0], {
    surahNumber: 93,
    ayahNumber: 1,
    verseKey: "93:1",
    startMs: 1_234,
    endMs: 2_500,
    confidence: 0,
    timingEvidence: legacy.verseAlignments[0].timingEvidence,
  });
  assert.throws(() => validateSavedProject({ ...migrated, verseAlignments: [{ ...migrated.verseAlignments[0], invalid: true }] }), /unrecognized|invalid/i);
});

test("missing legacy verse-number state receives the new default without overwriting false", () => {
  const legacy = { ...project(), showVerseNumber: undefined } as unknown as SavedProject;
  assert.equal(loadSavedProject(legacy).showVerseNumber, true);
  assert.equal(loadSavedProject(project({ showVerseNumber: false })).showVerseNumber, false);
});

test("highlight setting migration preserves explicit choices while missing legacy defaults read so far", () => {
  const legacyTypography = { ...project().typography } as Partial<SavedProject["typography"]>;
  delete legacyTypography.wordHighlightMode;
  delete legacyTypography.wordHighlightColor;
  delete legacyTypography.wordHighlightIntensity;
  assert.equal(loadSavedProject(project({ typography: legacyTypography as SavedProject["typography"] })).typography.wordHighlightMode, "read-so-far");
  assert.equal(loadSavedProject(project({ typography: { ...DEFAULT_TYPOGRAPHY, wordHighlightMode: "off" } })).typography.wordHighlightMode, "off");
  assert.equal(loadSavedProject(project({ typography: { ...DEFAULT_TYPOGRAPHY, wordHighlightMode: "current-word" } })).typography.wordHighlightMode, "current-word");
});

test("source verification accepts matching metadata and reports mismatch without attaching it silently", () => {
  const source = project().sourceMedia;
  const matching = { name: "recitation.mp4", size: 42, type: "video/mp4" };
  assert.equal(sourceFingerprint(matching), source?.fingerprint);
  assert.deepEqual(verifySourceFile(matching, source, 12_000), { matches: true, reasons: [] });
  const mismatch = verifySourceFile({ name: "wrong.mp4", size: 99, type: "video/webm" }, source, 20_000);
  assert.equal(mismatch.matches, false);
  assert.equal(mismatch.reasons.length, 4);
});

test("deleting a project removes only the local metadata record", async () => {
  const repository = createMemoryProjectRepository([project()]);
  await repository.delete("project-1");
  assert.deepEqual(await repository.list(), []);
});
