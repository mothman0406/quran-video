import { stripeCheckoutConfigured } from "@/lib/billing/server";
import { supabaseServerConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export function GET() {
  return Response.json({ appReady: true, supabaseConfigured: supabaseServerConfigured(), stripeConfigured: stripeCheckoutConfigured() }, { headers: { "cache-control": "no-store" } });
}
