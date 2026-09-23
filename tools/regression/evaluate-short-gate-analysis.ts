#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeCapturedLongPathFeature } from "./multisignal-long-path.ts";
import { computeProgressionFeatures, type ProgressionTrajectoryFixture } from "./progression-trajectory.ts";
import {
  SHORT_GATE_DESIGNATIONS,
  computeLocalEvidence,
  computeLocalWinnerProgression,
  computeShortSupport,
  exactRange,
  windowCountSensitivity,
  type ShortGateFixture,
} from "./short-gate-analysis.ts";

async function fixturesIn<T>(directory: string) {
  return Promise.all((await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8")) as T));
}

const shortFixtures = await fixturesIn<ShortGateFixture>(join(process.cwd(), "tools/regression/fixtures/short-gate"));
const progressionFixtures = await fixturesIn<ProgressionTrajectoryFixture>(join(process.cwd(), "tools/regression/fixtures/progression-trajectory"));
const validationFixtures = await fixturesIn<ProgressionTrajectoryFixture>(join(process.cwd(), "tools/regression/fixtures/progression-validation"));

function row(fixture: ShortGateFixture | ProgressionTrajectoryFixture) {
  const support = computeShortSupport(fixture.trajectory.windows);
  const local = computeLocalEvidence(fixture as ShortGateFixture);
  const coherentProgression = computeProgressionFeatures(fixture.trajectory.windows);
  const localProgression = computeLocalWinnerProgression(fixture as ShortGateFixture);
  const gates = normalizeCapturedLongPathFeature(fixture);
  return {
    id: fixture.id,
    expected: fixture.expected.outcome,
    provenance: fixture.provenance,
    windows: fixture.totalGeneratedWindows,
    coherentWindows: support.coherentWindows,
    coherentRatio: support.coherentRatio,
    longestCoherentRun: support.longestCoherentRun,
    leadingNullWindows: support.leadingNullWindows,
    longestNullRun: support.longestNullRun,
    bestCtc: fixture.bestWindowCtc,
    meanCtc: fixture.coherentPathMeanCtc,
    margin: fixture.margin,
    coverage: fixture.coverage,
    agreement: fixture.usableWindows ? Number((fixture.agreeingWindowCount / fixture.usableWindows).toFixed(6)) : 0,
    unsupportedRun: fixture.longestUnsupportedRun,
    failedRules: fixture.failedAcceptanceRules,
    fastConformerOutcome: fixture.fastConformerOutcome,
    identityCorrect: fixture.expected.surah === null || fixture.fastConformerProposedRange === null ? null
      : fixture.fastConformerProposedRange.surah === fixture.expected.surah,
    exactEdges: exactRange(fixture),
    fixedSafetyGatesPass: gates.fixedSafetyGatesPass,
    local,
    coherentProgression: {
      resetCount: coherentProgression.resetCount,
      longestNoProgressRun: coherentProgression.longestNoProgressRun,
    },
    localProgression: {
      coherentWindows: localProgression.coherentWindowCount,
      backwardTransitions: localProgression.backwardTransitionCount,
      resetCount: localProgression.resetCount,
      longestNoProgressRun: localProgression.longestNoProgressRun,
    },
  };
}

const shortRows = shortFixtures.map(row);
const hFixture = validationFixtures.find((fixture) => fixture.id === "progression-validation-positive-reader-h-91-1-15");
if (!hFixture) throw new Error("Reader H fixture is missing.");
const h = row(hFixture);
const historicalShort = [...progressionFixtures, ...validationFixtures]
  .filter((fixture) => fixture.totalGeneratedWindows >= 3 && fixture.totalGeneratedWindows <= 10)
  .map(row);

const provenanceErrors = shortFixtures.flatMap((fixture) => {
  const designation = SHORT_GATE_DESIGNATIONS.find((entry) => entry.id === fixture.id);
  if (!designation) return [`${fixture.id}: undesignated`];
  const expectedProvenance = designation.corpusRole === "design-support" ? "short-gate-design-support" : "short-gate-held-out";
  return [
    fixture.corpusRole === designation.corpusRole ? null : `${fixture.id}: corpus role mismatch`,
    fixture.expected.outcome === designation.expectedOutcome ? null : `${fixture.id}: outcome mismatch`,
    fixture.provenance === expectedProvenance ? null : `${fixture.id}: provenance mismatch`,
    fixture.readerGroup === designation.readerGroup ? null : `${fixture.id}: reader mismatch`,
  ].filter((value): value is string => value !== null);
});

const designRows = shortRows.filter((item) => item.provenance === "short-gate-design-support");
const heldOutRows = shortRows.filter((item) => item.provenance === "short-gate-held-out");
const localRecoveryProbe = (item: ReturnType<typeof row>, margin: number) => item.windows >= 5 && item.windows <= 9
  && item.coherentWindows >= 4 && item.margin !== null && item.margin >= margin
  && item.localProgression.coherentWindows === item.windows
  && item.localProgression.backwardTransitions === 0
  && item.localProgression.resetCount === 0
  && item.localProgression.longestNoProgressRun <= 1;
const allRows = [...historicalShort, ...shortRows];
const probe8FalsePositives = allRows.filter((item) => item.expected === "negative" && localRecoveryProbe(item, 8)).map((item) => item.id);
const probe8FalseNegatives = allRows.filter((item) => item.expected === "positive" && item.windows >= 5 && item.windows <= 9 && !localRecoveryProbe(item, 8)).map((item) => item.id);

const report = {
  provenanceErrors,
  hExcludedFromCalibration: !SHORT_GATE_DESIGNATIONS.some((entry) => entry.id.includes("reader-h") || entry.sourceRange?.surah === 91),
  corpus: { design: designRows, heldOut: heldOutRows },
  h,
  historicalShort,
  sensitivity: windowCountSensitivity(),
  ruleFamilies: {
    A_shortSupport: {
      result: "REJECT",
      reason: "Absolute support alone admits repetition: H has 4 coherent windows, while the design repeated-partial negative has 5 and historical repeated 93 has 7.",
    },
    B_localEvidenceRecovery: {
      result: "PROMISING BUT INSUFFICIENT",
      margin8FalsePositives: probe8FalsePositives,
      margin8FalseNegatives: probe8FalseNegatives,
      reason: "Ordered all-window local evidence separates retained negatives at margin 8, but it removes both acoustic floors and the only new held-out acoustic failure has a wrong end edge.",
    },
    C_lateLockStartEdge: {
      result: "REJECT",
      reason: "H never activates an anchor, so no retained late-lock event can establish or repair its missing beginning.",
    },
    D_marginConditionedSupport: {
      result: "REJECT",
      reason: "Margin 8 still rejects H; selecting 5 solely to include H would tune against held-out evidence.",
    },
    E_withoutBestCtc: {
      result: "REJECT",
      reason: "The held-out positive has no coherent CTC above -0.823178 and H has none above -0.99144; removing the floor lacks independent acoustic protection.",
    },
  },
  candidate: null,
  conclusion: "NO CANDIDATE",
  missingEvidence: [
    "More independently held-out 5-8-window positives with weak CTC but exact FastConformer edges.",
    "More 5-8-window same-surah repetition/reset negatives that retain plausible margins.",
    "A retained privacy-safe global runner-up table and top-N local candidate ranks for future captures.",
  ],
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
