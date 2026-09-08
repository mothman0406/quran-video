import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getMarketingQuranDemo, MARKETING_DEMO_VERSE_KEYS } from "../src/lib/landing/marketing-demo.ts";
import { getVerse } from "../src/lib/quran/local.ts";

const fromRoot = (...parts: string[]) => resolve(process.cwd(), ...parts);

test("public route renders the lightweight landing page and leaves the editor on /editor", () => {
  const landingRoute = readFileSync(fromRoot("src/app/page.tsx"), "utf8");
  const editorRoute = readFileSync(fromRoot("src/app/editor/page.tsx"), "utf8");
  const landingComponent = readFileSync(fromRoot("src/components/landing-page.tsx"), "utf8");

  assert.match(landingRoute, /LandingPage/);
  assert.doesNotMatch(landingRoute, /recognition|fastconformer|EditorWorkspace/i);
  assert.match(editorRoute, /EditorWorkspace/);
  assert.match(landingComponent, /href="\/editor"/);
  assert.match(landingComponent, /No sign-up required to start\./);
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
  assert.match(workspace, /<Link className="editor-brand" href="\/" aria-label="Quran Video home"/);
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
