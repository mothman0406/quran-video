import { deleteAccountForUser } from "@/lib/account-deletion";
import { authenticatedEntitlementUser } from "@/lib/entitlements/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await authenticatedEntitlementUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  let body: { confirmation?: unknown };
  try { body = await request.json() as { confirmation?: unknown }; }
  catch { return Response.json({ error: "Invalid deletion request." }, { status: 400 }); }
  if (body.confirmation !== "DELETE") return Response.json({ error: "Type DELETE to confirm permanent account deletion." }, { status: 400 });
  try {
    await deleteAccountForUser(user.id);
    return Response.json({ deleted: true });
  } catch {
    // Cleanup is intentionally stopped before Auth deletion; the signed-in user
    // can retry without data ownership being lost.
    return Response.json({ error: "Account deletion could not be completed. Your account remains available so you can retry safely." }, { status: 503 });
  }
}
