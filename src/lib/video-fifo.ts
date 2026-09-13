import type { CloudProjectRecord } from "./cloud-sync.ts";
import type { AccountEntitlements } from "./entitlements.ts";

/** Selects only the oldest completed saved video and never applies to paid plans. */
export function freeFifoReplacement(records: readonly CloudProjectRecord[], entitlements: AccountEntitlements, incomingProjectId: string): CloudProjectRecord | null {
  if (entitlements.plan !== "free" || entitlements.cloudProjectLimit === null) return null;
  const existing = records.filter((record) => record.row.id !== incomingProjectId);
  if (existing.length < entitlements.cloudProjectLimit) return null;
  return [...existing].sort((left, right) => left.row.created_at.localeCompare(right.row.created_at) || left.row.id.localeCompare(right.row.id))[0] ?? null;
}
