import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";
import { supabaseCookieOptions } from "./cookies";

type SupabaseCookie = { name: string; value: string; options: CookieOptions };

export function supabaseServerConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function createSupabaseServerClient(cookieStore: {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: SupabaseCookie[], headers: Record<string, string>) => void;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase authentication is not configured.");
  return createServerClient(url, key, {
    cookieOptions: supabaseCookieOptions(),
    cookies: {
      getAll: cookieStore.getAll,
      setAll: cookieStore.setAll,
    },
  });
}
