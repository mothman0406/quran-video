/// <reference lib="webworker" />

import { analyzeMonoPcm } from "./audio-analysis.ts";
import { createFastConformerIdentificationRunner, createFastConformerRunner } from "./local-fastconformer.ts";
import type { RecognitionWorkerRequest, RecognitionWorkerResponse } from "./recognition-worker-protocol.ts";
import { detectLocalSpeechRegions } from "./vad.ts";

const TARGET_SAMPLE_RATE = 16_000;
type PreparedJob = { audio: Float32Array; speechRegions: Awaited<ReturnType<typeof detectLocalSpeechRegions>>; audioAnalysis: ReturnType<typeof analyzeMonoPcm> };
const jobs = new Map<number, PreparedJob>();
const cancelled = new Set<number>();
let workQueue = Promise.resolve();

function post(message: RecognitionWorkerResponse) {
  self.postMessage(message);
}

function resampleAndMix(channelBuffers: readonly ArrayBuffer[], sourceSampleRate: number, frameCount: number) {
  const channels = channelBuffers.map((buffer) => new Float32Array(buffer));
  if (!channels.length || !frameCount) return new Float32Array();
  const output = new Float32Array(Math.ceil(frameCount * TARGET_SAMPLE_RATE / sourceSampleRate));
  for (let frame = 0; frame < output.length; frame += 1) {
    const position = frame * sourceSampleRate / TARGET_SAMPLE_RATE;
    const before = Math.floor(position);
    const after = Math.min(before + 1, frameCount - 1);
    const blend = position - before;
    let sample = 0;
    for (const channel of channels) sample += (channel[before] ?? 0) * (1 - blend) + (channel[after] ?? 0) * blend;
    output[frame] = sample / channels.length;
  }
  return output;
}

async function prepare(message: Extract<RecognitionWorkerRequest, { type: "prepare" }>) {
  const audio = resampleAndMix(message.channelBuffers, message.sourceSampleRate, message.frameCount);
  const audioAnalysis = analyzeMonoPcm(audio, TARGET_SAMPLE_RATE);
  const speechRegions = await detectLocalSpeechRegions(audio, TARGET_SAMPLE_RATE);
  if (cancelled.has(message.jobId)) return;
  jobs.set(message.jobId, { audio, audioAnalysis, speechRegions });
  post({ type: "prepared", jobId: message.jobId, audioAnalysis, speechRegions, durationMs: audioAnalysis.durationMs });
}

async function identify(jobId: number) {
  const job = jobs.get(jobId);
  if (!job) throw new Error("Recognition audio is no longer available.");
  const result = await createFastConformerIdentificationRunner(job.audio, job.speechRegions)((progress) => {
    if (!cancelled.has(jobId)) post({ type: "progress", jobId, progress });
  });
  if (!cancelled.has(jobId)) post({ type: "identified", jobId, result });
}

function copyPcm(jobId: number) {
  const job = jobs.get(jobId);
  if (!job) throw new Error("Recognition audio is no longer available.");
  const buffer = job.audio.slice().buffer;
  self.postMessage({ type: "pcm", jobId, buffer } satisfies RecognitionWorkerResponse, [buffer]);
}

async function align(message: Extract<RecognitionWorkerRequest, { type: "align" }>) {
  const job = jobs.get(message.jobId);
  if (!job) throw new Error("Recognition audio is no longer available.");
  const result = await createFastConformerRunner(job.audio, job.speechRegions, message.analysisRunId)(message.verses, message.matches, (progress) => {
    if (!cancelled.has(message.jobId)) post({ type: "progress", jobId: message.jobId, progress });
  });
  if (!cancelled.has(message.jobId)) post({ type: "aligned", jobId: message.jobId, result });
}

self.onmessage = (event: MessageEvent<RecognitionWorkerRequest>) => {
  const message = event.data;
  if (message.type === "cancel" || message.type === "release") {
    cancelled.add(message.jobId);
    jobs.delete(message.jobId);
    return;
  }
  cancelled.delete(message.jobId);
  // A single FIFO queue prevents two source changes from running the same
  // retained ORT session concurrently. Cancellation still takes effect between
  // awaited browser/ORT operations; an already-running inference may finish.
  workQueue = workQueue.then(async () => {
    if (cancelled.has(message.jobId)) return;
    if (message.type === "prepare") await prepare(message);
    else if (message.type === "identify") await identify(message.jobId);
    else if (message.type === "copy-pcm") copyPcm(message.jobId);
    else if (message.type === "align") await align(message);
  }).catch((error: unknown) => {
    if (!cancelled.has(message.jobId)) post({ type: "error", jobId: message.jobId, message: error instanceof Error ? error.message : "Local recognition worker failed." });
  });
};
