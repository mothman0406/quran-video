import { getAuthSession } from "../cloud-sync";
import type { UsageEventType, UsageMetadata } from "./server";

/** Records only an authenticated event; anonymous/local sessions are a no-op. */
export async function recordAuthenticatedUsage(eventType: UsageEventType, operationId: string): Promise<boolean> {
  const session = await getAuthSession();
  if (!session) return false;
  const response = await fetch("/api/usage", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${session.access_token}` }, body: JSON.stringify({ event_type: eventType, operation_id: operationId }) });
  if (!response.ok) throw new Error("Usage accounting could not be recorded.");
  return true;
}

export type { UsageEventType, UsageMetadata };
