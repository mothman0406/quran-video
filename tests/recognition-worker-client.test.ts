import assert from "node:assert/strict";
import test from "node:test";
import { LocalRecognitionWorkerClient } from "../src/lib/recognition/recognition-worker-client.ts";
import type { RecognitionWorkerRequest, RecognitionWorkerResponse } from "../src/lib/recognition/recognition-worker-protocol.ts";

class FakeWorker {
  onmessage: ((event: MessageEvent<RecognitionWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly calls: Array<{ message: unknown; transfer?: Transferable[] }> = [];
  postMessage(message: unknown, transfer?: Transferable[]) { this.calls.push({ message, transfer }); }
  terminate() { /* test double */ }
  respond(message: RecognitionWorkerResponse) { this.onmessage?.({ data: message } as MessageEvent<RecognitionWorkerResponse>); }
  detachTransferredBuffers(callIndex: number) {
    const call = this.calls[callIndex]!;
    structuredClone(call.message, { transfer: call.transfer });
  }
}

function prepared(jobId: number): RecognitionWorkerResponse {
  return { type: "prepared", jobId, durationMs: 1, audioAnalysis: { sampleRate: 16_000, durationMs: 1, windowMs: 10, rms: [] }, speechRegions: [] };
}

test("worker preparation transfers a disposable PCM copy while retaining caller-owned PCM", async () => {
  let created = 0;
  const worker = new FakeWorker();
  const client = new LocalRecognitionWorkerClient(() => { created += 1; return worker; });
  const authoritativePcm = new Float32Array([1, 2]);
  const preparing = client.prepare(7, 48_000, 2, [authoritativePcm.buffer]);
  assert.equal(worker.calls.length, 1, "the event handler posts work instead of running it synchronously");
  const firstRequest = worker.calls[0]?.message as Extract<RecognitionWorkerRequest, { type: "prepare" }>;
  const firstWorkerBuffer = firstRequest.channelBuffers[0]!;
  assert.notStrictEqual(firstWorkerBuffer, authoritativePcm.buffer);
  assert.deepEqual(Array.from(new Float32Array(firstWorkerBuffer)), [1, 2]);
  assert.deepEqual(worker.calls[0]?.transfer, [firstWorkerBuffer]);
  worker.detachTransferredBuffers(0);
  assert.equal(firstWorkerBuffer.byteLength, 0, "the disposable worker copy may be detached");
  assert.ok(authoritativePcm.buffer.byteLength > 0, "the caller-owned PCM must remain readable");
  assert.deepEqual(Array.from(authoritativePcm), [1, 2]);
  worker.respond(prepared(7));
  await preparing;

  assert.equal(created, 1, "the worker is retained after preparation");
});

test("recovery and retry can dispatch new transferred copies after a prior worker request", async () => {
  const worker = new FakeWorker();
  const client = new LocalRecognitionWorkerClient(() => worker);
  const authoritativePcm = new Float32Array([3, 4]);

  const primary = client.prepare(7, 48_000, 2, [authoritativePcm.buffer]);
  worker.detachTransferredBuffers(0);
  worker.respond(prepared(7));
  await primary;

  const recovery = client.prepare(7, 48_000, 2, [authoritativePcm.buffer]);
  const recoveryRequest = worker.calls[1]?.message as Extract<RecognitionWorkerRequest, { type: "prepare" }>;
  assert.notStrictEqual(recoveryRequest.channelBuffers[0], authoritativePcm.buffer);
  worker.detachTransferredBuffers(1);
  assert.ok(authoritativePcm.buffer.byteLength > 0, "a failed native request cannot poison route-persistent PCM");
  assert.deepEqual(Array.from(authoritativePcm), [3, 4]);
  worker.respond(prepared(7));
  await recovery;

  const retry = client.prepare(8, 48_000, 2, [authoritativePcm.buffer]);
  worker.detachTransferredBuffers(2);
  assert.ok(authoritativePcm.buffer.byteLength > 0, "a completed recovery cannot poison retry PCM");
  worker.respond(prepared(8));
  await retry;
  assert.equal(worker.calls.length, 3);
});

test("native-success path performs one preparation and reuses the worker for later commands", async () => {
  let created = 0;
  const worker = new FakeWorker();
  const client = new LocalRecognitionWorkerClient(() => { created += 1; return worker; });
  const preparing = client.prepare(7, 48_000, 2, [new Float32Array([1, 2]).buffer]);
  worker.respond(prepared(7));
  await preparing;
  let progressReports = 0;
  const identifying = client.identify(7, () => { progressReports += 1; });
  worker.respond({ type: "progress", jobId: 7, progress: { phase: "identifying-passage", completed: 1, total: 2 } });
  worker.respond({ type: "identified", jobId: 7, result: { status: "unavailable", reason: "fixture", span: null, canonicalSpan: null, wordLevelSpan: null, selectedSurah: null, optionalPrelude: null, surahConsensus: { selectedSurah: null, strongWindowCount: 0, agreeingStrongWindows: 0 }, windowResults: [], retrievalCandidates: [], normalizedCtcScore: null, margin: null, continuityScore: 0, globalHypotheses: [], confidence: { composite: null, normalizedBestCtcScore: null, bestVsSecondMargin: null, agreeingWindows: 0, voicedAudioExplained: 0 }, performance: { inferenceMs: 0, retrievalMs: 0, rerankingMs: 0, candidatesReranked: 0, totalMs: 0 }, CROSS_SURAH_CANDIDATES_REJECTED: 0 } });
  await identifying;
  assert.equal(progressReports, 1);
  assert.equal(worker.calls.length, 2, "accepted native recognition does not prepare a recovery PCM pass");
  assert.equal(created, 1, "progress and later commands retain one worker/model owner");
});

test("worker failures reject the active request without leaving it pending", async () => {
  const worker = new FakeWorker();
  const client = new LocalRecognitionWorkerClient(() => worker);
  const pending = client.identify(9);
  worker.respond({ type: "error", jobId: 9, message: "fixture failure" });
  await assert.rejects(pending, /fixture failure/);
});
