import { authenticatedEntitlementUser } from "@/lib/entitlements/server";
import { getBillingCustomer, getBillingSubscription, getStripeClient, safeApplicationOrigin, subscriptionUpdateTarget } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Opens Stripe's plan-change flow for the authenticated account's current paid subscription only. */
export async function POST(request: Request) {
  const user = await authenticatedEntitlementUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  const origin = safeApplicationOrigin(request);
  if (!origin) return Response.json({ error: "The application URL is not configured safely for billing." }, { status: 503 });
  try {
    const [customer, subscription] = await Promise.all([getBillingCustomer(user.id), getBillingSubscription(user.id)]);
    const subscriptionId = subscriptionUpdateTarget(subscription, customer);
    if (!customer || !subscriptionId) return Response.json({ error: "No active paid subscription is available to update." }, { status: 409 });
    const portal = await getStripeClient().billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: `${origin}/editor?billing=plan-update`,
      flow_data: { type: "subscription_update", subscription_update: { subscription: subscriptionId } },
    });
    if (!portal.url) throw new Error("Stripe did not return a Customer Portal URL.");
    return Response.json({ url: portal.url });
  } catch {
    return Response.json({ error: "We couldn't open plan management. Try again." }, { status: 503 });
  }
}
