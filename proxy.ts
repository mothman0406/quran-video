import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient, supabaseServerConfigured } from "@/lib/supabase/server";

/** Refreshes Supabase's cookie session without restricting public editor routes. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!supabaseServerConfigured()) return response;
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
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
