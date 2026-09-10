import assert from "node:assert/strict";
import test from "node:test";
import { LocalRecognitionWorkerClient } from "../src/lib/recognition/recognition-worker-client.ts";
import type { RecognitionWorkerResponse } from "../src/lib/recognition/recognition-worker-protocol.ts";

class FakeWorker {
  onmessage: ((event: MessageEvent<RecognitionWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly calls: Array<{ message: unknown; transfer?: Transferable[] }> = [];
  postMessage(message: unknown, transfer?: Transferable[]) { this.calls.push({ message, transfer }); }
  terminate() { /* test double */ }
  respond(message: RecognitionWorkerResponse) { this.onmessage?.({ data: message } as MessageEvent<RecognitionWorkerResponse>); }
}

test("worker preparation returns immediately, transfers buffers, and the worker is reused", async () => {
  let created = 0;
  const worker = new FakeWorker();
  const client = new LocalRecognitionWorkerClient(() => { created += 1; return worker; });
  const buffer = new Float32Array([1, 2]).buffer;
  const preparing = client.prepare(7, 48_000, 2, [buffer]);
  assert.equal(worker.calls.length, 1, "the event handler posts work instead of running it synchronously");
  assert.deepEqual(worker.calls[0]?.transfer, [buffer]);
  worker.respond({ type: "prepared", jobId: 7, durationMs: 1, audioAnalysis: { sampleRate: 16_000, durationMs: 1, windowMs: 10, rms: [] }, speechRegions: [] });
  await preparing;
  let progressReports = 0;
  const identifying = client.identify(7, () => { progressReports += 1; });
  worker.respond({ type: "progress", jobId: 7, progress: { phase: "identifying-passage", completed: 1, total: 2 } });
  worker.respond({ type: "identified", jobId: 7, result: { status: "unavailable", reason: "fixture", span: null, canonicalSpan: null, wordLevelSpan: null, selectedSurah: null, optionalPrelude: null, surahConsensus: { selectedSurah: null, strongWindowCount: 0, agreeingStrongWindows: 0 }, windowResults: [], retrievalCandidates: [], normalizedCtcScore: null, margin: null, continuityScore: 0, globalHypotheses: [], confidence: { composite: null, normalizedBestCtcScore: null, bestVsSecondMargin: null, agreeingWindows: 0, voicedAudioExplained: 0 }, performance: { inferenceMs: 0, retrievalMs: 0, rerankingMs: 0, candidatesReranked: 0, totalMs: 0 }, CROSS_SURAH_CANDIDATES_REJECTED: 0 } });
  await identifying;
  assert.equal(progressReports, 1);
  assert.equal(created, 1, "progress and later commands retain one worker/model owner");
});

test("worker failures reject the active request without leaving it pending", async () => {
  const worker = new FakeWorker();
  const client = new LocalRecognitionWorkerClient(() => worker);
  const pending = client.identify(9);
  worker.respond({ type: "error", jobId: 9, message: "fixture failure" });
  await assert.rejects(pending, /fixture failure/);
});
