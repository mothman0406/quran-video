import { createBrowserClient } from "@supabase/ssr";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { cloudProjectName, mediaExtension, PROJECT_MEDIA_BUCKET, projectMediaPath, quranProjectMetadata } from "./cloud-projects.ts";
import { loadSavedProject, serializeSavedProject } from "./project-storage.ts";
import type { SavedProject } from "./schemas/project.ts";

export const CLOUD_SCHEMA_VERSION = 2;

export type CloudProjectRow = {
  id: string; user_id: string; name: string; auto_title: string | null;
  surah_start: number | null; ayah_start: number | null; surah_end: number | null; ayah_end: number | null;
  duration_ms: number | null; aspect_ratio: string | null; project_data: unknown;
  source_filename: string | null; source_metadata: SavedProject["sourceMedia"] | null;
  source_media_path: string | null; source_media_type: string | null; source_media_name: string | null; source_media_size_bytes: number | null;
  thumbnail_path: string | null; thumbnail_size_bytes: number | null;
  last_export_quality: string | null; last_exported_at: string | null;
  schema_version: number; save_complete: boolean; created_at: string; updated_at: string;
};

export type CloudProjectPayload = Omit<CloudProjectRow, "user_id" | "created_at" | "updated_at" | "save_complete" | "source_media_path" | "source_media_type" | "source_media_name" | "source_media_size_bytes" | "thumbnail_path" | "thumbnail_size_bytes" | "last_export_quality" | "last_exported_at"> & { created_at: string; updated_at: string };
export type CloudProjectRecord = { row: CloudProjectRow; project: SavedProject };
export type CloudStorageSummary = { project_count: number; total_source_bytes: number; total_duration_ms: number };
export type CloudSaveStage = "configuration" | "database" | "source-upload" | "thumbnail" | "finalize" | "cleanup";

type SupabaseErrorLike = { code?: unknown; message?: unknown };

/** A safe, stage-aware error suitable for UI display; never includes credentials. */
export class CloudProjectError extends Error {
  readonly stage: CloudSaveStage;
  readonly code: string | null;

  constructor(stage: CloudSaveStage, message: string, code: string | null = null) {
    super(message);
    this.name = "CloudProjectError";
    this.stage = stage;
    this.code = code;
  }
}

export function cloudProjectError(error: unknown, stage: CloudSaveStage): CloudProjectError {
  if (error instanceof CloudProjectError) return error;
  const candidate = error && typeof error === "object" ? error as SupabaseErrorLike : null;
  const code = typeof candidate?.code === "string" ? candidate.code : null;
  const rawMessage = typeof candidate?.message === "string" ? candidate.message : error instanceof Error ? error.message : "";
  const missingProjectSchema = code === "42703" || code === "PGRST204" || /save_complete|column .*projects|schema cache/i.test(rawMessage);
  const message = stage === "configuration"
    ? "Cloud project database is not configured."
    : missingProjectSchema
      ? "Cloud project database is missing the required migration. Apply 20260908000000_production_cloud_projects.sql."
      : stage === "source-upload" || stage === "thumbnail"
        ? /bucket|not found/i.test(rawMessage)
          ? "The project-media bucket does not exist."
          : /permission|policy|not authorized|row-level/i.test(rawMessage)
            ? "Project media upload was blocked by Storage security policy."
            : "Project media could not be uploaded."
        : /permission|policy|not authorized|row-level|42501/i.test(rawMessage)
          ? "Project creation was blocked by database security policy."
          : rawMessage || "Could not save the project to the cloud.";
  const diagnostic = process.env.NODE_ENV !== "production"
    ? `${message} [stage: ${stage}${code ? `; code: ${code}` : ""}]`
    : message;
  return new CloudProjectError(stage, diagnostic, code);
}

let client: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && anonKey ? createBrowserClient(url, anonKey) : null;
  return client;
}

export function cloudSyncConfigured(): boolean { return getSupabaseClient() !== null; }

export function toCloudProjectPayload(project: SavedProject): CloudProjectPayload {
  const valid = loadSavedProject(serializeSavedProject(project));
  const metadata = quranProjectMetadata(valid);
  const source = valid.sourceMedia;
  return {
    id: valid.id, name: cloudProjectName(valid), auto_title: metadata.autoTitle,
    surah_start: metadata.surahStart, ayah_start: metadata.ayahStart, surah_end: metadata.surahEnd, ayah_end: metadata.ayahEnd,
    duration_ms: source?.durationMs ?? valid.mediaTrim.endMs - valid.mediaTrim.startMs, aspect_ratio: valid.format.preset,
    source_filename: source?.fileName ?? null, source_metadata: source, project_data: valid, schema_version: CLOUD_SCHEMA_VERSION,
    created_at: valid.createdAt, updated_at: valid.updatedAt,
  };
}

export function fromCloudProjectRow(row: CloudProjectRow): SavedProject {
  if (row.schema_version > CLOUD_SCHEMA_VERSION || row.schema_version < 1) throw new Error(`Unsupported cloud project schema version: ${row.schema_version}`);
  const project = loadSavedProject(row.project_data);
  if (project.id !== row.id) throw new Error("Cloud project identity does not match its metadata.");
  return { ...project, title: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function cloudRecord(row: CloudProjectRow): CloudProjectRecord { return { row, project: fromCloudProjectRow(row) }; }
export function hasProjectConflict(local: SavedProject | null, cloud: SavedProject | null): boolean { return Boolean(local && cloud && local.id === cloud.id && local.updatedAt !== cloud.updatedAt); }

function requireClient(): SupabaseClient {
  const supabase = getSupabaseClient();
  if (!supabase) throw cloudProjectError(null, "configuration");
  return supabase;
}

export async function getAuthSession(): Promise<Session | null> { const { data, error } = await requireClient().auth.getSession(); if (error) throw error; return data.session; }
function authCallbackUrl(next = "/editor"): string { if (typeof window === "undefined") throw new Error("Authentication can only start in the browser."); return new URL(`/auth/callback?next=${encodeURIComponent(next)}`, window.location.origin).toString(); }
export async function signInWithGoogle(next = "/editor"): Promise<void> { const { error } = await requireClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: authCallbackUrl(next) } }); if (error) throw error; }
export async function sendMagicLink(email: string, next = "/editor"): Promise<void> { const { error } = await requireClient().auth.signInWithOtp({ email, options: { emailRedirectTo: authCallbackUrl(next) } }); if (error) throw error; }
export async function signOut(): Promise<void> { const { error } = await requireClient().auth.signOut(); if (error) throw error; }

function rows(data: unknown): CloudProjectRow[] { return (Array.isArray(data) ? data : data ? [data] : []) as CloudProjectRow[]; }
export async function listCloudProjectRecords(): Promise<CloudProjectRecord[]> {
  const { data, error } = await requireClient().from("projects").select("*").eq("save_complete", true).order("updated_at", { ascending: false });
  if (error) throw cloudProjectError(error, "database");
  return rows(data).map(cloudRecord);
}
export async function listCloudProjects(): Promise<SavedProject[]> { return (await listCloudProjectRecords()).map((record) => record.project); }
export async function getCloudProjectRecord(id: string): Promise<CloudProjectRecord | null> {
  const { data, error } = await requireClient().from("projects").select("*").eq("id", id).eq("save_complete", true).maybeSingle();
  if (error) throw cloudProjectError(error, "database");
  return data ? cloudRecord(data as CloudProjectRow) : null;
}
export async function getCloudProject(id: string): Promise<SavedProject | null> { return (await getCloudProjectRecord(id))?.project ?? null; }
/** Legacy metadata-only caller compatibility. New editor saves use the staged media workflow. */
export async function saveCloudProject(project: SavedProject): Promise<SavedProject> {
  const row = await completeCloudProjectSave(project, { source_media_path: null, source_media_type: null, source_media_name: null, source_media_size_bytes: null, thumbnail_path: null, thumbnail_size_bytes: null });
  return fromCloudProjectRow(row);
}

/** Reserves a quota slot transactionally before the browser starts its direct upload. */
export async function beginCloudProjectSave(project: SavedProject): Promise<CloudProjectRow> {
  const payload = toCloudProjectPayload(project);
  const { data, error } = await requireClient().rpc("begin_cloud_project_save", { p_id: payload.id, p_name: payload.name, p_auto_title: payload.auto_title, p_surah_start: payload.surah_start, p_ayah_start: payload.ayah_start, p_surah_end: payload.surah_end, p_ayah_end: payload.ayah_end, p_duration_ms: payload.duration_ms, p_aspect_ratio: payload.aspect_ratio, p_project_data: payload.project_data, p_source_filename: payload.source_filename, p_source_metadata: payload.source_metadata, p_schema_version: payload.schema_version });
  if (error) throw cloudProjectError(error, "database");
  const row = rows(data)[0]; if (!row) throw new Error("Cloud save did not create a project reservation."); return row;
}

export async function completeCloudProjectSave(project: SavedProject, media: Pick<CloudProjectRow, "source_media_path" | "source_media_type" | "source_media_name" | "source_media_size_bytes" | "thumbnail_path" | "thumbnail_size_bytes">): Promise<CloudProjectRow> {
  const payload = toCloudProjectPayload(project);
  const { data, error } = await requireClient().rpc("complete_cloud_project_save", { p_id: payload.id, p_name: payload.name, p_auto_title: payload.auto_title, p_surah_start: payload.surah_start, p_ayah_start: payload.ayah_start, p_surah_end: payload.surah_end, p_ayah_end: payload.ayah_end, p_duration_ms: payload.duration_ms, p_aspect_ratio: payload.aspect_ratio, p_project_data: payload.project_data, p_source_filename: payload.source_filename, p_source_metadata: payload.source_metadata, p_schema_version: payload.schema_version, p_source_media_path: media.source_media_path, p_source_media_type: media.source_media_type, p_source_media_name: media.source_media_name, p_source_media_size_bytes: media.source_media_size_bytes, p_thumbnail_path: media.thumbnail_path, p_thumbnail_size_bytes: media.thumbnail_size_bytes });
  if (error) throw cloudProjectError(error, "finalize");
  const row = rows(data)[0]; if (!row) throw new Error("Cloud save did not return the updated project."); return row;
}

export async function renameCloudProject(id: string, name: string): Promise<CloudProjectRow> { const { data, error } = await requireClient().rpc("rename_cloud_project", { p_id: id, p_name: name.trim() }); if (error) throw error; const row = rows(data)[0]; if (!row) throw new Error("Cloud rename did not return the project."); return row; }
export async function deleteCloudProject(id: string): Promise<void> { const { error } = await requireClient().rpc("delete_cloud_project", { p_id: id }); if (error) throw error; }
export async function cleanupReplacedCloudMedia(id: string, sourcePath: string | null, thumbnailPath: string | null): Promise<void> { const { error } = await requireClient().rpc("cleanup_replaced_cloud_media", { p_id: id, p_source_path: sourcePath, p_thumbnail_path: thumbnailPath }); if (error) throw error; }
export async function cancelCloudProjectSave(id: string): Promise<void> { const { error } = await requireClient().rpc("cancel_cloud_project_save", { p_id: id }); if (error) throw error; }
export async function getCloudStorageSummary(): Promise<CloudStorageSummary> { const { data, error } = await requireClient().rpc("cloud_project_storage_summary"); if (error) throw error; return ((Array.isArray(data) ? data[0] : data) as CloudStorageSummary | null) ?? { project_count: 0, total_source_bytes: 0, total_duration_ms: 0 }; }

export async function uploadPrivateProjectObject(path: string, body: Blob, contentType: string, stage: Extract<CloudSaveStage, "source-upload" | "thumbnail"> = "source-upload"): Promise<void> { const { error } = await requireClient().storage.from(PROJECT_MEDIA_BUCKET).upload(path, body, { contentType, upsert: false, cacheControl: "3600" }); if (error) throw cloudProjectError(error, stage); }
export async function removePrivateProjectObjects(paths: string[]): Promise<void> { if (!paths.length) return; const { error } = await requireClient().storage.from(PROJECT_MEDIA_BUCKET).remove(paths); if (error) throw error; }
export async function getPrivateThumbnailUrl(row: CloudProjectRow): Promise<string | null> { if (!row.thumbnail_path) return null; const { data, error } = await requireClient().storage.from(PROJECT_MEDIA_BUCKET).createSignedUrl(row.thumbnail_path, 60 * 30); if (error) throw error; return data.signedUrl; }
export async function downloadCloudProjectSource(row: CloudProjectRow): Promise<File | null> { if (!row.source_media_path || !row.source_media_name) return null; const { data, error } = await requireClient().storage.from(PROJECT_MEDIA_BUCKET).download(row.source_media_path); if (error) throw error; return new File([data], row.source_media_name, { type: row.source_media_type ?? data.type ?? "application/octet-stream" }); }
export function newCloudSourcePath(userId: string, projectId: string, file: File): string { return projectMediaPath(userId, projectId, "source", mediaExtension(file)); }
export function newCloudThumbnailPath(userId: string, projectId: string): string { return projectMediaPath(userId, projectId, "thumbnail", "webp"); }

/** A representative local frame; audio uses a neutral product card without Quran text. */
export async function createProjectThumbnail(source: File | null, hasVideo: boolean): Promise<Blob> {
  const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
  const context = canvas.getContext("2d"); if (!context) throw new Error("This browser cannot generate a project thumbnail.");
  context.fillStyle = "#10201b"; context.fillRect(0, 0, canvas.width, canvas.height);
  if (source && hasVideo) {
    const video = document.createElement("video"); const sourceUrl = URL.createObjectURL(source);
    video.src = sourceUrl; video.muted = true; video.playsInline = true; video.preload = "metadata";
    try {
      await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error("The video thumbnail could not be read.")); });
      video.currentTime = Math.min(Math.max(video.duration * 0.18, 0.1), Math.max(video.duration - 0.1, 0));
      await new Promise<void>((resolve, reject) => { video.onseeked = () => resolve(); video.onerror = () => reject(new Error("The video thumbnail could not be created.")); });
      const scale = Math.max(canvas.width / Math.max(video.videoWidth, 1), canvas.height / Math.max(video.videoHeight, 1)); const width = video.videoWidth * scale, height = video.videoHeight * scale;
      context.drawImage(video, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    } finally { URL.revokeObjectURL(sourceUrl); video.remove(); }
  } else {
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height); gradient.addColorStop(0, "#244d40"); gradient.addColorStop(1, "#10201b"); context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#bfe8cf"; context.font = "600 34px system-ui, sans-serif"; context.fillText("Quran Video", 46, 272); context.fillStyle = "#8eb8a0"; context.font = "18px system-ui, sans-serif"; context.fillText("Audio project", 48, 305);
  }
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The project thumbnail could not be encoded.")), "image/webp", 0.78));
}
