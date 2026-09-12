import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { MAX_FULL_NORMALIZATION_BYTES, MAX_RECOGNITION_PCM_BYTES, MEDIA_COMPATIBILITY_ERRORS, MediaCompatibilityError, mediaCompatibilityErrorMessage, recognitionPcmBytes, routeMediaCompatibility, type MediaInspection } from "../src/lib/media-compatibility.ts";
import { MEDIA_FILE_ACCEPT, mediaFileError, mediaKindForFile } from "../src/lib/editor/media.ts";
import { mediaFailureFromFfmpegLog } from "../src/lib/recognition/local-media-compatibility.ts";
import { mediaDebugEnabled, visibleFileExtension } from "../src/lib/recognition/media-debug.ts";

const editor = readFileSync("src/components/editor-client.tsx", "utf8");
const workspace = readFileSync("src/components/editor-workspace.tsx", "utf8");
const fallback = readFileSync("src/lib/recognition/local-media-compatibility.ts", "utf8");

function inspection(overrides: Partial<MediaInspection> = {}): MediaInspection {
  return { readable: true, kind: "video", hasVideo: true, hasAudio: true, browserPlayback: true, nativeRecognitionAudio: true, videoCodec: "avc", audioCodec: "aac", ...overrides };
}

test("H.264/AAC MP4 stays on the native path", () => {
  assert.equal(routeMediaCompatibility(700 * 1024 * 1024, inspection()), "native");
  assert.equal(mediaFileError({ name: "large-screen-recording.mov", type: "video/quicktime", size: 700 * 1024 * 1024 }), null);
});

test("iPhone-style MOV selection is accepted without File System Access", () => {
  assert.equal(mediaKindForFile({ name: "IMG_0001.MOV", type: "" }), "video");
  assert.match(MEDIA_FILE_ACCEPT, /\.mov/);
  assert.match(workspace, /accept=\{MEDIA_FILE_ACCEPT\}/);
  assert.doesNotMatch(`${workspace}\n${editor}`, /showOpenFilePicker|FileSystemFileHandle|File System Access/i);
});

test("playable MOV with AAC audio routes to audio-only fallback without requiring a video decoder", () => {
  assert.equal(routeMediaCompatibility(250 * 1024 * 1024, inspection({ nativeRecognitionAudio: false, durationMs: 30_000, videoCodec: "hevc", audioCodec: "aac" })), "audio-fallback");
  assert.match(editor, /decodeAudioChannels\(sourceFile\)/);
  assert.match(editor, /decodeRecognitionAudioFallback\(sourceFile\)/);
  assert.match(editor, /compatibility: "audio-fallback"/);
  assert.match(fallback, /"-map", "0:a:0"/);
  assert.match(fallback, /"-vn"/);
  assert.doesNotMatch(fallback, /decodeRecognitionAudioFallback[\s\S]*?"-c:v", "libx264"/);
  assert.doesNotMatch(fallback, /decodeRecognitionAudioFallback[\s\S]*?"-map", "0:v:0"/);
  assert.match(fallback, /mount\("WORKERFS", \{ files: \[file\] \}/);
  assert.doesNotMatch(fallback, /file\.arrayBuffer\(\)/);
  assert.match(editor, /Preparing the audio for detection/);
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

test("unreadable, no-audio, oversized PCM, and unsafe full normalization fail during preflight", () => {
  assert.throws(() => routeMediaCompatibility(1, inspection({ readable: false })), new MediaCompatibilityError("unreadable"));
  assert.throws(() => routeMediaCompatibility(1, inspection({ hasAudio: false })), new MediaCompatibilityError("noAudio"));
  assert.throws(() => routeMediaCompatibility(MAX_FULL_NORMALIZATION_BYTES + 1, inspection({ browserPlayback: false })), new MediaCompatibilityError("fullNormalizationTooLarge"));
  assert.throws(() => routeMediaCompatibility(1, inspection({ browserPlayback: false, durationMs: 15 * 60 * 1_000 + 1 })), new MediaCompatibilityError("fullNormalizationTooLarge"));
  assert.throws(() => routeMediaCompatibility(1, inspection({ browserPlayback: false, width: 3_841, height: 2_160 })), new MediaCompatibilityError("fullNormalizationTooLarge"));
  assert.throws(() => routeMediaCompatibility(1, inspection({ nativeRecognitionAudio: false, durationMs: MAX_RECOGNITION_PCM_BYTES / 64 + 1 })), new MediaCompatibilityError("recognitionAudioTooLarge"));
  assert.equal(recognitionPcmBytes(30_000), 1_920_000);
  assert.equal(MEDIA_COMPATIBILITY_ERRORS.noAudio, "This video doesn't contain an audio track. Choose a recording where the recitation can be heard.");
  assert.equal(MEDIA_COMPATIBILITY_ERRORS.unreadable, "We couldn't read this recording. It may be damaged or incomplete. Try selecting the original file again.");
  assert.equal(MEDIA_COMPATIBILITY_ERRORS.protected, "This recording is protected and can't be processed in the browser. Try the original unprotected video from your Photos library.");
  assert.equal(MEDIA_COMPATIBILITY_ERRORS.runtimeLoad, "We couldn't prepare this recording on this device. Try refreshing the page and selecting it again.");
  assert.equal(MEDIA_COMPATIBILITY_ERRORS.audioDecoderUnavailable, "We found audio in this recording, but this device can't decode its audio format yet. Try exporting another copy of the recording and selecting it again.");
  assert.equal(mediaCompatibilityErrorMessage(new Error("worker import failed")), MEDIA_COMPATIBILITY_ERRORS.runtimeLoad);
  assert.equal(MEDIA_COMPATIBILITY_ERRORS.fullNormalizationTooLarge, "This recording needs more conversion than this browser can safely handle. Try trimming it to the part you want to caption, or choose a smaller copy.");
});

test("FFmpeg audio failures retain their internal stage instead of becoming generic unsupported", () => {
  assert.equal(mediaFailureFromFfmpegLog(["Stream map '0:a:0' matches no streams."]).code, "noAudio");
  assert.equal(mediaFailureFromFfmpegLog(["Error opening input: Invalid argument"]).code, "containerOpen");
  assert.equal(mediaFailureFromFfmpegLog(["Invalid data found when processing input"]).code, "unreadable");
  assert.equal(mediaFailureFromFfmpegLog(["Unknown decoder 'aac_at'"]).code, "audioDecoderUnavailable");
  assert.equal(mediaFailureFromFfmpegLog(["Cannot enlarge memory arrays"]).code, "resource");
  assert.equal(mediaFailureFromFfmpegLog(["Error while decoding stream #0:1"], "pcmExtractionFailed").code, "pcmExtractionFailed");
  assert.notEqual(mediaFailureFromFfmpegLog(["Unknown decoder 'aac_at'"]).code, "workerfsMount");
});

test("safe media debugging is opt-in and excludes the filename", () => {
  assert.equal(mediaDebugEnabled("?debugMedia=1"), true);
  assert.equal(mediaDebugEnabled("?debugMedia=0"), false);
  assert.equal(visibleFileExtension("Screen Recording 2026-09-11 at 10.32.15.mov"), "mov");
  assert.equal(visibleFileExtension("recitation"), null);
  assert.match(fallback, /mediaDebug\("inspection"/);
  assert.match(fallback, /audioStreams/);
  assert.match(fallback, /pcmDurationMs/);
  assert.doesNotMatch(fallback, /mediaDebug\([^\n]*file\.name/);
});

test("fallback work is local, cancellable, cleaned up, and cannot introduce a backend conversion service", () => {
  assert.match(fallback, /@ffmpeg\/ffmpeg/);
  assert.match(fallback, /AbortSignal/);
  assert.match(fallback, /unmount\(mountPoint\)/);
  assert.match(fallback, /deleteDir\(mountPoint\)/);
  assert.match(fallback, /runtime\.terminate\(\)/);
  assert.match(editor, /mediaPreparationAbort\.current\?\.abort\(\)/);
  assert.match(editor, /AutomaticRecognitionController/);
  assert.match(workspace, /Choose another recording/);
  assert.doesNotMatch(fallback, /fetch\([^)]*(upload|convert)|\/api\/(media|convert|transcode)|Railway|Render|Fly\.io/i);
});

test("ordinary extension-only picker files have no blanket native size limit", () => {
  assert.equal(mediaFileError({ name: "screen-recording.mov", type: "", size: 2 * 1024 * 1024 * 1024 }), null);
  assert.match(mediaFileError({ name: "notes.txt", type: "", size: 1 })!, /MP4, MOV, MP3, WAV, M4A/);
});
