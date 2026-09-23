import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS } from "../tools/regression/progression-long-path.ts";
import {
  PROGRESSION_VALIDATION_DESIGNATIONS,
  PROGRESSION_VALIDATION_PROVENANCE,
  extractValidationRunFacts,
  type ProgressionValidationFixture,
} from "../tools/regression/progression-long-path-validation.ts";

const execFileAsync = promisify(execFile);
const validationDirectory = join(process.cwd(), "tools/regression/fixtures/progression-validation");
const designDirectory = join(process.cwd(), "tools/regression/fixtures/progression-trajectory");

async function json(directory: string) {
  return Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => ({ name, fixture: JSON.parse(await readFile(join(directory, name), "utf8")) })));
}

test("every validation fixture has explicit provenance matching a pre-evaluation designation", async () => {
  const ids = PROGRESSION_VALIDATION_DESIGNATIONS.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(Object.isFrozen(PROGRESSION_VALIDATION_DESIGNATIONS));
  const fixtures = await json(validationDirectory);
  assert.equal(fixtures.length, PROGRESSION_VALIDATION_DESIGNATIONS.length);
  for (const { name, fixture } of fixtures as Array<{ name: string; fixture: ProgressionValidationFixture }>) {
    const designation = PROGRESSION_VALIDATION_DESIGNATIONS.find((entry) => entry.id === fixture.id);
    assert.ok(designation, `${fixture.id} was not designated`);
    assert.equal(name, `${fixture.id}.json`);
    assert.equal(fixture.provenance, PROGRESSION_VALIDATION_PROVENANCE);
    assert.equal(fixture.validationRole, designation.role);
    assert.equal(fixture.readerGroup, designation.readerGroup);
    assert.equal(fixture.negativeType, designation.negativeType);
    assert.equal(fixture.refrainStress, designation.refrainStress);
    assert.deepEqual(
      { surah: fixture.expected.surah, startAyah: fixture.expected.startAyah, endAyah: fixture.expected.endAyah },
      designation.sourceRange,
    );
    assert.equal(fixture.architectureEvidence.canonicalPcmPreparations, 1, fixture.id);
    assert.equal(fixture.architectureEvidence.topLevelFastConformerDecisions, 1, fixture.id);
    assert.equal(fixture.architectureEvidence.whisperEntered, fixture.fastConformerOutcome === "abstained", fixture.id);
  }
});

test("validation fixtures retain only privacy-safe relative trajectory evidence", async () => {
  const fixtures = (await json(validationDirectory)).map((entry) => entry.fixture as ProgressionValidationFixture);
  const serialized = JSON.stringify(fixtures).toLowerCase();
  for (const forbidden of ["filename", "filepath", "sourcepath", "transcript", "sha256", "pcmsha", "qurantext", "/users/", "everyayah", "kbps", "device", "useragent", "globalwordindex", "canonicalwordindex", ".mp3", ".wav", ".m4a"]) {
    assert.equal(serialized.includes(forbidden), false, `validation fixture unexpectedly contains ${forbidden}`);
  }
  for (const fixture of fixtures) {
    assert.equal(fixture.trajectory.coordinateOrigin, "minimum-coherent-start");
    const starts = fixture.trajectory.windows.flatMap((window) => window.coherent ? [window.coherent.start] : []);
    if (starts.length) assert.equal(Math.min(...starts), 0, `${fixture.id} coordinates are not relative`);
  }
});

test("external validation fixtures are isolated from the design corpus and frozen values", async () => {
  const design = (await json(designDirectory)).map((entry) => entry.fixture as { id: string; provenance: string });
  assert.equal(design.some((fixture) => fixture.provenance === PROGRESSION_VALIDATION_PROVENANCE), false);
  const validationIds = new Set(PROGRESSION_VALIDATION_DESIGNATIONS.map((entry) => entry.id));
  assert.equal(design.some((fixture) => validationIds.has(fixture.id)), false);
  const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", "tools/regression/evaluate-progression-long-path-validation.ts"], { cwd: process.cwd(), maxBuffer: 8_000_000 });
  const report = JSON.parse(stdout);
  assert.deepEqual(report.frozenCandidate, { ...FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS });
  assert.deepEqual(report.provenanceErrors, []);
  assert.equal(report.criteria.originalCorpusUnchanged, true);
});

test("validation run facts are extracted without source identity", () => {
  const prefix = "[Quran AutoCaption debug]";
  const facts = extractValidationRunFacts([
    `${prefix} build-marker {"build":"x"}`,
    `${prefix} recognition-preparation {"pcmSha256":"abc","sourceDurationMs":1}`,
    `${prefix} fastconformer-primary {"accepted":false}`,
    `${prefix} whisper-fallback {"entered":true}`,
    `${prefix} forced-alignment-succeeded {"status":"complete","resultingStartAyah":2,"resultingEndAyah":15}`,
  ].join("\n"));
  assert.deepEqual(facts, {
    architectureEvidence: { canonicalPcmPreparations: 1, topLevelFastConformerDecisions: 1, whisperEntered: true },
    forcedAlignment: { status: "complete", resultingStartAyah: 2, resultingEndAyah: 15 },
  });
  assert.equal(JSON.stringify(facts).includes("abc"), false);
});

test("frozen validation outcome is recorded without patching the candidate", async () => {
  const { stdout } = await execFileAsync(process.execPath, ["--experimental-strip-types", "tools/regression/evaluate-progression-long-path-validation.ts"], { cwd: process.cwd(), maxBuffer: 8_000_000 });
  const report = JSON.parse(stdout);
  assert.equal(report.conclusion, "EXTERNAL VALIDATION FAILED");
  assert.deepEqual(report.falseNegatives, ["progression-validation-positive-reader-h-91-1-15"]);
  assert.deepEqual(report.falsePositives, []);
  const reader91 = report.positives.find((row: { id: string }) => row.id === "progression-validation-positive-reader-h-91-1-15");
  assert.equal(reader91.frozenCandidate.firstFailedStage, "existing-safety");
  assert.equal(reader91.progression.resetCount, 0);
  // Every hard negative passes existing non-CTC safety and is rejected only by progression.
  for (const row of report.negatives) {
    assert.equal(row.existingSafetyGatesPass, true, row.id);
    assert.equal(row.frozenCandidate.firstFailedStage, "progression", row.id);
  }
  // Refrain positive whose local winner returns to an earlier identical ayah; progression does not reset.
  const refrain = report.positives.find((row: { id: string }) => row.id === "progression-validation-positive-reader-g-54-15-22");
  assert.equal(refrain.observations.localBehindFrontier, 1);
  assert.equal(refrain.frozenCandidate.accepted, true);
});
