import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const quickCreate = readFileSync(new URL("../src/components/quick-create.tsx", import.meta.url), "utf8");
const generation = readFileSync(new URL("../src/lib/video-generation.ts", import.meta.url), "utf8");
const jobs = readFileSync(new URL("../src/lib/video-jobs.ts", import.meta.url), "utf8");
const layout = readFileSync(new URL("../src/app/layout.tsx", import.meta.url), "utf8");
const createBoundary = readFileSync(new URL("../src/components/quick-create-boundary.tsx", import.meta.url), "utf8");
const videosBoundary = readFileSync(new URL("../src/components/videos-dashboard-boundary.tsx", import.meta.url), "utf8");
const jobProvider = readFileSync(new URL("../src/components/video-job-provider.tsx", import.meta.url), "utf8");
const editor = readFileSync(new URL("../src/components/editor-client.tsx", import.meta.url), "utf8");

test("quick create starts editor preparation and original-source recognition concurrently without exposing a timeline", () => {
  assert.match(quickCreate, /void prepare\(event\.currentTarget\.files\?\.\[0\]\)/);
  assert.match(quickCreate, /const editorPromise = prepareLocalMedia\(next, abort\.signal/);
  assert.match(quickCreate, /const recognitionPromise = prepareRecognitionAudio\(next, abort\.signal/);
  assert.match(quickCreate, /Promise\.allSettled\(\[editorPromise, recognitionPromise\]\)/);
  assert.match(quickCreate, /onDrop=\{drop\}/);
  assert.doesNotMatch(quickCreate, /CaptionTimeline|timelineRef|splitCaption|mergeCaption|word timing/i);
});

test("original and editor representations remain explicit with truthful local progress", () => {
  assert.match(quickCreate, /originalSource: next/);
  assert.match(quickCreate, /editorMedia: result\.editorMedia/);
  assert.match(quickCreate, /editorPlaybackUrl: result\.editorPlaybackUrl/);
  assert.match(quickCreate, /compatibility: result\.route/);
  assert.match(quickCreate, /event\.inspection/);
  assert.match(quickCreate, /Converting recording…/);
  assert.match(quickCreate, /Preparing audio for detection…/);
  assert.match(quickCreate, /No media leaves your device during preparation/);
  assert.doesNotMatch(quickCreate, /Uploading/);
});

test("pre-generation controls remain enabled during preparation and persist into the project", () => {
  assert.match(quickCreate, /fieldset disabled=\{!selected\}/);
  assert.match(quickCreate, /aria-label="Caption vertical position"/);
  assert.match(quickCreate, /aria-label="Quran caption size"/);
  assert.match(quickCreate, /<strong>Translation<\/strong>/);
  assert.match(quickCreate, /Word highlighting/);
  assert.match(quickCreate, /wordHighlightMode: event\.currentTarget\.checked \? "read-so-far" : "off"/);
  assert.match(quickCreate, /captionSegments: \[\]/);
});

test("Generate creates one app-level job from prepared media and navigates immediately", () => {
  assert.match(quickCreate, /videoJobManager\.start\(\{ project, originalSource: prepared\.originalSource, editorMedia: prepared\.editorMedia/);
  assert.match(quickCreate, /router\.push\("\/videos"\)/);
  assert.equal((quickCreate.match(/videoJobManager\.start\(/g) ?? []).length, 1);
  assert.doesNotMatch(generation, /prepareLocalMedia|extractRecognitionPcm|full-normalization|normalize/i);
});

test("root-owned job provider keeps local recognition alive across create-to-videos navigation", () => {
  assert.match(layout, /<VideoJobProvider \/>/);
  for (const boundary of [createBoundary, videosBoundary, jobProvider]) {
    assert.match(boundary, /dynamic\(\(\) => import/);
    assert.match(boundary, /ssr:\s*false/);
  }
  assert.match(jobs, /private queue: Promise<void>/);
  assert.match(jobs, /generateVideoCaptions/);
  assert.match(jobs, /this\.worker \?\?= new LocalRecognitionWorkerClient/);
  assert.match(jobs, /active\.runToken !== token/);
  assert.match(jobs, /item\.status === "generating" \? "interrupted"/);
});

test("generation retains the authoritative Quran recognition and timing path", () => {
  assert.match(generation, /decideFastConformerPassage/);
  assert.match(generation, /canonicalSpanFromFastConformerIdentification/);
  assert.match(generation, /passageSource: useFastConformer \? "fastconformer-quran" : "whisper-fallback"/);
  assert.match(generation, /createCaptionSegmentsFromVerseBoundaries/);
  assert.match(generation, /analysis\.authoritativeTimingEngine\.wordTimings/);
  assert.match(generation, /No credible human speech was detected/);
});

test("quick create and editor emit the same shared recognition diagnostic schema", () => {
  for (const source of [generation, editor]) {
    assert.match(source, /quranRecognitionDebug\(/);
    assert.match(source, /quranFallbackDebug\(/);
    assert.match(source, /quranFinalIdentityDebug\(/);
    assert.match(source, /quranForcedAlignmentDebug\(/);
  }
});

test("advanced editor restores the generated local project/runtime and preserves export auth gating", () => {
  assert.match(editor, /const routeProjectId = new URLSearchParams\(window\.location\.search\)\.get\("project"\)/);
  assert.match(editor, /videoJobManager\.getRuntime\(project\.id\)/);
  assert.match(editor, /restoredCompletedRecognition: project\.captionSegments\.length > 0/);
  assert.match(editor, /openingProject: project/);
  assert.match(editor, /const opening = options\?\.openingProject \?\? pendingOpenProject/);
  assert.match(editor, /setMediaTrim\(opening\?\.mediaTrim \?\?/);
  assert.match(editor, /requestExportSettings\(\)/);
  assert.match(editor, /exportAuthIntent\(Boolean\(session\)\)/);
});
