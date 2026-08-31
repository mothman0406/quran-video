import { authenticatedUser, getCurrentUserPlan, getSubscription } from "../../../../lib/billing/server.ts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await authenticatedUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  try {
    const subscription = await getSubscription(user.id);
    return Response.json({ plan: await getCurrentUserPlan(user.id), status: subscription?.status ?? "none", cancelAtPeriodEnd: subscription?.cancel_at_period_end ?? false, currentPeriodEnd: subscription?.current_period_end ?? null });
  } catch { return Response.json({ error: "Billing status is unavailable." }, { status: 503 }); }
}
