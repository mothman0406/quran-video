#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { QURAN_ID_FIXTURES } from "./quran-id-manifest.ts";

const execFileAsync = promisify(execFile);
const categories = ["starts mid-ayah", "ends mid-ayah", "basmalah present", "no basmalah", "long silence", "slow mujawwad", "faster tartil", "repeated phrase", "similar ayahs", "noisy audio", "short 1-ayah clip", "multi-ayah"];

async function main() {
  const covered = categories.filter((category) => QURAN_ID_FIXTURES.some((fixture) => fixture.category.includes(category)));
  if (covered.length !== categories.length) throw new Error(`Quran ID fixture manifest is missing: ${categories.filter((category) => !covered.includes(category)).join(", ")}`);
  await execFileAsync(process.execPath, ["--experimental-strip-types", "--test", "tests/ctc-calibration-capture.test.ts", "tests/ctc-path-statistics.test.ts", "tests/fastconformer-identification.test.ts", "tests/passage-decision.test.ts", "tests/passage-identification-debug.test.ts", "tests/passage-id-metrics.test.ts", "tests/recognition-audio-preparation.test.ts"], { cwd: process.cwd() });
  console.log(`PASS  Quran ID regression fixture schema (${QURAN_ID_FIXTURES.length} logical fixtures; retained audio required for runtime metrics).`);
}

void main();
