import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

test("obsolete monthly video usage API is not active", () => {
  assert.equal(existsSync(new URL("../src/app/api/usage/route.ts", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/lib/usage/client.ts", import.meta.url)), false);
  const editor = readFileSync(new URL("../src/app/editor/page.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(editor, /recordAuthenticatedUsage\("export_completed"/);
  assert.doesNotMatch(editor, /recordAuthenticatedUsage\("cloud_project_saved"/);
});
