import { createClient } from "@supabase/supabase-js";
import { recordUsageEvent, USAGE_EVENT_TYPES, type UsageEventType } from "@/lib/usage/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return Response.json({ error: "Authentication required." }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ error: "Authentication is not configured." }, { status: 503 });
  const authClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "Authentication required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const value = body as { event_type?: unknown; operation_id?: unknown };
  if (!USAGE_EVENT_TYPES.includes(value.event_type as UsageEventType) || typeof value.operation_id !== "string" || value.operation_id.length < 1 || value.operation_id.length > 200) return Response.json({ error: "Invalid usage event." }, { status: 400 });
  try {
    const recorded = await recordUsageEvent(data.user.id, value.event_type as UsageEventType, {}, value.operation_id);
    return Response.json({ recorded });
  } catch { return Response.json({ error: "Usage accounting is unavailable." }, { status: 503 }); }
}
