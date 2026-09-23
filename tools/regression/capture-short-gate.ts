#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractValidationRunFacts } from "./progression-long-path-validation.ts";
import { createProgressionTrajectoryFixture } from "./progression-trajectory.ts";
import {
  SHORT_GATE_DESIGNATIONS,
  SHORT_GATE_HELD_OUT_PROVENANCE,
  SHORT_GATE_PROVENANCE,
} from "./short-gate-analysis.ts";

const inputPath = process.argv[2];
const id = process.argv[3];
const designation = SHORT_GATE_DESIGNATIONS.find((entry) => entry.id === id);
if (!inputPath || !designation) {
  throw new Error("Usage: capture-short-gate.ts <ignored-debug-log> <designated-id>");
}

const input = await readFile(inputPath, "utf8");
const provenance = designation.corpusRole === "design-support"
  ? SHORT_GATE_PROVENANCE
  : SHORT_GATE_HELD_OUT_PROVENANCE;
const fixture = {
  ...createProgressionTrajectoryFixture(input, {
    id,
    expected: {
      outcome: designation.expectedOutcome,
      intent: designation.expectedOutcome === "positive"
        ? `Continuous canonical recitation of ${designation.construction} must be identified.`
        : `Manipulated recitation (${designation.negativeType}) built from ${designation.construction} must reject.`,
      surah: designation.sourceRange?.surah ?? null,
      startAyah: designation.sourceRange?.startAyah ?? null,
      endAyah: designation.sourceRange?.endAyah ?? null,
    },
    provenance,
    readerGroup: designation.readerGroup,
    negativeType: designation.negativeType,
  }),
  corpusRole: designation.corpusRole,
  ...extractValidationRunFacts(input),
};
const directory = join(process.cwd(), "tools/regression/fixtures/short-gate");
await mkdir(directory, { recursive: true });
await writeFile(join(directory, `${id}.json`), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
process.stdout.write(`${id}\n`);
