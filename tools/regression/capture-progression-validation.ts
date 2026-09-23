#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  PROGRESSION_VALIDATION_DESIGNATIONS,
  PROGRESSION_VALIDATION_PROVENANCE,
  extractValidationRunFacts,
  type ProgressionValidationFixture,
} from "./progression-long-path-validation.ts";
import { createProgressionTrajectoryFixture } from "./progression-trajectory.ts";

const inputPath = process.argv[2];
const id = process.argv[3];
const designation = PROGRESSION_VALIDATION_DESIGNATIONS.find((entry) => entry.id === id);
if (!inputPath || !designation) {
  throw new Error("Usage: node --experimental-strip-types tools/regression/capture-progression-validation.ts <ignored-debug-log> <designated-validation-id>");
}
const input = await readFile(inputPath, "utf8");
const positive = designation.role === "positive";
const trajectory = createProgressionTrajectoryFixture(input, {
  id: designation.id,
  expected: {
    outcome: positive ? "positive" : "negative",
    intent: positive
      ? `Continuous canonical recitation of ${designation.construction} must be identified.`
      : `Manipulated recitation (${designation.negativeType}) built from ${designation.construction} must not pass as forward progression.`,
    ...designation.sourceRange,
  },
  provenance: PROGRESSION_VALIDATION_PROVENANCE,
  readerGroup: designation.readerGroup,
  negativeType: designation.negativeType,
});
const fixture: ProgressionValidationFixture = {
  ...trajectory,
  provenance: PROGRESSION_VALIDATION_PROVENANCE,
  validationRole: designation.role,
  refrainStress: designation.refrainStress,
  ...extractValidationRunFacts(input),
};
const output = join(process.cwd(), "tools/regression/fixtures/progression-validation", `${designation.id}.json`);
await writeFile(output, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
process.stdout.write(`${designation.id}\n`);
