import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { loadSavedProject, serializeSavedProject } from "./project-storage.ts";
import type { SavedProject } from "./schemas/project.ts";

export const CLOUD_SCHEMA_VERSION = 1;

export type CloudProjectRow = {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  source_filename: string | null;
  source_metadata: SavedProject["sourceMedia"];
  project_data: unknown;
  schema_version: number;
};

export type CloudProjectPayload = Omit<CloudProjectRow, "user_id" | "created_at" | "updated_at"> & {
  created_at: string;
  updated_at: string;
};

let client: SupabaseClient | null | undefined;

export function getSupabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  client = url && anonKey ? createClient(url, anonKey) : null;
  return client;
}

export function cloudSyncConfigured(): boolean {
  return getSupabaseClient() !== null;
}

export function toCloudProjectPayload(project: SavedProject): CloudProjectPayload {
  const valid = loadSavedProject(serializeSavedProject(project));
  return {
    id: valid.id,
    name: valid.title,
    created_at: valid.createdAt,
    updated_at: valid.updatedAt,
    source_filename: valid.sourceMedia?.fileName ?? null,
    source_metadata: valid.sourceMedia,
    project_data: valid,
    schema_version: CLOUD_SCHEMA_VERSION,
  };
}

export function fromCloudProjectRow(row: CloudProjectRow): SavedProject {
  if (row.schema_version !== CLOUD_SCHEMA_VERSION) throw new Error(`Unsupported cloud project schema version: ${row.schema_version}`);
  const project = loadSavedProject(row.project_data);
  if (project.id !== row.id) throw new Error("Cloud project identity does not match its metadata.");
  return { ...project, title: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
}

export function hasProjectConflict(local: SavedProject | null, cloud: SavedProject | null): boolean {
  return Boolean(local && cloud && local.id === cloud.id && local.updatedAt !== cloud.updatedAt);
}

function requireClient(): SupabaseClient {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Cloud sync is not configured. Add the Supabase environment variables to enable it.");
  return supabase;
}

export async function getAuthSession(): Promise<Session | null> {
  const { data, error } = await requireClient().auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function signUp(email: string, password: string): Promise<Session | null> {
  const { data, error } = await requireClient().auth.signUp({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signIn(email: string, password: string): Promise<Session | null> {
  const { data, error } = await requireClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut(): Promise<void> {
  const { error } = await requireClient().auth.signOut();
  if (error) throw error;
}

export async function listCloudProjects(): Promise<SavedProject[]> {
  const { data, error } = await requireClient().from("projects").select("*").order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as CloudProjectRow[]).map(fromCloudProjectRow);
}

export async function getCloudProject(id: string): Promise<SavedProject | null> {
  const { data, error } = await requireClient().from("projects").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? fromCloudProjectRow(data as CloudProjectRow) : null;
}

export async function saveCloudProject(project: SavedProject): Promise<SavedProject> {
  const payload = toCloudProjectPayload(project);
  const { data, error } = await requireClient().from("projects").upsert(payload, { onConflict: "id" }).select("*").single();
  if (error) throw error;
  return fromCloudProjectRow(data as CloudProjectRow);
}

export async function deleteCloudProject(id: string): Promise<void> {
  const { error } = await requireClient().from("projects").delete().eq("id", id);
  if (error) throw error;
}
