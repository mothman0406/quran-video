import {
  canonicalCtcWords,
  forceAlignCtc,
  type CtcForcedAlignmentResult,
  type CtcTargetToken,
} from "./ctc-forced-alignment.ts";
import { configureVadRuntime } from "./vad.ts";
import type { QuranCorpusVerse } from "./core.ts";
import type { VadSpeechRegion } from "./speech-regions.ts";

/**
 * This is a public, Apache-2.0 Wav2Vec2 CTC export used by Darten for Quran
 * recitation alignment. The SHA pin makes the browser artifact immutable while
 * keeping the model out of this repository and out of the application server.
 */
export const QURAN_CTC_SHADOW_MODEL = "Tidzo/darten-quran-asr";
export const QURAN_CTC_SHADOW_MODEL_LICENSE = "Apache-2.0";
export const QURAN_CTC_SHADOW_MODEL_ARTIFACT = "model.int8.onnx";
export const QURAN_CTC_SHADOW_MODEL_REVISION = "0530f8aabd7a19a152e8476fe94fa6c6b2f38dd3";
export const QURAN_CTC_SHADOW_MODEL_URL = `https://huggingface.co/${QURAN_CTC_SHADOW_MODEL}/resolve/${QURAN_CTC_SHADOW_MODEL_REVISION}/${QURAN_CTC_SHADOW_MODEL_ARTIFACT}`;
/** Exact response length from the pinned public resolver, checked 2026-09-02. */
export const QURAN_CTC_SHADOW_MODEL_BYTES = 355_026_417;
export const QURAN_CTC_SHADOW_RUNTIME = "ONNX Runtime Web (WebGPU, then WASM fallback)";
const SAMPLE_RATE = 16_000;
const CTC_CACHE_NAME = "quran-video-ctc-v1";
const WORD_DELIMITER = "|";
const BLANK_TOKEN_ID = 0;

/** Exact ids from the Apache-2.0 upstream Wav2Vec2 vocabulary used by this export. */
const ARABIC_CTC_VOCABULARY: Readonly<Record<string, number>> = {
  "|": 4, "ء": 6, "آ": 7, "أ": 8, "ؤ": 9, "إ": 10, "ئ": 11, "ا": 12,
  "ب": 13, "ة": 14, "ت": 15, "ث": 16, "ج": 17, "ح": 18, "خ": 19, "د": 20,
  "ذ": 21, "ر": 22, "ز": 23, "س": 24, "ش": 25, "ص": 26, "ض": 27, "ط": 28,
  "ظ": 29, "ع": 30, "غ": 31, "ف": 33, "ق": 34, "ك": 35, "ل": 36, "م": 37,
  "ن": 38, "ه": 39, "و": 40, "ى": 41, "ي": 42,
};

export type CtcShadowRunner = (verses: readonly QuranCorpusVerse[], matches: readonly { startMs: number; endMs: number }[]) => Promise<CtcForcedAlignmentResult>;

type OrtTensor = { data: unknown; dims: readonly number[] };
type LoadedCtcModel = {
  session: {
    inputNames: readonly string[];
    outputNames: readonly string[];
    run(input: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
  };
  ort: { Tensor: new (type: "float32", data: Float32Array, dims: readonly number[]) => unknown };
  backend: "webgpu" | "wasm";
  cacheStatus: "cold-download" | "browser-cache";
  modelDownloadBytes: number;
};

let sharedModelPromise: Promise<LoadedCtcModel> | null = null;

function unavailable(reason: string, verses: readonly QuranCorpusVerse[], performance?: CtcForcedAlignmentResult["performance"]): CtcForcedAlignmentResult {
  return {
    status: "unavailable",
    reason,
    canonicalWords: canonicalCtcWords(verses),
    targetTokens: [],
    words: [],
    verses: [],
    pauses: [],
    audibleRepetitions: [],
    frameCount: 0,
    frameDurationMs: 0,
    performance,
  };
}

function ctcWindow(audio: Float32Array, speechRegions: readonly VadSpeechRegion[], matches: readonly { startMs: number; endMs: number }[]) {
  const firstMatch = matches[0];
  const lastMatch = matches.at(-1);
  if (!firstMatch || !lastMatch) return null;
  const startRegion = speechRegions.find((region) => region.endMs >= firstMatch.startMs) ?? { startMs: firstMatch.startMs, endMs: lastMatch.endMs };
  const endRegion = [...speechRegions].reverse().find((region) => region.startMs <= lastMatch.endMs && region.endMs >= firstMatch.startMs) ?? startRegion;
  const startMs = Math.max(0, Math.min(firstMatch.startMs, startRegion.startMs));
  const endMs = Math.min(Math.round(audio.length / SAMPLE_RATE * 1_000), Math.max(lastMatch.endMs, endRegion.endMs));
  const startFrame = Math.max(0, Math.floor(startMs * SAMPLE_RATE / 1_000));
  const endFrame = Math.min(audio.length, Math.ceil(endMs * SAMPLE_RATE / 1_000));
  return endFrame > startFrame ? { audio: audio.slice(startFrame, endFrame), startMs, endMs } : null;
}

/**
 * Wav2Vec2 target-only orthographic normalization. It removes display-only
 * Quran marks while preserving the character distinctions the model
 * vocabulary can represent. The Uthmani `canonicalArabic` field is untouched.
 */
export function normalizeCtcArabic(value: string): string {
  return value.normalize("NFKC")
    .replace(/[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/[ۖۗۚۛۜۙۘ۝۞]/g, "")
    .replace(/ٱ/g, "ا")
    .replace(/ـ/g, "")
    .replace(/[^ءآأؤإئا-ي\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Per-utterance zero-mean/unit-variance normalization from the model's Wav2Vec2 preprocessor config. */
export function normalizeWav2Vec2Pcm(audio: Float32Array): Float32Array {
  if (!audio.length) return new Float32Array();
  let sum = 0;
  for (const sample of audio) sum += sample;
  const mean = sum / audio.length;
  let squaredError = 0;
  for (const sample of audio) squaredError += (sample - mean) ** 2;
  const scale = Math.sqrt(squaredError / audio.length + 1e-7);
  return Float32Array.from(audio, (sample) => (sample - mean) / scale);
}

/** Returns a canonical-word-preserving character CTC target, including known word delimiters. */
export function encodeCtcWords(words: ReturnType<typeof canonicalCtcWords>): { canonicalWords: ReturnType<typeof canonicalCtcWords>; targetTokens: CtcTargetToken[] } {
  const canonicalWords = words.map((word) => ({ ...word, alignmentText: normalizeCtcArabic(word.canonicalArabic) }));
  const targetTokens: CtcTargetToken[] = [];
  for (const [index, word] of canonicalWords.entries()) {
    if (!word.alignmentText) throw new Error(`Canonical Quran word ${word.globalWordIndex} cannot be represented by the CTC vocabulary.`);
    for (const token of word.alignmentText) {
      const tokenId = ARABIC_CTC_VOCABULARY[token];
      if (tokenId === undefined) throw new Error(`The CTC vocabulary cannot encode ${JSON.stringify(token)} in canonical Quran word ${word.globalWordIndex}.`);
      targetTokens.push({ tokenId, token, globalWordIndex: word.globalWordIndex });
    }
    if (index < canonicalWords.length - 1) targetTokens.push({ tokenId: ARABIC_CTC_VOCABULARY[WORD_DELIMITER]!, token: WORD_DELIMITER, globalWordIndex: word.globalWordIndex });
  }
  return { canonicalWords, targetTokens };
}

async function fetchModelArtifact(): Promise<{ buffer: ArrayBuffer; cacheStatus: "cold-download" | "browser-cache"; modelDownloadBytes: number }> {
  const cache = typeof caches === "undefined" ? null : await caches.open(CTC_CACHE_NAME);
  const cached = cache ? await cache.match(QURAN_CTC_SHADOW_MODEL_URL) : undefined;
  if (cached) return { buffer: await cached.arrayBuffer(), cacheStatus: "browser-cache", modelDownloadBytes: 0 };
  const response = await fetch(QURAN_CTC_SHADOW_MODEL_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`CTC model download failed with HTTP ${response.status} ${response.statusText}.`);
  if (cache) await cache.put(QURAN_CTC_SHADOW_MODEL_URL, response.clone());
  const buffer = await response.arrayBuffer();
  return { buffer, cacheStatus: "cold-download", modelDownloadBytes: buffer.byteLength };
}

async function loadCtcModel(): Promise<LoadedCtcModel> {
  const artifact = await fetchModelArtifact();
  const ort = await import("onnxruntime-web");
  configureVadRuntime(ort);
  const create = async (backend: "webgpu" | "wasm") => ({
    session: await ort.InferenceSession.create(artifact.buffer, { executionProviders: [backend] }),
    backend,
  });
  let loaded: { session: LoadedCtcModel["session"]; backend: "webgpu" | "wasm" };
  try {
    loaded = typeof navigator !== "undefined" && "gpu" in navigator ? await create("webgpu") : await create("wasm");
  } catch (error) {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) throw error;
    loaded = await create("wasm");
  }
  return { ...loaded, ort, cacheStatus: artifact.cacheStatus, modelDownloadBytes: artifact.modelDownloadBytes };
}

/** Creates a browser-only, lazy CTC runner over the already decoded PCM. */
export function createCtcShadowRunner(audio: Float32Array, speechRegions: readonly VadSpeechRegion[]): CtcShadowRunner {
  return async (verses, matches) => {
    const canonical = canonicalCtcWords(verses);
    const window = ctcWindow(audio, speechRegions, matches);
    if (!window) return unavailable("No VAD-constrained Quran interval was available for CTC alignment.", verses);
    const totalStartedAt = performance.now();
    const isMemoryWarm = sharedModelPromise !== null;
    try {
      const loadingStartedAt = performance.now();
      sharedModelPromise ??= loadCtcModel().catch((error) => {
        sharedModelPromise = null;
        throw error;
      });
      const loaded = await sharedModelPromise;
      const loadMs = Math.round(performance.now() - loadingStartedAt);
      const encoded = encodeCtcWords(canonical);
      if (loaded.session.inputNames.length !== 1) throw new Error(`CTC model has an unsupported input contract: ${loaded.session.inputNames.join(", ")}.`);
      const preprocessingStartedAt = performance.now();
      const normalizedAudio = normalizeWav2Vec2Pcm(window.audio);
      const preprocessingMs = Math.round(performance.now() - preprocessingStartedAt);
      const inferenceStartedAt = performance.now();
      const outputs = await loaded.session.run({ [loaded.session.inputNames[0]!]: new loaded.ort.Tensor("float32", normalizedAudio, [1, normalizedAudio.length]) });
      const output = outputs.logits ?? outputs[loaded.session.outputNames[0]!];
      const [, frames, vocabularySize] = output?.dims ?? [];
      if (!output || !(output.data instanceof Float32Array) || !frames || !vocabularySize || vocabularySize <= BLANK_TOKEN_ID) throw new Error("The CTC model returned logits with an unsupported shape.");
      const inferenceMs = Math.round(performance.now() - inferenceStartedAt);
      const aligned = forceAlignCtc(encoded.canonicalWords, encoded.targetTokens, { values: output.data, frames, vocabularySize }, {
        blankTokenId: BLANK_TOKEN_ID,
        startMs: window.startMs,
        endMs: window.endMs,
        finalSpeechEndMs: window.endMs,
      });
      return {
        ...aligned,
        performance: {
          ...aligned.performance,
          modelArtifactBytes: QURAN_CTC_SHADOW_MODEL_BYTES,
          modelDownloadBytes: isMemoryWarm ? 0 : loaded.modelDownloadBytes,
          cacheStatus: isMemoryWarm ? "memory" : loaded.cacheStatus,
          backend: loaded.backend,
          coldModelLoadMs: isMemoryWarm ? undefined : loadMs,
          warmModelLoadMs: isMemoryWarm ? loadMs : undefined,
          preprocessingMs,
          inferenceMs,
          totalMs: Math.round(performance.now() - totalStartedAt),
        },
      };
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error), verses, {
        modelArtifactBytes: QURAN_CTC_SHADOW_MODEL_BYTES,
        cacheStatus: "unavailable",
        totalMs: Math.round(performance.now() - totalStartedAt),
      });
    }
  };
}
