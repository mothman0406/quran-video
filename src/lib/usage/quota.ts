import { getCloudProjectLimit, getPlanEntitlements, type Plan } from "../entitlements.ts";
export type { Plan } from "../entitlements.ts";
export type UsageAction = "export" | "cloud_project_save";
export type Usage = Record<UsageAction, number>;

export type PlanLimits = {
  cloudProjects: number;
  exportCount: null;
};

export const PLAN_LIMITS: Readonly<Record<Plan, PlanLimits>> = {
  Free: { cloudProjects: getCloudProjectLimit("Free"), exportCount: null },
  Creator: { cloudProjects: getCloudProjectLimit("Creator"), exportCount: null },
  Pro: { cloudProjects: getCloudProjectLimit("Pro"), exportCount: null },
};

export function getPlanLimits(plan: Plan): PlanLimits {
  return PLAN_LIMITS[plan];
}

export type QuotaResult = {
  allowed: boolean;
  currentUsage: number;
  limit: number | null;
  resetAt: string | null;
  reason: "within_limit" | "unlimited" | "quota_exceeded";
};

export function canPerform(action: UsageAction, plan: Plan, usage: Usage, resetAt: Date | null = null): QuotaResult {
  const limit = action === "export" ? getPlanEntitlements(plan).exportCountQuota : getCloudProjectLimit(plan);
  const currentUsage = usage[action] ?? 0;
  if (limit === null) return { allowed: true, currentUsage, limit, resetAt: null, reason: "unlimited" };
  const allowed = currentUsage < limit;
  return { allowed, currentUsage, limit, resetAt: resetAt?.toISOString() ?? null, reason: allowed ? "within_limit" : "quota_exceeded" };
}
