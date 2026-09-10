import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAX_LOCAL_MEDIA_BYTES, mediaFileError } from "../src/lib/editor/media.ts";

const workspace = readFileSync("src/components/editor-workspace.tsx", "utf8");
const editor = readFileSync("src/components/editor-client.tsx", "utf8");
const landing = readFileSync("src/components/landing-page.tsx", "utf8");

test("the customer editor has no reachable YouTube surface or platform guide", () => {
  assert.doesNotMatch(workspace, /youtube/i);
  assert.doesNotMatch(landing, /youtube/i);
  assert.doesNotMatch(readFileSync("src/lib/editor/social-platform-guides.ts", "utf8"), /youtube/i);
});

test("the initial empty state is Quran-specific, keyboard-accessible, and accepts drag/drop", () => {
  for (const copy of ["Upload your recitation", "Add a Quran recitation and we&apos;ll detect the verses, sync the captions, and prepare them for editing.", "Drop your recitation here", "or click to choose a file", "MP4, MOV, MP3, WAV, M4A · Up to 500 MB"]) assert.ok(workspace.includes(copy));
  assert.match(workspace, /onKeyDown=.*querySelector<HTMLInputElement>\("input"\).*click/);
  assert.ok(workspace.includes("onDragEnter=") && workspace.includes("onDragOver=") && workspace.includes("onDragLeave=") && workspace.includes("onDrop="));
  assert.match(workspace, /onVideoDrop\(file\)/);
  assert.ok(workspace.includes('videoUrl ? <div ref={setFullscreenPreviewRef}') && workspace.includes(': <label className={`editor-empty-canvas'));
});

test("browse and drag/drop share useful local media validation at the advertised limit", () => {
  assert.equal(mediaFileError({ type: "audio/mpeg", size: MAX_LOCAL_MEDIA_BYTES }), null);
  assert.match(mediaFileError({ type: "audio/mpeg", size: MAX_LOCAL_MEDIA_BYTES + 1 })!, /500 MB/);
  assert.match(mediaFileError({ type: "text/plain", size: 1 })!, /MP4, MOV, MP3, WAV, M4A/);
  assert.match(editor, /function selectMediaFile/);
  assert.match(editor, /onVideoDrop=\{selectMediaFile\}/);
});
