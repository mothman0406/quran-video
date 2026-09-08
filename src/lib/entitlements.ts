import type { ProjectFormat } from "./schemas/project.ts";

export type Plan = "Free" | "Creator" | "Pro";
export type ExportResolution = "720p" | "1080p" | "4k";
export type FontTier = "basic" | "all";
export type Feature = "all_fonts" | "all_translations" | "all_transitions" | "advanced_word_alignment" | "4k_export" | "multiple_qiraat" | "premium_creator_capabilities" | "watermark";

export type PlanEntitlements = {
  plan: Plan;
  maxExportResolution: ExportResolution;
  watermarkRequired: boolean;
  availableFontTier: FontTier;
  availableTranslationTier: "saheeh-international" | "all";
  availableTransitionTier: "basic" | "all";
  /** null deliberately means the paid-project policy has not been decided yet. */
  cloudProjectLimit: number | null;
  customStyleLimit: number | null;
  supportsAdvancedWordAlignment: boolean;
  supports4KExport: boolean;
  supportsMultipleQiraat: boolean;
  supportsPremiumCreatorCapabilities: boolean;
  exportCountQuota: null;
};

export const PLAN_ENTITLEMENTS: Readonly<Record<Plan, PlanEntitlements>> = {
  Free: { plan: "Free", maxExportResolution: "720p", watermarkRequired: true, availableFontTier: "basic", availableTranslationTier: "saheeh-international", availableTransitionTier: "basic", cloudProjectLimit: 3, customStyleLimit: 2, supportsAdvancedWordAlignment: false, supports4KExport: false, supportsMultipleQiraat: false, supportsPremiumCreatorCapabilities: false, exportCountQuota: null },
  Creator: { plan: "Creator", maxExportResolution: "1080p", watermarkRequired: false, availableFontTier: "all", availableTranslationTier: "all", availableTransitionTier: "all", cloudProjectLimit: null, customStyleLimit: null, supportsAdvancedWordAlignment: true, supports4KExport: false, supportsMultipleQiraat: false, supportsPremiumCreatorCapabilities: false, exportCountQuota: null },
  Pro: { plan: "Pro", maxExportResolution: "4k", watermarkRequired: false, availableFontTier: "all", availableTranslationTier: "all", availableTransitionTier: "all", cloudProjectLimit: null, customStyleLimit: null, supportsAdvancedWordAlignment: true, supports4KExport: true, supportsMultipleQiraat: true, supportsPremiumCreatorCapabilities: true, exportCountQuota: null },
};

export function getPlanEntitlements(plan: Plan): PlanEntitlements { return PLAN_ENTITLEMENTS[plan]; }
export function getCloudProjectLimit(plan: Plan): number | null { return getPlanEntitlements(plan).cloudProjectLimit; }
export function getCustomStyleLimit(plan: Plan): number | null { return getPlanEntitlements(plan).customStyleLimit; }
export function getMaxExportResolution(plan: Plan): ExportResolution { return getPlanEntitlements(plan).maxExportResolution; }
export function isFontAvailable(plan: Plan, fontStyle: string): boolean { return hasFeature(plan, "all_fonts") || fontStyle === "uthmani"; }
export function isBuiltInStyleAvailable(plan: Plan, styleName: string): boolean { return hasFeature(plan, "all_transitions") || styleName === "Minimal" || styleName === "Classic Mushaf"; }
export function hasFeature(plan: Plan, feature: Feature): boolean {
  const entitlements = getPlanEntitlements(plan);
  switch (feature) {
    case "all_fonts": return entitlements.availableFontTier === "all";
    case "all_translations": return entitlements.availableTranslationTier === "all";
    case "all_transitions": return entitlements.availableTransitionTier === "all";
    case "advanced_word_alignment": return entitlements.supportsAdvancedWordAlignment;
    case "4k_export": return entitlements.supports4KExport;
    case "multiple_qiraat": return entitlements.supportsMultipleQiraat;
    case "premium_creator_capabilities": return entitlements.supportsPremiumCreatorCapabilities;
    case "watermark": return entitlements.watermarkRequired;
  }
}

const RESOLUTION_LONG_EDGE: Record<ExportResolution, number> = { "720p": 1_280, "1080p": 1_920, "4k": 3_840 };
export function exportFormatForPlan(plan: Plan, format: ProjectFormat): ProjectFormat {
  const limit = format.preset === "square" ? RESOLUTION_LONG_EDGE[getMaxExportResolution(plan)] * 0.5625 : RESOLUTION_LONG_EDGE[getMaxExportResolution(plan)];
  const scale = Math.min(1, limit / Math.max(format.width, format.height));
  return { ...format, width: Math.round(format.width * scale), height: Math.round(format.height * scale) };
}
export function resolvePlan(input: { authenticated: boolean; subscriptionPlan?: Plan | null }): Plan {
  if (!input.authenticated) return "Free";
  return input.subscriptionPlan ?? "Free";
}
/** Paid plans can only be simulated during local development; production always resolves server state. */
export function resolveClientPlan(authenticated: boolean, subscriptionPlan?: Plan | null): Plan {
  const resolved = resolvePlan({ authenticated, subscriptionPlan });
  if (process.env.NODE_ENV !== "production") {
    const override = process.env.NEXT_PUBLIC_DEV_PLAN_OVERRIDE;
    if (override === "Free" || override === "Creator" || override === "Pro") return override;
  }
  return resolved;
}
