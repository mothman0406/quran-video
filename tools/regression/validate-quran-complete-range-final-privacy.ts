#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const directory = join(process.cwd(), "tools/regression/fixtures/quran-complete-range-final-validation");
const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
const forbiddenKeys = /^(?:audio|pcm|samples|transcript|filename|filepath|sourcepath|mediahash|device|userdata|qurantext|canonicalarabic|globalwordindex)$/iu;
const forbiddenValues = ["/users/", "/private/", ".mp3", ".wav", ".m4a", ".mp4", "everyayah", "kbps"];

for (const name of files) {
  const raw = await readFile(join(directory, name), "utf8");
  const fixture = JSON.parse(raw) as { schemaVersion?: unknown; id?: unknown };
  if (fixture.schemaVersion !== 1 || typeof fixture.id !== "string") throw new Error(`Invalid final-validation fixture: ${name}`);
  const visit = (value: unknown, path = "root"): void => {
    if (typeof value === "string") {
      const normalized = value.toLowerCase();
      for (const token of forbiddenValues) {
        if (normalized.includes(token)) throw new Error(`Forbidden privacy value ${token} at ${path} in ${name}`);
      }
      return;
    }
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${path}[${index}]`));
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) {
      if (forbiddenKeys.test(key)) throw new Error(`Forbidden privacy key ${path}.${key} in ${name}`);
      visit(item, `${path}.${key}`);
    }
  };
  visit(fixture);
}

if (files.length !== 4) throw new Error(`Expected exactly four final-validation fixtures, received ${files.length}.`);
process.stdout.write(`PASS Quran complete-range final privacy (${files.length} fixtures; aggregate evidence only)\n`);
