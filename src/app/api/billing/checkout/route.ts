import { authenticatedUser, getOrCreateCustomer, getStripeClient, paidPlanFromInput, priceIdForPlan } from "../../../../lib/billing/server.ts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid JSON." }, { status: 400 }); }
  const requestedPlan = (body as { plan?: unknown }).plan;
  const plan = paidPlanFromInput(requestedPlan);
  if (!plan) return Response.json({ error: "Choose Creator or Pro." }, { status: 400 });
  try {
    const customer = await getOrCreateCustomer(user);
    const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
    if (!origin) return Response.json({ error: "Application URL is not configured." }, { status: 503 });
    const session = await getStripeClient().checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
      success_url: `${origin}/?billing=success`,
      cancel_url: `${origin}/?billing=cancelled`,
      client_reference_id: user.id,
      metadata: { user_id: user.id, plan },
      subscription_data: { metadata: { user_id: user.id } },
    });
    return Response.json({ url: session.url });
  } catch { return Response.json({ error: "Checkout is unavailable." }, { status: 503 }); }
}
