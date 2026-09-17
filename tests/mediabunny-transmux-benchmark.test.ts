import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  dependencies: Record<string, string>;
};
const nodeHarness = readFileSync(new URL("../scripts/benchmark-mediabunny-transmux.ts", import.meta.url), "utf8");
const browserHarness = readFileSync(new URL("../src/app/debug/transmux/transmux-client.tsx", import.meta.url), "utf8");
const debugPage = readFileSync(new URL("../src/app/debug/transmux/page.tsx", import.meta.url), "utf8");

test("transmux diagnostics require zero-shift packet copy for both tracks", () => {
  assert.equal(packageJson.dependencies.mediabunny, "^1.57.0");
  for (const source of [nodeHarness, browserHarness]) {
    assert.match(source, /mode:\s*"forced"/u);
    assert.match(source, /shiftTolerance:\s*0/u);
    assert.match(source, /boundaryPolicy:\s*"expand"/u);
    assert.match(source, /codec:\s*"avc"/u);
    assert.match(source, /codec:\s*"aac"/u);
    assert.doesNotMatch(source, /from\s+["']@ffmpeg\//u);
  }
});

test("headed benchmark remains development-only and keeps the fragmented failure visible", () => {
  assert.match(debugPage, /process\.env\.NODE_ENV === "production"/u);
  assert.match(debugPage, /notFound\(\)/u);
  assert.match(browserHarness, /chromeTimelineAccepted/u);
  assert.match(browserHarness, /REJECTED: Chrome duration/u);
  assert.match(browserHarness, /OPFS diagnostic; rejected on fixture/u);
});
