import { NextRequest, NextResponse } from "next/server";
import type { CookieOptions } from "@supabase/ssr";
import { applicationOrigin } from "@/lib/application-url";
import { authCookieNames, authDebugEnabled, logAuthDebug, safeAuthDiagnosticError } from "@/lib/auth-debug";
import { createSupabaseServerClient, supabaseServerConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function disabled(): NextResponse {
  return new NextResponse(null, { status: 404, headers: { "cache-control": "no-store" } });
}

export async function GET(request: NextRequest) {
  if (!authDebugEnabled()) return disabled();

  const requestCookieNames = authCookieNames(request.cookies.getAll());
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const appUrl = applicationOrigin(process.env.NEXT_PUBLIC_APP_URL, request.url);
  let getUserOk = false;
  let getUserError: string | null = null;
  const pendingCookies: Array<{ name: string; value: string; options: CookieOptions }> = [];
  const pendingHeaders: Record<string, string> = {};

  if (!supabaseServerConfigured()) {
    getUserError = "supabase-not-configured";
  } else {
    const supabase = createSupabaseServerClient({
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set({ name, value, ...options });
          pendingCookies.push({ name, value, options });
        });
        Object.assign(pendingHeaders, headers);
      },
    });
    try {
      const { data, error } = await supabase.auth.getUser();
      getUserOk = Boolean(data.user) && !error;
      getUserError = safeAuthDiagnosticError(error) ?? (data.user ? null : "no-authenticated-user");
    } catch (error) {
      getUserError = safeAuthDiagnosticError(error);
    }
  }

  const response = NextResponse.json({
    host,
    appUrl,
    authCookieNamesPresent: requestCookieNames,
    getUserOk,
    getUserError,
  }, { headers: { "cache-control": "no-store" } });
  pendingCookies.forEach(({ name, value, options }) => response.cookies.set({ name, value, ...options }));
  Object.entries(pendingHeaders).forEach(([name, value]) => response.headers.set(name, value));
  logAuthDebug("auth-state", { host, appUrl, requestCookieNames, getUserOk, getUserError, responseSetCookieCount: response.cookies.getAll().length });
  return response;
}
