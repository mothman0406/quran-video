import type {
  LocalTranscriptionResult,
  RecognitionTranscriber,
  TranscriptionProgress,
} from "./transcriber";
import { analyzeMonoPcm } from "./audio-analysis.ts";

export const LOCAL_WHISPER_MODEL = "onnx-community/whisper-base";
export const LOCAL_WHISPER_APPROXIMATE_DOWNLOAD_MB = 145;
const TARGET_SAMPLE_RATE = 16_000;
const CHUNK_SECONDS = 30;
const CHUNK_OVERLAP_SECONDS = 3;

type PipelineOutput = {
  text?: string;
  chunks?: Array<{ text: string; timestamp: [number, number] }>;
};

type Pipeline = (audio: Float32Array, options: Record<string, unknown>) => Promise<PipelineOutput>;

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
  async transcribe(source, onProgress) {
    if (typeof window === "undefined") {
      throw new Error("Local transcription can only run in a browser.");
    }

    const startedAt = performance.now();
    const audio = await decodeAudio(source, onProgress);
    const audioAnalysis = analyzeMonoPcm(audio, TARGET_SAMPLE_RATE);
    const { transcriber, backend } = await createPipeline(supportsWebGpu(), onProgress);
    const audioChunks = splitPcmAudio(audio);
    const transcriptChunks: LocalTranscriptionResult["chunks"] = [];

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
        // Transformers.js supports word timestamps for Whisper.  These are the
        // alignment observations; output chunk windows are never verse timing.
        return_timestamps: "word",
      });
      const timestamped = output.chunks ?? (output.text ? [{ text: output.text, timestamp: [0, chunk.audio.length / TARGET_SAMPLE_RATE] as [number, number] }] : []);
      for (const item of timestamped) {
        const midpoint = (item.timestamp[0] + item.timestamp[1]) / 2;
        if (midpoint < chunk.trimBeforeSeconds) continue;
        const text = item.text.trim();
        const startMs = Math.round((chunk.offsetSeconds + item.timestamp[0]) * 1_000);
        const endMs = Math.round((chunk.offsetSeconds + item.timestamp[1]) * 1_000);
        // A runtime may still return a multi-word span. Keep its timestamp but
        // label it as coarser evidence; normal installations return words.
        transcriptChunks.push({
          text,
          startMs,
          endMs,
          words: text.split(/\s+/).filter(Boolean).length === 1 ? [{ text, startMs, endMs }] : undefined,
        });
      }
    }

    // 30-second windows overlap by three seconds.  Keep the first occurrence
    // of an overlapping word and enforce monotonic timestamps so the logical
    // recording is one transcript rather than independent chunk decisions.
    const stitched = transcriptChunks
      .filter((chunk) => chunk.text)
      .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
      .reduce<LocalTranscriptionResult["chunks"]>((all, chunk) => {
        const prior = all.at(-1);
        const sameWord = prior?.text.trim() === chunk.text.trim();
        const overlaps = prior ? chunk.startMs <= prior.endMs : false;
        if (prior && sameWord && overlaps) return all;
        const startMs = Math.max(prior?.endMs ?? 0, chunk.startMs);
        const endMs = Math.max(startMs, chunk.endMs);
        all.push({
          ...chunk,
          startMs,
          endMs,
          words: chunk.words?.map((word) => ({ ...word, startMs: Math.max(startMs, word.startMs), endMs: Math.max(startMs, word.endMs) })),
        });
        return all;
      }, []);

    onProgress?.({ phase: "transcribing", message: "Local transcription complete.", completed: audioChunks.length, total: audioChunks.length });
    return {
      chunks: stitched,
      rawTranscript: stitched.map((chunk) => chunk.text).join(" "),
      backend,
      durationMs: Math.round(performance.now() - startedAt),
      audioAnalysis,
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
