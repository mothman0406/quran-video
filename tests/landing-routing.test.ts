import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getMarketingQuranDemo, MARKETING_DEMO_VERSE_KEYS } from "../src/lib/landing/marketing-demo.ts";
import { getVerse } from "../src/lib/quran/local.ts";
import { getLandingShowcaseAssets, LANDING_SHOWCASE } from "../src/lib/landing/showcase-assets.ts";

const fromRoot = (...parts: string[]) => resolve(process.cwd(), ...parts);

test("public route renders the lightweight landing page and leaves the editor on /editor", () => {
  const landingRoute = readFileSync(fromRoot("src/app/page.tsx"), "utf8");
  const editorRoute = readFileSync(fromRoot("src/app/editor/page.tsx"), "utf8");
  const editorClient = readFileSync(fromRoot("src/components/editor-client.tsx"), "utf8");
  const landingComponent = readFileSync(fromRoot("src/components/landing-page.tsx"), "utf8");

  assert.match(landingRoute, /LandingPage/);
  assert.doesNotMatch(landingRoute, /recognition|fastconformer|EditorWorkspace/i);
  assert.match(editorRoute, /EditorClient/);
  assert.match(editorClient, /EditorWorkspace/);
  assert.match(landingComponent, /href="\/create"/);
  assert.match(landingComponent, /No sign-up required to start\./);
});

test("landing header is guest-first and supplies its initial Supabase auth state from the server", () => {
  const landingRoute = readFileSync(fromRoot("src/app/page.tsx"), "utf8");
  const landing = readFileSync(fromRoot("src/components/landing-page.tsx"), "utf8");
  const authActions = readFileSync(fromRoot("src/components/landing-auth-actions.tsx"), "utf8");
  const accountPanel = readFileSync(fromRoot("src/components/account-panel.tsx"), "utf8");
  const globals = readFileSync(fromRoot("src/app/globals.css"), "utf8");

  assert.match(landingRoute, /import \{ cookies \} from "next\/headers"/);
  assert.match(landingRoute, /createSupabaseServerClient/);
  assert.match(landingRoute, /supabase\.auth\.getUser\(\)/);
  assert.match(landingRoute, /authenticated=\{authenticated\}/);
  assert.match(landing, /<LandingAuthActions authenticated=\{authenticated\} \/>/);
  assert.match(authActions, /authenticated \? <Link className="landing-auth-link" href="\/videos">Videos<\/Link> : <button className="landing-auth-link"/);
  assert.match(authActions, />Sign in<\/button>/);
  assert.match(authActions, /<Link className="landing-header-cta" href="\/create">Start creating/);
  assert.match(authActions, /<AccountPanel session=\{null\} authReturnPath="\/videos"/);
  assert.match(accountPanel, /await signInWithGoogle\(authReturnPath\)/);
  assert.match(accountPanel, /await sendMagicLink\(email\.trim\(\), authReturnPath\)/);
  assert.doesNotMatch(authActions, /getAuthSession|useEffect|localStorage/);
  assert.match(globals, /\.landing-auth-actions \{ display:flex; align-items:center; gap:14px; \}/);
  assert.match(globals, /@media \(max-width:600px\) \{ \.landing-auth-actions \{ gap:8px; \}/);
});

test("marketing Quran captions resolve exactly from the canonical local corpus", () => {
  const demo = getMarketingQuranDemo();
  assert.deepEqual(demo.map((item) => item.verseKey), [...MARKETING_DEMO_VERSE_KEYS]);
  for (const item of demo) {
    assert.equal(item.arabic, getVerse(item.verseKey)?.arabic.uthmani, item.verseKey);
  }
});

test("editor home affordance routes back to the public landing page", () => {
  const workspace = readFileSync(fromRoot("src/components/editor-workspace.tsx"), "utf8");
  assert.match(workspace, /<Link className="editor-brand" href="\/" aria-label="Quran AutoCaption home"/);
});

test("global document scrolling is available to the landing page while the editor owns its viewport lock", () => {
  const globals = readFileSync(fromRoot("src/app/globals.css"), "utf8");

  assert.match(globals, /html,body \{ width:100%; min-width:0; min-height:100%; margin:0; overflow-x:hidden; overflow-y:auto; \}/);
  assert.doesNotMatch(globals, /html,body \{[^}]*height:100%;[^}]*overflow:hidden/);
  assert.match(globals, /\.landing-page \{[^}]*min-width:0; overflow:hidden;/);
  assert.match(globals, /\.editor-shell \{ height:100dvh; min-height:0; overflow:hidden;/);
  assert.match(globals, /\.editor-sidebar-scroll \{[^}]*overflow:auto;/);
  assert.match(globals, /\.editor-body \{ grid-template-columns:var\(--left-panel-width,var\(--sidebar-left-width\)\) 10px minmax\(0,1fr\) 10px var\(--right-panel-width,var\(--sidebar-right-width\)\); \}/);
});

test("landing uses an optimized first-party editor image without importing the editor runtime", () => {
  const landing = readFileSync(fromRoot("src/components/landing-page.tsx"), "utf8");
  const imports = landing.split("\n").filter((line) => line.startsWith("import ")).join("\n");
  const editorImage = readFileSync(fromRoot("public/landing/editor-demo.png"));

  assert.match(landing, /import Image from "next\/image"/);
  assert.match(landing, /src="\/landing\/editor-demo\.png"/);
  assert.match(landing, /width=\{1649\} height=\{954\}/);
  assert.match(landing, /Quran AutoCaption editor showing a vertical recitation video/);
  assert.doesNotMatch(imports, /recognition|fastconformer|EditorWorkspace/i);
  assert.ok(editorImage.length > 100_000, "editor screenshot should be a real high-detail static image");
});

test("showcase supports supplied first-party captures and its canonical fallback styles are distinct", () => {
  const landing = readFileSync(fromRoot("src/components/landing-page.tsx"), "utf8");
  const globals = readFileSync(fromRoot("src/app/globals.css"), "utf8");

  assert.deepEqual(LANDING_SHOWCASE.map((example) => example.title), ["Minimal", "Translation", "Word Highlight", "Cinematic"]);
  assert.deepEqual(LANDING_SHOWCASE.map((example) => example.description), ["Arabic-first with a clean, distraction-free layout.", "Arabic and English composed together in one frame.", "Follow the recitation word by word with read-so-far color.", "Polished Arabic focus for social-first Quran videos."]);
  assert.equal(getLandingShowcaseAssets().length, 0, "no unreviewed showcase captures should be assumed present");
  assert.doesNotMatch(landing, /A caption treatment made for Quran recitation\./);
  assert.doesNotMatch(landing, /https?:\/\//i, "landing product visuals must not source competitor or third-party URLs");
  assert.match(globals, /\.landing-showcase-grid \{ grid-template-columns:repeat\(4,minmax\(0,1fr\)\);/);
  assert.match(globals, /@media \(prefers-reduced-motion:reduce\)/);
});
