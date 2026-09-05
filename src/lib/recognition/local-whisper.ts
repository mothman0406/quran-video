import type {
  LocalTimingRecoveryResult,
  LocalTranscriptionResult,
  RecognitionTranscriber,
  TranscriptionProgress,
} from "./transcriber";
import { analyzeMonoPcm } from "./audio-analysis.ts";
import { detectLocalSpeechRegions } from "./vad.ts";
import { createCtcShadowRunner } from "./local-ctc.ts";
import { createFastConformerShadowRunner } from "./local-fastconformer.ts";
import type { TranscriptChunk } from "./core";
import type { TimestampValidationDiagnostics } from "./transcriber";

/** This export retains the decoder cross-attentions Transformers.js needs for word timestamps. */
export const LOCAL_WHISPER_MODEL = "onnx-community/whisper-base_timestamped";
// q4 encoder (18.8 MB) + q4 merged decoder (123.7 MB) + tokenizer/config assets.
export const LOCAL_WHISPER_APPROXIMATE_DOWNLOAD_MB = 145;
export const LOCAL_WHISPER_CAPABILITY = {
  modelId: LOCAL_WHISPER_MODEL,
  wordTimestamps: true,
  dtype: "q4",
} as const;
const TARGET_SAMPLE_RATE = 16_000;
const CHUNK_SECONDS = 30;
const CHUNK_OVERLAP_SECONDS = 3;

type PipelineOutput = {
  text?: string;
  chunks?: Array<{ text: string; timestamp: [number, number] }>;
};

type Pipeline = (audio: Float32Array, options: Record<string, unknown>) => Promise<PipelineOutput>;
type TimestampMode = "word" | "chunk-fallback";
type TimestampedUnit = { text: string; timestamp: [number, number] };

function supportsWebGpu() {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

function progressFromDownload(value: {
  status: string;
  file?: string;
  progress?: number;
  loaded?: number;
  total?: number;
}): TranscriptionProgress {
  return {
    phase: "loading-model",
    message: value.status === "ready"
      ? "Model ready."
      : `Downloading ${value.file ?? "model asset"}${value.progress === undefined ? "" : ` (${Math.round(value.progress)}%)`}`,
    bytesLoaded: value.loaded,
    bytesTotal: value.total,
  };
}

async function createPipeline(
  preferWebGpu: boolean,
  onProgress?: (progress: TranscriptionProgress) => void,
): Promise<{ transcriber: Pipeline; backend: "webgpu" | "wasm" }> {
  const { env, pipeline } = await import("@huggingface/transformers");

  // Transformers.js uses the Cache API when it exists. Explicitly retaining the
  // default makes the browser cache policy part of this local-only adapter.
  env.useBrowserCache = typeof caches !== "undefined";
  const options = {
    dtype: "q4" as const,
    progress_callback: (value: {
      status: string;
      file?: string;
      progress?: number;
      loaded?: number;
      total?: number;
    }) => onProgress?.(progressFromDownload(value)),
  };

  if (preferWebGpu) {
    try {
      const transcriber = await pipeline("automatic-speech-recognition", LOCAL_WHISPER_MODEL, {
        ...options,
        device: "webgpu",
      });
      return { transcriber: transcriber as Pipeline, backend: "webgpu" };
    } catch {
      onProgress?.({
        phase: "loading-model",
        message: "WebGPU could not initialize; using the local WASM fallback.",
      });
    }
  }

  const transcriber = await pipeline("automatic-speech-recognition", LOCAL_WHISPER_MODEL, options);
  return { transcriber: transcriber as Pipeline, backend: "wasm" };
}

export function isWordTimestampRuntimeFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cross attentions|output_attentions|token_timestamps/i.test(message);
}

export async function withTimestampFallback<T>(
  runWordTimestamps: () => Promise<T>,
  runChunkTimestamps: () => Promise<T>,
): Promise<{ value: T; timestampMode: TimestampMode; fallbackReason?: string }> {
  try {
    return { value: await runWordTimestamps(), timestampMode: "word" };
  } catch (error) {
    if (!isWordTimestampRuntimeFailure(error)) throw error;
    return {
      value: await runChunkTimestamps(),
      timestampMode: "chunk-fallback",
      fallbackReason: error instanceof Error ? error.message : String(error),
    };
  }
}

export function validateWordTimestamps(
  units: readonly TimestampedUnit[],
  audioDurationMs: number,
): { valid: boolean; diagnostics: TimestampValidationDiagnostics; reason?: string } {
  const nonEmpty = units.filter((item) => item.text.trim());
  const timestamps = nonEmpty.map((item) => item.timestamp);
  const invalid = timestamps.some(([start, end]) =>
    !Number.isFinite(start) || !Number.isFinite(end) || start > end || start < 0 || end * 1_000 > audioDurationMs + 250,
  );
  const regressions = timestamps.some(([start, end], index) => index > 0 && (start < timestamps[index - 1][0] || end < timestamps[index - 1][1]));
  const zeroDurationCount = timestamps.filter(([start, end]) => start === end).length;
  const allIdentical = timestamps.length > 1 && timestamps.every(([start, end]) => start === timestamps[0][0] && end === timestamps[0][1]);
  const diagnostics: TimestampValidationDiagnostics = {
    asrWordCount: nonEmpty.reduce((count, item) => count + item.text.trim().split(/\s+/).filter(Boolean).length, 0),
    timestampedWordCount: timestamps.length,
    zeroDurationCount,
    rangeMs: timestamps.length ? [Math.round(timestamps[0][0] * 1_000), Math.round(timestamps.at(-1)![1] * 1_000)] : null,
  };
  const reason = invalid ? "Word timestamps were missing, non-finite, or outside the recording."
    : regressions ? "Word timestamps regressed after overlap stitching."
    : allIdentical ? "Word timestamps were identical for every recognized word."
    : timestamps.length === 0 ? "The transcriber returned no timestamped words."
    : undefined;
  return { valid: !reason, diagnostics, reason };
}

export function stitchTimestampedChunks(
  chunks: readonly { text: string; startMs: number; endMs: number; words?: Array<{ text: string; startMs: number; endMs: number }> }[],
) {
  return chunks
    .filter((chunk) => chunk.text.trim())
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
    .reduce<typeof chunks[number][]>((all, chunk) => {
      const prior = all.at(-1);
      const sameWord = prior?.text.trim() === chunk.text.trim();
      const overlaps = prior ? chunk.startMs <= prior.endMs : false;
      // The second 30-second window repeats its first three seconds. Keep the
      // first occurrence rather than modifying a valid absolute timestamp.
      if (prior && sameWord && overlaps) return all;
      if (prior && chunk.endMs < prior.endMs) return all;
      all.push(chunk);
      return all;
    }, []);
}

async function decodeAudio(source: File, onProgress?: (progress: TranscriptionProgress) => void) {
  if (typeof AudioContext === "undefined") {
    throw new Error("Audio decoding is unavailable in this browser.");
  }

  onProgress?.({ phase: "decoding", message: "Decoding the selected video locally…" });
  const context = new AudioContext();
  try {
    const audio = await context.decodeAudioData(await source.arrayBuffer());
    const frameCount = Math.ceil(audio.duration * TARGET_SAMPLE_RATE);
    const mono = new Float32Array(frameCount);
    const channels = Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index));

    for (let frame = 0; frame < frameCount; frame += 1) {
      const position = frame * audio.sampleRate / TARGET_SAMPLE_RATE;
      const before = Math.floor(position);
      const after = Math.min(before + 1, audio.length - 1);
      const blend = position - before;
      let sample = 0;
      for (const channel of channels) {
        sample += channel[before] * (1 - blend) + channel[after] * blend;
      }
      mono[frame] = sample / channels.length;
    }
    return mono;
  } catch {
    throw new Error("This browser could not decode the selected video's audio. Try an MP4 or WebM it can play locally.");
  } finally {
    await context.close();
  }
}

export function splitPcmAudio(audio: Float32Array, sampleRate = TARGET_SAMPLE_RATE) {
  const chunkSize = CHUNK_SECONDS * sampleRate;
  const overlapSize = CHUNK_OVERLAP_SECONDS * sampleRate;
  const chunks: Array<{ audio: Float32Array; offsetSeconds: number; trimBeforeSeconds: number }> = [];
  for (let start = 0; start < audio.length; start += chunkSize - overlapSize) {
    const end = Math.min(start + chunkSize, audio.length);
    chunks.push({
      audio: audio.slice(start, end),
      offsetSeconds: start / sampleRate,
      trimBeforeSeconds: start === 0 ? 0 : CHUNK_OVERLAP_SECONDS,
    });
    if (end === audio.length) break;
  }
  return chunks;
}

export const localWhisperTranscriber: RecognitionTranscriber = {
  async transcribe(source, onProgress, requestedRun) {
    if (typeof window === "undefined") {
      throw new Error("Local transcription can only run in a browser.");
    }

    const startedAt = performance.now();
    const audio = await decodeAudio(source, onProgress);
    const run = {
      analysisRunId: requestedRun?.analysisRunId ?? crypto.randomUUID(),
      sourceIdentity: requestedRun?.sourceIdentity ?? `${source.name}:${source.size}:${source.lastModified}`,
      sourceObjectUrl: requestedRun?.sourceObjectUrl ?? null,
      sourceDurationMs: Math.round(audio.length / TARGET_SAMPLE_RATE * 1_000),
      sampleRate: TARGET_SAMPLE_RATE,
      pcmIdentity: crypto.randomUUID(),
    };
    const audioAnalysis = analyzeMonoPcm(audio, TARGET_SAMPLE_RATE);
    onProgress?.({ phase: "detecting-speech", message: "Checking for local human speech with Silero VAD…" });
    let speechRegions;
    try {
      speechRegions = await detectLocalSpeechRegions(audio, TARGET_SAMPLE_RATE);
    } catch (error) {
      throw new Error(`Local speech activity detection could not run: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!speechRegions.length) {
      throw new Error("No credible human speech was detected in this recording, so Quran captions were not timed from background audio.");
    }
    const loadingStartedAt = performance.now();
    const { transcriber, backend } = await createPipeline(supportsWebGpu(), onProgress);
    const modelLoadMs = Math.round(performance.now() - loadingStartedAt);
    const audioChunks = splitPcmAudio(audio);
    const transcriptionStartedAt = performance.now();

    async function runTranscription(timestampMode: TimestampMode) {
      const transcriptChunks: LocalTranscriptionResult["chunks"] = [];
      const returnedUnits: TimestampedUnit[] = [];
      for (const [index, chunk] of audioChunks.entries()) {
        onProgress?.({
          phase: "transcribing",
          message: `Transcribing local audio chunk ${index + 1} of ${audioChunks.length}…`,
          completed: index,
          total: audioChunks.length,
        });
        const output = await transcriber(chunk.audio, {
          language: "arabic",
          task: "transcribe",
          return_timestamps: timestampMode === "word" ? "word" : true,
        });
        const timestamped = output.chunks ?? (output.text ? [{ text: output.text, timestamp: [0, chunk.audio.length / TARGET_SAMPLE_RATE] as [number, number] }] : []);
        for (const item of timestamped) {
          const midpoint = (item.timestamp[0] + item.timestamp[1]) / 2;
          if (midpoint < chunk.trimBeforeSeconds) continue;
          const text = item.text.trim();
          if (!text) continue;
          const startMs = Math.round((chunk.offsetSeconds + item.timestamp[0]) * 1_000);
          const endMs = Math.round((chunk.offsetSeconds + item.timestamp[1]) * 1_000);
          returnedUnits.push({ text, timestamp: [startMs / 1_000, endMs / 1_000] });
          transcriptChunks.push({
            text,
            startMs,
            endMs,
            words: timestampMode === "word" ? [{ text, startMs, endMs }] : undefined,
          });
        }
      }
      const stitched = stitchTimestampedChunks(transcriptChunks);
      return {
        chunks: stitched,
        returnedUnits: timestampMode === "word"
          ? stitched.flatMap((item) => item.words ?? []).map((word) => ({ text: word.text, timestamp: [word.startMs / 1_000, word.endMs / 1_000] as [number, number] }))
          : returnedUnits,
      };
    }

    const initialAttempt = await withTimestampFallback(
      () => runTranscription("word"),
      () => runTranscription("chunk-fallback"),
    );
    let timestampMode = initialAttempt.timestampMode;
    let fallbackReason = initialAttempt.fallbackReason;
    let transcription = initialAttempt.value;
    let validation = validateWordTimestamps(transcription.returnedUnits, Math.round(audio.length / TARGET_SAMPLE_RATE * 1_000));
    if (timestampMode === "word" && !validation.valid) {
      timestampMode = "chunk-fallback";
      fallbackReason = validation.reason;
      transcription = await runTranscription("chunk-fallback");
    }
    if (timestampMode === "chunk-fallback") {
      validation = {
        valid: true,
        diagnostics: {
          asrWordCount: transcription.chunks.reduce((count, chunk) => count + chunk.text.split(/\s+/).filter(Boolean).length, 0),
          timestampedWordCount: 0,
          zeroDurationCount: 0,
          rangeMs: null,
          fallbackReason,
        },
        reason: undefined,
      };
    }

    async function recoverTiming(plan: import("./core").TimingRecoveryPlan, recoveryProgress?: (progress: TranscriptionProgress) => void): Promise<LocalTimingRecoveryResult> {
      if (!plan.required || !plan.windows.length) return { analysisRunId: run.analysisRunId, chunks: [], windowsRun: 0, transcriptionMs: 0 };
      const recoveryStartedAt = performance.now();
      const recovered: TranscriptChunk[] = [];
      for (const [index, window] of plan.windows.entries()) {
        const startFrame = Math.max(0, Math.floor(window.startMs * TARGET_SAMPLE_RATE / 1_000));
        const endFrame = Math.min(audio.length, Math.ceil(window.endMs * TARGET_SAMPLE_RATE / 1_000));
        if (endFrame <= startFrame) continue;
        recoveryProgress?.({
          phase: "transcribing",
          message: `Recovering known Quran timing window ${index + 1} of ${plan.windows.length}…`,
          completed: index,
          total: plan.windows.length,
        });
        const output = await transcriber(audio.slice(startFrame, endFrame), {
          language: "arabic",
          task: "transcribe",
          return_timestamps: timestampMode === "word" ? "word" : true,
        });
        const units = output.chunks ?? (output.text ? [{ text: output.text, timestamp: [0, (endFrame - startFrame) / TARGET_SAMPLE_RATE] as [number, number] }] : []);
        for (const item of units) {
          const text = item.text.trim();
          if (!text) continue;
          const startMs = Math.round(window.startMs + item.timestamp[0] * 1_000);
          const endMs = Math.round(window.startMs + item.timestamp[1] * 1_000);
          recovered.push({
            text,
            startMs,
            endMs: Math.max(startMs + 1, endMs),
            words: timestampMode === "word" ? [{ text, startMs, endMs: Math.max(startMs + 1, endMs) }] : undefined,
            timingSource: "micro-asr",
          });
        }
      }
      recoveryProgress?.({ phase: "transcribing", message: "Known-passage timing recovery complete.", completed: plan.windows.length, total: plan.windows.length });
      return {
        analysisRunId: run.analysisRunId,
        chunks: stitchTimestampedChunks(recovered),
        windowsRun: plan.windows.length,
        transcriptionMs: Math.round(performance.now() - recoveryStartedAt),
      };
    }

    onProgress?.({ phase: "transcribing", message: "Local transcription complete.", completed: audioChunks.length, total: audioChunks.length });
    return {
      run,
      chunks: transcription.chunks,
      rawTranscript: transcription.chunks.map((chunk) => chunk.text).join(" "),
      backend,
      timestampMode,
      timestampValidation: validation.diagnostics,
      modelLoadMs,
      transcriptionMs: Math.round(performance.now() - transcriptionStartedAt),
      durationMs: Math.round(performance.now() - startedAt),
      audioAnalysis,
      speechRegions,
      recoverTiming,
      runCtcShadow: createCtcShadowRunner(audio, speechRegions, run.analysisRunId),
      // The FastConformer experiment is deliberately absent from production
      // runs. It may enrich development diagnostics only.
      runFastConformerShadow: process.env.NODE_ENV !== "production"
        ? createFastConformerShadowRunner(audio, speechRegions, run.analysisRunId)
        : undefined,
    };
  },
};

export function localTranscriptionSupport() {
  if (typeof window === "undefined") return { supported: false, reason: "This check must run in a browser." };
  if (typeof AudioContext === "undefined") return { supported: false, reason: "This browser does not expose AudioContext for local audio decoding." };
  return {
    supported: true,
    webgpu: supportsWebGpu(),
    reason: supportsWebGpu() ? "WebGPU will be tried first; WASM is used if it fails." : "WebGPU is unavailable; local WASM will be used.",
  };
}
