import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";

export type YouTubeImportMode = "video" | "audio";

export type YouTubeImportMetadata = {
  sessionId: string;
  sourceUrl: string;
  fileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  title?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  hasVideo: boolean;
  hasAudio: true;
};

const TEMP_DIRECTORY = join(tmpdir(), "quran-video-youtube-imports");
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STALE_IMPORT_AGE_MS = 24 * 60 * 60 * 1_000;
const activeImports = new Map<string, ChildProcess>();

/** Testable app-owned directory; callers must never derive arbitrary paths from it. */
export function youtubeImportTempDirectory() {
  return TEMP_DIRECTORY;
}

export function isLocalYouTubeImportEnabled() {
  return process.env.NODE_ENV !== "production";
}

export function validateYouTubeUrl(value: string): { valid: true; url: string } | { valid: false; reason: string } {
  if (/[^\x20-\x7e]/.test(value) || /[\r\n]/.test(value)) return { valid: false, reason: "Use a standard YouTube URL without control characters." };
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const acceptedHost = host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com" || host === "youtu.be";
    if (!acceptedHost || (parsed.protocol !== "https:" && parsed.protocol !== "http:")) return { valid: false, reason: "Enter a youtube.com, youtu.be, or YouTube Shorts link." };
    const validPath = host === "youtu.be"
      ? parsed.pathname.length > 1
      : parsed.pathname === "/watch" ? Boolean(parsed.searchParams.get("v")) : /^\/(shorts|live|embed)\/[^/]+/.test(parsed.pathname);
    if (!validPath) return { valid: false, reason: "That does not look like a playable YouTube video URL." };
    return { valid: true, url: parsed.toString() };
  } catch {
    return { valid: false, reason: "Enter a complete YouTube URL." };
  }
}

export function isValidImportSessionId(sessionId: string) {
  return SESSION_ID_PATTERN.test(sessionId);
}

/** Deliberately returns argv, never a shell command string. */
export function createYtDlpArgs(url: string, mode: YouTubeImportMode, outputTemplate: string): string[] {
  const format = mode === "audio"
    ? "bestaudio[ext=m4a]/bestaudio"
    : "best[ext=mp4][vcodec^=avc][acodec^=mp4a]/best[ext=mp4]";
  return [
    "--no-playlist",
    "--no-warnings",
    "--restrict-filenames",
    "--print-json",
    "--no-simulate",
    "--format", format,
    "--output", outputTemplate,
    url,
  ];
}

function mimeTypeForFile(fileName: string, mode: YouTubeImportMode) {
  const extension = fileName.split(".").at(-1)?.toLowerCase();
  if (extension === "mp4" || extension === "m4v") return "video/mp4";
  if (extension === "webm") return mode === "audio" ? "audio/webm" : "video/webm";
  if (extension === "m4a") return "audio/mp4";
  if (extension === "mp3") return "audio/mpeg";
  return mode === "audio" ? "audio/*" : "video/*";
}

async function ensureTemporaryDirectory() {
  await mkdir(TEMP_DIRECTORY, { recursive: true });
}

export async function cleanupStaleYouTubeImports() {
  await ensureTemporaryDirectory();
  const now = Date.now();
  await Promise.all((await readdir(TEMP_DIRECTORY, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map(async (entry) => {
    const target = join(TEMP_DIRECTORY, entry.name);
    try {
      if (now - (await stat(target)).mtimeMs > STALE_IMPORT_AGE_MS) await rm(target, { recursive: true, force: true });
    } catch {
      // A concurrent import or cleanup may have removed it.
    }
  }));
}

export async function removeYouTubeImport(sessionId: string) {
  if (!isValidImportSessionId(sessionId)) return;
  activeImports.get(sessionId)?.kill("SIGTERM");
  activeImports.delete(sessionId);
  await rm(join(TEMP_DIRECTORY, sessionId), { recursive: true, force: true });
}

export async function assertYtDlpAvailable() {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn("yt-dlp", ["--version"], { stdio: "ignore", shell: false });
    child.once("error", () => reject(new Error("yt-dlp is not installed. Install it locally (for example, `brew install yt-dlp` or `pipx install yt-dlp`) and restart `npm run dev`.")));
    child.once("exit", (code) => code === 0 ? resolvePromise() : reject(new Error("yt-dlp is unavailable. Reinstall it locally, then restart `npm run dev`.")));
  });
}

export async function importYouTubeMedia(sessionId: string, url: string, mode: YouTubeImportMode): Promise<YouTubeImportMetadata> {
  if (!isLocalYouTubeImportEnabled()) throw new Error("YouTube import is available only in local development.");
  if (!isValidImportSessionId(sessionId)) throw new Error("Invalid import session.");
  const checkedUrl = validateYouTubeUrl(url);
  if (!checkedUrl.valid) throw new Error(checkedUrl.reason);
  await cleanupStaleYouTubeImports();
  await assertYtDlpAvailable();
  const sessionDirectory = join(TEMP_DIRECTORY, sessionId);
  await rm(sessionDirectory, { recursive: true, force: true });
  await mkdir(sessionDirectory, { recursive: true });
  const outputTemplate = join(sessionDirectory, "source.%(ext)s");
  const child = spawn("yt-dlp", createYtDlpArgs(checkedUrl.url, mode, outputTemplate), { shell: false, stdio: ["ignore", "pipe", "pipe"] });
  activeImports.set(sessionId, child);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
  try {
    await new Promise<void>((resolvePromise, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (code === 0) resolvePromise();
        else reject(new Error(signal ? "YouTube import was cancelled." : (stderr.trim().split("\n").at(-1) || "yt-dlp could not download this video.")));
      });
    });
    const files = (await readdir(sessionDirectory)).filter((file) => !file.endsWith(".part") && !file.endsWith(".ytdl"));
    const fileName = files[0];
    if (!fileName) throw new Error("yt-dlp did not produce a supported media file.");
    const filePath = join(sessionDirectory, fileName);
    const fileStats = await stat(filePath);
    const info = stdout.split("\n").map((line) => { try { return JSON.parse(line) as Record<string, unknown>; } catch { return null; } }).find(Boolean);
    return {
      sessionId,
      sourceUrl: checkedUrl.url,
      fileName,
      filePath,
      mimeType: mimeTypeForFile(fileName, mode),
      fileSize: fileStats.size,
      title: typeof info?.title === "string" ? info.title : undefined,
      durationMs: typeof info?.duration === "number" ? Math.round(info.duration * 1_000) : undefined,
      width: typeof info?.width === "number" ? info.width : undefined,
      height: typeof info?.height === "number" ? info.height : undefined,
      hasVideo: mode === "video",
      hasAudio: true,
    };
  } catch (error) {
    await removeYouTubeImport(sessionId);
    throw error;
  } finally {
    activeImports.delete(sessionId);
  }
}

export async function getYouTubeImportFile(sessionId: string) {
  if (!isValidImportSessionId(sessionId)) return null;
  const sessionDirectory = resolve(TEMP_DIRECTORY, sessionId);
  if (!sessionDirectory.startsWith(`${resolve(TEMP_DIRECTORY)}/`)) return null;
  try {
    const files = (await readdir(sessionDirectory)).filter((file) => !file.endsWith(".part") && !file.endsWith(".ytdl"));
    const fileName = files[0];
    if (!fileName) return null;
    const filePath = join(sessionDirectory, basename(fileName));
    const fileStats = await stat(filePath);
    return { fileName, filePath, fileSize: fileStats.size };
  } catch {
    return null;
  }
}

export { createReadStream, mimeTypeForFile };
