#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const directory = join(process.cwd(), "tools/regression/fixtures/quran-local-core-edge");
const files = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
const forbidden = [
  "/users/", "filename", "filepath", "sourcepath", "transcript", "qurantext", "sha256", "pcmsha",
  ".mp3", ".wav", ".m4a", ".mp4", "userdata", "device", "globalwordindex",
];
const found: string[] = [];
for (const name of files) {
  const text = (await readFile(join(directory, name), "utf8")).toLowerCase();
  for (const token of forbidden) if (text.includes(token)) found.push(`${name}:${token}`);
}
if (found.length) throw new Error(`Quran local-core/edge fixtures contain forbidden data: ${found.join(", ")}`);
if (files.length !== 2) throw new Error(`Expected exactly two retained privacy-safe boundary fixtures, received ${files.length}.`);
process.stdout.write(`PASS Quran local-core/edge privacy (${files.length} fixtures; no media or PCM)\n`);

