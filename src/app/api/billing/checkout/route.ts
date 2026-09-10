import { authenticatedEntitlementUser } from "@/lib/entitlements/server";
import { assertStripePricesMatchEnvironment, getBillingSubscription, getOrCreateCustomer, getStripeClient, hasPaidSubscription, isBillingInterval, isPaidPlan, priceIdForPlan, safeApplicationOrigin, stripeCheckoutConfigured } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await authenticatedEntitlementUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  let body: { plan?: unknown; interval?: unknown };
  try { body = await request.json() as { plan?: unknown; interval?: unknown }; } catch { return Response.json({ error: "Invalid checkout request." }, { status: 400 }); }
  if (!isPaidPlan(body.plan) || !isBillingInterval(body.interval)) return Response.json({ error: "Choose Pro or Premium and a billing interval." }, { status: 400 });
  if (!stripeCheckoutConfigured()) return Response.json({ error: "Stripe billing is not configured for this environment yet." }, { status: 503 });
  const origin = safeApplicationOrigin(request);
  if (!origin) return Response.json({ error: "The application URL is not configured safely for billing." }, { status: 503 });
  try {
    if (hasPaidSubscription(await getBillingSubscription(user.id))) return Response.json({ error: "You already have a paid subscription. Use Manage plan instead." }, { status: 409 });
    const price = priceIdForPlan(body.plan, body.interval);
    if (!price) return Response.json({ error: "That billing option is not configured." }, { status: 503 });
    const stripe = getStripeClient();
    await assertStripePricesMatchEnvironment(stripe);
    const customer = await getOrCreateCustomer(user, { stripe });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", customer, line_items: [{ price, quantity: 1 }], client_reference_id: user.id,
      success_url: `${origin}/editor?billing=success`, cancel_url: `${origin}/editor?billing=cancelled`,
      metadata: { user_id: user.id, plan: body.plan, billing_interval: body.interval }, subscription_data: { metadata: { user_id: user.id } },
    });
    if (!session.url) throw new Error("Stripe did not return a Checkout URL.");
    return Response.json({ url: session.url });
  } catch {
    return Response.json({ error: "Checkout is temporarily unavailable. Your plan has not changed." }, { status: 503 });
  }
}
