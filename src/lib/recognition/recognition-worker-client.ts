import type { AudioAnalysis } from "./audio-analysis.ts";
import type { QuranCorpusVerse } from "./core.ts";
import type { FastConformerProgress } from "./contracts.ts";
import type { FastConformerResult } from "./local-fastconformer.ts";
import type { FastConformerIdentificationResult } from "./fastconformer-identification.ts";
import type { RecognitionWorkerRequest, RecognitionWorkerResponse } from "./recognition-worker-protocol.ts";
import type { VadSpeechRegion } from "./speech-regions.ts";

type WorkerLike = {
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
  terminate: () => void;
  onmessage: ((event: MessageEvent<RecognitionWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};
type WorkerFactory = () => WorkerLike;
type Pending = { resolve: (value: unknown) => void; reject: (reason: Error) => void; expected: RecognitionWorkerResponse["type"]; onProgress?: (progress: FastConformerProgress) => void };

export class RecognitionJobCancelledError extends Error {
  constructor() { super("Recognition job was cancelled."); }
}

/** One dedicated worker retains the pinned WASM session between runs. */
export class LocalRecognitionWorkerClient {
  private readonly worker: WorkerLike;
  private readonly pending = new Map<number, Pending>();

  constructor(factory: WorkerFactory = () => new Worker(new URL("./recognition-worker.ts", import.meta.url)) as unknown as WorkerLike) {
    this.worker = factory();
    this.worker.onmessage = (event) => this.handleMessage(event.data);
    this.worker.onerror = () => this.failAll(new Error("Local recognition worker stopped unexpectedly. Please retry."));
  }

  prepare(jobId: number, sourceSampleRate: number, frameCount: number, channelBuffers: ArrayBuffer[]) {
    return this.request<{ audioAnalysis: AudioAnalysis; speechRegions: VadSpeechRegion[]; durationMs: number }>(
      { type: "prepare", jobId, sourceSampleRate, frameCount, channelBuffers }, "prepared", channelBuffers,
    );
  }

  identify(jobId: number, onProgress?: (progress: FastConformerProgress) => void) {
    return this.request<FastConformerIdentificationResult>({ type: "identify", jobId }, "identified", [], onProgress);
  }

  copyPcm(jobId: number) {
    return this.request<Float32Array>({ type: "copy-pcm", jobId }, "pcm", []);
  }

  align(jobId: number, verses: QuranCorpusVerse[], matches: Array<{ startMs: number; endMs: number }>, analysisRunId: string, onProgress?: (progress: FastConformerProgress) => void) {
    return this.request<FastConformerResult>({ type: "align", jobId, verses, matches, analysisRunId }, "aligned", [], onProgress);
  }

  cancel(jobId: number) {
    this.pending.get(jobId)?.reject(new RecognitionJobCancelledError());
    this.pending.delete(jobId);
    this.worker.postMessage({ type: "cancel", jobId } satisfies RecognitionWorkerRequest);
  }

  release(jobId: number) {
    this.pending.delete(jobId);
    this.worker.postMessage({ type: "release", jobId } satisfies RecognitionWorkerRequest);
  }

  terminate() { this.failAll(new Error("Local recognition worker was disposed.")); this.worker.terminate(); }

  private request<T>(message: RecognitionWorkerRequest, expected: Pending["expected"], transfer: Transferable[], onProgress?: (progress: FastConformerProgress) => void): Promise<T> {
    if (this.pending.has(message.jobId)) return Promise.reject(new Error("Recognition worker already has a request for this job."));
    return new Promise<T>((resolve, reject) => {
      this.pending.set(message.jobId, { resolve: resolve as (value: unknown) => void, reject, expected, onProgress });
      this.worker.postMessage(message, transfer);
    });
  }

  private handleMessage(message: RecognitionWorkerResponse) {
    const pending = this.pending.get(message.jobId);
    if (!pending) return;
    if (message.type === "progress") { pending.onProgress?.(message.progress); return; }
    if (message.type === "error") { this.pending.delete(message.jobId); pending.reject(new Error(message.message)); return; }
    if (message.type !== pending.expected) return;
    this.pending.delete(message.jobId);
    if (message.type === "prepared") pending.resolve({ audioAnalysis: message.audioAnalysis, speechRegions: message.speechRegions, durationMs: message.durationMs });
    else if (message.type === "identified") pending.resolve(message.result);
    else if (message.type === "pcm") pending.resolve(new Float32Array(message.buffer));
    else pending.resolve(message.result);
  }

  private failAll(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }
}
