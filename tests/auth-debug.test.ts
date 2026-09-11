import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { authCookieNames, authDebugEnabled, safeAuthDiagnosticError } from "../src/lib/auth-debug.ts";

const callback = readFileSync(new URL("../src/app/auth/callback/route.ts", import.meta.url), "utf8");
const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
const authState = readFileSync(new URL("../src/app/api/debug/auth-state/route.ts", import.meta.url), "utf8");
const authStart = readFileSync(new URL("../src/app/api/debug/auth-start/route.ts", import.meta.url), "utf8");
const cloud = readFileSync(new URL("../src/lib/cloud-sync.ts", import.meta.url), "utf8");

test("AUTH_DEBUG is opt-in and diagnostics cannot serialize cookie values or provider messages", () => {
  assert.equal(authDebugEnabled({}), false);
  assert.equal(authDebugEnabled({ AUTH_DEBUG: "false" }), false);
  assert.equal(authDebugEnabled({ AUTH_DEBUG: "true" }), true);
  assert.deepEqual(authCookieNames([{ name: "sb-a" }, { name: "sb-a" }, { name: "theme" }]), ["sb-a", "theme"]);
  assert.equal(safeAuthDiagnosticError({ code: "unexpected_token" }), "unexpected_token");
  assert.equal(safeAuthDiagnosticError({ message: "Auth session missing!" }), "auth-session-missing");
  assert.equal(safeAuthDiagnosticError({ message: "token=private-value" }), "auth-request-failed");
});

test("the OAuth trace covers callback exchange, the returned redirect, and editor server reads", () => {
  for (const stage of ["callback-entry", "exchange-code-for-session", "callback-response"]) assert.match(callback, new RegExp(`logAuthDebug\\(\\"${stage}`));
  assert.match(callback, /hasCode: Boolean\(code\)/);
  assert.match(callback, /requestCookieNames/);
  assert.match(callback, /writtenCookieNames/);
  assert.match(callback, /responseSetCookieCount: response\.cookies\.getAll\(\)\.length/);
  assert.match(proxy, /logAuthDebug\("editor-auth-read"/);
  assert.match(proxy, /requestCookieNames/);
  assert.match(authState, /if \(!authDebugEnabled\(\)\) return disabled\(\)/);
  assert.match(authState, /authCookieNamesPresent: requestCookieNames/);
  assert.match(authState, /getUserOk/);
  assert.match(authState, /getUserError/);
  assert.match(authStart, /if \(!authDebugEnabled\(\)\)/);
  assert.match(authStart, /redirectToMatchesConfigured/);
  assert.match(cloud, /reportOAuthStart\(next, redirectTo\)/);
});
