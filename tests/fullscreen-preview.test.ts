import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canFullscreenComposedPreview, isComposedPreviewFullscreen, toggleComposedPreviewFullscreen } from "../src/lib/editor/fullscreen.ts";

const workspace = readFileSync(new URL("../src/components/editor-workspace.tsx", import.meta.url), "utf8");
const captions = readFileSync(new URL("../src/components/caption-preview.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

test("fullscreen requests the composed preview target and leaves the media clock untouched", async () => {
  const composedPreview = {} as Element & { requestFullscreen: () => Promise<void> };
  let rawVideoRequests = 0;
  const rawVideo = { requestFullscreen: () => { rawVideoRequests += 1; } };
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
  assert.equal(rawVideoRequests, 0);
  assert.equal(await toggleComposedPreviewFullscreen(composedPreview, documentLike), "exited");
  assert.equal(exitCount, 1);
  assert.equal(fullscreenElement, null);
  assert.equal(rawVideoRequests, 0);
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

test("mounted composed previews gain standard fullscreen capability after an initial null ref", () => {
  const documentLike = { fullscreenEnabled: true };
  const composedPreview = { requestFullscreen() {} };

  assert.equal(canFullscreenComposedPreview(null, documentLike), false);
  assert.equal(canFullscreenComposedPreview(composedPreview, documentLike), true);
});

test("WebKit container fullscreen capability is available when the standard API is absent", () => {
  const composedPreview = { webkitRequestFullscreen() {} };

  assert.equal(canFullscreenComposedPreview(composedPreview, { webkitFullscreenEnabled: true }), true);
  assert.equal(canFullscreenComposedPreview(composedPreview, { webkitFullscreenEnabled: false }), false);
});

test("fullscreen stays disabled when the composed container or browser support is unavailable", () => {
  assert.equal(canFullscreenComposedPreview(null, { fullscreenEnabled: true }), false);
  assert.equal(canFullscreenComposedPreview({}, { fullscreenEnabled: true }), false);
  assert.equal(canFullscreenComposedPreview({ requestFullscreen() {} }, { fullscreenEnabled: false }), false);
});

test("a rejected composed fullscreen request remains retryable", async () => {
  const composedPreview = { requestFullscreen: async () => { throw new Error("gesture expired"); } } as unknown as Element & { requestFullscreen: () => Promise<void> };
  const documentLike = { fullscreenEnabled: true };

  await assert.rejects(toggleComposedPreviewFullscreen(composedPreview, documentLike), /gesture expired/);
  assert.equal(canFullscreenComposedPreview(composedPreview, documentLike), true);
});

test("the sole caption renderer remains inside the fullscreen preview subtree", () => {
  const fullscreenStart = workspace.indexOf('ref={setFullscreenPreviewRef} className="editor-fullscreen-preview"');
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

test("the product-owned player exposes one fullscreen control and no native fullscreen affordance", () => {
  assert.doesNotMatch(workspace, /controlsList=/);
  assert.doesNotMatch(workspace, /<video[^>]*\bcontrols\b/);
  assert.doesNotMatch(workspace, /<audio[^>]*\bcontrols\b/);
  assert.doesNotMatch(workspace, /disabled=\{!fullscreenSupported\}/);
  assert.equal((workspace.match(/data-player-control="fullscreen"/g) ?? []).length, 1);
  assert.match(workspace, /fullscreenSupported && <button className="editor-player-button"/);
  assert.match(workspace, /aria-label=\{isPreviewFullscreen \? "Exit fullscreen" : "Enter fullscreen"\}/);
  assert.match(workspace, /title=\{isPreviewFullscreen \? "Exit fullscreen" : "Enter fullscreen"\}/);
});

test("the custom preview player retains familiar playback, seek, volume, and fullscreen controls", () => {
  assert.match(workspace, /data-player-control="playback"/);
  assert.match(workspace, /onClick=\{onTogglePreviewPlayback\}/);
  assert.match(workspace, /<Play aria-hidden="true"/);
  assert.match(workspace, /<Pause aria-hidden="true"/);
  assert.match(workspace, /data-player-control="seek"/);
  assert.match(workspace, /onChange=\{\(event\) => onSeekPreview\(Number\(event\.currentTarget\.value\) \* 1000\)\}/);
  assert.match(workspace, /data-player-control="mute"/);
  assert.match(workspace, /data-player-control="volume"/);
  assert.match(workspace, /<Volume2 aria-hidden="true"/);
  assert.match(workspace, /<VolumeX aria-hidden="true"/);
  assert.match(workspace, /onVolumeChange=\{syncPreviewVolume\}/);
  assert.match(workspace, /editor-player-controls/);
});

test("status is placed between the visible player controls and timeline without an overlay", () => {
  assert.match(styles, /\.editor-main-stage > \.editor-notices \{ position:static;/);
  assert.match(styles, /\.editor-main-stage > \.editor-timeline-panel \{ order:2;/);
  assert.match(styles, /width:min\(100%,760px\); max-height:min\(184px,30%\);/);
  assert.match(styles, /@media \(max-width:680px\) \{\n  \.editor-timeline-panel \{ position:relative; display:flex; width:100%; \}/);
});

test("fullscreen remains composed-only with mounted capability detection and centered project ratios", () => {
  assert.match(workspace, /fullscreenchange/);
  assert.match(workspace, /webkitfullscreenchange/);
  assert.match(workspace, /canFullscreenComposedPreview\(fullscreenPreviewElement, document\)/);
  assert.match(workspace, /const preview = fullscreenPreviewRef\.current;/);
  assert.match(workspace, /Composed preview fullscreen request failed/);
  assert.match(workspace, /editor-audio-canvas/);
  assert.match(styles, /grid-template-rows:minmax\(0,1fr\) auto/);
  for (const format of ["vertical", "landscape", "square"]) assert.match(styles, new RegExp(`editor-fullscreen-preview[^\\n]*data-project-format=\\"${format}\\"`));
  assert.match(styles, /align-items:center; justify-items:center; gap:12px; background:#050607/);
});
