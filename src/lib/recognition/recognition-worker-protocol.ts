import type { AudioAnalysis } from "./audio-analysis.ts";
import type { QuranCorpusVerse } from "./core.ts";
import type { FastConformerProgress } from "./contracts.ts";
import type { FastConformerResult } from "./local-fastconformer.ts";
import type { FastConformerIdentificationResult } from "./fastconformer-identification.ts";
import type { VadSpeechRegion } from "./speech-regions.ts";

export type RecognitionWorkerRequest =
  | { type: "prepare"; jobId: number; sourceSampleRate: number; frameCount: number; channelBuffers: ArrayBuffer[] }
  | { type: "identify"; jobId: number }
  | { type: "copy-pcm"; jobId: number }
  | { type: "align"; jobId: number; verses: QuranCorpusVerse[]; matches: Array<{ startMs: number; endMs: number }>; analysisRunId: string }
  | { type: "release" | "cancel"; jobId: number };

export type RecognitionWorkerResponse =
  | { type: "prepared"; jobId: number; audioAnalysis: AudioAnalysis; speechRegions: VadSpeechRegion[]; durationMs: number }
  | { type: "identified"; jobId: number; result: FastConformerIdentificationResult }
  | { type: "pcm"; jobId: number; buffer: ArrayBuffer }
  | { type: "aligned"; jobId: number; result: FastConformerResult }
  | { type: "progress"; jobId: number; progress: FastConformerProgress }
  | { type: "error"; jobId: number; message: string };
