import type { Session } from "@supabase/supabase-js";
import type { AccountEntitlements, ExportAuthorization } from "../entitlements.ts";
import type { ExportQuality } from "../export/quality.ts";

async function request(path: string, session: Session, init?: RequestInit): Promise<Response> {
  return fetch(path, { ...init, headers: { ...init?.headers, authorization: `Bearer ${session.access_token}` } });
}

export async function getAccountEntitlements(session: Session): Promise<AccountEntitlements> {
  const response = await request("/api/entitlements", session);
  const payload = await response.json() as AccountEntitlements & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "We couldn't verify your plan. Try again.");
  return payload;
}

/** Every supported new local render asks the server to authorize its exact quality. */
export async function authorizeAccountExport(session: Session, quality: ExportQuality): Promise<ExportAuthorization> {
  const response = await request("/api/export-authorization", session, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ quality }) });
  const payload = await response.json() as ExportAuthorization & { error?: string };
  if (response.status === 403) return payload as Extract<ExportAuthorization, { allowed: false }>;
  if (!response.ok) throw new Error(payload.error ?? "We couldn't verify your plan. Try again.");
  return payload;
}
