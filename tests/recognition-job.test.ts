import assert from "node:assert/strict";
import test from "node:test";
import { RecognitionJobController } from "../src/lib/editor/recognition-job.ts";

test("visibility reconciliation preserves the one active recognition job", () => {
  const jobs = new RecognitionJobController();
  const job = jobs.start("asset:a")!;
  jobs.update(job.id, "processing");
  const hidden = jobs.reconcileVisibility();
  const visible = jobs.reconcileVisibility();
  assert.deepEqual(hidden, { id: job.id, sourceIdentity: "asset:a", phase: "processing" });
  assert.deepEqual(visible, hidden, "visible must not start a duplicate job");
  assert.equal(jobs.start("asset:a"), null);
  jobs.update(job.id, "completed");
  assert.equal(jobs.reconcileVisibility()?.phase, "completed", "completion while hidden remains reconcilable");
});

test("source replacement and explicit cancellation invalidate stale completions", () => {
  const jobs = new RecognitionJobController();
  const first = jobs.start("asset:a")!;
  jobs.update(first.id, "processing");
  jobs.invalidateSource();
  const second = jobs.start("asset:b")!;
  assert.ok(second.id > first.id);
  assert.equal(jobs.update(first.id, "completed"), null, "old media cannot overwrite a newer source");
  assert.equal(jobs.cancel(second.id)?.phase, "cancelled");
  assert.equal(jobs.snapshot()?.phase, "cancelled");
});
