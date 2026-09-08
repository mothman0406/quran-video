import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createTikTokUploadPlan, validateTikTokMedia } from "./media";
import { oauthStatesMatch } from "./oauth";
import type { TikTokConnectionState, TikTokCreatorInfo, TikTokInitRequest, TikTokPostInitialization, TikTokPublishStatus } from "./types";

const API_BASE = "https://open.tiktokapis.com";
const AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize/";
const CONNECTION_COOKIE = "quran_video_tiktok_connection";
const STATE_COOKIE = "quran_video_tiktok_oauth_state";
const OAUTH_STATE_BYTES = 32;

type StoredConnection = { accessToken: string; refreshToken: string; accessTokenExpiresAt: number; refreshTokenExpiresAt: number; openId: string; scopes: string[] };
type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; refresh_expires_in?: number; open_id?: string; scope?: string; error?: string; error_description?: string };
type TikTokApiEnvelope<T> = { data?: T; error?: { code?: string; message?: string; log_id?: string }; message?: string };

export function tiktokConnectionState(connected = false): TikTokConnectionState {
  const configured = Boolean(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET && process.env.TIKTOK_REDIRECT_URI);
  return { configured, connected: configured && connected, directPostAudited: process.env.TIKTOK_DIRECT_POST_AUDITED === "true" };
}

function requireConfig() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  const redirectUri = process.env.TIKTOK_REDIRECT_URI;
  if (!clientKey || !clientSecret || !redirectUri) throw new TikTokServerError(503, "TikTok is not configured for this environment.");
  try {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") throw new Error();
  } catch { throw new TikTokServerError(503, "TIKTOK_REDIRECT_URI must be a registered absolute callback URL."); }
  return { clientKey, clientSecret, redirectUri };
}

function cookieKey() {
  const { clientSecret } = requireConfig();
  return createHash("sha256").update(process.env.TIKTOK_TOKEN_ENCRYPTION_KEY || clientSecret).digest();
}

function encryptConnection(connection: StoredConnection) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", cookieKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(connection), "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

function decryptConnection(value: string): StoredConnection | null {
  try {
    const bytes = Buffer.from(value, "base64url");
    const iv = bytes.subarray(0, 12);
    const tag = bytes.subarray(12, 28);
    const encrypted = bytes.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", cookieKey(), iv);
    decipher.setAuthTag(tag);
    const decoded = JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8")) as StoredConnection;
    return decoded.accessToken && decoded.refreshToken && decoded.openId ? decoded : null;
  } catch { return null; }
}

function secureCookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge };
}

export function setTikTokConnection(response: NextResponse, connection: StoredConnection) {
  response.cookies.set(CONNECTION_COOKIE, encryptConnection(connection), secureCookieOptions(Math.max(60, Math.floor((connection.refreshTokenExpiresAt - Date.now()) / 1000))));
}

export function clearTikTokConnection(response: NextResponse) {
  response.cookies.set(CONNECTION_COOKIE, "", { ...secureCookieOptions(0), maxAge: 0 });
}

export class TikTokServerError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function tokenRequest(parameters: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE}/v2/oauth/token/`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: parameters, cache: "no-store" });
  const body = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || body.error || !body.access_token) throw new TikTokServerError(401, body.error_description || "TikTok authorization could not be completed.");
  return body;
}

function storedToken(body: TokenResponse, previous?: StoredConnection): StoredConnection {
  if (!body.access_token || !body.refresh_token || !body.open_id || !body.expires_in || !body.refresh_expires_in) throw new TikTokServerError(401, "TikTok returned an incomplete authorization response.");
  return { accessToken: body.access_token, refreshToken: body.refresh_token, accessTokenExpiresAt: Date.now() + body.expires_in * 1000, refreshTokenExpiresAt: Date.now() + body.refresh_expires_in * 1000, openId: body.open_id, scopes: body.scope?.split(",").filter(Boolean) ?? previous?.scopes ?? [] };
}

export async function exchangeTikTokAuthorizationCode(code: string) {
  const { clientKey, clientSecret, redirectUri } = requireConfig();
  const body = await tokenRequest(new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }));
  return storedToken(body);
}

async function getStoredConnection(): Promise<StoredConnection | null> {
  if (!tiktokConnectionState().configured) return null;
  const store = await cookies();
  return store.get(CONNECTION_COOKIE)?.value ? decryptConnection(store.get(CONNECTION_COOKIE)!.value) : null;
}

export async function connectionStateForRequest() {
  return tiktokConnectionState(Boolean(await getStoredConnection()));
}

async function accessToken() {
  const connection = await getStoredConnection();
  if (!connection) throw new TikTokServerError(401, "Connect TikTok before posting.");
  if (connection.accessTokenExpiresAt > Date.now() + 60_000) return { token: connection.accessToken, refreshed: null as StoredConnection | null };
  if (connection.refreshTokenExpiresAt <= Date.now()) throw new TikTokServerError(401, "Your TikTok authorization expired. Connect TikTok again.");
  const { clientKey, clientSecret } = requireConfig();
  const body = await tokenRequest(new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, grant_type: "refresh_token", refresh_token: connection.refreshToken }));
  const refreshed = storedToken(body, connection);
  return { token: refreshed.accessToken, refreshed };
}

async function apiRequest<T>(path: string, payload: unknown) {
  const { token, refreshed } = await accessToken();
  const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" }, body: JSON.stringify(payload), cache: "no-store" });
  const body = await response.json().catch(() => ({})) as TikTokApiEnvelope<T>;
  if (!response.ok || body.error?.code !== "ok") {
    const message = body.error?.message || body.message || "TikTok could not complete this request.";
    const safeMessage = body.error?.code === "access_token_invalid" ? "Your TikTok authorization expired. Connect TikTok again." : body.error?.code === "scope_not_authorized" ? "TikTok did not grant the required posting permission." : body.error?.code === "rate_limit_exceeded" ? "TikTok is rate limiting requests. Please wait and try again." : message;
    throw new TikTokServerError(response.status || 502, safeMessage);
  }
  if (!body.data) throw new TikTokServerError(502, "TikTok returned an incomplete response.");
  return { data: body.data, refreshed };
}

export async function creatorInfo() {
  const { data, refreshed } = await apiRequest<{ creator_username?: string; creator_nickname?: string; creator_avatar_url?: string; privacy_level_options?: string[]; comment_disabled?: boolean; duet_disabled?: boolean; stitch_disabled?: boolean; max_video_post_duration_sec?: number }>("/v2/post/publish/creator_info/query/", {});
  if (!data.creator_username || !data.creator_nickname || !Array.isArray(data.privacy_level_options) || !data.max_video_post_duration_sec) throw new TikTokServerError(502, "TikTok returned incomplete creator posting capabilities.");
  const creator: TikTokCreatorInfo = { username: data.creator_username, nickname: data.creator_nickname, avatarUrl: data.creator_avatar_url ?? null, privacyLevelOptions: data.privacy_level_options.filter((value): value is TikTokCreatorInfo["privacyLevelOptions"][number] => ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"].includes(value)), commentDisabled: Boolean(data.comment_disabled), duetDisabled: Boolean(data.duet_disabled), stitchDisabled: Boolean(data.stitch_disabled), maxVideoPostDurationSeconds: data.max_video_post_duration_sec };
  return { creator, refreshed };
}

export async function initializeTikTokPost(request: TikTokInitRequest) {
  const expectedUpload = createTikTokUploadPlan(request.media.fileSizeBytes);
  if (request.upload.chunkSize !== expectedUpload.chunkSize || request.upload.totalChunkCount !== expectedUpload.totalChunkCount) throw new TikTokServerError(400, "The TikTok upload chunk plan is invalid.");
  const errors = validateTikTokMedia(request.media);
  if (errors.length) throw new TikTokServerError(400, errors[0]!);
  if (request.title.length > 2200) throw new TikTokServerError(400, "TikTok captions are limited to 2,200 characters.");
  const config = tiktokConnectionState();
  const sourceInfo = { source: "FILE_UPLOAD", video_size: request.media.fileSizeBytes, chunk_size: request.upload.chunkSize, total_chunk_count: request.upload.totalChunkCount };
  if (request.mode === "draft") {
    const result = await apiRequest<{ publish_id?: string; upload_url?: string }>("/v2/post/publish/inbox/video/init/", { source_info: sourceInfo });
    if (!result.data.publish_id || !result.data.upload_url) throw new TikTokServerError(502, "TikTok did not return an upload destination.");
    return { initialization: { publishId: result.data.publish_id, uploadUrl: result.data.upload_url } satisfies TikTokPostInitialization, refreshed: result.refreshed };
  }
  if (!request.privacyLevel) throw new TikTokServerError(400, "Select a TikTok privacy setting before posting.");
  // Re-query here after the explicit final action so the API request remains
  // constrained by the creator's current capabilities, not stale browser UI.
  const latestCreator = await creatorInfo();
  const creatorMediaErrors = validateTikTokMedia(request.media, latestCreator.creator.maxVideoPostDurationSeconds);
  if (creatorMediaErrors.length) throw new TikTokServerError(400, creatorMediaErrors[0]!);
  if (!latestCreator.creator.privacyLevelOptions.includes(request.privacyLevel)) throw new TikTokServerError(400, "That TikTok privacy setting is no longer available for this account.");
  const privacy = config.directPostAudited ? request.privacyLevel : "SELF_ONLY";
  const result = await apiRequest<{ publish_id?: string; upload_url?: string }>("/v2/post/publish/video/init/", { post_info: { title: request.title || undefined, privacy_level: privacy, disable_comment: latestCreator.creator.commentDisabled || Boolean(request.disableComment), disable_duet: latestCreator.creator.duetDisabled || Boolean(request.disableDuet), disable_stitch: latestCreator.creator.stitchDisabled || Boolean(request.disableStitch) }, source_info: sourceInfo });
  if (!result.data.publish_id || !result.data.upload_url) throw new TikTokServerError(502, "TikTok did not return an upload destination.");
  return { initialization: { publishId: result.data.publish_id, uploadUrl: result.data.upload_url } satisfies TikTokPostInitialization, refreshed: result.refreshed };
}

export async function getTikTokPostStatus(publishId: string) {
  const { data, refreshed } = await apiRequest<{ status?: string; uploaded_bytes?: number; fail_reason?: string; publicaly_available_post_id?: Array<string | number> }>("/v2/post/publish/status/fetch/", { publish_id: publishId });
  const known = ["PROCESSING_UPLOAD", "PROCESSING_DOWNLOAD", "SEND_TO_USER_INBOX", "PUBLISH_COMPLETE", "FAILED"];
  const status: TikTokPublishStatus = { status: known.includes(data.status ?? "") ? data.status as TikTokPublishStatus["status"] : "UNKNOWN", uploadedBytes: typeof data.uploaded_bytes === "number" ? data.uploaded_bytes : null, failureReason: data.fail_reason ?? null, publiclyAvailablePostIds: (data.publicaly_available_post_id ?? []).map(String) };
  return { status, refreshed };
}

export async function cancelTikTokPost(publishId: string) {
  const { data: _data, refreshed } = await apiRequest<Record<string, never>>("/v2/post/publish/cancel/", { publish_id: publishId });
  return { refreshed };
}

export async function createOAuthRedirect() {
  const { clientKey, redirectUri } = requireConfig();
  const state = randomBytes(OAUTH_STATE_BYTES).toString("base64url");
  const url = new URL(AUTH_BASE);
  url.searchParams.set("client_key", clientKey);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "video.publish,video.upload");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return { state, url: url.toString() };
}

export async function storeOAuthState(response: NextResponse, state: string) {
  response.cookies.set(STATE_COOKIE, state, secureCookieOptions(10 * 60));
}

export async function validateOAuthState(state: string | null) {
  const expected = (await cookies()).get(STATE_COOKIE)?.value;
  if (!oauthStatesMatch(expected, state) || !state || !expected || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) throw new TikTokServerError(400, "TikTok authorization could not be verified. Please try connecting again.");
}

export function clearOAuthState(response: NextResponse) {
  response.cookies.set(STATE_COOKIE, "", { ...secureCookieOptions(0), maxAge: 0 });
}

export function attachRefreshedConnection(response: NextResponse, refreshed: StoredConnection | null) {
  if (refreshed) setTikTokConnection(response, refreshed);
  return response;
}

export function uploadPlanForMedia(fileSizeBytes: number) { return createTikTokUploadPlan(fileSizeBytes); }
