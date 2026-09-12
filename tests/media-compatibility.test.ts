import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAX_LOCAL_FALLBACK_BYTES, MEDIA_COMPATIBILITY_ERRORS, MediaCompatibilityError, routeMediaCompatibility, type MediaInspection } from "../src/lib/media-compatibility.ts";
import { MEDIA_FILE_ACCEPT, mediaFileError, mediaKindForFile } from "../src/lib/editor/media.ts";

const editor = readFileSync("src/components/editor-client.tsx", "utf8");
const workspace = readFileSync("src/components/editor-workspace.tsx", "utf8");
const fallback = readFileSync("src/lib/recognition/local-media-compatibility.ts", "utf8");

function inspection(overrides: Partial<MediaInspection> = {}): MediaInspection {
  return { readable: true, kind: "video", hasVideo: true, hasAudio: true, browserPlayback: true, nativeRecognitionAudio: true, videoCodec: "avc", audioCodec: "aac", ...overrides };
}

test("H.264/AAC MP4 stays on the native path", () => {
  assert.equal(routeMediaCompatibility(400 * 1024 * 1024, inspection()), "native");
});

test("iPhone-style MOV selection is accepted without File System Access", () => {
  assert.equal(mediaKindForFile({ name: "IMG_0001.MOV", type: "" }), "video");
  assert.match(MEDIA_FILE_ACCEPT, /\.mov/);
  assert.match(workspace, /accept=\{MEDIA_FILE_ACCEPT\}/);
  assert.doesNotMatch(`${workspace}\n${editor}`, /showOpenFilePicker|FileSystemFileHandle|File System Access/i);
});

test("playable video with an unusable recognition decoder selects audio-only fallback", () => {
  assert.equal(routeMediaCompatibility(20 * 1024 * 1024, inspection({ nativeRecognitionAudio: false })), "audio-fallback");
  assert.match(editor, /decodeAudioChannels\(sourceFile\)/);
  assert.match(editor, /decodeRecognitionAudioFallback\(sourceFile\)/);
  assert.match(editor, /compatibility: "audio-fallback"/);
});

test("unplayable HEVC/MOV selects full normalization only after a local probe", () => {
  assert.equal(routeMediaCompatibility(20 * 1024 * 1024, inspection({ browserPlayback: false, videoCodec: "hevc" })), "full-normalization");
  assert.match(fallback, /probeFfmpeg\(runtime, inputName, audioOnly \? "audio" : "media"/);
  assert.match(fallback, /"-c:v", "libx264"/);
  assert.match(fallback, /"-pix_fmt", "yuv420p"/);
  assert.match(fallback, /"-movflags", "\+faststart"/);
  assert.match(fallback, /audioOnly \? "audio" : "media"/);
  assert.match(fallback, /audioOnly \? "audio" : "video"/);
});

test("unreadable, no-audio, and over-limit recordings fail before full conversion", () => {
  assert.throws(() => routeMediaCompatibility(1, inspection({ readable: false })), new MediaCompatibilityError("unreadable"));
  assert.throws(() => routeMediaCompatibility(1, inspection({ hasAudio: false })), new MediaCompatibilityError("noAudio"));
  assert.throws(() => routeMediaCompatibility(MAX_LOCAL_FALLBACK_BYTES + 1, inspection({ browserPlayback: false })), new MediaCompatibilityError("tooLarge"));
  assert.equal(MEDIA_COMPATIBILITY_ERRORS.noAudio, "This video doesn't contain an audio track. Choose a recording where the recitation can be heard.");
  assert.equal(MEDIA_COMPATIBILITY_ERRORS.unreadable, "We couldn't read this recording. It may be damaged or incomplete. Try selecting the original file again.");
  assert.equal(MEDIA_COMPATIBILITY_ERRORS.protected, "This recording is protected and can't be processed in the browser. Try the original unprotected video from your Photos library.");
  assert.equal(MEDIA_COMPATIBILITY_ERRORS.unsupported, "We can't process this recording on this device yet. Try another copy of the video or export it from Photos and try again.");
  assert.equal(MEDIA_COMPATIBILITY_ERRORS.tooLarge, "This recording is too large to convert safely in your browser. Trim it to the part you want to caption and try again.");
});

test("fallback work is local, cancellable, cleaned up, and cannot introduce a backend conversion service", () => {
  assert.match(fallback, /@ffmpeg\/ffmpeg/);
  assert.match(fallback, /AbortSignal/);
  assert.match(fallback, /deleteFile\(inputName/);
  assert.match(fallback, /runtime\.terminate\(\)/);
  assert.match(editor, /mediaPreparationAbort\.current\?\.abort\(\)/);
  assert.match(editor, /AutomaticRecognitionController/);
  assert.match(workspace, /Choose another recording/);
  assert.doesNotMatch(fallback, /fetch\([^)]*(upload|convert)|\/api\/(media|convert|transcode)|Railway|Render|Fly\.io/i);
});

test("ordinary extension-only picker files remain subject to the existing native size limit", () => {
  assert.equal(mediaFileError({ name: "screen-recording.mov", type: "", size: 500 * 1024 * 1024 }), null);
  assert.match(mediaFileError({ name: "notes.txt", type: "", size: 1 })!, /MP4, MOV, MP3, WAV, M4A/);
});
