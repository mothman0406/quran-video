import { NextRequest, NextResponse } from "next/server";
import { safeAuthReturnPath } from "@/lib/auth-flow";
import { applicationOrigin } from "@/lib/application-url";
import { createSupabaseServerClient, supabaseServerConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const returnTo = safeAuthReturnPath(request.nextUrl.searchParams.get("next"));
  const origin = applicationOrigin(process.env.NEXT_PUBLIC_APP_URL, request.url);
  if (!origin) return NextResponse.json({ error: "The application URL is not configured safely for authentication." }, { status: 503 });
  const response = NextResponse.redirect(new URL(returnTo, origin));
  const code = request.nextUrl.searchParams.get("code");
  if (!code || !supabaseServerConfigured()) return response;

  const supabase = createSupabaseServerClient({
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet, headers) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        request.cookies.set({ name, value, ...options });
        response.cookies.set({ name, value, ...options });
      });
      Object.entries(headers).forEach(([name, value]) => {
        response.headers.set(name, value);
      });
    },
  });
  await supabase.auth.exchangeCodeForSession(code);
  return response;
}
