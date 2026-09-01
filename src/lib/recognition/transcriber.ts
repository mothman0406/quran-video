import type { TranscriptChunk } from "./core";
import type { AudioAnalysis } from "./audio-analysis.ts";

/** The boundary used by recognition clients; implementations never receive a server URL. */
export type RecognitionTranscriber = {
  transcribe(
    source: File,
    onProgress?: (progress: TranscriptionProgress) => void,
  ): Promise<LocalTranscriptionResult>;
};

export type TranscriptionProgress = {
  phase: "decoding" | "loading-model" | "transcribing";
  message: string;
  completed?: number;
  total?: number;
  bytesLoaded?: number;
  bytesTotal?: number;
};

export type LocalTranscriptionResult = {
  chunks: TranscriptChunk[];
  rawTranscript: string;
  backend: "webgpu" | "wasm";
  timestampMode: "word" | "chunk-fallback";
  timestampValidation: TimestampValidationDiagnostics;
  /** Time spent loading the locally cached/downloaded model. */
  modelLoadMs: number;
  /** Time spent in ASR calls, excluding decoding and model loading. */
  transcriptionMs: number;
  durationMs: number;
  /** Local 10 ms PCM energy envelope, retained only for this recognition job. */
  audioAnalysis: AudioAnalysis;
};

export type TimestampValidationDiagnostics = {
  asrWordCount: number;
  timestampedWordCount: number;
  zeroDurationCount: number;
  rangeMs: [number, number] | null;
  fallbackReason?: string;
};
