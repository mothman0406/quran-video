import { normalizeArabic, type QuranCorpusVerse } from "./core.ts";
import {
  canonicalCtcWords,
  coherentCtcRepeatHints,
  forceAlignCtc,
  type CtcForcedAlignmentResult,
  type CtcTargetToken,
} from "./ctc-forced-alignment.ts";
import type { VadSpeechRegion } from "./speech-regions.ts";

/**
 * Apache-2.0, Arabic/Quran fine-tuned CTC export. It remains a shadow-only
 * dependency until it has been compared with real reciter recordings.
 */
export const QURAN_CTC_SHADOW_MODEL = "abdelmoez98/wav2vec2-large-xlsr-53-arabic-quran-v_final-ONNX";
export const QURAN_CTC_SHADOW_MODEL_LICENSE = "Apache-2.0";
export const QURAN_CTC_SHADOW_MODEL_ARTIFACT = "onnx/model_int8.onnx";
/** Repository total reported by Hugging Face: 2.93 GB; exact int8 artifact
 * size is resolved by the browser download progress and recorded per run. */
export const QURAN_CTC_SHADOW_REPOSITORY_MB = 2_930;
export const QURAN_CTC_SHADOW_RUNTIME = "Transformers.js + ONNX Runtime Web (WebGPU preferred, WASM fallback)";
const SAMPLE_RATE = 16_000;

export type CtcShadowRunner = (verses: readonly QuranCorpusVerse[], matches: readonly { startMs: number; endMs: number }[]) => Promise<CtcForcedAlignmentResult>;
type LoadedCtcModel = {
  model: (input: unknown) => Promise<{ logits: { data: Float32Array; dims: number[] } }>;
  processor: {
    (input: Float32Array): Promise<unknown>;
    tokenizer?: { encode(text: string, options?: { add_special_tokens?: boolean }): number[]; decode(ids: number[], options?: { skip_special_tokens?: boolean }): string; pad_token_id: number };
  };
};

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

function toTargetTokens(words: ReturnType<typeof canonicalCtcWords>, tokenizer: { encode(text: string, options?: { add_special_tokens?: boolean }): number[] }): CtcTargetToken[] {
  return words.flatMap((word) => tokenizer.encode(normalizeArabic(word.canonicalArabic), { add_special_tokens: false })
    .filter((tokenId) => Number.isInteger(tokenId))
    .map((tokenId) => ({ tokenId, globalWordIndex: word.globalWordIndex })));
}

function greedyCtcTokenIds(values: Float32Array, frames: number, vocabularySize: number, blankTokenId: number) {
  const ids: number[] = [];
  let previous = -1;
  for (let frame = 0; frame < frames; frame += 1) {
    let bestToken = 0;
    let bestValue = Number.NEGATIVE_INFINITY;
    for (let token = 0; token < vocabularySize; token += 1) {
      const value = values[frame * vocabularySize + token] ?? Number.NEGATIVE_INFINITY;
      if (value > bestValue) { bestValue = value; bestToken = token; }
    }
    if (bestToken !== blankTokenId && bestToken !== previous) ids.push(bestToken);
    previous = bestToken;
  }
  return ids;
}

/** Exact normalized words only; approximate observations cannot invent a repeat arc. */
function observedCanonicalWordIndexes(decoded: string, words: ReturnType<typeof canonicalCtcWords>) {
  const observed = normalizeArabic(decoded).split(/\s+/).filter(Boolean);
  const canonical = words.map((word) => normalizeArabic(word.canonicalArabic));
  const indexes: number[] = [];
  let cursor = 0;
  for (const observedWord of observed) {
    const matches = canonical.map((word, index) => word === observedWord ? index : -1).filter((index) => index >= 0);
    if (!matches.length) continue;
    const local = matches.filter((index) => index >= cursor - 4 && index <= cursor + 8);
    const winner = (local.length ? local : matches).sort((left, right) => {
      const leftDistance = left >= cursor ? left - cursor : (cursor - left) * 2;
      const rightDistance = right >= cursor ? right - cursor : (cursor - right) * 2;
      return leftDistance - rightDistance || left - right;
    })[0]!;
    indexes.push(words[winner]!.globalWordIndex);
    cursor = winner;
  }
  return indexes;
}

/** Creates a browser-only, lazy CTC runner over the already decoded PCM. */
export function createCtcShadowRunner(audio: Float32Array, speechRegions: readonly VadSpeechRegion[]): CtcShadowRunner {
  let modelPromise: Promise<LoadedCtcModel> | null = null;
  let modelDownloadBytes: number | undefined;
  return async (verses, matches) => {
    const canonicalWords = canonicalCtcWords(verses);
    const window = ctcWindow(audio, speechRegions, matches);
    if (!window) return { status: "unavailable", reason: "No VAD-constrained Quran interval was available for CTC alignment.", canonicalWords, words: [], verses: [], pauses: [], audibleRepetitions: [], frameCount: 0, frameDurationMs: 0 };
    const totalStartedAt = performance.now();
    const loadingStartedAt = performance.now();
    const warm = modelPromise !== null;
    try {
      modelPromise ??= (async () => {
        const { AutoModelForCTC, AutoProcessor, env } = await import("@huggingface/transformers");
        env.useBrowserCache = typeof caches !== "undefined";
        const progress_callback = (progress: unknown) => {
          const total = typeof progress === "object" && progress !== null && "total" in progress
            ? (progress as { total?: unknown }).total
            : undefined;
          if (typeof total === "number" && Number.isFinite(total)) modelDownloadBytes = Math.max(modelDownloadBytes ?? 0, total);
        };
        const processor = await AutoProcessor.from_pretrained(QURAN_CTC_SHADOW_MODEL, { progress_callback });
        const model = await AutoModelForCTC.from_pretrained(QURAN_CTC_SHADOW_MODEL, { dtype: "int8", device: typeof navigator !== "undefined" && "gpu" in navigator ? "webgpu" : "wasm", progress_callback });
        return { model, processor };
      })();
      const loaded = await modelPromise;
      const loadMs = Math.round(performance.now() - loadingStartedAt);
      const tokenizer = loaded.processor.tokenizer;
      if (!tokenizer) throw new Error("The selected CTC model did not expose a character tokenizer.");
      const targetTokens = toTargetTokens(canonicalWords, tokenizer);
      if (!targetTokens.length) throw new Error("The selected CTC vocabulary could not encode the canonical Quran passage.");
      const inferenceStartedAt = performance.now();
      const inputs = await loaded.processor(window.audio);
      const output = await loaded.model(inputs);
      const inferenceMs = Math.round(performance.now() - inferenceStartedAt);
      const [, frames, vocabularySize] = output.logits.dims;
      if (!frames || !vocabularySize) throw new Error("The CTC model returned logits with an unsupported shape.");
      const repeats = coherentCtcRepeatHints(observedCanonicalWordIndexes(
        tokenizer.decode(greedyCtcTokenIds(output.logits.data, frames, vocabularySize, tokenizer.pad_token_id), { skip_special_tokens: true }),
        canonicalWords,
      ));
      const aligned = forceAlignCtc(canonicalWords, targetTokens, { values: output.logits.data, frames, vocabularySize }, {
        blankTokenId: tokenizer.pad_token_id,
        startMs: window.startMs,
        endMs: window.endMs,
        finalSpeechEndMs: window.endMs,
        repeats,
      });
      return {
        ...aligned,
        performance: {
          ...aligned.performance,
          modelDownloadBytes,
          coldModelLoadMs: warm ? undefined : loadMs,
          warmModelLoadMs: warm ? loadMs : undefined,
          inferenceMs,
          totalMs: Math.round(performance.now() - totalStartedAt),
        },
      };
    } catch (error) {
      return { status: "unavailable", reason: error instanceof Error ? error.message : String(error), canonicalWords, words: [], verses: [], pauses: [], audibleRepetitions: [], frameCount: 0, frameDurationMs: 0, performance: { totalMs: Math.round(performance.now() - totalStartedAt) } };
    }
  };
}
