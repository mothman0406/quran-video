import Stripe from "stripe";
import { claimWebhookEvent, ensureCheckoutCustomerMapping, failWebhookEvent, finishWebhookEvent, getStripeClient, syncStripeSubscription } from "@/lib/billing/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  let event: Stripe.Event;
  try { event = getStripeClient().webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return Response.json({ error: "Invalid webhook signature." }, { status: 400 }); }
  try {
    if (!(await claimWebhookEvent(event))) return Response.json({ received: true, duplicate: true });
    if (event.type === "checkout.session.completed") await ensureCheckoutCustomerMapping(event.data.object as Stripe.Checkout.Session);
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") await syncStripeSubscription(event.data.object as Stripe.Subscription);
    await finishWebhookEvent(event.id);
    return Response.json({ received: true });
  } catch {
    try { await failWebhookEvent(event.id); } catch { /* Stripe will retry the original failure. */ }
    return Response.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
