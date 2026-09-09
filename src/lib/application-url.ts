/**
 * Returns a canonical Quran Video origin. A configured public origin always
 * wins; the request/browser origin is only a localhost development fallback.
 */
export function applicationOrigin(
  configured = process.env.NEXT_PUBLIC_APP_URL,
  fallbackOrigin?: string,
  environment = process.env.NODE_ENV,
): string | null {
  if (configured) {
    try {
      const url = new URL(configured);
      const isLocalHttp = url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
      if ((url.protocol === "https:" || (environment !== "production" && isLocalHttp)) && url.pathname === "/" && !url.search && !url.hash) return url.origin;
    } catch {
      // Invalid configuration must not be replaced with an untrusted origin.
    }
    return null;
  }

  if (environment === "production" || !fallbackOrigin) return null;
  try {
    const url = new URL(fallbackOrigin);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1") ? url.origin : null;
  } catch {
    return null;
  }
}

export function authCallbackUrl(next = "/editor", fallbackOrigin?: string): string {
  const origin = applicationOrigin(process.env.NEXT_PUBLIC_APP_URL, fallbackOrigin);
  if (!origin) throw new Error("NEXT_PUBLIC_APP_URL must be a canonical HTTPS origin before authentication can start.");
  return new URL(`/auth/callback?next=${encodeURIComponent(next)}`, origin).toString();
}
