import { createServerClient } from "@supabase/ssr";
import type { CookieOptions } from "@supabase/ssr";

export function supabaseServerConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function createSupabaseServerClient(cookieStore: {
  getAll: () => { name: string; value: string }[];
  set: (name: string, value: string, options: CookieOptions) => void;
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase authentication is not configured.");
  return createServerClient(url, key, { cookies: { getAll: cookieStore.getAll, setAll: (cookies) => cookies.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } });
}
