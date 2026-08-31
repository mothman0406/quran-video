import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { currentUsagePeriod, type UsagePeriod } from "./period";
import { canPerform, type Plan, type QuotaResult, type Usage, type UsageAction } from "./quota";

export const USAGE_EVENT_TYPES = ["export_completed", "cloud_project_saved"] as const;
export type UsageEventType = (typeof USAGE_EVENT_TYPES)[number];
export type UsageMetadata = Record<string, string | number | boolean | null>;

type UsageClient = SupabaseClient;
let adminClient: UsageClient | null | undefined;

function getAdminClient(): UsageClient {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Server usage accounting is not configured.");
  adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return adminClient;
}

function eventTypeForAction(action: UsageAction): UsageEventType {
  return action === "export" ? "export_completed" : "cloud_project_saved";
}

export async function recordUsageEvent(userId: string, eventType: UsageEventType, metadata: UsageMetadata = {}, operationId?: string): Promise<boolean> {
  const { error } = await getAdminClient().from("usage_events").insert({ user_id: userId, event_type: eventType, operation_id: operationId ?? null, metadata });
  if (!error) return true;
  if (error.code === "23505" && operationId) return false;
  throw error;
}

export async function getUsageCount(userId: string, eventType: UsageEventType, period: UsagePeriod = currentUsagePeriod()): Promise<number> {
  const { count, error } = await getAdminClient().from("usage_events").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("event_type", eventType).gte("created_at", period.start.toISOString()).lt("created_at", period.end.toISOString());
  if (error) throw error;
  return count ?? 0;
}

export async function getUsageForCurrentMonth(userId: string): Promise<Usage> {
  const period = currentUsagePeriod();
  const [exports, cloudSaves] = await Promise.all([getUsageCount(userId, "export_completed", period), getUsageCount(userId, "cloud_project_saved", period)]);
  return { export: exports, cloud_project_save: cloudSaves };
}

export async function canPerformAction(userId: string, action: UsageAction, plan: Plan): Promise<QuotaResult> {
  const period = currentUsagePeriod();
  return canPerform(action, plan, await getUsageForCurrentMonth(userId), period.resetAt);
}

export { eventTypeForAction };
