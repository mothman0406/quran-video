#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const files = [
  "tools/regression/quran-whole-recording-integrity.ts",
  "tools/regression/quran-edge-completion.ts",
  "tools/regression/evaluate-quran-integrity-edge-completion.ts",
  "tests/quran-integrity-edge-completion.test.ts",
];
const serialized = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n").toLowerCase();
const forbidden = ["/users/", "filename", "filepath", "sourcepath", "transcript", "sha256", "pcmsha", ".mp3", ".wav", ".m4a"];
const found = forbidden.filter((value) => serialized.includes(value));
if (found.length) throw new Error(`Integrity/edge tooling contains forbidden retained fields: ${found.join(", ")}`);
process.stdout.write(`PASS Quran integrity/edge privacy (${files.length} source files; no new media fixtures)\n`);
