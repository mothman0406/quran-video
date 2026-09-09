import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { accountEntitlementsForPlan, type AccountEntitlements } from "../entitlements.ts";

export type AccountEntitlementReader = (userId: string) => Promise<unknown>;

let adminClient: SupabaseClient | null | undefined;

function entitlementAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("Account entitlement storage is not configured.");
  adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return adminClient;
}

/** Resolves one account's effective plan. Missing and unknown rows safely become Free. */
async function readAccountPlan(userId: string): Promise<unknown> {
  const { data, error } = await entitlementAdminClient().from("account_entitlements").select("plan").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Account entitlement lookup failed.");
  return data?.plan;
}

export async function resolveAccountEntitlements(userId: string, reader: AccountEntitlementReader = readAccountPlan): Promise<AccountEntitlements> {
  return accountEntitlementsForPlan(await reader(userId));
}

/** Validates the authenticated Supabase identity from a bearer token before entitlement lookup. */
export async function authenticatedEntitlementUser(request: Request): Promise<User | null> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!token || !url || !anonKey) return null;
  const authClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data } = await authClient.auth.getUser(token);
  return data.user ?? null;
}
