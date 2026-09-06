import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createYtDlpArgs, removeYouTubeImport, validateYouTubeUrl, youtubeImportTempDirectory } from "../src/lib/youtube-import.ts";
import { mediaSourceFromFile, timelineTracks } from "../src/lib/editor/media.ts";

test("accepts standard youtube.com, youtu.be, and Shorts URLs", () => {
  assert.equal(validateYouTubeUrl("https://www.youtube.com/watch?v=abc123").valid, true);
  assert.equal(validateYouTubeUrl("https://youtu.be/abc123?t=4").valid, true);
  assert.equal(validateYouTubeUrl("https://www.youtube.com/shorts/abc123").valid, true);
});

test("rejects non-YouTube and control-character URLs before process launch", () => {
  assert.equal(validateYouTubeUrl("https://example.com/watch?v=abc").valid, false);
  assert.equal(validateYouTubeUrl("https://youtube.com/watch?v=abc\n--output=/tmp/pwned").valid, false);
});

test("yt-dlp receives a safe argument array with the URL as one opaque argument", () => {
  const url = "https://www.youtube.com/watch?v=abc123";
  const args = createYtDlpArgs(url, "video", "/tmp/quran-video/source.%(ext)s");
  assert.equal(args.at(-1), url);
  assert.ok(args.includes("--output"));
  assert.ok(args.includes("--format"));
  assert.ok(args.some((argument) => argument.includes("bestvideo[ext=mp4][vcodec^=avc]+bestaudio[ext=m4a][acodec^=mp4a]")));
  assert.equal(args.some((argument) => argument.includes(";")), false);
});

test("cancelling an import removes only its app-owned partial output", async () => {
  const sessionId = "123e4567-e89b-42d3-a456-426614174000";
  const sessionDirectory = join(youtubeImportTempDirectory(), sessionId);
  await mkdir(sessionDirectory, { recursive: true });
  await writeFile(join(sessionDirectory, "source.mp4.part"), "partial");
  await removeYouTubeImport(sessionId);
  await assert.rejects(access(sessionDirectory));
});

test("successful YouTube imports normalize to the existing video and audio MediaSource contracts", () => {
  const video = mediaSourceFromFile({ name: "source.mp4", size: 10, type: "video/mp4" }, "video", { durationMs: 12_000, origin: "youtube-import", sourceUrl: "https://youtu.be/abc123", displayName: "Recitation" });
  const audio = mediaSourceFromFile({ name: "source.m4a", size: 10, type: "audio/mp4" }, "audio", { durationMs: 12_000, origin: "youtube-import", sourceUrl: "https://youtu.be/abc123" });
  assert.equal(video.origin, "youtube-import");
  assert.equal(audio.origin, "youtube-import");
  assert.deepEqual(timelineTracks(video, []).map((track) => [track.kind, track.items.length]), [["text", 0], ["video", 1], ["audio", 1]]);
  assert.deepEqual(timelineTracks(audio, []).map((track) => [track.kind, track.items.length]), [["text", 0], ["video", 0], ["audio", 1]]);
});
