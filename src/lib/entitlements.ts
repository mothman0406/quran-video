import type { ExportQuality } from "./export/quality.ts";

/** The single canonical commercial plan vocabulary used by the application. */
export const PLANS = ["free", "pro", "premium"] as const;
export type Plan = (typeof PLANS)[number];
export type EntitlementSource = "manual" | "stripe" | "migration";

export type AccountEntitlements = {
  plan: Plan;
  maxExportQuality: ExportQuality;
  watermarkRequiredForBasic: boolean;
  canExportStandard: boolean;
  canExportUltra: boolean;
  /** `null` deliberately means that paid project/storage policy is still TBD. */
  cloudProjectLimit: number | null;
};

const ACCOUNT_ENTITLEMENTS: Readonly<Record<Plan, AccountEntitlements>> = {
  free: { plan: "free", maxExportQuality: "basic", watermarkRequiredForBasic: true, canExportStandard: false, canExportUltra: false, cloudProjectLimit: 3 },
  pro: { plan: "pro", maxExportQuality: "standard", watermarkRequiredForBasic: false, canExportStandard: true, canExportUltra: false, cloudProjectLimit: null },
  premium: { plan: "premium", maxExportQuality: "ultra", watermarkRequiredForBasic: false, canExportStandard: true, canExportUltra: true, cloudProjectLimit: null },
};

export function normalizePlan(value: unknown): Plan {
  return typeof value === "string" && (PLANS as readonly string[]).includes(value) ? value as Plan : "free";
}

export function accountEntitlementsForPlan(plan: unknown): AccountEntitlements {
  return ACCOUNT_ENTITLEMENTS[normalizePlan(plan)];
}

export function defaultExportQualityForPlan(plan: unknown): ExportQuality {
  // Premium deliberately starts at Standard: 4K remains an intentional choice.
  return normalizePlan(plan) === "free" ? "basic" : "standard";
}

export function canExportQuality(entitlements: AccountEntitlements, quality: ExportQuality): boolean {
  return quality === "basic" || (quality === "standard" && entitlements.canExportStandard) || (quality === "ultra" && entitlements.canExportUltra);
}

export function watermarkRequiredForExport(entitlements: AccountEntitlements, quality: ExportQuality): boolean {
  return quality === "basic" && entitlements.watermarkRequiredForBasic;
}

export type ExportAuthorization =
  | { allowed: true; entitlements: AccountEntitlements; quality: ExportQuality; watermarkRequired: boolean }
  | { allowed: false; entitlements: AccountEntitlements; quality: ExportQuality; code: "requires-pro" | "requires-premium"; message: string };

/** Applies export policy from a normalized, server-resolved snapshot only. */
export function authorizeExport(entitlements: AccountEntitlements, quality: ExportQuality): ExportAuthorization {
  if (canExportQuality(entitlements, quality)) return { allowed: true, entitlements, quality, watermarkRequired: watermarkRequiredForExport(entitlements, quality) };
  if (quality === "ultra") return { allowed: false, entitlements, quality, code: "requires-premium", message: "4K export requires Premium." };
  return { allowed: false, entitlements, quality, code: "requires-pro", message: "Standard export requires Pro." };
}

/** Style/font editing is not a paid entitlement in the current product policy. */
export function getCustomStyleLimit(_plan: Plan): number | null { return null; }
export function isFontAvailable(_plan: Plan, _fontStyle: string): boolean { return true; }
export function isBuiltInStyleAvailable(_plan: Plan, _styleName: string): boolean { return true; }
