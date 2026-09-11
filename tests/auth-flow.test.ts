import assert from "node:assert/strict";
import test from "node:test";
import { exportAuthIntent, rememberAuthContinuation, rememberAuthResumeProject, safeAuthReturnPath, takeAuthContinuation, takeAuthResumeProject } from "../src/lib/auth-flow.ts";

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
  assert.equal(safeAuthReturnPath("/editor?project=project-123"), "/editor?project=project-123");
  assert.equal(safeAuthReturnPath("/projects"), "/projects");
  assert.equal(safeAuthReturnPath("/account"), "/account");
  assert.equal(safeAuthReturnPath("/billing"), "/billing");
  assert.equal(safeAuthReturnPath("https://attacker.example/editor"), "/editor");
  assert.equal(safeAuthReturnPath("//attacker.example"), "/editor");
  assert.equal(safeAuthReturnPath("/\\\\attacker.example"), "/editor");
  assert.equal(safeAuthReturnPath("/auth/callback?next=https://attacker.example"), "/editor");
});

test("homepage and editor OAuth continuations retain their distinct safe destinations", () => {
  assert.equal(safeAuthReturnPath("/projects"), "/projects");
  assert.equal(safeAuthReturnPath("/editor"), "/editor");
  assert.equal(safeAuthReturnPath("/projects?next=https://attacker.example"), "/projects?next=https://attacker.example");
});

test("guest export asks for authentication while authenticated export opens settings", () => {
  assert.deepEqual(exportAuthIntent(false), { kind: "authenticate", continuation: "export" });
  assert.deepEqual(exportAuthIntent(true), { kind: "open-export-settings" });
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
