import { NextRequest, NextResponse } from "next/server";
import { safeAuthReturnPath } from "@/lib/auth-flow";
import { applicationOrigin } from "@/lib/application-url";
import { authCookieNames, logAuthDebug, safeAuthDiagnosticError } from "@/lib/auth-debug";
import { createSupabaseServerClient, supabaseServerConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const returnTo = safeAuthReturnPath(request.nextUrl.searchParams.get("next"));
  const origin = applicationOrigin(process.env.NEXT_PUBLIC_APP_URL, request.url);
  const code = request.nextUrl.searchParams.get("code");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const requestCookieNames = authCookieNames(request.cookies.getAll());
  logAuthDebug("callback-entry", { host, pathname: request.nextUrl.pathname, hasCode: Boolean(code), next: returnTo, requestCookieNames });
  if (!origin) {
    const configurationResponse = NextResponse.json({ error: "The application URL is not configured safely for authentication." }, { status: 503 });
    logAuthDebug("callback-response", { location: configurationResponse.headers.get("location"), status: configurationResponse.status, responseSetCookieCount: configurationResponse.cookies.getAll().length });
    return configurationResponse;
  }
  const response = NextResponse.redirect(new URL(returnTo, origin));
  if (!code || !supabaseServerConfigured()) {
    logAuthDebug("callback-response", { location: response.headers.get("location"), status: response.status, responseSetCookieCount: response.cookies.getAll().length });
    return response;
  }

  let writtenCookieNames: string[] = [];
  const supabase = createSupabaseServerClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet, headers) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        request.cookies.set({ name, value, ...options });
        response.cookies.set({ name, value, ...options });
      });
      writtenCookieNames = authCookieNames(cookiesToSet);
      Object.entries(headers).forEach(([name, value]) => {
        response.headers.set(name, value);
      });
    },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  logAuthDebug("exchange-code-for-session", { ok: !error, error: safeAuthDiagnosticError(error), writtenCookieNames, responseSetCookieCount: response.cookies.getAll().length });
  if (error) {
    const failureResponse = NextResponse.redirect(new URL("/editor?auth=error", origin));
    logAuthDebug("callback-response", { location: failureResponse.headers.get("location"), status: failureResponse.status, responseSetCookieCount: failureResponse.cookies.getAll().length });
    return failureResponse;
  }
  logAuthDebug("callback-response", { location: response.headers.get("location"), status: response.status, responseSetCookieCount: response.cookies.getAll().length });
  return response;
}
