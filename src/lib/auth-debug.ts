type CookieLike = { name: string };
type AuthErrorLike = { code?: unknown; message?: unknown };

/** Temporary, server-only production OAuth tracing switch. */
export function authDebugEnabled(environment: { AUTH_DEBUG?: string } = process.env as { AUTH_DEBUG?: string }): boolean {
  return environment.AUTH_DEBUG === "true";
}

/** Cookie names are useful for tracing, while their values are always secrets. */
export function authCookieNames(cookies: readonly CookieLike[]): string[] {
  return [...new Set(cookies.map((cookie) => cookie.name))].sort();
}

/**
 * Returns only stable error classifications. Never return provider messages:
 * an upstream error can include a URL, cookie, or authorization artifact.
 */
export function safeAuthDiagnosticError(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as AuthErrorLike;
  if (typeof candidate.code === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(candidate.code)) return candidate.code;
  const message = typeof candidate.message === "string" ? candidate.message.toLowerCase() : "";
  if (/auth session missing|session missing/.test(message)) return "auth-session-missing";
  if (/refresh token/.test(message)) return "refresh-token-error";
  if (/invalid.*jwt|jwt.*invalid/.test(message)) return "invalid-jwt";
  if (/expired/.test(message)) return "session-expired";
  return "auth-request-failed";
}

/** Logs only facts that are safe to retain in production logs. */
export function logAuthDebug(stage: string, facts: Record<string, unknown>): void {
  if (!authDebugEnabled()) return;
  console.info("[auth-debug]", JSON.stringify({ stage, ...facts }));
}
