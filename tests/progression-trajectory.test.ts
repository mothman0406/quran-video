import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import {
  computeProgressionFeatures,
  extractTrajectoryWindows,
  type TrajectoryLocalWinner,
  type TrajectoryWindow,
} from "../tools/regression/progression-trajectory.ts";

function windows(spans: ReadonlyArray<readonly [number, number] | null>, locals: ReadonlyArray<readonly [number, number] | null> = []): TrajectoryWindow[] {
  return spans.map((span, index) => {
    const local = locals[index];
    const localWinner: TrajectoryLocalWinner | null = local ? { surah: 1, startAyah: 1, endAyah: 1, sameSurah: true, start: local[0], end: local[1], ctc: -0.3 } : null;
    return {
      index,
      coherent: span ? { surah: 1, startAyah: 1, endAyah: 1, start: span[0], end: span[1], ctc: -0.3, origins: ["global"] } : null,
      localWinner,
      anchorEvent: "anchor-advanced",
    };
  });
}

test("normal 50% overlapping forward windows are progression, not repetition", () => {
  const features = computeProgressionFeatures(windows([[0, 9], [5, 14], [10, 19], [15, 24], [20, 24]]));
  assert.equal(features.resetCount, 0);
  assert.equal(features.backwardTransitionCount, 0);
  assert.equal(features.monotonicityRatio, 1);
  assert.equal(features.medianCandidateOverlap, 0.5);
  assert.deepEqual(features.newWordsByCoherentWindow, [10, 5, 5, 5, 0]);
  assert.equal(features.noveltyRatio, Number((25 / 45).toFixed(6)));
  assert.equal(features.progressionEfficiency, 1);
  // Only the tail window re-covers the recitation end.
  assert.equal(features.longestNoProgressRun, 1);
  assert.deepEqual(features.cumulativeCoverage, [10, 15, 20, 25, 25]);
});

test("a return behind the previous candidate after progress is a reset", () => {
  const features = computeProgressionFeatures(windows([[0, 9], [5, 14], [10, 19], [0, 9], [5, 14], [10, 19]]));
  assert.equal(features.resetCount, 1);
  assert.equal(features.resetAfterProgressCount, 1);
  assert.equal(features.backwardTransitionCount, 1);
  assert.equal(features.longestNoProgressRun, 3);
  assert.equal(features.revisitRatio, 0.6);
  assert.ok(features.progressionEfficiency! < 0.5);
  assert.ok(features.noveltyRatio! < 0.35);
});

test("backward movement that still overlaps is backward but not a reset", () => {
  const features = computeProgressionFeatures(windows([[10, 19], [6, 19]]));
  assert.equal(features.backwardTransitionCount, 1);
  assert.equal(features.resetCount, 0);
  assert.equal(features.transitions[0]!.deltaStart, -4);
});

test("span widening within the solver's two-word tolerance stays forward-consistent", () => {
  const features = computeProgressionFeatures(windows([[10, 15], [8, 25]]));
  assert.equal(features.backwardTransitionCount, 0);
  assert.equal(features.monotonicityRatio, 1);
  assert.equal(features.transitions[0]!.candidateOverlap, Number((6 / 18).toFixed(6)));
  assert.equal(features.newWordsByCoherentWindow[1], 12);
});

test("repeated identical spans have low novelty and a growing no-progress run", () => {
  const features = computeProgressionFeatures(windows([[0, 1], [0, 1], [0, 1], [0, 1], [0, 1]]));
  assert.equal(features.noveltyRatio, 0.2);
  assert.equal(features.noProgressWindowCount, 4);
  assert.equal(features.longestNoProgressRun, 4);
  assert.equal(features.revisitRatio, 1);
  assert.equal(features.progressionEfficiency, null);
});

test("null windows carry coverage forward and are transparent to no-progress runs", () => {
  const features = computeProgressionFeatures(windows([[0, 9], null, [0, 9], null, [0, 9], [10, 14]]));
  assert.deepEqual(features.cumulativeCoverage, [10, 10, 10, 10, 10, 15]);
  assert.equal(features.coherentWindowCount, 4);
  assert.equal(features.longestNoProgressRun, 2);
  assert.equal(features.transitions.length, 3);
});

test("local winners behind the coherent frontier expose forced-forward reinterpretation", () => {
  const features = computeProgressionFeatures(windows(
    [[0, 9], [5, 14], [10, 19], [15, 24]],
    [[0, 9], [5, 14], [0, 1], [2, 6]],
  ));
  assert.equal(features.local.behindFrontierCount, 2);
  assert.equal(features.local.forcedForwardCount, 2);
  assert.equal(features.local.agreeingWindowCount, 2);
  assert.equal(features.local.agreementRatio, 0.5);
});

const prefix = "[Quran AutoCaption debug]";
function position(ayah: number, globalWordIndex: number) {
  return { surah: 50, ayah, canonicalWordIndex: 1, globalWordIndex };
}

test("trajectory extraction keeps only relative coordinates from the latest run", () => {
  const log = [
    `${prefix} build-marker {"build":"old"}`,
    `${prefix} ctc-gate-input ${JSON.stringify({ windowIndex: 0, coherentPathCandidate: { start: position(1, 9000), end: position(1, 9001), normalizedCtcScore: -0.1, origins: [] } })}`,
    `${prefix} build-marker {"build":"new"}`,
    `${prefix} ctc-gate-input ${JSON.stringify({ windowIndex: 0, coherentPathCandidate: { start: position(16, 66917), end: position(16, 66922), normalizedCtcScore: -0.25, origins: ["global"] }, independentWindowWinner: { start: position(16, 66916), end: position(16, 66922), normalizedCtcScore: -0.15 } })}`,
    `${prefix} ctc-gate-input ${JSON.stringify({ windowIndex: 1, coherentPathCandidate: null, independentWindowWinner: { start: { surah: 3, ayah: 98, canonicalWordIndex: 1, globalWordIndex: 7805 }, end: { surah: 3, ayah: 98, canonicalWordIndex: 6, globalWordIndex: 7810 }, normalizedCtcScore: -0.4 } })}`,
    `${prefix} fastconformer-window-result ${JSON.stringify({ index: 0, continuation: { event: "anchor-activated" } })}`,
  ].join("\n");
  const trajectory = extractTrajectoryWindows(log);
  assert.equal(trajectory.length, 2);
  assert.deepEqual(trajectory[0]!.coherent, { surah: 50, startAyah: 16, endAyah: 16, start: 0, end: 5, ctc: -0.25, origins: ["global"] });
  assert.deepEqual(trajectory[0]!.localWinner, { surah: 50, startAyah: 16, endAyah: 16, sameSurah: true, start: -1, end: 5, ctc: -0.15 });
  assert.equal(trajectory[0]!.anchorEvent, "anchor-activated");
  assert.equal(trajectory[1]!.coherent, null);
  assert.deepEqual(trajectory[1]!.localWinner, { surah: 3, startAyah: 98, endAyah: 98, sameSurah: false, start: null, end: null, ctc: -0.4 });
  assert.equal(JSON.stringify(trajectory).includes("66917"), false);
});

test("progression fixtures retain only privacy-safe relative trajectory evidence", async () => {
  const directory = join(process.cwd(), "tools/regression/fixtures/progression-trajectory");
  const fixtures = await Promise.all((await readdir(directory)).sort().map(async (name) => JSON.parse(await readFile(join(directory, name), "utf8"))));
  assert.ok(fixtures.length >= 18);
  const serialized = JSON.stringify(fixtures).toLowerCase();
  for (const forbidden of ["filename", "filepath", "sourcepath", "transcript", "sha256", "qurantext", "/users/", "device", "remoteaddress", "useragent", "globalwordindex", "canonicalwordindex", ".mp3", ".wav", ".m4a"]) {
    assert.equal(serialized.includes(forbidden), false, `progression fixture unexpectedly contains ${forbidden}`);
  }
  for (const fixture of fixtures) {
    assert.equal(fixture.trajectory.coordinateOrigin, "minimum-coherent-start");
    const starts = fixture.trajectory.windows.flatMap((window: TrajectoryWindow) => window.coherent ? [window.coherent.start] : []);
    if (starts.length) assert.equal(Math.min(...starts), 0, `${fixture.id} coordinates are not relative`);
    assert.ok(["design", "external-validation", "progression-design-support", "progression-held-out"].includes(fixture.provenance));
  }
});
