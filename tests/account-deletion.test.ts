import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deleteAccountForUser, type AccountDeletionGateway } from "../src/lib/account-deletion.ts";

function gateway(events: string[]): AccountDeletionGateway {
  return {
    async projectsForUser(userId) { assert.equal(userId, "owner"); return [{ id: "project-a", source_media_path: "owner/project-a/source-a.mp4", thumbnail_path: null }]; },
    async projectMediaPaths(userId, project) { assert.equal(userId, "owner"); assert.equal(project.id, "project-a"); return ["owner/project-a/source-a.mp4"]; },
    async removeProjectMedia(paths) { events.push(`storage:${paths.join(",")}`); },
    async billingCustomerId(userId) { assert.equal(userId, "owner"); return "cus_owner"; },
    async markBillingCustomerDeleted(customerId) { events.push(`tombstone:${customerId}`); },
    async removeApplicationData(userId) { events.push(`data:${userId}`); },
    async deleteAuthUser(userId) { events.push(`auth:${userId}`); },
  };
}

test("account deletion requires authenticated identity and never accepts a target user id", () => {
  const route = readFileSync(new URL("../src/app/api/account/delete/route.ts", import.meta.url), "utf8");
  assert.match(route, /authenticatedEntitlementUser\(request\)/);
  assert.match(route, /Authentication required/);
  assert.doesNotMatch(route, /targetUserId|userId:\s*body/);
});

test("paid account deletion cancels active Stripe subscriptions before application cleanup", async () => {
  const events: string[] = [];
  const stripe = { subscriptions: {
    async list() { return { data: [{ id: "sub_active", status: "active" }, { id: "sub_old", status: "canceled" }] }; },
    async cancel(id: string) { events.push(`cancel:${id}`); return {} as never; },
  } };
  await deleteAccountForUser("owner", { gateway: gateway(events), stripe: stripe as never });
  assert.deepEqual(events, ["cancel:sub_active", "tombstone:cus_owner", "storage:owner/project-a/source-a.mp4", "data:owner", "auth:owner"]);
});

test("media cleanup is completed through the Supabase Storage API before metadata/Auth removal", () => {
  const source = readFileSync(new URL("../src/lib/account-deletion.ts", import.meta.url), "utf8");
  assert.match(source, /storage\.from\(PROJECT_MEDIA_BUCKET\)\.remove\(paths\)/);
  assert.doesNotMatch(source, /delete\s+from\s+storage\.objects/i);
  assert.ok(source.indexOf("await gateway.removeProjectMedia(paths)") < source.indexOf("await gateway.removeApplicationData(userId)"));
  assert.ok(source.indexOf("await gateway.removeApplicationData(userId)") < source.indexOf("await gateway.deleteAuthUser(userId)"));
});
