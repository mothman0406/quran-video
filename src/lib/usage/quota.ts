export type Plan = "Free" | "Creator" | "Pro";
export type UsageAction = "export" | "cloud_project_save";
export type Usage = Record<UsageAction, number>;

export type PlanLimits = {
  monthlyExports: number | null;
  monthlyCloudProjectSaves: number | null;
};

// Provisional: null means unlimited while pricing and quota values are undecided.
// Enforcement can be enabled centrally once product limits are approved.
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  Free: { monthlyExports: null, monthlyCloudProjectSaves: null },
  Creator: { monthlyExports: null, monthlyCloudProjectSaves: null },
  Pro: { monthlyExports: null, monthlyCloudProjectSaves: null },
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
  const limits = getPlanLimits(plan);
  const limit = action === "export" ? limits.monthlyExports : limits.monthlyCloudProjectSaves;
  const currentUsage = usage[action] ?? 0;
  if (limit === null) return { allowed: true, currentUsage, limit, resetAt: null, reason: "unlimited" };
  const allowed = currentUsage < limit;
  return { allowed, currentUsage, limit, resetAt: resetAt?.toISOString() ?? null, reason: allowed ? "within_limit" : "quota_exceeded" };
}
