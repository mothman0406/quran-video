export type UsagePeriod = { start: Date; end: Date; resetAt: Date };

/** Calendar-month boundaries in UTC; event queries naturally reset without a cron job. */
export function currentUsagePeriod(now = new Date()): UsagePeriod {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end, resetAt: end };
}
