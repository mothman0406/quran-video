#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { createCtcCalibrationCapture, summarizeCtcCalibrationCapture, type CalibrationOutcome } from "./ctc-calibration-capture.ts";

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

const inputPath = process.argv[2];
const id = argument("--id");
const expected = argument("--expected") as CalibrationOutcome | undefined;
const intent = argument("--intent");
if (!inputPath || !id || !intent || !expected || !["positive", "negative", "observational"].includes(expected)) {
  throw new Error("Usage: npm run calibration:ctc -- <debug-log> --id <id> --expected <positive|negative|observational> --intent <meaning> [--surah N --start-ayah N --end-ayah N]");
}
const capture = createCtcCalibrationCapture(await readFile(inputPath, "utf8"), {
  id,
  expected: {
    outcome: expected,
    intent,
    surah: positiveInteger(argument("--surah"), "surah"),
    startAyah: positiveInteger(argument("--start-ayah"), "start ayah"),
    endAyah: positiveInteger(argument("--end-ayah"), "end ayah"),
  },
});
process.stderr.write(`${JSON.stringify(summarizeCtcCalibrationCapture(capture))}\n`);
const json = `${JSON.stringify(capture, null, 2)}\n`;
const outputPath = argument("--output");
if (outputPath) await writeFile(outputPath, json, "utf8");
else process.stdout.write(json);
