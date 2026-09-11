export type BillingConfigurationState = "loading" | "configured" | "unconfigured" | "error";

/** Keeps unresolved billing status distinct from a verified configuration result. */
export function billingConfigurationState(billing: { configured: boolean } | null, initialConfigured?: boolean, loadFailed = false): BillingConfigurationState {
  if (loadFailed) return "error";
  if (billing) return billing.configured ? "configured" : "unconfigured";
  if (initialConfigured === undefined) return "loading";
  return initialConfigured ? "configured" : "unconfigured";
}
