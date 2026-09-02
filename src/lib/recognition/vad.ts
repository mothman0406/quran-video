/**
 * Browser-local Silero VAD adapter. This intentionally has no energy-based
 * fallback: a waveform with music, room tone, or other background sound is
 * not evidence that someone is reciting.
 */
import { smoothVadSpeechRegions, type VadSpeechRegion } from "./speech-regions.ts";

export type { VadSpeechRegion } from "./speech-regions.ts";

export const VAD_ASSET_BASE = "/ort/";
export const VAD_WASM_URL = `${VAD_ASSET_BASE}ort-wasm-simd-threaded.jsep.wasm`;
export const VAD_WASM_MODULE_URL = `${VAD_ASSET_BASE}ort-wasm-simd-threaded.jsep.mjs`;
export const SILERO_MODEL_URL = `${VAD_ASSET_BASE}silero_vad_legacy.onnx`;
const FRAME_MS = 96;
const POSITIVE_SPEECH_THRESHOLD = 0.45;
const NEGATIVE_SPEECH_THRESHOLD = 0.3;
const MIN_SPEECH_MS = 320;

type FrameProbability = { startMs: number; endMs: number; speech: number };

type VadOrt = {
  env: {
    wasm: {
      wasmPaths?: string | { wasm?: string | URL; mjs?: string | URL };
      numThreads?: number;
    };
    versions?: { common?: string };
  };
};

export function configureVadRuntime(ort: VadOrt): void {
  ort.env.wasm.wasmPaths = { wasm: VAD_WASM_URL, mjs: VAD_WASM_MODULE_URL };
  ort.env.wasm.numThreads = 1;
}

type VadRuntime = {
  vad: {
    frameProcessor: {
      process: (frame: Float32Array, handleEvent: (event: unknown) => void) => Promise<void>;
    };
    run: (audio: Float32Array, sampleRate: number) => AsyncGenerator<{ start: number; end: number }>;
  };
  ortVersion: string;
  setFrameObserver: (observer: (speech: number) => void) => void;
};

let vadRuntimePromise: Promise<VadRuntime> | null = null;

async function getVadRuntime(): Promise<VadRuntime> {
  if (vadRuntimePromise) return vadRuntimePromise;

  vadRuntimePromise = (async () => {
    const startedAt = performance.now();
    let failedAsset = VAD_WASM_MODULE_URL;
    try {
      const [{ Message }, { NonRealTimeVAD }] = await Promise.all([
        import("@ricky0123/vad-web/dist/messages.js"),
        import("@ricky0123/vad-web/dist/non-real-time-vad.js"),
      ]);
      let ortVersion = "unknown";
      let frameObserver: ((speech: number) => void) | null = null;
      const vad = await NonRealTimeVAD.new({
        modelURL: SILERO_MODEL_URL,
        modelFetcher: async (url) => {
          failedAsset = url;
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
          failedAsset = VAD_WASM_MODULE_URL;
          return response.arrayBuffer();
        },
        ortConfig: (ort) => {
          configureVadRuntime(ort);
          ortVersion = ort.env.versions?.common ?? "unknown";
        },
        positiveSpeechThreshold: POSITIVE_SPEECH_THRESHOLD,
        negativeSpeechThreshold: NEGATIVE_SPEECH_THRESHOLD,
        minSpeechMs: MIN_SPEECH_MS,
        preSpeechPadMs: 0,
        redemptionMs: 480,
      });
      const originalProcess = vad.frameProcessor.process.bind(vad.frameProcessor);
      vad.frameProcessor.process = async (frame, handleEvent) => originalProcess(frame, (event) => {
        if (event.msg === Message.FrameProcessed) frameObserver?.(event.probs.isSpeech);
        handleEvent(event);
      });
      const runtime: VadRuntime = {
        vad,
        ortVersion,
        setFrameObserver: (observer) => { frameObserver = observer; },
      };
      if (process.env.NODE_ENV !== "production") {
        console.debug("VAD runtime", {
          ortVersion: runtime.ortVersion,
          backend: "wasm",
          wasmAssetBase: VAD_ASSET_BASE,
          modelLoaded: true,
          initializationMs: Math.round(performance.now() - startedAt),
        });
      }
      return runtime;
    } catch (error) {
      vadRuntimePromise = null;
      const cause = error instanceof Error ? error.message : String(error);
      throw new Error(`Browser VAD initialization failed (asset: ${failedAsset}; root cause: ${cause})`);
    }
  })();

  return vadRuntimePromise;
}

/**
 * Runs one stateful Silero pass over the already-decoded mono waveform. The
 * package exposes segment callbacks, and we retain its frame probabilities to
 * make the region confidence inspectable in recognition diagnostics.
 */
export async function detectLocalSpeechRegions(
  audio: Float32Array,
  sampleRate: number,
): Promise<VadSpeechRegion[]> {
  if (typeof window === "undefined") throw new Error("Local speech activity detection can only run in a browser.");
  if (!audio.length) return [];

  const runtime = await getVadRuntime();
  const { vad } = runtime;
  const probabilities: FrameProbability[] = [];
  let frameIndex = 0;
  runtime.setFrameObserver((speech) => {
    probabilities.push({
      startMs: frameIndex * FRAME_MS,
      endMs: (frameIndex + 1) * FRAME_MS,
      speech,
    });
    frameIndex += 1;
  });
  const durationMs = Math.round(audio.length / sampleRate * 1_000);
  const rawRegions: VadSpeechRegion[] = [];
  for await (const segment of vad.run(audio, sampleRate)) {
    const segmentFrames = probabilities.filter((frame) => frame.startMs < segment.end && frame.endMs > segment.start);
    const positive = segmentFrames.filter((frame) => frame.speech >= POSITIVE_SPEECH_THRESHOLD);
    if (!positive.length) continue;
    const first = positive[0];
    const last = positive.at(-1)!;
    const confidence = positive.reduce((sum, frame) => sum + frame.speech, 0) / positive.length;
    rawRegions.push({
      startMs: first.startMs,
      endMs: last.endMs,
      durationMs: last.endMs - first.startMs,
      confidence,
    });
  }
  return smoothVadSpeechRegions(rawRegions, durationMs);
}
