#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { buildNormalizedLongPathCorpus } from "./multisignal-long-path.ts";
import {
  FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS,
  PROGRESSION_RULE_FAMILIES,
  calibrateProgressionThresholds,
  evaluateProgressionCandidate,
  progressionSampleFromFixture,
  progressionSampleWithoutTrajectory,
  type ProgressionCandidateThresholds,
  type ProgressionSample,
} from "./progression-long-path.ts";
import { computeProgressionFeatures, type ProgressionTrajectoryFixture, type TrajectoryWindow } from "./progression-trajectory.ts";

const directory = join(process.cwd(), "tools/regression/fixtures/progression-trajectory");
const fixtures = await Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
  .map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8")) as ProgressionTrajectoryFixture));
const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
const trajectorySamples = fixtures.map(progressionSampleFromFixture);
const legacy = buildNormalizedLongPathCorpus([]).filter((feature) => feature.classification === "known-positive" || feature.classification === "logical-negative")
  .map(progressionSampleWithoutTrajectory);
const all = [...trajectorySamples, ...legacy];
const heldOut = all.filter((sample) => sample.provenance === "progression-held-out");
const designVisible = all.filter((sample) => sample.provenance !== "progression-held-out");
const longPositives = (samples: readonly ProgressionSample[]) => samples.filter((sample) => sample.sampleClass === "long-positive");
const realNegatives = (samples: readonly ProgressionSample[]) => samples.filter((sample) => sample.sampleClass === "real-negative");
const isRepetition = (sample: ProgressionSample) => sample.negativeType?.startsWith("repeated") === true || sample.negativeType === "partial-reset" || sample.negativeType === "alternating-halves";

function round(value: number) {
  return Number(value.toFixed(6));
}

function row(sample: ProgressionSample) {
  const p = sample.progression;
  const fixture = fixtureById.get(sample.id);
  return {
    id: sample.id,
    class: sample.sampleClass,
    provenance: sample.provenance,
    negativeType: sample.negativeType,
    readerGroup: sample.readerGroup,
    windows: sample.gates.totalGeneratedWindows,
    coherentWindows: p?.coherentWindowCount ?? sample.gates.coherentCandidateCount,
    safetyGates: sample.gates.fixedSafetyGatesPass,
    failedSafetyGates: sample.gates.failedSafetyGates,
    margin: sample.gates.globalViterbiMargin,
    bestCtc: sample.gates.bestCoherentCtc,
    fastConformer: fixture ? `${fixture.fastConformerOutcome} ${range(fixture.fastConformerProposedRange)}` : null,
    final: fixture ? `${fixture.finalOutcome ?? "none"} ${range(fixture.finalProposedRange)} via ${fixture.finalAuthority ?? "none"}` : null,
    progression: p ? {
      medianCandidateOverlap: p.medianCandidateOverlap,
      maximumCandidateOverlap: p.maximumCandidateOverlap,
      medianNewWordsPerWindow: p.medianNewWordsPerWindow,
      minimumNewWordsPerWindow: p.minimumNewWordsPerWindow,
      monotonicityRatio: p.monotonicityRatio,
      backwardTransitions: p.backwardTransitionCount,
      backwardRatio: p.backwardRatio,
      resetCount: p.resetCount,
      resetAfterProgress: p.resetAfterProgressCount,
      noveltyRatio: p.noveltyRatio,
      progressionEfficiency: p.progressionEfficiency,
      revisitRatio: p.revisitRatio,
      noProgressWindows: p.noProgressWindowCount,
      longestNoProgressRun: p.longestNoProgressRun,
      distinctCoverage: p.distinctCoverage,
      cumulativeCoverage: p.cumulativeCoverage.join(","),
      localAgreementRatio: p.local.agreementRatio,
      localBehindFrontier: p.local.behindFrontierCount,
      localForcedForward: p.local.forcedForwardCount,
    } : "trajectory-missing",
  };
}

function range(value: { surah: number; startAyah: number; endAyah: number } | null) {
  return value ? `${value.surah}:${value.startAyah}-${value.endAyah}` : "none";
}

function distribution(samples: readonly ProgressionSample[], read: (sample: ProgressionSample) => number | null) {
  const values = samples.flatMap((sample) => {
    const value = sample.progression ? read(sample) : null;
    return value === null ? [] : [value];
  }).sort((left, right) => left - right);
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return { n: values.length, minimum: values[0], median: round(values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2), maximum: values.at(-1), values };
}

const features = {
  resetCount: (sample: ProgressionSample) => sample.progression!.resetCount,
  backwardTransitions: (sample: ProgressionSample) => sample.progression!.backwardTransitionCount,
  backwardRatio: (sample: ProgressionSample) => sample.progression!.backwardRatio,
  noveltyRatio: (sample: ProgressionSample) => sample.progression!.noveltyRatio,
  revisitRatio: (sample: ProgressionSample) => sample.progression!.revisitRatio,
  progressionEfficiency: (sample: ProgressionSample) => sample.progression!.progressionEfficiency,
  longestNoProgressRun: (sample: ProgressionSample) => sample.progression!.longestNoProgressRun,
  medianCandidateOverlap: (sample: ProgressionSample) => sample.progression!.medianCandidateOverlap,
  localBehindFrontier: (sample: ProgressionSample) => sample.progression!.local.behindFrontierCount,
};

function distributions(samples: readonly ProgressionSample[]) {
  const positives = longPositives(samples);
  const repetition = realNegatives(samples).filter(isRepetition);
  const otherNegatives = realNegatives(samples).filter((sample) => !isRepetition(sample));
  return Object.fromEntries(Object.entries(features).map(([name, read]) => [name, {
    longPositives: distribution(positives, read),
    repetitionNegatives: distribution(repetition, read),
    otherRealNegatives: distribution(otherNegatives, read),
  }]));
}

function outcome(samples: readonly ProgressionSample[], thresholds: ProgressionCandidateThresholds) {
  const results = samples.map((sample) => ({ id: sample.id, class: sample.sampleClass, ...evaluateProgressionCandidate(sample, thresholds) }));
  return {
    falseNegatives: results.filter((result) => result.class === "long-positive" && !result.accepted).map((result) => `${result.id} (${result.firstFailedStage})`),
    falsePositives: results.filter((result) => (result.class === "real-negative" || result.class === "logical-negative") && result.accepted).map((result) => result.id),
    results,
  };
}

function familyGrid(samples: readonly ProgressionSample[]) {
  const base = (sample: ProgressionSample) => {
    const result = evaluateProgressionCandidate(sample, { ...FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS, minimumMargin: Number.NEGATIVE_INFINITY });
    return result.conditions.existingSafetyGates && result.conditions.longRecording && result.conditions.bestCtc;
  };
  const scored = samples.filter((sample) => sample.progression !== null && (sample.sampleClass === "long-positive" || sample.sampleClass === "real-negative"));
  const grid = (id: string, accepts: (sample: ProgressionSample) => boolean) => ({
    id,
    falseNegatives: scored.filter((sample) => sample.sampleClass === "long-positive" && !(base(sample) && accepts(sample))).map((sample) => sample.id),
    falsePositives: scored.filter((sample) => sample.sampleClass === "real-negative" && base(sample) && accepts(sample)).map((sample) => sample.id),
  });
  const families = Object.values(PROGRESSION_RULE_FAMILIES).flat().map((family) => grid(family.id, (sample) => family.accepts(sample.progression!)));
  const marginFamily = [5, 7, 8, 9, 10].map((margin) => grid(`E margin>=${margin} reset=0 run<=2`, (sample) => (sample.gates.globalViterbiMargin ?? Number.NEGATIVE_INFINITY) >= margin && sample.progression!.resetCount === 0 && sample.progression!.longestNoProgressRun <= 2));
  const marginAlone = [8].map((margin) => grid(`margin>=${margin} alone`, (sample) => (sample.gates.globalViterbiMargin ?? Number.NEGATIVE_INFINITY) >= margin));
  const staged = [1, 2, 3].map((run) => grid(`G margin>=8 reset=0 run<=${run}`, (sample) => (sample.gates.globalViterbiMargin ?? Number.NEGATIVE_INFINITY) >= 8 && sample.progression!.resetCount === 0 && sample.progression!.longestNoProgressRun <= run));
  return { scope: "design-visible long positives and real negatives with trajectories; base = existing safety + >=5 windows + retained best CTC >= -0.60", rows: [...families, ...marginAlone, ...marginFamily, ...staged] };
}

function leaveOneOut(heldOutSamples: readonly ProgressionSample[], label: string) {
  return heldOutSamples.map((heldOutSample) => {
    const training = designVisible.filter((sample) => sample.id !== heldOutSample.id);
    const thresholds = calibrateProgressionThresholds(longPositives(training), realNegatives(training));
    const result = thresholds ? evaluateProgressionCandidate(heldOutSample, thresholds) : null;
    const expectedAccept = heldOutSample.sampleClass === "long-positive";
    const passed = result !== null && (expectedAccept
      ? result.accepted || result.firstFailedStage === "trajectory-missing"
      : !result.accepted);
    return {
      fold: `${label}:${heldOutSample.id}`,
      thresholds,
      matchesFrozen: thresholds !== null && isDeepStrictEqual(thresholds, { ...FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS }),
      heldOutAccepted: result?.accepted ?? null,
      firstFailedStage: result ? result.firstFailedStage : "calibration-failed",
      distances: result?.distances ?? null,
      foldPassed: passed,
      note: result?.firstFailedStage === "trajectory-missing" ? "non-progression conditions pass; progression not evaluable from retained evidence" : undefined,
    };
  });
}

/** Synthetic repetition of a genuine trajectory, as the solver could represent it. */
function repeatTrajectory(windows: readonly TrajectoryWindow[], copies: number, mode: "reset" | "null") {
  const repeated: TrajectoryWindow[] = [];
  for (let copy = 0; copy < copies; copy += 1) {
    for (const window of windows) {
      repeated.push({ ...window, index: repeated.length, coherent: copy > 0 && mode === "null" ? null : window.coherent });
    }
  }
  return repeated;
}

function lengthAnalysis(samples: readonly ProgressionSample[]) {
  const buckets = [["5-7", 5, 7], ["8-10", 8, 10], ["11-20", 11, 20], ["21+", 21, Number.POSITIVE_INFINITY]] as const;
  const scored = samples.filter((sample) => sample.sampleClass === "long-positive" || sample.sampleClass === "real-negative" || sample.sampleClass === "identity-positive-edge-failure");
  const byBucket = buckets.map(([label, minimum, maximum]) => ({
    windows: label,
    samples: scored.filter((sample) => sample.gates.totalGeneratedWindows >= minimum && sample.gates.totalGeneratedWindows <= maximum).map((sample) => {
      const result = evaluateProgressionCandidate(sample);
      return `${sample.id} [${sample.sampleClass}] ${result.accepted ? "accept" : `reject:${result.firstFailedStage}`}`;
    }),
  }));
  const genuine = fixtureById.get("validation-positive-reader-b-50-16-18")!;
  const synthetic = ([1, 2, 3, 4] as const).flatMap((copies) => (["reset", "null"] as const).map((mode) => {
    const p = computeProgressionFeatures(repeatTrajectory(genuine.trajectory.windows, copies, mode));
    return { copies, mode, windows: p.generatedWindowCount, resetCount: p.resetCount, longestNoProgressRun: p.longestNoProgressRun, noveltyRatio: p.noveltyRatio, progressionPasses: p.resetCount <= FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS.maximumResetCount && p.longestNoProgressRun <= FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS.maximumNoProgressRun };
  }));
  return { byBucket, syntheticRepetitionOfGenuine50: synthetic, note: "Synthetic rows recompute progression only; null-mode copies are additionally rejected in production by coherent-window support and unsupported-run gates." };
}

function whisperExposure(samples: readonly ProgressionSample[]) {
  return samples.flatMap((sample) => {
    const fixture = fixtureById.get(sample.id);
    if (!fixture || fixture.fastConformerOutcome !== "abstained") return [];
    const expectedPositive = fixture.expected.outcome === "positive";
    const finalAccepted = fixture.finalOutcome === "accepted";
    const correct = expectedPositive
      ? finalAccepted && fixture.finalProposedRange?.surah === fixture.expected.surah && fixture.finalProposedRange?.startAyah === fixture.expected.startAyah && fixture.finalProposedRange?.endAyah === fixture.expected.endAyah
      : !finalAccepted;
    const candidate = evaluateProgressionCandidate(sample);
    return [{ id: sample.id, provenance: sample.provenance, expected: fixture.expected.outcome, whisper: `${fixture.finalOutcome ?? "none"} ${range(fixture.finalProposedRange)}`, whisperCorrect: correct, progressionCandidateWouldAccept: candidate.accepted, fastConformerProposal: range(fixture.fastConformerProposedRange) }];
  });
}

const derived = calibrateProgressionThresholds(longPositives(designVisible), realNegatives(designVisible));
const positiveFolds = leaveOneOut(longPositives(designVisible), "leave-one-positive-out");
const repetitionFolds = leaveOneOut(realNegatives(designVisible).filter(isRepetition), "leave-one-repetition-negative-out");
const logical = all.filter((sample) => sample.sampleClass === "logical-negative").map((sample) => {
  const result = evaluateProgressionCandidate(sample);
  return { id: sample.id, rejected: !result.accepted, firstFailedStage: result.firstFailedStage };
});
const heldOutResults = heldOut.map((sample) => {
  const frozen = evaluateProgressionCandidate(sample);
  const withoutSafety = evaluateProgressionCandidate({ ...sample, gates: { ...sample.gates, fixedSafetyGatesPass: true } });
  return {
    ...row(sample),
    frozenCandidate: frozen,
    // Diagnostics only: what the progression stage alone would decide, and the unused local signal.
    progressionStageAloneAccepts: withoutSafety.conditions.noReset === true && withoutSafety.conditions.boundedNoProgressRun === true,
    postHocLocalBehindFrontier: sample.progression?.local.behindFrontierCount ?? null,
  };
});
const heldOutNegatives = heldOutResults.filter((result) => result.class === "real-negative");
const heldOutLongPositives = heldOutResults.filter((result) => result.class === "long-positive");
const heldOutSummary = {
  repetitionNegativesRejected: `${heldOutNegatives.filter((result) => !result.frozenCandidate.accepted).length}/${heldOutNegatives.length}`,
  rejectingStage: Object.fromEntries(heldOutNegatives.map((result) => [result.id, result.frozenCandidate.firstFailedStage])),
  repetitionNegativesInvisibleToProgression: heldOutNegatives.filter((result) => result.progressionStageAloneAccepts).map((result) => result.id),
  longPositivesAccepted: `${heldOutLongPositives.filter((result) => result.frozenCandidate.accepted).length}/${heldOutLongPositives.length}`,
  identityPositivesWithEdgeFailure: heldOutResults.filter((result) => result.class === "identity-positive-edge-failure")
    .map((result) => ({ id: result.id, fastConformer: result.fastConformer, final: result.final, stage: result.frozenCandidate.firstFailedStage, progressionStageAloneAccepts: result.progressionStageAloneAccepts })),
};
const heldOutPassed = heldOutNegatives.length > 0 && heldOutNegatives.every((result) => !result.frozenCandidate.accepted)
  && heldOutLongPositives.length > 0 && heldOutLongPositives.every((result) => result.frozenCandidate.accepted);

const report = {
  frozenThresholds: FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS,
  frozenMatchesDesignCalibration: derived !== null && isDeepStrictEqual(derived, { ...FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS }),
  designVisible: {
    positiveTable: designVisible.filter((sample) => sample.sampleClass !== "real-negative" && sample.sampleClass !== "logical-negative").map(row),
    realNegativeTable: realNegatives(designVisible).map(row),
    distributions: distributions(designVisible),
    families: familyGrid(designVisible),
    frozenCandidate: outcome(designVisible, FROZEN_PROGRESSION_CANDIDATE_THRESHOLDS),
    positiveFolds,
    repetitionFolds,
    logicalNegatives: logical,
  },
  heldOut: { summary: heldOutSummary, results: heldOutResults, passed: heldOutPassed },
  lengthSensitivity: lengthAnalysis(all),
  whisperExposure: whisperExposure(all),
};
const designFrozen = report.designVisible.frozenCandidate;
const conclusion = report.frozenMatchesDesignCalibration
  && !designFrozen.falsePositives.length
  && designFrozen.falseNegatives.every((entry) => entry.endsWith("(trajectory-missing)"))
  && positiveFolds.every((fold) => fold.foldPassed)
  && repetitionFolds.every((fold) => fold.foldPassed)
  && logical.every((entry) => entry.rejected)
  && heldOutPassed
  ? "PROGRESSION CANDIDATE JUSTIFIED FOR FROZEN EXTERNAL VALIDATION"
  : "NO PROGRESSION CANDIDATE";
process.stdout.write(`${JSON.stringify({ ...report, conclusion }, null, 2)}\n`);
