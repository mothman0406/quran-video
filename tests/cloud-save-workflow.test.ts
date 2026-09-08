import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const editor = readFileSync(new URL("../src/app/editor/page.tsx", import.meta.url), "utf8");

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
});

test("new media schedules automatic detection while restored completed recognition is preserved", () => {
  assert.match(editor, /setAutomaticRecognitionRequest\(/);
  assert.match(editor, /new AutomaticRecognitionController\(\)/);
  assert.match(editor, /restoredCompletedRecognition: record\.project\.captionSegments\.length > 0/);
  assert.match(editor, /void detect\(automaticRecognitionRequest\)/);
});
