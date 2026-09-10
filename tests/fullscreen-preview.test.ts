import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isComposedPreviewFullscreen, toggleComposedPreviewFullscreen } from "../src/lib/editor/fullscreen.ts";

const workspace = readFileSync(new URL("../src/components/editor-workspace.tsx", import.meta.url), "utf8");
const captions = readFileSync(new URL("../src/components/caption-preview.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("fullscreen requests the composed preview target and leaves the media clock untouched", async () => {
  const composedPreview = {} as Element & { requestFullscreen: () => Promise<void> };
  const rawVideo = { requestFullscreen: () => { throw new Error("raw video must not be fullscreened"); } };
  let fullscreenElement: Element | null = null;
  let requestCount = 0;
  let exitCount = 0;
  composedPreview.requestFullscreen = async () => { requestCount += 1; fullscreenElement = composedPreview; };
  const documentLike = {
    get fullscreenElement() { return fullscreenElement; },
    exitFullscreen: async () => { exitCount += 1; fullscreenElement = null; },
  };

  assert.equal(await toggleComposedPreviewFullscreen(composedPreview, documentLike), "entered");
  assert.equal(requestCount, 1);
  assert.equal(isComposedPreviewFullscreen(composedPreview, documentLike), true);
  assert.equal(rawVideo.requestFullscreen instanceof Function, true);
  assert.equal(await toggleComposedPreviewFullscreen(composedPreview, documentLike), "exited");
  assert.equal(exitCount, 1);
  assert.equal(fullscreenElement, null);
});

test("legacy WebKit container fullscreen is supported without a media-element fallback", async () => {
  const composedPreview = {} as Element & { webkitRequestFullscreen: () => void };
  let fullscreenElement: Element | null = null;
  composedPreview.webkitRequestFullscreen = () => { fullscreenElement = composedPreview; };
  const documentLike = { get webkitFullscreenElement() { return fullscreenElement; } };

  assert.equal(await toggleComposedPreviewFullscreen(composedPreview, documentLike), "entered");
  assert.equal(isComposedPreviewFullscreen(composedPreview, documentLike), true);
  assert.doesNotMatch(readFileSync(new URL("../src/lib/editor/fullscreen.ts", import.meta.url), "utf8"), /webkitEnterFullscreen/);
});

test("the sole caption renderer remains inside the fullscreen preview subtree", () => {
  const fullscreenStart = workspace.indexOf('ref={fullscreenPreviewRef} className="editor-fullscreen-preview"');
  const canvasStart = workspace.indexOf('ref={previewRef} className={`project-preview-canvas', fullscreenStart);
  const captionRenderer = workspace.indexOf("<CaptionPreview", canvasStart);
  const fullscreenEnd = workspace.indexOf("</div> : <label className=\"editor-empty-canvas\"", captionRenderer);
  assert.ok(fullscreenStart >= 0 && canvasStart > fullscreenStart && captionRenderer > canvasStart && fullscreenEnd > captionRenderer);
  assert.equal((workspace.match(/<CaptionPreview/g) ?? []).length, 1);
  assert.match(captions, /data-caption-arabic-text/);
  assert.match(captions, /data-caption-object="translation"/);
  assert.match(captions, /data-caption-word-highlighted/);
  assert.match(captions, /contentKind === "ayah"/);
});

test("native video fullscreen is suppressed where controlsList is supported and all project ratios retain a centered canvas", () => {
  assert.match(workspace, /controlsList="nofullscreen"/);
  assert.match(workspace, /onDoubleClick=\{\(event\) => \{ event\.preventDefault\(\); togglePreviewFullscreen\(\); \}\}/);
  assert.match(workspace, /fullscreenchange/);
  assert.match(workspace, /webkitfullscreenchange/);
  assert.match(workspace, /editor-audio-canvas/);
  for (const format of ["vertical", "landscape", "square"]) assert.match(styles, new RegExp(`editor-fullscreen-preview[^\\n]*data-project-format=\\"${format}\\"`));
  assert.match(styles, /align-items:center; justify-content:center; background:#050607/);
});
