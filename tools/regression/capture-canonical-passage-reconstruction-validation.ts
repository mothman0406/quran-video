#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATIONS,
  CANONICAL_RECONSTRUCTION_VALIDATION_PROVENANCE,
} from "./canonical-passage-reconstruction-validation.ts";
import { extractValidationRunFacts } from "./progression-long-path-validation.ts";
import { createProgressionTrajectoryFixture } from "./progression-trajectory.ts";

const inputPath = process.argv[2];
const id = process.argv[3];
const designation = CANONICAL_RECONSTRUCTION_VALIDATION_DESIGNATIONS.find((entry) => entry.id === id);
if (!inputPath || !designation) {
  throw new Error("Usage: capture-canonical-passage-reconstruction-validation.ts <ignored-debug-log> <designated-id>");
}

const input = await readFile(inputPath, "utf8");
const positive = designation.role.startsWith("positive");
const fixture = {
  ...createProgressionTrajectoryFixture(input, {
    id,
    expected: {
      outcome: positive ? "positive" as const : "negative" as const,
      intent: positive
        ? `Continuous canonical recitation of ${designation.construction} must reconstruct exactly.`
        : `Manipulated same-surah construction ${designation.construction} must not reconstruct as one continuous passage.`,
      ...designation.sourceRange,
    },
    provenance: CANONICAL_RECONSTRUCTION_VALIDATION_PROVENANCE,
    readerGroup: designation.readerGroup,
    negativeType: designation.negativeType,
  }),
  validationRole: designation.role,
  ...extractValidationRunFacts(input),
};
const directory = join(process.cwd(), "tools/regression/fixtures/canonical-reconstruction-validation");
await mkdir(directory, { recursive: true });
await writeFile(join(directory, `${id}.json`), `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
process.stdout.write(`${id}\n`);
