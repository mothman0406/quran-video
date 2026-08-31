import { authenticatedUser, customerIdForPortal, getStripeClient, getSubscription } from "../../../../lib/billing/server.ts";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  try {
    const subscription = await getSubscription(user.id);
    if (!subscription) return Response.json({ error: "No billing customer exists for this account." }, { status: 404 });
    const origin = request.headers.get("origin") ?? process.env.NEXT_PUBLIC_APP_URL;
    if (!origin) return Response.json({ error: "Application URL is not configured." }, { status: 503 });
    const portal = await getStripeClient().billingPortal.sessions.create({ customer: customerIdForPortal(subscription), return_url: `${origin}/?billing=portal` });
    return Response.json({ url: portal.url });
  } catch { return Response.json({ error: "Customer portal is unavailable." }, { status: 503 }); }
}
