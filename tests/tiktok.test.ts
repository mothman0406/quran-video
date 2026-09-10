import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTikTokCaption } from "../src/lib/tiktok/caption.ts";
import { createTikTokUploadPlan, isTikTokExportEligible, tiktokUploadChunks, validateTikTokMedia } from "../src/lib/tiktok/media.ts";
import { MockTikTokService } from "../src/lib/tiktok/mock.ts";
import { oauthStatesMatch } from "../src/lib/tiktok/oauth.ts";
import { TIKTOK_STATUS_POLL_INTERVAL_MS, isTikTokStatusFinal, tiktokStatusMessage } from "../src/lib/tiktok/status.ts";

const postingUi = readFileSync("src/components/tiktok-posting.tsx", "utf8");
const tiktokServer = readFileSync("src/lib/tiktok/server.ts", "utf8");
const tiktokClient = readFileSync("src/lib/tiktok/client.ts", "utf8");

const segment = { id: "18:57#1", contentKind: "ayah", verseKeys: ["18:57"], startMs: 0, endMs: 4_000, arabic: "وَمَنْ أَظْلَمُ", translation: "And who is more unjust than one who is reminded of the verses of his Lord but turns away from them and forgets what his hands have put forth?", transliteration: null, wordStart: 0, wordEnd: 1, wordCount: 1, timingEvidence: { start: { timestampMs: 0, source: "direct-asr-word" }, end: { timestampMs: 4_000, source: "chunk-text-alignment" }, derived: false } } as never;

test("only actually watermarked exports are blocked for TikTok", () => {
  assert.equal(isTikTokExportEligible({ watermarkRequired: true }), false);
  assert.equal(isTikTokExportEligible({ watermarkRequired: false }), true);
});

test("TikTok media limits are centralized before initialization", () => {
  const healthy = { mimeType: "video/mp4", fileSizeBytes: 25_000_000, width: 1080, height: 1920, durationSeconds: 59, fps: 30, videoCodec: "avc" as const };
  assert.deepEqual(validateTikTokMedia(healthy, 180), []);
  assert.match(validateTikTokMedia({ ...healthy, fps: 20 })[0]!, /23 and 60 FPS/);
  assert.match(validateTikTokMedia({ ...healthy, durationSeconds: 181 }, 180)[0]!, /3 minute/);
  assert.match(validateTikTokMedia({ ...healthy, mimeType: "video/avi" })[0]!, /MP4, MOV, and WebM/);
});

test("FILE_UPLOAD plans and chunks follow TikTok sequential sizing rules", () => {
  const mib = 1024 * 1024;
  assert.deepEqual(createTikTokUploadPlan(4 * mib), { chunkSize: 4 * mib, totalChunkCount: 1 });
  assert.deepEqual(createTikTokUploadPlan(65 * mib), { chunkSize: 10 * mib, totalChunkCount: 6 });
  const chunks = tiktokUploadChunks(new Blob([new Uint8Array(65 * mib)]), createTikTokUploadPlan(65 * mib));
  assert.equal(chunks.length, 6);
  assert.equal(chunks.at(-1)?.blob.size, 15 * mib);
  assert.equal(chunks[0]?.start, 0);
  assert.equal(chunks.at(-1)?.end, 65 * mib);
});

test("social caption is local, deterministic, and based on canonical selected translation data", () => {
  const content = { "18:57": { status: "ready", verse: { translation: "And who is more unjust than one who is reminded of the verses of his Lord but turns away from them and forgets what his hands have put forth?" } } } as never;
  const caption = createTikTokCaption([segment], content);
  assert.match(caption, /Surah Al-Kahf 57 · الكهف/);
  assert.match(caption, /And who is more unjust/);
  assert.match(caption, /#quran #quranrecitation/);
  assert.equal(createTikTokCaption([segment], content), caption);
  assert.equal((content as { "18:57": { verse: { translation: string } } })["18:57"].verse.translation.startsWith("And who"), true);
});

test("OAuth state validation accepts only the exact state", () => {
  assert.equal(oauthStatesMatch("fixed-state", "fixed-state"), true);
  assert.equal(oauthStatesMatch("fixed-state", "fixed-state-x"), false);
  assert.equal(oauthStatesMatch("fixed-state", null), false);
  assert.equal(oauthStatesMatch(undefined, "fixed-state"), false);
});

test("post status distinguishes upload processing, completion, and failure", () => {
  const mock = new MockTikTokService();
  assert.equal(mock.creator.username, "test_creator");
  assert.equal(mock.initialize().publishId, "mock-publish-1");
  assert.equal(mock.nextStatus().status, "PROCESSING_UPLOAD");
  const complete = mock.nextStatus();
  assert.equal(isTikTokStatusFinal(complete), true);
  assert.equal(tiktokStatusMessage({ ...complete, status: "PROCESSING_DOWNLOAD" }), "Processing on TikTok");
  assert.equal(tiktokStatusMessage(complete), "Posted to TikTok");
  assert.match(tiktokStatusMessage({ ...complete, status: "FAILED", failureReason: "invalid_video" }), /TikTok could not process this video/);
});

test("status polling interval remains below TikTok's documented 30 calls/minute limit", () => {
  assert.ok(TIKTOK_STATUS_POLL_INTERVAL_MS >= 2_000);
});

test("TikTok boundary excludes recognition models and browser code contains no server token secrets", () => {
  const files = ["src/lib/tiktok/client.ts", "src/components/tiktok-posting.tsx", "src/lib/tiktok/caption.ts"].map((file) => readFileSync(file, "utf8")).join("\n");
  assert.doesNotMatch(files, /recognition\//u);
  assert.doesNotMatch(files, /TIKTOK_CLIENT_SECRET|refreshToken|accessToken/u);
  assert.match(readFileSync("src/components/editor-workspace.tsx", "utf8"), /TikTokPosting/);
});

test("Direct Post requires a fresh creator-info query, FILE_UPLOAD, and explicit consent before transfer", () => {
  assert.match(tiktokServer, /await creatorInfo\(\)/);
  assert.match(tiktokServer, /source: "FILE_UPLOAD"/);
  assert.match(tiktokServer, /if \(!request\.userConsent\)/);
  assert.match(postingUi, /getTikTokCreatorInfo/);
  assert.match(postingUi, /checked=\{userConsent\}/);
  assert.match(postingUi, /disabled=\{Boolean\(localErrors\.length \|\| captionTooLong \|\| !privacy \|\| !userConsent/);
  assert.match(tiktokClient, /uploadTikTokVideo/);
  assert.match(tiktokClient, /Content-Range/);
});

test("creator capabilities, commercial disclosure, and unaudited privacy restrictions drive the UI", () => {
  assert.match(postingUi, /creator\.privacyLevelOptions/);
  assert.match(postingUi, /Select privacy…/);
  assert.match(postingUi, /directPostAudited/);
  assert.match(postingUi, /Commercial content/);
  assert.match(tiktokServer, /brand_content_toggle/);
  assert.match(tiktokServer, /brand_organic_toggle/);
  assert.match(tiktokServer, /privacyLevelOptions\.includes\("SELF_ONLY"\)/);
  assert.match(tiktokServer, /const privacy = config\.directPostAudited \? request\.privacyLevel : "SELF_ONLY"/);
});

test("failure preserves the completed local export and expired authorization clears the protected connection", () => {
  assert.match(postingUi, /exported\.blob/);
  assert.match(postingUi, /Your completed export is still available for download/);
  assert.match(tiktokServer, /Connect TikTok again/);
  assert.match(tiktokServer, /requireVideoPublishScope/);
  assert.match(readFileSync("src/app/api/tiktok/post/init/route.ts", "utf8"), /clearTikTokConnection/);
});

test("user-facing unavailable state and OAuth callback do not expose setup instructions or callback credentials", () => {
  assert.match(postingUi, /TikTok posting is unavailable right now/);
  assert.doesNotMatch(postingUi, /docs\/TIKTOK_SETUP\.md|TIKTOK_CLIENT_SECRET|TIKTOK_REDIRECT_URI/u);
  const callback = readFileSync("src/app/api/tiktok/oauth/callback/route.ts", "utf8");
  assert.match(callback, /history\.replaceState/);
  assert.match(callback, /window\.location\.origin/);
});
