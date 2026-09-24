#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PrivacySafeCoreBoundaryFixture } from "./quran-core-boundary-evidence.ts";

const root = join(process.cwd(), "tools/regression/fixtures/quran-core-boundary-localization");
const names = (await readdir(root)).filter((name) => name.endsWith(".json")).sort();
const forbiddenKeys = /^(?:audio|pcm|samples|transcript|filename|filepath|sourcepath|mediahash|device|userdata|qurantext|canonicalarabic)$/iu;

for (const name of names) {
  const raw = await readFile(join(root, name), "utf8");
  const fixture = JSON.parse(raw) as PrivacySafeCoreBoundaryFixture;
  if (!fixture.id || !fixture.role || fixture.schemaVersion !== 1) throw new Error(`Invalid core-boundary fixture: ${name}`);
  const visit = (value: unknown, path = "root"): void => {
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${path}[${index}]`));
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      // Aggregate duration and inference cost are allowed; retained samples,
      // source identity, transcripts, and canonical text are not.
      if (forbiddenKeys.test(key)) throw new Error(`Forbidden privacy key ${path}.${key} in ${name}`);
      visit(item, `${path}.${key}`);
    }
  };
  visit(fixture);
}

process.stdout.write(`PASS Quran core-boundary privacy (${names.length} fixtures; no media, PCM, transcript, source identity, or Quran text)\n`);
