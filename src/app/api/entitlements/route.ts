import { authenticatedEntitlementUser, resolveAccountEntitlements } from "@/lib/entitlements/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await authenticatedEntitlementUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  try {
    return Response.json(await resolveAccountEntitlements(user.id));
  } catch {
    return Response.json({ error: "We couldn't verify your plan. Try again." }, { status: 503 });
  }
}
