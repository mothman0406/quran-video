/**
 * PostgREST can transiently reject a freshly-issued, otherwise valid Supabase
 * token while its validator time is behind the issuer. Retry only that precise
 * response once; every authorization decision remains with Supabase.
 */
export const SUPABASE_JWT_CLOCK_SKEW_RETRY_DELAY_MS = 2_000;

type SupabaseJwtTimingError = { code?: unknown; message?: unknown };
type Sleep = (milliseconds: number) => Promise<void>;

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function isSupabaseJwtIssuedInFutureError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as SupabaseJwtTimingError;
  return candidate.code === "PGRST303" && candidate.message === "JWT issued at future";
}

/**
 * A bounded availability retry for safe, read-only authenticated Data API
 * requests. It never reads or trusts JWT claims and does not retry mutations.
 */
export async function retrySupabaseJwtClockSkew<T>(operation: () => PromiseLike<T>, wait: Sleep = sleep): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!isSupabaseJwtIssuedInFutureError(error)) throw error;
    await wait(SUPABASE_JWT_CLOCK_SKEW_RETRY_DELAY_MS);
    return await operation();
  }
}
