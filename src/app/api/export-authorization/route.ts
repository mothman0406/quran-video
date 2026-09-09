import { authorizeExport } from "@/lib/entitlements";
import { authenticatedEntitlementUser, resolveAccountEntitlements } from "@/lib/entitlements/server";
import type { ExportQuality } from "@/lib/export/quality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isExportQuality(value: unknown): value is ExportQuality {
  return value === "basic" || value === "standard" || value === "ultra";
}

export async function POST(request: Request) {
  const user = await authenticatedEntitlementUser(request);
  if (!user) return Response.json({ error: "Authentication required." }, { status: 401 });
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "Invalid export request." }, { status: 400 }); }
  const quality = (body as { quality?: unknown }).quality;
  if (!isExportQuality(quality)) return Response.json({ error: "Invalid export quality." }, { status: 400 });
  try {
    const authorization = authorizeExport(await resolveAccountEntitlements(user.id), quality);
    return Response.json(authorization, { status: authorization.allowed ? 200 : 403 });
  } catch {
    return Response.json({ error: "We couldn't verify your plan. Try again." }, { status: 503 });
  }
}
