import Stripe from "stripe";
import { ensureCustomerRecord, getStripeClient, recordWebhookEvent, syncStripeSubscription } from "../../../../lib/billing/server.ts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !secret) return Response.json({ error: "Webhook is not configured." }, { status: 503 });
  let event: Stripe.Event;
  try { event = getStripeClient().webhooks.constructEvent(await request.text(), signature, secret); }
  catch { return Response.json({ error: "Invalid webhook signature." }, { status: 400 }); }
  try {
    if (!(await recordWebhookEvent(event))) return Response.json({ received: true, duplicate: true });
    if (event.type === "customer.subscription.created" || event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      await syncStripeSubscription(event.data.object as Stripe.Subscription);
    } else if (event.type === "checkout.session.completed") {
      const checkout = event.data.object as Stripe.Checkout.Session;
      if (checkout.customer && checkout.metadata?.user_id) await ensureCustomerRecord(checkout.metadata.user_id, typeof checkout.customer === "string" ? checkout.customer : checkout.customer.id);
    }
    return Response.json({ received: true });
  } catch { return Response.json({ error: "Webhook processing failed." }, { status: 500 }); }
}
