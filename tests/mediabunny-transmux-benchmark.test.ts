import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createEphemeralOpfsFile,
  EPHEMERAL_TRANSMUX_PREFIX,
  removeEphemeralOpfsFile,
  removeStaleEphemeralOpfsFiles,
  replaceEphemeralOpfsFile,
} from "../src/lib/media/ephemeral-opfs-file.ts";
import {
  editListStartsAtPresentationZero,
  isTransmuxDurationAccepted,
} from "../src/lib/media/transmux-timeline-validation.ts";

const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  dependencies: Record<string, string>;
};
const nodeHarness = readFileSync(new URL("../scripts/benchmark-mediabunny-transmux.ts", import.meta.url), "utf8");
const browserHarness = readFileSync(new URL("../src/app/debug/transmux/transmux-client.tsx", import.meta.url), "utf8");
const debugPage = readFileSync(new URL("../src/app/debug/transmux/page.tsx", import.meta.url), "utf8");
const opfsWorker = readFileSync(new URL("../public/debug-transmux-opfs-sw.js", import.meta.url), "utf8");

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

test("OPFS playback uses bounded byte ranges instead of materializing the file", () => {
  assert.match(browserHarness, /service-worker byte-range URL backed by OPFS/u);
  assert.match(opfsWorker, /request\.headers\.get\("range"\)/u);
  assert.match(opfsWorker, /new Response\(file\.slice\(start, end \+ 1\)/u);
  assert.match(opfsWorker, /status: 206/u);
  assert.match(opfsWorker, /Content-Range/u);
  assert.doesNotMatch(opfsWorker, /arrayBuffer\(/u);
});

test("per-track edit lists preserve independent zero presentation starts", () => {
  assert.equal(editListStartsAtPresentationZero(-0.95, 0.95), true);
  assert.equal(editListStartsAtPresentationZero(-0.03835416666666667, 0.03835416666666667), true);
  assert.equal(editListStartsAtPresentationZero(-0.03835416666666667, 0.95), false);
});

test("fragmented raw-span duration cannot pass timeline acceptance", () => {
  assert.equal(isTransmuxDurationAccepted(33.033333, 33.03333333333333), true);
  assert.equal(isTransmuxDurationAccepted(33.983333, 33.03333333333333), false);
});

test("headed benchmark remains development-only and keeps the fragmented failure visible", () => {
  assert.match(debugPage, /process\.env\.NODE_ENV === "production"/u);
  assert.match(debugPage, /notFound\(\)/u);
  assert.match(browserHarness, /chromeTimelineAccepted/u);
  assert.match(browserHarness, /REJECTED: Chrome duration/u);
  assert.match(browserHarness, /OPFS diagnostic; rejected on fixture/u);
  assert.match(browserHarness, /fastStart = mode === "buffer-fast-start"[\s\S]+: false/u);
  assert.match(browserHarness, /conversionRef\.current\.cancel/u);
  assert.match(browserHarness, /removeEphemeralOpfsFile/u);
});

function mockDirectory() {
  const files = new Set<string>();
  const removed: string[] = [];
  const directory = {
    async getFileHandle(name: string, options?: FileSystemGetFileOptions) {
      if (!options?.create && !files.has(name)) throw new DOMException("missing", "NotFoundError");
      files.add(name);
      return { name } as unknown as FileSystemFileHandle;
    },
    async removeEntry(name: string) {
      if (!files.delete(name)) throw new DOMException("missing", "NotFoundError");
      removed.push(name);
    },
    async *[Symbol.asyncIterator]() {
      for (const name of files) yield [name, { name }] as const;
    },
  } as unknown as FileSystemDirectoryHandle;
  return { directory, files, removed };
}

test("ephemeral OPFS output is app-owned and cleanup is idempotent", async () => {
  const { directory, files, removed } = mockDirectory();
  const file = await createEphemeralOpfsFile(directory);
  assert.match(file.name, new RegExp(`^${EPHEMERAL_TRANSMUX_PREFIX}.+\\.mp4$`, "u"));
  assert.equal(files.has(file.name), true);

  await removeEphemeralOpfsFile(file);
  await removeEphemeralOpfsFile(file);
  assert.deepEqual(removed, [file.name]);
});

test("source replacement deletes the previous OPFS output before creating another", async () => {
  const { directory, files, removed } = mockDirectory();
  const first = await createEphemeralOpfsFile(directory);
  const second = await replaceEphemeralOpfsFile(first, directory);

  assert.deepEqual(removed, [first.name]);
  assert.equal(files.has(first.name), false);
  assert.equal(files.has(second.name), true);
  assert.notEqual(second.name, first.name);
});

test("OPFS cleanup refuses non-app-owned files", async () => {
  const { directory } = mockDirectory();
  await assert.rejects(
    removeEphemeralOpfsFile({
      directory,
      handle: { name: "unrelated.mp4" } as unknown as FileSystemFileHandle,
      name: "unrelated.mp4",
    }),
    /not app-owned/u,
  );
});

test("startup cleanup removes stale transmux files but preserves unrelated OPFS data", async () => {
  const { directory, files } = mockDirectory();
  const staleName = `${EPHEMERAL_TRANSMUX_PREFIX}00000000-0000-4000-8000-000000000000.mp4`;
  files.add(staleName);
  files.add(`${EPHEMERAL_TRANSMUX_PREFIX}not-an-owned-opaque-name.mp4`);
  files.add("unrelated-project-data");

  const removed = await removeStaleEphemeralOpfsFiles(directory);
  assert.deepEqual(removed, [staleName]);
  assert.deepEqual([...files], [`${EPHEMERAL_TRANSMUX_PREFIX}not-an-owned-opaque-name.mp4`, "unrelated-project-data"]);
});
