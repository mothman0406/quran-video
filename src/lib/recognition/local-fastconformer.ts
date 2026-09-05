import {
  canonicalCtcWords,
  forceAlignCtc,
  type CtcCanonicalWord,
  type CtcForcedAlignmentResult,
  type CtcTargetToken,
} from "./ctc-forced-alignment.ts";
import { normalizeArabic, type QuranCorpusVerse } from "./core.ts";
import { configureVadRuntime } from "./vad.ts";
import type { VadSpeechRegion } from "./speech-regions.ts";

/**
 * Development-only Tilawa FastConformer shadow. The public artifact is
 * CC-BY-4.0 (commercially usable with attribution); this adapter is entirely
 * separate from the production timing authority.
 */
export const FASTCONFORMER_SHADOW_MODEL = "acibZ/tilawa-quran-onnx";
export const FASTCONFORMER_SHADOW_MODEL_LICENSE = "CC-BY-4.0";
export const FASTCONFORMER_SHADOW_MODEL_REVISION = "0cd79471524bc9cfa1c9296055242a935a1873e4";
export const FASTCONFORMER_SHADOW_MODEL_ARTIFACT = "fastconformer_full_mixed.onnx";
export const FASTCONFORMER_SHADOW_MODEL_BYTES = 88_307_366;
export const FASTCONFORMER_SHADOW_TOKEN_TABLE_BYTES = 12_211_783;
export const FASTCONFORMER_SHADOW_VOCAB_BYTES = 21_062;
export const FASTCONFORMER_SHADOW_RUNTIME = "ONNX Runtime Web (WebGPU, then WASM fallback)";
const FASTCONFORMER_BASE_URL = `https://huggingface.co/${FASTCONFORMER_SHADOW_MODEL}/resolve/${FASTCONFORMER_SHADOW_MODEL_REVISION}`;
export const FASTCONFORMER_SHADOW_MODEL_URL = `${FASTCONFORMER_BASE_URL}/${FASTCONFORMER_SHADOW_MODEL_ARTIFACT}`;
const VOCAB_URL = `${FASTCONFORMER_BASE_URL}/vocab.json`;
const TOKEN_TABLE_URL = `${FASTCONFORMER_BASE_URL}/quran_ctc_tokens.json`;
const CACHE_NAME = "quran-video-fastconformer-shadow-v1";
const SAMPLE_RATE = 16_000;
const BLANK_TOKEN_ID = 1_024;
const WORD_PREFIX = "▁";

type OrtTensor = { data: unknown; dims: readonly number[] };
type TokenTable = Record<string, number[]>;
type Vocabulary = Record<string, string>;
type FastConformerAssets = { model: ArrayBuffer; vocabulary: Vocabulary; tokenTable: TokenTable; cacheStatus: "cold-download" | "browser-cache"; downloadBytes: number };
type LoadedFastConformer = {
  session: { inputNames: readonly string[]; outputNames: readonly string[]; run(input: Record<string, unknown>): Promise<Record<string, OrtTensor>> };
  ort: { Tensor: new (type: "float32" | "int64", data: Float32Array | BigInt64Array, dims: readonly number[]) => unknown };
  backend: "webgpu" | "wasm";
  assets: FastConformerAssets;
};

export type FastConformerShadowResult = {
  status: "complete" | "unavailable" | "failed";
  reason?: string;
  analysisRunId?: string;
  /** This is the pre-identified canonical range, not a new identity authority. */
  detectedRange: { startVerseKey: string; endVerseKey: string; source: "known-canonical-passage" } | null;
  confidence: number | null;
  greedyTranscript: string;
  rawLogits: { frames: number; vocabularySize: number; blankTokenId: number; frameDurationMs: number } | null;
  alignment: CtcForcedAlignmentResult;
  performance: {
    modelArtifactBytes: number;
    supportingAssetBytes: number;
    modelDownloadBytes: number;
    cacheStatus: "cold-download" | "browser-cache" | "memory" | "unavailable";
    backend?: "webgpu" | "wasm";
    coldModelLoadMs?: number;
    warmModelLoadMs?: number;
    inferenceMs?: number;
    totalMs: number;
  };
};

export type FastConformerShadowRunner = (verses: readonly QuranCorpusVerse[], matches: readonly { startMs: number; endMs: number }[]) => Promise<FastConformerShadowResult>;

let sharedModelPromise: Promise<LoadedFastConformer> | null = null;

function passageWindow(audio: Float32Array, speechRegions: readonly VadSpeechRegion[], matches: readonly { startMs: number; endMs: number }[]) {
  const first = matches[0];
  const last = matches.at(-1);
  if (!first || !last) return null;
  const startRegion = speechRegions.find((region) => region.endMs >= first.startMs) ?? { startMs: first.startMs, endMs: last.endMs };
  const endRegion = [...speechRegions].reverse().find((region) => region.startMs <= last.endMs && region.endMs >= first.startMs) ?? startRegion;
  const startMs = Math.max(0, Math.min(first.startMs, startRegion.startMs));
  const endMs = Math.min(Math.round(audio.length / SAMPLE_RATE * 1_000), Math.max(last.endMs, endRegion.endMs));
  const startSample = Math.max(0, Math.floor(startMs * SAMPLE_RATE / 1_000));
  const endSample = Math.min(audio.length, Math.ceil(endMs * SAMPLE_RATE / 1_000));
  return endSample > startSample ? { audio: audio.slice(startSample, endSample), startMs, endMs } : null;
}

async function fetchCached(url: string): Promise<{ buffer: ArrayBuffer; cacheHit: boolean }> {
  const cache = typeof caches === "undefined" ? null : await caches.open(CACHE_NAME);
  const cached = cache ? await cache.match(url) : undefined;
  if (cached) return { buffer: await cached.arrayBuffer(), cacheHit: true };
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`FastConformer asset download failed (${response.status} ${response.statusText}).`);
  if (cache) await cache.put(url, response.clone());
  return { buffer: await response.arrayBuffer(), cacheHit: false };
}

async function loadAssets(): Promise<FastConformerAssets> {
  const [model, vocabulary, tokenTable] = await Promise.all([fetchCached(FASTCONFORMER_SHADOW_MODEL_URL), fetchCached(VOCAB_URL), fetchCached(TOKEN_TABLE_URL)]);
  const cacheHit = model.cacheHit && vocabulary.cacheHit && tokenTable.cacheHit;
  return {
    model: model.buffer,
    vocabulary: JSON.parse(new TextDecoder().decode(vocabulary.buffer)) as Vocabulary,
    tokenTable: JSON.parse(new TextDecoder().decode(tokenTable.buffer)) as TokenTable,
    cacheStatus: cacheHit ? "browser-cache" : "cold-download",
    downloadBytes: (model.cacheHit ? 0 : model.buffer.byteLength) + (vocabulary.cacheHit ? 0 : vocabulary.buffer.byteLength) + (tokenTable.cacheHit ? 0 : tokenTable.buffer.byteLength),
  };
}

async function loadModel(): Promise<LoadedFastConformer> {
  const assets = await loadAssets();
  const ort = await import("onnxruntime-web");
  configureVadRuntime(ort);
  const create = async (backend: "webgpu" | "wasm") => ({ session: await ort.InferenceSession.create(assets.model, { executionProviders: [backend] }), backend });
  let loaded: { session: LoadedFastConformer["session"]; backend: "webgpu" | "wasm" };
  try {
    loaded = typeof navigator !== "undefined" && "gpu" in navigator ? await create("webgpu") : await create("wasm");
  } catch (error) {
    if (typeof navigator === "undefined" || !("gpu" in navigator)) throw error;
    loaded = await create("wasm");
  }
  return { ...loaded, ort, assets };
}

function verseTableKey(verseKey: string) {
  const [surah, ayah] = verseKey.split(":");
  return `${surah}:${ayah}:${ayah}`;
}

function normalizeWord(value: string) {
  return normalizeArabic(value).replace(/\s+/g, "");
}

/** Builds exact BPE target ids from Tilawa's published canonical token table. */
export function encodeFastConformerWords(
  canonicalWords: readonly CtcCanonicalWord[],
  tokenTable: TokenTable,
  vocabulary: Vocabulary,
): { canonicalWords: CtcCanonicalWord[]; targetTokens: CtcTargetToken[] } {
  const words = canonicalWords.map((word) => ({ ...word, alignmentText: normalizeWord(word.canonicalArabic) }));
  const targetTokens: CtcTargetToken[] = [];
  for (const verseKey of [...new Set(words.map((word) => word.verseKey))]) {
    const verseWords = words.filter((word) => word.verseKey === verseKey);
    const ids = tokenTable[verseTableKey(verseKey)];
    if (!ids?.length) throw new Error(`Tilawa's token table has no canonical target for ${verseKey}.`);
    let wordIndex = 0;
    let accumulated = "";
    const finishWord = () => {
      const expected = verseWords[wordIndex];
      if (!expected || normalizeWord(accumulated) !== expected.alignmentText) {
        throw new Error(`Tilawa BPE target does not round-trip to the selected canonical ${verseKey} word ${wordIndex + 1}.`);
      }
      wordIndex += 1;
      accumulated = "";
    };
    for (const tokenId of ids) {
      const token = vocabulary[String(tokenId)];
      if (!token || token === "<unk>" || token === "<blank>") throw new Error(`Tilawa BPE vocabulary is missing a usable token id ${tokenId} for ${verseKey}.`);
      const beginsWord = token.includes(WORD_PREFIX);
      if (beginsWord && accumulated) finishWord();
      const fragment = token.replaceAll(WORD_PREFIX, "");
      if (!fragment) continue;
      const word = verseWords[wordIndex];
      if (!word) throw new Error(`Tilawa BPE target exceeds the selected canonical words for ${verseKey}.`);
      accumulated += fragment;
      targetTokens.push({ tokenId, token, globalWordIndex: word.globalWordIndex });
    }
    if (accumulated) finishWord();
    if (wordIndex !== verseWords.length) throw new Error(`Tilawa BPE target has incomplete canonical word coverage for ${verseKey}.`);
  }
  return { canonicalWords: words, targetTokens };
}

function greedyDecode(values: Float32Array, frames: number, vocabularySize: number, vocabulary: Vocabulary) {
  let previous = -1;
  const ids: number[] = [];
  for (let frame = 0; frame < frames; frame += 1) {
    let bestId = 0;
    let best = Number.NEGATIVE_INFINITY;
    const offset = frame * vocabularySize;
    for (let id = 0; id < vocabularySize; id += 1) {
      const value = values[offset + id]!;
      if (value > best) { best = value; bestId = id; }
    }
    if (bestId !== previous && bestId !== BLANK_TOKEN_ID) ids.push(bestId);
    previous = bestId;
  }
  return ids.map((id) => vocabulary[String(id)] ?? "").join("").replaceAll(WORD_PREFIX, " ").replace(/\s+/g, " ").trim();
}

function unavailable(reason: string, verses: readonly QuranCorpusVerse[], startedAt: number, analysisRunId?: string): FastConformerShadowResult {
  return {
    status: "unavailable",
    reason,
    analysisRunId,
    detectedRange: verses.length ? { startVerseKey: verses[0]!.verseKey, endVerseKey: verses.at(-1)!.verseKey, source: "known-canonical-passage" } : null,
    confidence: null,
    greedyTranscript: "",
    rawLogits: null,
    alignment: { status: "unavailable", reason, canonicalWords: canonicalCtcWords(verses), targetTokens: [], words: [], verses: [], pauses: [], audibleRepetitions: [], frameCount: 0, frameDurationMs: 0 },
    performance: { modelArtifactBytes: FASTCONFORMER_SHADOW_MODEL_BYTES, supportingAssetBytes: FASTCONFORMER_SHADOW_TOKEN_TABLE_BYTES + FASTCONFORMER_SHADOW_VOCAB_BYTES, modelDownloadBytes: 0, cacheStatus: "unavailable", totalMs: Math.round(performance.now() - startedAt) },
  };
}

/** Creates a lazy browser-only shadow runner over the same decoded 16 kHz PCM. */
export function createFastConformerShadowRunner(audio: Float32Array, speechRegions: readonly VadSpeechRegion[], analysisRunId?: string): FastConformerShadowRunner {
  return async (verses, matches) => {
    const startedAt = performance.now();
    const window = passageWindow(audio, speechRegions, matches);
    if (!window) return unavailable("No VAD-constrained Quran interval was available for FastConformer shadow alignment.", verses, startedAt, analysisRunId);
    const memoryWarm = sharedModelPromise !== null;
    try {
      const loadingStartedAt = performance.now();
      sharedModelPromise ??= loadModel().catch((error) => { sharedModelPromise = null; throw error; });
      const loaded = await sharedModelPromise;
      const loadMs = Math.round(performance.now() - loadingStartedAt);
      const encoded = encodeFastConformerWords(canonicalCtcWords(verses), loaded.assets.tokenTable, loaded.assets.vocabulary);
      if (!loaded.session.inputNames.includes("audio_signal") || !loaded.session.inputNames.includes("length")) throw new Error(`FastConformer has an unsupported input contract: ${loaded.session.inputNames.join(", ")}.`);
      const inferenceStartedAt = performance.now();
      const outputs = await loaded.session.run({
        audio_signal: new loaded.ort.Tensor("float32", window.audio, [1, window.audio.length]),
        length: new loaded.ort.Tensor("int64", BigInt64Array.from([BigInt(window.audio.length)]), [1]),
      });
      const output = outputs[loaded.session.outputNames[0]!];
      const [, frames, vocabularySize] = output?.dims ?? [];
      if (!output || !(output.data instanceof Float32Array) || !frames || !vocabularySize || vocabularySize <= BLANK_TOKEN_ID) throw new Error("FastConformer returned an unsupported CTC log-probability shape.");
      const inferenceMs = Math.round(performance.now() - inferenceStartedAt);
      const alignment = forceAlignCtc(encoded.canonicalWords, encoded.targetTokens, { values: output.data, frames, vocabularySize }, {
        blankTokenId: BLANK_TOKEN_ID,
        startMs: window.startMs,
        endMs: window.endMs,
        finalSpeechEndMs: window.endMs,
        frameExactEndpoints: true,
      });
      const greedyTranscript = greedyDecode(output.data, frames, vocabularySize, loaded.assets.vocabulary);
      const confidence = alignment.status === "complete" && alignment.words.length
        ? Number((alignment.words.reduce((sum, word) => sum + word.confidence, 0) / alignment.words.length).toFixed(4))
        : null;
      return {
        status: alignment.status,
        reason: alignment.reason,
        analysisRunId,
        detectedRange: verses.length ? { startVerseKey: verses[0]!.verseKey, endVerseKey: verses.at(-1)!.verseKey, source: "known-canonical-passage" } : null,
        confidence,
        greedyTranscript,
        rawLogits: { frames, vocabularySize, blankTokenId: BLANK_TOKEN_ID, frameDurationMs: Number(((window.endMs - window.startMs) / frames).toFixed(4)) },
        alignment,
        performance: {
          modelArtifactBytes: FASTCONFORMER_SHADOW_MODEL_BYTES,
          supportingAssetBytes: FASTCONFORMER_SHADOW_TOKEN_TABLE_BYTES + FASTCONFORMER_SHADOW_VOCAB_BYTES,
          modelDownloadBytes: memoryWarm ? 0 : loaded.assets.downloadBytes,
          cacheStatus: memoryWarm ? "memory" : loaded.assets.cacheStatus,
          backend: loaded.backend,
          coldModelLoadMs: memoryWarm ? undefined : loadMs,
          warmModelLoadMs: memoryWarm ? loadMs : undefined,
          inferenceMs,
          totalMs: Math.round(performance.now() - startedAt),
        },
      };
    } catch (error) {
      return unavailable(error instanceof Error ? error.message : String(error), verses, startedAt, analysisRunId);
    }
  };
}
