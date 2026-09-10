type Environment = NodeJS.ProcessEnv;

export type RuntimeConfigurationIssue = {
  feature: "Supabase authentication and cloud projects" | "Stripe billing" | "TikTok posting" | "Quran Foundation content";
  missing: string[];
};

function missing(env: Environment, names: readonly string[]) {
  return names.filter((name) => !env[name]);
}

/**
 * Reports variable *names* only. It is safe for startup/build diagnostics and
 * keeps optional integrations from making the local editor unavailable.
 */
export function runtimeConfigurationIssues(env: Environment = process.env): RuntimeConfigurationIssue[] {
  const issues: RuntimeConfigurationIssue[] = [];
  const supabase = missing(env, ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  if (supabase.length) issues.push({ feature: "Supabase authentication and cloud projects", missing: supabase });

  const stripe = missing(env, [
    "NEXT_PUBLIC_APP_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "STRIPE_BILLING_ENV",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRO_MONTHLY_PRICE_ID",
    "STRIPE_PRO_ANNUAL_PRICE_ID",
    "STRIPE_PREMIUM_MONTHLY_PRICE_ID",
    "STRIPE_PREMIUM_ANNUAL_PRICE_ID",
  ]);
  if (stripe.length) issues.push({ feature: "Stripe billing", missing: stripe });

  const tiktok = missing(env, ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET", "TIKTOK_REDIRECT_URI"]);
  if (tiktok.length) issues.push({ feature: "TikTok posting", missing: tiktok });

  const quranFoundation = missing(env, ["QF_CLIENT_ID", "QF_CLIENT_SECRET"]);
  if (quranFoundation.length) issues.push({ feature: "Quran Foundation content", missing: quranFoundation });
  return issues;
}

export function formatRuntimeConfigurationIssues(issues = runtimeConfigurationIssues()) {
  return issues.map((issue) => `${issue.feature}: ${issue.missing.join(", ")}`);
}
