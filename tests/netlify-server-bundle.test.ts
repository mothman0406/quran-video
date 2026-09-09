import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const editorRoute = readFileSync(new URL("../src/app/editor/page.tsx", import.meta.url), "utf8");
const editorClient = readFileSync(new URL("../src/components/editor-client.tsx", import.meta.url), "utf8");
const exportSupport = readFileSync(new URL("../src/lib/export/support.ts", import.meta.url), "utf8");
const recognitionSupport = readFileSync(new URL("../src/lib/recognition/support.ts", import.meta.url), "utf8");

test("the editor runtime is isolated behind a client-only dynamic boundary", () => {
  assert.match(editorRoute, /dynamic\(\(\) => import\("@\/components\/editor-client"\)/);
  assert.match(editorRoute, /ssr:\s*false/);
  for (const runtime of ["@huggingface/transformers", "onnxruntime-web", "fastconformer-onnxruntime-web", "mediabunny", "@ricky0123/vad-web"]) {
    assert.doesNotMatch(editorRoute, new RegExp(runtime.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("recognition and export engines remain lazy browser imports", () => {
  assert.doesNotMatch(editorClient, /from "@\/lib\/recognition\/local-whisper"/);
  assert.doesNotMatch(editorClient, /from "@\/lib\/export\/offline-webcodecs"/);
  assert.match(editorClient, /await import\("@\/lib\/recognition\/local-whisper"\)/);
  assert.match(editorClient, /await import\("@\/lib\/export\/offline-webcodecs"\)/);
  assert.doesNotMatch(exportSupport, /from\s+["']mediabunny["']/u);
  assert.doesNotMatch(recognitionSupport, /transformers|onnxruntime/iu);
});

test("a completed production trace excludes browser engines from the editor server graph", () => {
  const trace = new URL("../.next/server/app/editor/page.js.nft.json", import.meta.url);
  if (!existsSync(trace)) return;
  const files = JSON.parse(readFileSync(trace, "utf8")).files as string[];
  for (const runtime of ["@huggingface/transformers", "onnxruntime-node", "onnxruntime-web", "fastconformer-onnxruntime-web", "mediabunny", "@ricky0123/vad-web"]) {
    assert.equal(files.some((file) => file.includes(runtime)), false, `${runtime} must not be in the editor server trace`);
  }
});
