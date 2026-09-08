import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient, supabaseServerConfigured } from "@/lib/supabase/server";

/** Refreshes Supabase's cookie session without restricting public editor routes. */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  if (!supabaseServerConfigured()) return response;
  const supabase = createSupabaseServerClient({
    getAll: () => request.cookies.getAll(),
    set: (name, value, options) => {
      request.cookies.set({ name, value, ...options });
      response.cookies.set({ name, value, ...options });
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
