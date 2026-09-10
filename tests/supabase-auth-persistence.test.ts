import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { supabaseCookieOptions } from "../src/lib/supabase/cookies.ts";

const browser = readFileSync(new URL("../src/lib/cloud-sync.ts", import.meta.url), "utf8");
const server = readFileSync(new URL("../src/lib/supabase/server.ts", import.meta.url), "utf8");
const callback = readFileSync(new URL("../src/app/auth/callback/route.ts", import.meta.url), "utf8");
const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

test("browser and server share a secure host-only Supabase cookie policy in production", () => {
  assert.deepEqual(supabaseCookieOptions(true), {
    path: "/",
    sameSite: "lax",
    secure: true,
    httpOnly: false,
  });
  assert.equal("domain" in supabaseCookieOptions(true), false);
  assert.match(browser, /createBrowserClient\(url, anonKey, \{ cookieOptions: supabaseCookieOptions\(\) \}\)/);
  assert.match(server, /cookieOptions: supabaseCookieOptions\(\)/);
});

test("PKCE exchange and proxy write every Supabase cookie and cache header to their returned response", () => {
  assert.match(callback, /await supabase\.auth\.exchangeCodeForSession\(code\)/);
  assert.match(callback, /setAll: \(cookiesToSet, headers\)/);
  assert.match(callback, /response\.cookies\.set/);
  assert.match(callback, /response\.headers\.set/);
  assert.match(callback, /return response/);
  assert.match(proxy, /setAll: \(cookiesToSet, headers\)/);
  assert.match(proxy, /response = NextResponse\.next\(\{ request \}\)/);
  assert.match(proxy, /response\.cookies\.set/);
  assert.match(proxy, /response\.headers\.set/);
});
