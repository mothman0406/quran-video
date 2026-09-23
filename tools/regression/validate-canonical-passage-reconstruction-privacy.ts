#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const directory = join(process.cwd(), "tools/regression/fixtures/canonical-reconstruction-validation");
const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
if (files.length !== 4) throw new Error(`Expected exactly four validation fixtures, found ${files.length}.`);
const serialized = (await Promise.all(files.map((name) => readFile(join(directory, name), "utf8")))).join("\n").toLowerCase();
const forbidden = [
  "filename", "filepath", "sourcepath", "transcript", "sha256", "pcmsha", "qurantext", "/users/",
  "everyayah", "kbps", "device", "useragent", "globalwordindex", "canonicalwordindex", ".mp3", ".wav", ".m4a",
];
const found = forbidden.filter((value) => serialized.includes(value));
if (found.length) throw new Error(`Canonical reconstruction validation fixtures contain forbidden fields: ${found.join(", ")}`);
process.stdout.write(`PASS canonical reconstruction validation privacy (${files.length} fixtures)\n`);
