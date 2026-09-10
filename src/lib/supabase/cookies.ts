import type { CookieOptions } from "@supabase/ssr";

/**
 * Keep browser PKCE and server session cookies on the same host-only scope.
 * The browser client must be able to read these cookies, so they cannot be
 * HttpOnly. Supabase supplies the 400-day session lifetime when it writes the
 * session; this policy deliberately does not set a Domain.
 */
export function supabaseCookieOptions(isProduction = process.env.NODE_ENV === "production"): CookieOptions {
  return {
    path: "/",
    sameSite: "lax",
    secure: isProduction,
    httpOnly: false,
  };
}
