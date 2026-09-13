import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { accountEntitlementsForPlan } from "../src/lib/entitlements.ts";
import { freeFifoReplacement } from "../src/lib/video-fifo.ts";
import type { CloudProjectRecord } from "../src/lib/cloud-sync.ts";

const videos = readFileSync(new URL("../src/components/videos-dashboard.tsx", import.meta.url), "utf8");
const jobs = readFileSync(new URL("../src/lib/video-jobs.ts", import.meta.url), "utf8");
const composed = readFileSync(new URL("../src/components/composed-video-preview.tsx", import.meta.url), "utf8");
const quickCreate = readFileSync(new URL("../src/components/quick-create.tsx", import.meta.url), "utf8");

function record(id: string, createdAt: string): CloudProjectRecord {
  return { row: { id, created_at: createdAt }, project: {} } as unknown as CloudProjectRecord;
}

test("Free FIFO keeps three, selects the oldest for the fourth, and never applies to paid plans", () => {
  const records = [record("second", "2026-01-02T00:00:00.000Z"), record("oldest", "2026-01-01T00:00:00.000Z"), record("newest", "2026-01-03T00:00:00.000Z")];
  assert.equal(freeFifoReplacement(records.slice(0, 2), accountEntitlementsForPlan("free"), "incoming"), null);
  assert.equal(freeFifoReplacement(records, accountEntitlementsForPlan("free"), "incoming")?.row.id, "oldest");
  assert.equal(freeFifoReplacement(records, accountEntitlementsForPlan("pro"), "incoming"), null);
  assert.equal(freeFifoReplacement(records, accountEntitlementsForPlan("premium"), "incoming"), null);
});

test("FIFO uses the secure cloud deletion path and users receive notice before Generate", () => {
  assert.match(jobs, /if \(replacement\) await deleteCloudProject\(replacement\.row\.id\)/);
  assert.match(quickCreate, /Free keeps your 3 most recent saved videos/);
  assert.match(quickCreate, /Generating this will replace your oldest saved video/);
  assert.match(jobs, /removePrivateProjectObjects/);
  assert.match(jobs, /finalized \? deleteCloudProject\(id\) : cancelCloudProjectSave\(id\)/);
});

test("videos surface real live states, filters, retry, and stale-safe progress", () => {
  for (const label of ["Preparing", "Generating captions", "Ready", "Generation failed", "Interrupted"]) assert.match(videos, new RegExp(label));
  assert.match(videos, /\["all", "ready", "generating", "failed"\]/);
  assert.match(videos, /videoJobManager\.retry\(card\.id\)/);
  assert.match(videos, /Retry in editor/);
  assert.match(jobs, /active\.runToken !== token/);
  assert.doesNotMatch(jobs, /Math\.random\(\).*progress|setInterval/);
});

test("watch composes source media with saved CaptionSegments rather than requiring rendered media", () => {
  assert.match(videos, /downloadCloudProjectSource/);
  assert.match(videos, /<ComposedVideoPreview project=\{watching\.project\}/);
  assert.match(composed, /segments=\{project\.captionSegments as CaptionSegment\[\]\}/);
  assert.match(composed, /typography=\{project\.typography\}/);
  assert.match(composed, /positioning=\{project\.positioning\}/);
  assert.doesNotMatch(composed, /renderedMp4|finishedMp4|exportVideo/i);
});

test("ready cards offer Watch, Edit, Download, Delete and TikTok-coming-soon without YouTube", () => {
  assert.match(videos, /"Watch"/);
  assert.match(videos, />Edit<\/Link>/);
  assert.match(videos, />Download<\/Link>/);
  assert.match(videos, />Delete<\/button>/);
  assert.match(videos, /Post to TikTok/);
  assert.match(videos, /Coming soon/);
  assert.doesNotMatch(videos, /YouTube/i);
});

test("cloud persistence saves source, thumbnail, and project state but never a rendered final MP4", () => {
  assert.match(jobs, /uploadPrivateProjectObject\(sourcePath, runtime\.file/);
  assert.match(jobs, /uploadPrivateProjectObject\(thumbnailPath, poster/);
  assert.match(jobs, /completeCloudProjectSave\(job\.project/);
  assert.doesNotMatch(jobs, /renderVideo|rendered.*upload|finished.*mp4/i);
});
