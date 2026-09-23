#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { progressionSampleFromFixture, type ProgressionSample } from "./progression-long-path.ts";
import {
  FROZEN_PROGRESSION_VALIDATION_CANDIDATE,
  PROGRESSION_VALIDATION_DESIGNATIONS,
  PROGRESSION_VALIDATION_PROVENANCE,
  evaluateFrozenProgressionValidation,
  type ProgressionValidationFixture,
} from "./progression-long-path-validation.ts";
import type { ProgressionTrajectoryFixture } from "./progression-trajectory.ts";

type Range = { surah: number; startAyah: number; endAyah: number };

async function fixturesIn<T>(directory: string) {
  return Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8")) as T));
}

function round(value: number) {
  return Number(value.toFixed(6));
}

function range(value: Range | null) {
  return value ? `${value.surah}:${value.startAyah}-${value.endAyah}` : "none";
}

function exact(left: Range | null, right: Range) {
  return left !== null && left.surah === right.surah && left.startAyah === right.startAyah && left.endAyah === right.endAyah;
}

function overlaps(left: Range | null, right: Range) {
  return left !== null && left.surah === right.surah && left.startAyah <= right.endAyah && left.endAyah >= right.startAyah;
}

const validationDirectory = join(process.cwd(), "tools/regression/fixtures/progression-validation");
const fixtures = await fixturesIn<ProgressionValidationFixture>(validationDirectory);
const provenanceErrors = fixtures.flatMap((fixture) => {
  const designation = PROGRESSION_VALIDATION_DESIGNATIONS.find((entry) => entry.id === fixture.id);
  if (!designation) return [`${fixture.id}: not designated before evaluation`];
  const errors: string[] = [];
  if (fixture.provenance !== PROGRESSION_VALIDATION_PROVENANCE) errors.push(`${fixture.id}: provenance ${fixture.provenance}`);
  if (fixture.validationRole !== designation.role) errors.push(`${fixture.id}: role differs from designation`);
  if (fixture.readerGroup !== designation.readerGroup) errors.push(`${fixture.id}: reader group differs from designation`);
  if (fixture.negativeType !== designation.negativeType) errors.push(`${fixture.id}: negative type differs from designation`);
  if (fixture.expected.outcome !== (designation.role === "positive" ? "positive" : "negative")) errors.push(`${fixture.id}: expected outcome differs from designation`);
  return errors;
});
const missingCaptures = PROGRESSION_VALIDATION_DESIGNATIONS.filter((entry) => !fixtures.some((fixture) => fixture.id === entry.id)).map((entry) => entry.id);

function caseRow(fixture: ProgressionValidationFixture) {
  const sample = progressionSampleFromFixture(fixture);
  const p = sample.progression!;
  const frozen = evaluateFrozenProgressionValidation(sample);
  const expected: Range = { surah: fixture.expected.surah!, startAyah: fixture.expected.startAyah!, endAyah: fixture.expected.endAyah! };
  const trajectory = fixture.trajectory.windows;
  const anchorEvents: Record<string, number> = {};
  for (const window of trajectory) anchorEvents[window.anchorEvent] = (anchorEvents[window.anchorEvent] ?? 0) + 1;
  return {
    id: fixture.id,
    role: fixture.validationRole,
    readerGroup: fixture.readerGroup,
    negativeType: fixture.negativeType,
    refrainStress: fixture.refrainStress,
    expectedRange: range(expected),
    windows: sample.gates.totalGeneratedWindows,
    coherentWindows: p.coherentWindowCount,
    existingSafetyGatesPass: sample.gates.fixedSafetyGatesPass,
    failedSafetyGates: sample.gates.failedSafetyGates,
    failedAcceptanceRules: fixture.failedAcceptanceRules,
    bestCoherentCtc: sample.gates.bestCoherentCtc,
    bestCtcDistance: sample.gates.bestCoherentCtc === null ? null : round(sample.gates.bestCoherentCtc - FROZEN_PROGRESSION_VALIDATION_CANDIDATE.minimumBestCtc),
    margin: sample.gates.globalViterbiMargin,
    windowsDistance: sample.gates.totalGeneratedWindows - FROZEN_PROGRESSION_VALIDATION_CANDIDATE.minimumGeneratedWindows,
    frozenCandidate: frozen,
    failedConditions: Object.entries(frozen.conditions).filter(([, passed]) => passed === false).map(([name]) => name),
    progression: {
      resetCount: p.resetCount,
      longestNoProgressRun: p.longestNoProgressRun,
      backwardTransitions: p.backwardTransitionCount,
      monotonicityRatio: p.monotonicityRatio,
      noveltyRatio: p.noveltyRatio,
      revisitRatio: p.revisitRatio,
      progressionEfficiency: p.progressionEfficiency,
      medianCandidateOverlap: p.medianCandidateOverlap,
      maximumCandidateOverlap: p.maximumCandidateOverlap,
      newWordsByCoherentWindow: p.newWordsByCoherentWindow.join(","),
      cumulativeCoverage: p.cumulativeCoverage.join(","),
      distinctCoverage: p.distinctCoverage,
    },
    observations: {
      localAgreementRatio: p.local.agreementRatio,
      localBehindFrontier: p.local.behindFrontierCount,
      localForcedForward: p.local.forcedForwardCount,
      localOtherSurah: trajectory.filter((window) => window.localWinner !== null && !window.localWinner.sameSurah).length,
    },
    coherentSpans: trajectory.map((window) => window.coherent ? `${window.coherent.startAyah}-${window.coherent.endAyah}[${window.coherent.start},${window.coherent.end}]` : "null").join(" "),
    localSpans: trajectory.map((window) => !window.localWinner ? "none"
      : window.localWinner.sameSurah ? `${window.localWinner.startAyah}-${window.localWinner.endAyah}[${window.localWinner.start},${window.localWinner.end}]`
        : `other:${window.localWinner.surah}`).join(" "),
    anchorEvents,
    fastConformer: { outcome: fixture.fastConformerOutcome, proposal: range(fixture.fastConformerProposedRange) },
    identityCorrect: overlaps(fixture.fastConformerProposedRange, expected),
    edgeCorrect: exact(fixture.fastConformerProposedRange, expected),
    whisper: fixture.architectureEvidence.whisperEntered
      ? { entered: true, outcome: fixture.finalOutcome, range: range(fixture.finalProposedRange), exact: fixture.finalOutcome === "accepted" && exact(fixture.finalProposedRange, expected) }
      : { entered: false },
    final: `${fixture.finalOutcome ?? "none"} ${range(fixture.finalProposedRange)} via ${fixture.finalAuthority ?? "none"}`,
    forcedAlignment: fixture.forcedAlignment,
    architectureEvidence: fixture.architectureEvidence,
  };
}

const rows = fixtures.map(caseRow);
const positives = rows.filter((row) => row.role === "positive");
const hardNegatives = rows.filter((row) => row.role === "hard-negative");
const negatives = rows.filter((row) => row.role !== "positive");
const falseNegatives = positives.filter((row) => !row.frozenCandidate.accepted).map((row) => row.id);
const falsePositives = negatives.filter((row) => row.frozenCandidate.accepted).map((row) => row.id);

const lengthBuckets = ([["5-7", 5, 7], ["8-10", 8, 10], ["11-20", 11, 20], ["21+", 21, Number.POSITIVE_INFINITY]] as const).map(([label, minimum, maximum]) => ({
  windows: label,
  cases: rows.filter((row) => row.windows >= minimum && row.windows <= maximum)
    .map((row) => `${row.id} [${row.role}] reset=${row.progression.resetCount} run=${row.progression.longestNoProgressRun} ${row.frozenCandidate.accepted ? "accept" : `reject:${row.frozenCandidate.firstFailedStage}`}`),
}));

// Historical corpus: every committed progression fixture under the same frozen candidate.
const historical = (await fixturesIn<ProgressionTrajectoryFixture>(join(process.cwd(), "tools/regression/fixtures/progression-trajectory"))).map(progressionSampleFromFixture);
const historicalResult = (sample: ProgressionSample) => evaluateFrozenProgressionValidation(sample);
const historicalAccepted = historical.filter((sample) => historicalResult(sample).accepted).map((sample) => sample.id).sort();
const expectedHistoricalAccepted = [
  "positive-alafasy-93-1-11", "positive-alafasy-94-1-8", "positive-hani-3-33-35", "positive-husary-75-1-15",
  "progression-heldout-positive-reader-a-1-1-7-take-b", "validation-positive-reader-a-1-1-7", "validation-positive-reader-a-66-1-7", "validation-positive-reader-b-50-16-18",
];
const historicalNegatives = historical.filter((sample) => sample.sampleClass === "real-negative");
const repeated50 = historicalResult(historical.find((sample) => sample.id === "validation-negative-reader-b-repeated")!);
const originalCorpus = {
  acceptedIds: historicalAccepted,
  acceptedMatchesProgressionMilestone: JSON.stringify(historicalAccepted) === JSON.stringify(expectedHistoricalAccepted),
  realNegativesRejected: `${historicalNegatives.filter((sample) => !historicalResult(sample).accepted).length}/${historicalNegatives.length}`,
  repeated50: { accepted: repeated50.accepted, firstFailedStage: repeated50.firstFailedStage },
  mixedNoncontiguous: historicalResult(historical.find((sample) => sample.id === "mixed-noncontiguous-quran")!).firstFailedStage,
};
const originalCorpusUnchanged = originalCorpus.acceptedMatchesProgressionMilestone
  && historicalNegatives.every((sample) => !historicalResult(sample).accepted)
  && repeated50.firstFailedStage === "progression"
  && originalCorpus.mixedNoncontiguous === "identity-margin";

const criteria = {
  provenanceValid: provenanceErrors.length === 0,
  allDesignationsCaptured: missingCaptures.length === 0,
  atLeastThreePositives: positives.length >= 3,
  atLeastTwoPositiveReaderGroups: new Set(positives.map((row) => row.readerGroup)).size >= 2,
  fastConformerAbstentionPositivePresent: positives.some((row) => row.fastConformer.outcome === "abstained"),
  everyPositivePasses: falseNegatives.length === 0,
  atLeastThreeHardNegatives: hardNegatives.length >= 3,
  atLeastTwoHardNegativesPassExistingSafety: hardNegatives.filter((row) => row.existingSafetyGatesPass).length >= 2,
  everyNegativeRejects: falsePositives.length === 0,
  noRefrainPositiveReset: positives.filter((row) => row.refrainStress).every((row) => row.progression.resetCount === 0),
  originalCorpusUnchanged,
};
const conclusion = !criteria.provenanceValid ? "INVALID VALIDATION CORPUS"
  : falseNegatives.length || falsePositives.length ? "EXTERNAL VALIDATION FAILED"
    : Object.values(criteria).every(Boolean) ? "EXTERNAL VALIDATION PASSED" : "INSUFFICIENT NEW DATA";

process.stdout.write(`${JSON.stringify({
  frozenCandidate: FROZEN_PROGRESSION_VALIDATION_CANDIDATE,
  provenanceErrors,
  missingCaptures,
  positives,
  negatives,
  falseNegatives,
  falsePositives,
  hardNegativesPassingExistingSafety: hardNegatives.filter((row) => row.existingSafetyGatesPass).map((row) => row.id),
  lengthBuckets,
  originalCorpus,
  criteria,
  conclusion,
}, null, 2)}\n`);
