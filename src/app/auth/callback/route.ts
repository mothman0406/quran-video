import { NextRequest, NextResponse } from "next/server";
import { safeAuthReturnPath } from "@/lib/auth-flow";
import { createSupabaseServerClient, supabaseServerConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const returnTo = safeAuthReturnPath(request.nextUrl.searchParams.get("next"));
  const response = NextResponse.redirect(new URL(returnTo, request.url));
  const code = request.nextUrl.searchParams.get("code");
  if (!code || !supabaseServerConfigured()) return response;

  const supabase = createSupabaseServerClient({
    getAll: () => request.cookies.getAll(),
    set: (name, value, options) => {
      request.cookies.set({ name, value, ...options });
      response.cookies.set({ name, value, ...options });
    },
  });
  await supabase.auth.exchangeCodeForSession(code);
  return response;
}
