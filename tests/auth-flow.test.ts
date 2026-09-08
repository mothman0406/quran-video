import assert from "node:assert/strict";
import test from "node:test";
import { accountPlanForAuthenticatedUser, exportAuthIntent, rememberAuthContinuation, rememberAuthResumeProject, safeAuthReturnPath, takeAuthContinuation, takeAuthResumeProject } from "../src/lib/auth-flow.ts";

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

test("public landing and editor routes remain safe auth return destinations", () => {
  assert.equal(safeAuthReturnPath("/"), "/");
  assert.equal(safeAuthReturnPath("/editor"), "/editor");
  assert.equal(safeAuthReturnPath("/projects"), "/projects");
  assert.equal(safeAuthReturnPath("https://attacker.example/editor"), "/editor");
  assert.equal(safeAuthReturnPath("//attacker.example"), "/editor");
});

test("guest export asks for authentication while authenticated export opens settings", () => {
  assert.deepEqual(exportAuthIntent(false), { kind: "authenticate", continuation: "export" });
  assert.deepEqual(exportAuthIntent(true), { kind: "open-export-settings" });
});

test("authenticated accounts resolve to Free until the later entitlement milestone", () => {
  assert.equal(accountPlanForAuthenticatedUser(), "free");
});

test("auth continuation and local resume identity are minimal, one-time browser state", () => {
  const sessionStorage = storage();
  rememberAuthContinuation("export", sessionStorage);
  rememberAuthResumeProject("project-123", sessionStorage);
  assert.equal(takeAuthContinuation(sessionStorage), "export");
  assert.equal(takeAuthContinuation(sessionStorage), null);
  assert.equal(takeAuthResumeProject(sessionStorage), "project-123");
  assert.equal(takeAuthResumeProject(sessionStorage), null);
});

test("guest save continuation survives the authentication return", () => {
  const sessionStorage = storage();
  rememberAuthContinuation("save", sessionStorage);
  assert.equal(takeAuthContinuation(sessionStorage), "save");
});
