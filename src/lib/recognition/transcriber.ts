import type { TranscriptChunk } from "./core";
import type { AudioAnalysis } from "./audio-analysis.ts";
import type { VadSpeechRegion } from "./speech-regions.ts";
import type { FastConformerIdentificationRunner, FastConformerRunner } from "./local-fastconformer.ts";

/** The boundary used by recognition clients; implementations never receive a server URL. */
export type RecognitionTranscriber = {
  transcribe(
    source: File,
    onProgress?: (progress: TranscriptionProgress) => void,
    run?: RecognitionRunSnapshot,
  ): Promise<LocalTranscriptionResult>;
};

/** Immutable identity carried by every asynchronous recognition product. */
export type RecognitionRunSnapshot = {
  analysisRunId: string;
  sourceIdentity: string;
  sourceObjectUrl: string | null;
};

export type TranscriptionProgress = {
  phase: "decoding" | "detecting-speech" | "loading-model" | "transcribing";
  message: string;
  completed?: number;
  total?: number;
  bytesLoaded?: number;
  bytesTotal?: number;
};

export type LocalTranscriptionResult = {
  run: RecognitionRunSnapshot & {
    sourceDurationMs: number;
    sampleRate: number;
    pcmIdentity: string;
  };
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
  /** Silero VAD regions in absolute source-video time. */
  speechRegions: VadSpeechRegion[];
  /** Known-passage FastConformer timing run. Passage identity remains owned by
   * the existing Whisper matcher; successful output is the sole timing input. */
  runFastConformer?: FastConformerRunner;
  /** Quran-wide CTC identification, retained exclusively as shadow evidence. */
  runFastConformerIdentification?: FastConformerIdentificationRunner;
};

export type TimestampValidationDiagnostics = {
  asrWordCount: number;
  timestampedWordCount: number;
  zeroDurationCount: number;
  rangeMs: [number, number] | null;
  fallbackReason?: string;
};
