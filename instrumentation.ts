import { formatRuntimeConfigurationIssues } from "./src/lib/runtime-config";

/** Logs missing configuration names (never values) when a server instance starts. */
export function register() {
  const issues = formatRuntimeConfigurationIssues();
  if (issues.length) console.warn(`[quran-video] Production features are not configured: ${issues.join("; ")}`);
}
