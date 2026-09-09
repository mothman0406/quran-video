import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync(new URL("../src/components/editor-client.tsx", import.meta.url), "utf8");

test("editor Save keeps guest intent and confirms a first cloud-project name", () => {
  assert.match(editor, /rememberAuthContinuation\("save"\)/);
  assert.match(editor, /setCloudSaveOpen\(true\)/);
  assert.match(editor, /Save project/);
});

test("cloud save stages media before completing state and keeps failure dirty", () => {
  assert.match(editor, /beginCloudProjectSave\(snapshot\)/);
  assert.match(editor, /uploadPrivateProjectObject/);
  assert.match(editor, /completeCloudProjectSave\(snapshot/);
  assert.match(editor, /cleanupReplacedCloudMedia/);
  assert.match(editor, /setCloudSaveStatus\(message\); setErrorMessage\(message\)/);
  assert.match(editor, /cloudProjectError\(error, cloudSaveStage\)/);
  assert.match(editor, /let cloudSaveStage: CloudSaveStage = "database"/);
  assert.match(editor, /cleanupReplacedCloudMedia\(id, \[oldSourcePath, oldThumbnailPath\], \[row\.source_media_path, row\.thumbnail_path\]\)/);
  assert.match(editor, /Cloud project media cleanup failed after save/);
});

test("new media schedules automatic detection while restored completed recognition is preserved", () => {
  assert.match(editor, /setAutomaticRecognitionRequest\(/);
  assert.match(editor, /new AutomaticRecognitionController\(\)/);
  assert.match(editor, /restoredCompletedRecognition: record\.project\.captionSegments\.length > 0/);
  assert.match(editor, /void detect\(automaticRecognitionRequest\)/);
});

test("cloud restore downloads private media into the normal File contract and retries retrieval failures", () => {
  assert.match(editor, /await restoreCloudProjectSource\(record\)/);
  assert.match(editor, /restoredCompletedRecognition: record\.project\.captionSegments\.length > 0/);
  assert.match(editor, /retryCloudSourceRestore/);
  assert.match(editor, /This project doesn't have a saved source file/);
  assert.match(editor, /This project's saved source file is no longer available/);
});
