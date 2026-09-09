import { authenticatedEntitlementUser } from "@/lib/entitlements/server";
import { billingSummary, getBillingSubscription } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await authenticatedEntitlementUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  try { return Response.json(billingSummary(await getBillingSubscription(user.id))); }
  catch { return Response.json({ error: "Billing information is temporarily unavailable." }, { status: 503 }); }
}
