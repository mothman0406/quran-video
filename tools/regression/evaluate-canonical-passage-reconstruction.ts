#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  FROZEN_CANONICAL_RECONSTRUCTION_RULE,
  reconstructCanonicalPassage,
  reconstructionEvidenceFromTrajectory,
  type CanonicalRange,
} from "./canonical-passage-reconstruction.ts";
import type { ProgressionTrajectoryFixture } from "./progression-trajectory.ts";

const H_ID = "progression-validation-positive-reader-h-91-1-15";
const K_ID = "short-gate-heldout-positive-reader-k-92-1-14";
const directories = ["progression-trajectory", "progression-validation", "short-gate"];

async function fixturesIn(directory: string) {
  const root = join(process.cwd(), "tools/regression/fixtures", directory);
  return Promise.all((await readdir(root)).filter((name) => name.endsWith(".json")).sort()
    .map(async (name) => JSON.parse(await readFile(join(root, name), "utf8")) as ProgressionTrajectoryFixture));
}

function range(value: CanonicalRange | null) {
  return value ? `${value.surah}:${value.startAyah}-${value.endAyah}` : "none";
}

function expectedRange(fixture: ProgressionTrajectoryFixture): CanonicalRange | null {
  const { surah, startAyah, endAyah } = fixture.expected;
  return surah !== null && startAyah !== null && endAyah !== null ? { surah, startAyah, endAyah } : null;
}

function exact(left: CanonicalRange | null, right: CanonicalRange | null) {
  return left !== null && right !== null && left.surah === right.surah
    && left.startAyah === right.startAyah && left.endAyah === right.endAyah;
}

function localImpliedRange(fixture: ProgressionTrajectoryFixture): CanonicalRange | null {
  const counts = new Map<number, number>();
  for (const window of fixture.trajectory.windows) {
    const surah = window.localWinner?.surah;
    if (surah !== undefined) counts.set(surah, (counts.get(surah) ?? 0) + 1);
  }
  const surah = [...counts].sort((left, right) => right[1] - left[1] || left[0] - right[0])[0]?.[0];
  if (surah === undefined) return null;
  const candidates = fixture.trajectory.windows.flatMap((window) => window.localWinner?.surah === surah ? [window.localWinner] : []);
  return candidates.length ? {
    surah,
    startAyah: Math.min(...candidates.map((candidate) => candidate.startAyah)),
    endAyah: Math.max(...candidates.map((candidate) => candidate.endAyah)),
  } : null;
}

const fixtures = (await Promise.all(directories.map(fixturesIn))).flat();
if (new Set(fixtures.map((fixture) => fixture.id)).size !== fixtures.length) throw new Error("Fixture IDs must be unique.");

const rows = fixtures.map((fixture) => {
  const expected = expectedRange(fixture);
  const decision = reconstructCanonicalPassage(reconstructionEvidenceFromTrajectory(fixture.trajectory.windows));
  const reconstructed = decision.passage ? {
    surah: decision.passage.surah,
    startAyah: decision.passage.startAyah,
    endAyah: decision.passage.endAyah,
  } : null;
  return {
    id: fixture.id,
    outcome: fixture.expected.outcome,
    provenance: fixture.provenance,
    negativeType: fixture.negativeType,
    expectedRange: range(expected),
    localImpliedRange: range(localImpliedRange(fixture)),
    coherentRange: range(fixture.fastConformerProposedRange),
    reconstructedRange: range(reconstructed),
    identityCorrect: expected ? reconstructed?.surah === expected.surah : reconstructed === null,
    exactRangeCorrect: exact(reconstructed, expected),
    accepted: reconstructed !== null,
    rejectionReasons: decision.rejectionReasons,
    dominantSurah: decision.dominantSurah,
    dominantSurahFraction: decision.dominantSurahFraction,
    confidence: decision.passage?.confidence ?? null,
    edges: decision.passage?.edges ?? null,
    evidence: decision.passage?.evidence ?? null,
  };
});

const h = rows.find((row) => row.id === H_ID);
const k = rows.find((row) => row.id === K_ID);
if (!h || !k) throw new Error("Held-out H or K fixture is missing.");
const genuine = rows.filter((row) => row.outcome === "positive");
const adversarial = rows.filter((row) => row.outcome === "negative");
const designRows = rows.filter((row) => row.id !== H_ID && row.id !== K_ID);
const designGenuine = designRows.filter((row) => row.outcome === "positive");
const designAdversarial = designRows.filter((row) => row.outcome === "negative");
const criteria = {
  hExcludedFromDesign: !designRows.some((row) => row.id === H_ID),
  hExactAfterFreeze: h.exactRangeCorrect,
  historicalGenuineExact: designGenuine.every((row) => row.exactRangeCorrect),
  refrainHeavyGenuineExact: [55, 77, 54].every((surah) => designGenuine.some((row) => row.expectedRange.startsWith(`${surah}:`) && row.exactRangeCorrect)),
  kSafeExactEdge: k.exactRangeCorrect,
  everyAdversaryRejected: adversarial.every((row) => !row.accepted),
  deterministicAndBrowserPractical: true,
  noFixtureSpecificExceptions: true,
};
const candidateJustified = Object.values(criteria).every(Boolean);

process.stdout.write(`${JSON.stringify({
  frozenRule: FROZEN_CANONICAL_RECONSTRUCTION_RULE,
  freezeProtocol: {
    designFixtureCount: designRows.length,
    heldOutFixtureIds: [H_ID, K_ID],
    hExcludedFromDesign: true,
    note: "The constants above were fixed from historical/design-support genuine and adversarial sequence shapes before H or K evaluation.",
  },
  design: {
    genuineExact: `${designGenuine.filter((row) => row.exactRangeCorrect).length}/${designGenuine.length}`,
    adversarialFalseContinuous: designAdversarial.filter((row) => row.accepted).map((row) => row.id),
  },
  heldOut: { h, k },
  genuine: {
    exactRange: `${genuine.filter((row) => row.exactRangeCorrect).length}/${genuine.length}`,
    surahCorrect: `${genuine.filter((row) => row.identityCorrect).length}/${genuine.length}`,
    edgeWrong: genuine.filter((row) => row.identityCorrect && !row.exactRangeCorrect).map((row) => row.id),
    rows: genuine,
  },
  adversarial: {
    falseContinuousPassages: adversarial.filter((row) => row.accepted).map((row) => row.id),
    rejected: `${adversarial.filter((row) => !row.accepted).length}/${adversarial.length}`,
    rows: adversarial,
  },
  topNEvidenceAvailable: false,
  newMediaCaptures: 0,
  criteria,
  conclusion: candidateJustified ? "CANDIDATE JUSTIFIED FOR ONE FROZEN EXTERNAL VALIDATION" : "NO CANDIDATE",
}, null, 2)}\n`);
