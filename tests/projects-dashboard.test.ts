import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const videos = readFileSync(new URL("../src/components/videos-dashboard.tsx", import.meta.url), "utf8");
const projectsRoute = readFileSync(new URL("../src/app/projects/page.tsx", import.meta.url), "utf8");

test("videos library combines guest-local and authenticated private records with search", () => {
  assert.match(videos, /createProjectRepository\(\)/);
  assert.match(videos, /getAuthSession\(\)/);
  assert.match(videos, /listCloudProjectRecords\(\)/);
  assert.match(videos, /getPrivateThumbnailUrl/);
  assert.match(videos, /Search videos/);
});

test("ready video cards expose composed watch, advanced edit, and on-demand download", () => {
  assert.match(videos, /<ComposedVideoPreview/);
  assert.match(videos, /\/editor\?project=/);
  assert.match(videos, /&export=1/);
  assert.match(videos, /"Watch"/);
  assert.match(videos, />Edit<\/Link>/);
  assert.match(videos, />Download<\/Link>/);
});

test("legacy projects redirect compatibly and undetected items remain recoverable", () => {
  assert.match(projectsRoute, /redirect\("\/videos"\)/);
  assert.match(videos, /Needs captions/);
});
