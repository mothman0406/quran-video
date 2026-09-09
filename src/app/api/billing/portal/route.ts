import { authenticatedEntitlementUser } from "@/lib/entitlements/server";
import { getBillingCustomer, getStripeClient, safeApplicationOrigin } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await authenticatedEntitlementUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  const origin = safeApplicationOrigin(request);
  if (!origin) return Response.json({ error: "The application URL is not configured safely for billing." }, { status: 503 });
  try {
    const customer = await getBillingCustomer(user.id);
    if (!customer) return Response.json({ error: "No billing customer exists for this account yet." }, { status: 404 });
    const portal = await getStripeClient().billingPortal.sessions.create({ customer: customer.stripe_customer_id, return_url: `${origin}/editor?billing=portal` });
    return Response.json({ url: portal.url });
  } catch {
    return Response.json({ error: "Customer Portal is temporarily unavailable. Please try again." }, { status: 503 });
  }
}
