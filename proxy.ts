import { NextResponse, type NextRequest } from "next/server";
import { authCookieNames, logAuthDebug, safeAuthDiagnosticError } from "@/lib/auth-debug";
import { createSupabaseServerClient, supabaseServerConfigured } from "@/lib/supabase/server";

/** Refreshes Supabase's cookie session without restricting public editor routes. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const isEditor = request.nextUrl.pathname === "/editor";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? request.nextUrl.host;
  const requestCookieNames = isEditor ? authCookieNames(request.cookies.getAll()) : [];
  if (!supabaseServerConfigured()) {
    if (isEditor) logAuthDebug("editor-auth-read", { host, requestCookieNames, getUserOk: false, getUserError: "supabase-not-configured" });
    return response;
  }
  const supabase = createSupabaseServerClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet, headers) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        request.cookies.set({ name, value, ...options });
      });
      response = NextResponse.next({ request });
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set({ name, value, ...options });
      });
      Object.entries(headers).forEach(([name, value]) => {
        response.headers.set(name, value);
      });
    },
  });
  const { data, error } = await supabase.auth.getUser();
  if (isEditor) logAuthDebug("editor-auth-read", { host, requestCookieNames, getUserOk: Boolean(data.user) && !error, getUserError: safeAuthDiagnosticError(error) ?? (data.user ? null : "no-authenticated-user") });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
