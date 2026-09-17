import assert from "node:assert/strict";
import test from "node:test";
import { PROTECTED_NEGATIVE_CTC_FIXTURES, REAL_CTC_PATH_FIXTURES } from "../tools/regression/ctc-path-fixtures.ts";
import { evaluateCtcPathStatistics, statisticWouldAccept, type CtcPathStatisticValues } from "../tools/regression/ctc-path-statistics.ts";

test("privacy-safe real CTC fixtures retain the reported chronology, nulls, anchors, and gate metadata", () => {
  const [surah2, surah6, surah20] = REAL_CTC_PATH_FIXTURES;
  assert.deepEqual({ windows: surah2?.scores.length, coherent: surah2?.scores.filter((score) => score !== null).length, anchor: surah2?.anchorActivationIndex, best: Math.max(...surah2!.scores.filter((score): score is number => score !== null)) }, { windows: 19, coherent: 18, anchor: 5, best: -0.168907 });
  assert.deepEqual({ windows: surah6?.scores.length, coherent: surah6?.scores.filter((score) => score !== null).length, anchor: surah6?.anchorActivationIndex, best: Math.max(...surah6!.scores.filter((score): score is number => score !== null)) }, { windows: 11, coherent: 10, anchor: 6, best: -0.207528 });
  assert.deepEqual({ windows: surah20?.scores.length, coherent: surah20?.scores.filter((score) => score !== null).length, anchor: surah20?.anchorActivationIndex, best: Math.max(...surah20!.scores.filter((score): score is number => score !== null)) }, { windows: 5, coherent: 4, anchor: 3, best: -0.540149 });
  assert.deepEqual(REAL_CTC_PATH_FIXTURES.map((fixture) => fixture.metadata.longestUnsupportedRun), [1, 1, 1]);
});

test("all requested robust statistics are deterministic on the retained real-world shapes", () => {
  const results = REAL_CTC_PATH_FIXTURES.map(evaluateCtcPathStatistics);
  assert.deepEqual(results.map((result) => result.arithmeticMean), [-0.8448, -1.177863, -0.837851]);
  assert.deepEqual(results.map((result) => result.median), [-0.646189, -0.726755, -0.640654]);
  assert.deepEqual(results.map((result) => result.postAnchorMean), [-0.592401, -0.813659, -0.574316]);
  assert.deepEqual(results.map((result) => Object.keys(result)), Array.from({ length: 3 }, () => Object.keys(results[0]!) as (keyof CtcPathStatisticValues)[]));
});

test("protected negatives remain enumerated and expose unsafe upper-tail alternatives", () => {
  const expected = ["isolated-strong-window", "three-window-unsupported-gap", "repeated-shared-language", "low-lexical-uniqueness", "low-coverage", "small-global-margin", "wrong-surah-transitions", "backward-jumps", "structurally-invalid-passage", "non-finite-evidence", "short-target-low-capacity", "basmalah-only", "mixed-unrelated-window-matches"];
  assert.deepEqual(PROTECTED_NEGATIVE_CTC_FIXTURES.map((fixture) => fixture.id), expected);
  const isolated = PROTECTED_NEGATIVE_CTC_FIXTURES[0]!;
  const statistics = evaluateCtcPathStatistics(isolated);
  assert.equal(statisticWouldAccept(isolated, statistics.arithmeticMean), false);
  assert.equal(statisticWouldAccept(isolated, statistics.upperQuartile), false);
  assert.equal(statisticWouldAccept(isolated, statistics.top3Mean), false);
  assert.equal(statisticWouldAccept(isolated, statistics.bestPlusSupport), true, "the reference score lands exactly on the old threshold and is not safe without a separately calibrated boundary");
});
