import assert from "node:assert/strict";
import test from "node:test";
import { passageIdentificationMetrics } from "../tools/regression/passage-id-metrics.ts";

test("passage metrics distinguish retrieval recall from false confident selection", () => {
  const metrics = passageIdentificationMetrics([
    { id: "one", category: "test", expected: { surah: 70, startAyah: 1, endAyah: 1 } },
    { id: "two", category: "test", expected: { surah: 74, startAyah: 1, endAyah: 2 } },
  ], [
    { id: "one", accepted: true, topCandidates: [{ surah: 32, startAyah: 5, endAyah: 5 }, { surah: 70, startAyah: 1, endAyah: 1 }] },
    { id: "two", accepted: false, topCandidates: [{ surah: 74, startAyah: 1, endAyah: 2 }] },
  ]);
  assert.deepEqual(metrics, { fixtures: 2, observed: 2, exactSurahAccuracy: 0.5, exactStartingAyahAccuracy: 0.5, exactEndingAyahAccuracy: 0.5, top3RetrievalRecall: 1, top5RetrievalRecall: 1, falseConfidentAcceptanceRate: 0.5, abstentionRate: 0.5 });
});
