import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { beginTimelineScrub, endTimelineScrub, isActiveTimelineScrubMove } from "../src/lib/editor/timeline-scrub.ts";

const client = readFileSync(new URL("../src/components/editor-client.tsx", import.meta.url), "utf8");
const workspace = readFileSync(new URL("../src/components/editor-workspace.tsx", import.meta.url), "utf8");

test("timeline hover never creates a scrub session", () => {
  assert.equal(isActiveTimelineScrubMove(null, 1, 0), false);
  assert.equal(isActiveTimelineScrubMove(null, 1, 1), false);
  assert.equal(beginTimelineScrub(1, 2), null, "secondary presses cannot start a scrub");
});

test("a primary pointer drag scrubs only for its initiating pointer while its button is held", () => {
  const session = beginTimelineScrub(41, 0);
  assert.deepEqual(session, { pointerId: 41 });
  assert.equal(isActiveTimelineScrubMove(session, 41, 1), true);
  assert.equal(isActiveTimelineScrubMove(session, 42, 1), false, "another pointer cannot move the playhead");
  assert.equal(isActiveTimelineScrubMove(session, 41, 0), false, "a missed pointerup cannot leave a stale drag active");
});

test("pointerup, pointercancel, lost capture, and release outside all end the exact scrub session", () => {
  const session = beginTimelineScrub(7, 0);
  assert.equal(endTimelineScrub(session, 7), null, "pointerup ends its session");
  assert.equal(endTimelineScrub(session), null, "cancel, window blur, and unmount end any session");
  assert.deepEqual(endTimelineScrub(session, 8), session, "unrelated pointer exits are ignored");
  assert.match(workspace, /onPointerUp=\{onTimelinePointerEnd\} onPointerCancel=\{onTimelinePointerEnd\} onLostPointerCapture=\{onTimelinePointerEnd\}/, "the captured playhead bubbles every release path through the timeline container");
  assert.match(client, /window\.addEventListener\("blur", onWindowBlur\)/);
  assert.match(client, /window\.removeEventListener\("blur", onWindowBlur\)/);
  assert.match(client, /timelineCleanup\.current\(\);/, "unmount performs the same cleanup");
});

test("click-to-seek remains a single background pointerdown and timeline objects do not seek", () => {
  assert.match(client, /function handleTimelinePointerDown[\s\S]*if \(event\.button !== 0\) return;[\s\S]*seekTimeline\(event\);/);
  assert.match(workspace, /className="editor-media-block"[\s\S]*onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(workspace, /className="editor-waveform"[\s\S]*onPointerDown=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(workspace, /onPointerDown=\{\(event\) => onSegmentPointerDown\(event, segment\)\}/);
});

test("cleanup restores stationary paused hover, repeated drags, and playback-driven updates", () => {
  const first = beginTimelineScrub(3, 0);
  assert.equal(endTimelineScrub(first, 3), null);
  const second = beginTimelineScrub(4, 0);
  assert.equal(isActiveTimelineScrubMove(second, 4, 1), true, "a later drag starts independently");
  assert.match(client, /if \(!durationMs \|\| draggingEdge\.current \|\| draggingMediaTrim\.current \|\| playheadScrub\.current \|\| videoRef\.current\?\.paused\) return;/, "playback remains the only non-scrub source that follows the playhead");
  assert.match(client, /if \(!capture \|\| capture\.pointerId !== event\.pointerId\) return;/, "later hover has no active movement path");
});
