import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { PROJECT_MEDIA_BUCKET } from "./cloud-projects.ts";
import { getStripeClient } from "./billing/server.ts";

type ProjectMediaRecord = { id: string; source_media_path: string | null; thumbnail_path: string | null };

export type AccountDeletionGateway = {
  projectsForUser(userId: string): Promise<ProjectMediaRecord[]>;
  projectMediaPaths(userId: string, project: ProjectMediaRecord): Promise<string[]>;
  removeProjectMedia(paths: string[]): Promise<void>;
  billingCustomerId(userId: string): Promise<string | null>;
  markBillingCustomerDeleted(customerId: string): Promise<void>;
  removeApplicationData(userId: string): Promise<void>;
  deleteAuthUser(userId: string): Promise<void>;
};

export type AccountDeletionDependencies = { gateway: AccountDeletionGateway; stripe: { subscriptions: Pick<Stripe["subscriptions"], "list" | "cancel"> } };

function accountDeletionAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Account deletion is not configured.");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function validProjectMediaPath(userId: string, projectId: string, path: string): boolean {
  return path.startsWith(`${userId}/${projectId}/`) && !path.slice(`${userId}/${projectId}/`.length).includes("/");
}

function supabaseGateway(admin = accountDeletionAdmin()): AccountDeletionGateway {
  return {
    async projectsForUser(userId) {
      const { data, error } = await admin.from("projects").select("id,source_media_path,thumbnail_path").eq("user_id", userId);
      if (error) throw error;
      return (data ?? []) as ProjectMediaRecord[];
    },
    async projectMediaPaths(userId, project) {
      const prefix = `${userId}/${project.id}`;
      const { data, error } = await admin.storage.from(PROJECT_MEDIA_BUCKET).list(prefix, { limit: 1_000 });
      if (error) throw error;
      const candidates = [project.source_media_path, project.thumbnail_path, ...(data ?? []).map((object) => `${prefix}/${object.name}`)];
      return [...new Set(candidates.filter((path): path is string => Boolean(path)).filter((path) => validProjectMediaPath(userId, project.id, path)))];
    },
    async removeProjectMedia(paths) {
      if (!paths.length) return;
      // Supabase Storage's supported API is deliberately used here; application
      // code never writes the storage.objects table directly.
      const { error } = await admin.storage.from(PROJECT_MEDIA_BUCKET).remove(paths);
      if (error) throw error;
    },
    async billingCustomerId(userId) {
      const { data, error } = await admin.from("billing_customers").select("stripe_customer_id").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return (data as { stripe_customer_id?: string } | null)?.stripe_customer_id ?? null;
    },
    async markBillingCustomerDeleted(customerId) {
      const { error } = await admin.from("billing_customer_deletions").upsert({ stripe_customer_id: customerId, deleted_at: new Date().toISOString() }, { onConflict: "stripe_customer_id" });
      if (error) throw error;
    },
    async removeApplicationData(userId) {
      for (const table of ["projects", "billing_subscriptions", "billing_customers", "account_entitlements"]) {
        const { error } = await admin.from(table).delete().eq("user_id", userId);
        if (error) throw error;
      }
    },
    async deleteAuthUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
    },
  };
}

function subscriptionNeedsCancellation(status: string): boolean {
  return !["canceled", "incomplete_expired"].includes(status);
}

/**
 * Ordered and retry-safe lifecycle policy: cancel every nonterminal Stripe
 * subscription for the mapped customer, remove private media via Storage API,
 * remove application records, then delete Supabase Auth last. Any failure
 * leaves the authenticated account in place so the same user can retry.
 */
export async function deleteAccountForUser(userId: string, dependencies?: AccountDeletionDependencies): Promise<void> {
  const gateway = dependencies?.gateway ?? supabaseGateway();
  const stripe = dependencies?.stripe ?? getStripeClient();
  const customerId = await gateway.billingCustomerId(userId);

  if (customerId) {
    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    for (const subscription of subscriptions.data) {
      if (subscriptionNeedsCancellation(subscription.status)) await stripe.subscriptions.cancel(subscription.id);
    }
    // Preserve only a minimal Stripe-customer tombstone. It prevents a delayed
    // verified webhook from recreating mapping/state after Auth is gone.
    await gateway.markBillingCustomerDeleted(customerId);
  }

  const projects = await gateway.projectsForUser(userId);
  for (const project of projects) {
    const paths = await gateway.projectMediaPaths(userId, project);
    await gateway.removeProjectMedia(paths);
  }
  await gateway.removeApplicationData(userId);
  await gateway.deleteAuthUser(userId);
}
