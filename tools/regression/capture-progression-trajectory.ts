#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import type { CalibrationOutcome } from "./ctc-calibration-capture.ts";
import { computeProgressionFeatures, createProgressionTrajectoryFixture, type ProgressionProvenance } from "./progression-trajectory.ts";

function argument(name: string) {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function positiveInteger(value: string | undefined, label: string) {
  if (value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${label} must be a positive integer.`);
  return parsed;
}

const provenances: readonly ProgressionProvenance[] = ["design", "external-validation", "progression-design-support", "progression-held-out"];
const inputPath = process.argv[2];
const id = argument("--id");
const expected = argument("--expected") as CalibrationOutcome | undefined;
const intent = argument("--intent");
const provenance = argument("--provenance") as ProgressionProvenance | undefined;
const readerGroup = argument("--reader-group");
if (!inputPath || !id || !intent || !readerGroup || !expected || !["positive", "negative", "observational"].includes(expected) || !provenance || !provenances.includes(provenance)) {
  throw new Error("Usage: npm run calibration:progression:capture -- <debug-log> --id <id> --expected <positive|negative|observational> --intent <meaning> --provenance <design|external-validation|progression-design-support|progression-held-out> --reader-group <label> [--negative-type <type>] [--surah N --start-ayah N --end-ayah N] [--output <fixture.json>]");
}
const fixture = createProgressionTrajectoryFixture(await readFile(inputPath, "utf8"), {
  id,
  expected: {
    outcome: expected,
    intent,
    surah: positiveInteger(argument("--surah"), "surah"),
    startAyah: positiveInteger(argument("--start-ayah"), "start ayah"),
    endAyah: positiveInteger(argument("--end-ayah"), "end ayah"),
  },
  provenance,
  readerGroup,
  negativeType: argument("--negative-type") ?? null,
});
const features = computeProgressionFeatures(fixture.trajectory.windows);
process.stderr.write(`${JSON.stringify({ id, resetCount: features.resetCount, noveltyRatio: features.noveltyRatio, longestNoProgressRun: features.longestNoProgressRun })}\n`);
const json = `${JSON.stringify(fixture, null, 2)}\n`;
const outputPath = argument("--output");
if (outputPath) await writeFile(outputPath, json, "utf8");
else process.stdout.write(json);
