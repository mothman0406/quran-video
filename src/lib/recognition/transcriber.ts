import type { TranscriptChunk } from "./core";

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
  durationMs: number;
};
