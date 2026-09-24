import {
  canonicalCtcWords,
  forceAlignCtc,
  type CtcCanonicalWord,
  type CtcForcedAlignmentResult,
  type CtcTargetToken,
} from "./ctc-forced-alignment.ts";
import { deriveCtcTransitionBoundaryWords, type CtcTransitionBoundaryWord } from "./ctc-transition-boundary.ts";
import { hafsVerses, type QuranCorpusVerse } from "./core.ts";
import type { VadSpeechRegion } from "./speech-regions.ts";
import { normalizeTilawaArabic } from "./tilawa-lexical.ts";
import {
  FASTCONFORMER_IDENTIFICATION_DEFAULTS,
  advanceQuranContinuationState,
  buildQuranWideLexicalIndex,
  ctcForwardScore,
  identifyQuranWindow,
  summarizeFastConformerIdentification,
  type FastConformerIdentificationResult,
  type QuranWideLexicalIndex,
  type QuranContinuationState,
} from "./fastconformer-identification.ts";
import {
  FASTCONFORMER_BASE_URL,
  FASTCONFORMER_MODEL,
  FASTCONFORMER_MODEL_ARTIFACT,
  FASTCONFORMER_MODEL_BYTES,
  FASTCONFORMER_MODEL_LICENSE,
  FASTCONFORMER_MODEL_REVISION,
  FASTCONFORMER_MODEL_URL,
  FASTCONFORMER_ORT_IMPORT,
  FASTCONFORMER_ORT_VERSION,
  FASTCONFORMER_QURAN_BYTES,
  FASTCONFORMER_RUNTIME,
  FASTCONFORMER_TILAWA_RELEASE,
  FASTCONFORMER_TOKEN_TABLE_BYTES,
  FASTCONFORMER_TOKEN_TABLE_REVISION,
  FASTCONFORMER_VOCAB_BYTES,
  FASTCONFORMER_VOCAB_REVISION,
  type FastConformerProgress,
  type FastConformerProgressCallback,
} from "./contracts.ts";
import { boundedBoundaryRegion, normalizedBlankCtcLogLikelihood, voicedDurationInRegion } from "./quran-boundary-acoustics.ts";
import { completeBoundedEdges, type EdgeAcousticEvidence } from "./quran-edge-completion.ts";
import {
  canonicalSpanFromExactRange,
  resolveQuranCore,
  versesForExactRange,
  type QuranBoundaryLocalization,
  type QuranCoreDecision,
  type QuranEdgeVerification,
  type QuranExactRange,
} from "./quran-complete-range.ts";
import {
  FROZEN_CORE_BOUNDARY_RULE,
  locateCoreBoundary,
  selectApplicableCoreBoundaries,
  sliceCtcLogits,
} from "./quran-core-boundary-localizer.ts";
export {
  FASTCONFORMER_MODEL,
  FASTCONFORMER_MODEL_ARTIFACT,
  FASTCONFORMER_MODEL_BYTES,
  FASTCONFORMER_MODEL_LICENSE,
  FASTCONFORMER_MODEL_REVISION,
  FASTCONFORMER_MODEL_URL,
  FASTCONFORMER_ORT_IMPORT,
  FASTCONFORMER_ORT_VERSION,
  FASTCONFORMER_QURAN_BYTES,
  FASTCONFORMER_RUNTIME,
  FASTCONFORMER_TILAWA_RELEASE,
  FASTCONFORMER_TOKEN_TABLE_BYTES,
  FASTCONFORMER_TOKEN_TABLE_REVISION,
  FASTCONFORMER_VOCAB_BYTES,
  FASTCONFORMER_VOCAB_REVISION,
  type FastConformerProgress,
} from "./contracts.ts";

/**
 * Tilawa FastConformer known-passage timing adapter. The public artifact is
 * CC-BY-4.0 (commercially usable with attribution); it never participates in
 * passage identification and becomes authoritative only after structural
 * validation in the central timing-engine selector.
 */
const VOCAB_URL = `${FASTCONFORMER_BASE_URL}/vocab.json`;
const TOKEN_TABLE_URL = `${FASTCONFORMER_BASE_URL}/quran_ctc_tokens.json`;
const QURAN_URL = `${FASTCONFORMER_BASE_URL}/quran.json`;
const CACHE_NAME = "quran-video-fastconformer-v3";
const SAMPLE_RATE = 16_000;
const BLANK_TOKEN_ID = 1_024;
const WORD_PREFIX = "▁";
const MAX_DOWNLOAD_ATTEMPTS = 3;
const RETRY_BASE_MS = 1_000;

type OrtTensor = { data: unknown; dims: readonly number[] };
type TokenTable = Record<string, number[]>;
type Vocabulary = Record<string, string>;
type TilawaQuranVerse = { surah: number; ayah: number; text_clean?: string; text_uthmani: string };
type TilawaQuranText = Record<string, string>;
export type FastConformerTargetToken = {
  tokenId: number;
  token: string;
  verseKey: string;
  owner: "canonical" | "optional-prelude";
  /** Set only when this target token belongs to a selected Quran word. */
  canonicalWordIndex?: number;
  globalWordIndex?: number;
  /** Present only for a losslessly mapped optional prelude display word. */
  optionalPreludeWordIndex?: number;
};
export type FastConformerTargetValidation = {
  verseKey: string;
  tokenCount: number;
  firstTokenIds: number[];
  lastTokenIds: number[];
  invalidTokenIds: number[];
};
export type FastConformerTargetConstructionFailure = {
  verseKey: string;
  tableKey: string;
  tokenIds: number[];
  decodedPieces: string[];
  reconstructedRaw: string;
  reconstructedNormalized: string;
  canonicalRaw: string;
  canonicalNormalized: string;
  canonicalLexicalText: string;
  firstMismatchIndex: number;
  reconstructedCodePoints: Array<{ index: number; character: string; codePoint: string }>;
  canonicalCodePoints: Array<{ index: number; character: string; codePoint: string }>;
};
type FastConformerFailureStage = "asset" | "target-construction" | "session-create" | "inference" | "forced-alignment";
type UpstreamTilawaResult = {
  status: "complete" | "unavailable";
  transcript: string;
  detectedPassage: { startVerseKey: string; endVerseKey: string } | null;
  confidence: number | null;
  tokenCount: number;
  reason?: string;
};
export type FastConformerAssetDiagnostic = {
  assetUrlHost: string;
  httpStatus: number | null;
  attemptCount: number;
  retryAfterMs: number | null;
  cacheStatus: "cold-download" | "browser-cache" | "cache-unavailable";
  downloadBytes: number;
  downloadMs: number;
};
export type FastConformerAsset = { buffer: ArrayBuffer; diagnostic: FastConformerAssetDiagnostic };
type FastConformerAssets = {
  model: ArrayBuffer;
  modelSha256: string;
  vocabulary: Vocabulary;
  tokenTable: TokenTable;
  quranText: TilawaQuranText;
  cacheStatus: FastConformerAssetDiagnostic["cacheStatus"];
  downloadBytes: number;
  downloadMs: number;
  modelDiagnostic: FastConformerAssetDiagnostic;
};
type LoadedFastConformer = {
  session: { inputNames: readonly string[]; outputNames: readonly string[]; run(input: Record<string, unknown>): Promise<Record<string, OrtTensor>> };
  ort: { Tensor: new (type: "float32" | "int64", data: Float32Array | BigInt64Array, dims: readonly number[]) => unknown };
  backend: "wasm";
  sessionCreateMs: number;
  modelLoadMs: number;
  assets: FastConformerAssets;
};

export type FastConformerResult = {
  status: "complete" | "unavailable" | "failed";
  reason?: string;
  failureStage?: FastConformerFailureStage;
  analysisRunId?: string;
  tilawaRelease: string;
  modelRevision: string;
  vocabRevision: string;
  tokenTableRevision: string;
  blankId: number;
  vocabSize: number | null;
  targetValidation: FastConformerTargetValidation[];
  targetTokenMapping: FastConformerTargetToken[];
  optionalPrelude: {
    available: boolean;
    lexicalText: string;
    tokenIds: number[];
    candidateWithoutPreludeScore: number | null;
    candidateWithPreludeScore: number | null;
    selected: "present" | "absent";
    startMs: number | null;
    endMs: number | null;
    /** CTC forced-alignment boundaries; omitted rather than synthesized when unavailable. */
    wordTimings?: Array<{ canonicalWordIndex: number; startMs: number; endMs: number }>;
  };
  firstCanonicalTokenFrame: number | null;
  firstCanonicalWordStartMs: number | null;
  /** Present only in development debug when a target could not be constructed. */
  targetConstructionFailure?: FastConformerTargetConstructionFailure;
  upstreamTilawaResult: UpstreamTilawaResult | null;
  /** Upstream Tilawa passage result; this never participates in identity selection. */
  upstreamTilawaDetectedPassage: { startVerseKey: string; endVerseKey: string } | null;
  /** Calibrated upstream Tilawa passage score, distinct from forced-path scores. */
  upstreamTilawaConfidence: number | null;
  /** This is the pre-identified canonical range, not a new identity authority. */
  detectedRange: { startVerseKey: string; endVerseKey: string; source: "known-canonical-passage" } | null;
  /** Mean local forced-path posterior, not a calibrated passage confidence. */
  forcedAlignmentMeanScore: number | null;
  greedyTranscript: string;
  frameCount: number | null;
  frameDurationMs: number | null;
  combinedTargetTokenCount: number;
  alignmentComplete: boolean;
  ayahTimings: Array<{ verseKey: string; startMs: number; endMs: number; acousticScore: number }>;
  rawLogits: { frames: number; vocabularySize: number; blankTokenId: number; frameDurationMs: number } | null;
  /** The production default is the acoustically selected CTC transition boundary. */
  wordEndPolicy?: "ctc-transition-boundary" | "first-aligned-token";
  /** Development-only CTC transition evidence. Never requested by production timing. */
  transitionBoundaryWords?: readonly CtcTransitionBoundaryWord[];
  alignment: CtcForcedAlignmentResult;
  performance: {
    modelArtifactBytes: number;
    supportingAssetBytes: number;
    modelDownloadBytes: number;
    cacheStatus: "cold-download" | "browser-cache" | "cache-unavailable" | "memory" | "unavailable";
    assetUrlHost?: string;
    httpStatus?: number | null;
    attemptCount?: number;
    retryAfterMs?: number | null;
    downloadBytes?: number;
    downloadMs?: number;
    backend?: "webgpu" | "wasm";
    ortImport?: string;
    ortVersion?: string;
    executionProvider?: "wasm";
    wasmNumThreads?: number;
    wasmSimd?: boolean;
    sessionCreateMs?: number;
    modelLoadMs?: number;
    alignmentMs?: number;
    modelBytes?: number;
    modelSha256?: string;
    coldModelLoadMs?: number;
    warmModelLoadMs?: number;
    inferenceMs?: number;
    totalMs: number;
  };
};

export type FastConformerRunner = (
  verses: readonly QuranCorpusVerse[],
  matches: readonly { startMs: number; endMs: number }[],
  onProgress?: FastConformerProgressCallback,
) => Promise<FastConformerResult>;
/** Independent Quran-wide CTC identifier used before canonical passage selection. */
export type FastConformerIdentificationRunner = (onProgress?: FastConformerProgressCallback) => Promise<FastConformerIdentificationResult>;

export type FastConformerCompleteRangeResult = {
  status: "complete" | "rejected" | "failed";
  reason: string | null;
  coreDecision: QuranCoreDecision;
  exactRange: QuranExactRange | null;
  canonicalSpan: ReturnType<typeof canonicalSpanFromExactRange>;
  boundaryLocalization: QuranBoundaryLocalization | null;
  edgeVerification: QuranEdgeVerification | null;
  alignment: FastConformerResult | null;
  reuse: {
    pcmReused: true;
    vadReused: true;
    modelSessionReused: boolean;
    fullRecordingLogitsReused: boolean;
    globalQuranSearches: 1;
    edgeInferenceCount: number;
  };
};

export type FastConformerCompleteRangeRunner = (
  identification: FastConformerIdentificationResult,
  onProgress?: FastConformerProgressCallback,
) => Promise<FastConformerCompleteRangeResult>;

let sharedModelPromise: Promise<LoadedFastConformer> | null = null;
let sharedQuranIdentificationIndexPromise: Promise<QuranWideLexicalIndex> | null = null;
const sharedAssetPromises = new Map<string, Promise<FastConformerAsset>>();

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

class FastConformerAssetError extends Error {
  readonly diagnostic: FastConformerAssetDiagnostic;

  constructor(message: string, diagnostic: FastConformerAssetDiagnostic) {
    super(message);
    this.diagnostic = diagnostic;
  }
}

class FastConformerStageError extends Error {
  readonly stage: FastConformerFailureStage;
  readonly diagnostic?: FastConformerAssetDiagnostic;

  constructor(stage: FastConformerFailureStage, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.stage = stage;
    this.diagnostic = cause instanceof FastConformerAssetError ? cause.diagnostic : undefined;
  }
}

function retryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000);
  const dateMs = Date.parse(value);
  return Number.isNaN(dateMs) ? null : Math.max(0, dateMs - Date.now());
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function browserCache(): Promise<Cache | null> {
  if (typeof caches === "undefined") return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

function assetDiagnostic(url: string, overrides: Partial<FastConformerAssetDiagnostic> = {}): FastConformerAssetDiagnostic {
  return {
    assetUrlHost: new URL(url).host,
    httpStatus: null,
    attemptCount: 0,
    retryAfterMs: null,
    cacheStatus: "cold-download",
    downloadBytes: 0,
    downloadMs: 0,
    ...overrides,
  };
}

async function readAssetBytes(response: Response, expectedBytes: number, onBytesLoaded?: (bytesLoaded: number) => void) {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    onBytesLoaded?.(buffer.byteLength);
    return buffer;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesLoaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    bytesLoaded += value.byteLength;
    onBytesLoaded?.(Math.min(bytesLoaded, expectedBytes));
  }
  const bytes = new Uint8Array(bytesLoaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes.buffer;
}

async function loadPinnedAsset(url: string, expectedBytes: number, onBytesLoaded?: (bytesLoaded: number) => void): Promise<FastConformerAsset> {
  const cache = await browserCache();
  const cached = cache ? await cache.match(url) : undefined;
  if (cached) {
    const buffer = await cached.arrayBuffer();
    if (buffer.byteLength === expectedBytes) {
      return { buffer, diagnostic: assetDiagnostic(url, { cacheStatus: "browser-cache" }) };
    }
    await cache?.delete(url);
  }

  const downloadStartedAt = performance.now();
  let lastStatus: number | null = null;
  let lastRetryAfterMs: number | null = null;
  let attempts = 0;
  for (let attempt = 1; attempt <= MAX_DOWNLOAD_ATTEMPTS; attempt += 1) {
    attempts = attempt;
    const response = await fetch(url, { cache: "no-store" });
    lastStatus = response.status;
    if (response.status === 429) lastRetryAfterMs = retryAfterMs(response.headers.get("Retry-After"));
    if (response.ok) {
      const buffer = await readAssetBytes(response, expectedBytes, onBytesLoaded);
      const diagnostic = assetDiagnostic(url, {
        assetUrlHost: new URL(response.url || url).host,
        httpStatus: response.status,
        attemptCount: attempt,
        retryAfterMs: lastRetryAfterMs,
        cacheStatus: cache ? "cold-download" : "cache-unavailable",
        downloadBytes: buffer.byteLength,
        downloadMs: Math.round(performance.now() - downloadStartedAt),
      });
      if (buffer.byteLength !== expectedBytes) {
        throw new FastConformerAssetError(`FastConformer asset size validation failed for ${url}: expected ${expectedBytes} bytes, received ${buffer.byteLength}.`, diagnostic);
      }
      if (cache) {
        try {
          await cache.put(url, new Response(buffer.slice(0), { headers: { "content-type": response.headers.get("content-type") ?? "application/octet-stream" } }));
        } catch {
          diagnostic.cacheStatus = "cache-unavailable";
        }
      }
      return { buffer, diagnostic };
    }
    if (response.status !== 429 || attempt === MAX_DOWNLOAD_ATTEMPTS) break;
    await wait(lastRetryAfterMs ?? RETRY_BASE_MS * 2 ** (attempt - 1));
  }
  const diagnostic = assetDiagnostic(url, {
    httpStatus: lastStatus,
    attemptCount: attempts,
    retryAfterMs: lastRetryAfterMs,
    cacheStatus: cache ? "cold-download" : "cache-unavailable",
    downloadMs: Math.round(performance.now() - downloadStartedAt),
  });
  throw new FastConformerAssetError(`FastConformer asset download failed (${lastStatus ?? "network"}).`, diagnostic);
}

/** Loads one immutable public Tilawa artifact with a cache-first, module-single-flight request. */
export function loadFastConformerAsset(url: string, expectedBytes: number, onBytesLoaded?: (bytesLoaded: number) => void): Promise<FastConformerAsset> {
  const existing = sharedAssetPromises.get(url);
  if (existing) return existing;
  const loading = loadPinnedAsset(url, expectedBytes, onBytesLoaded).catch((error) => {
    sharedAssetPromises.delete(url);
    throw error;
  });
  sharedAssetPromises.set(url, loading);
  return loading;
}

async function loadAssets(onProgress?: FastConformerProgressCallback): Promise<FastConformerAssets> {
  // Hugging Face's unauthenticated resolver can reject bursts while its queue
  // is full. Keep cold resolver traffic to one pinned asset at a time.
  const totalBytes = FASTCONFORMER_MODEL_BYTES + FASTCONFORMER_VOCAB_BYTES + FASTCONFORMER_TOKEN_TABLE_BYTES + FASTCONFORMER_QURAN_BYTES;
  let completedBytes = 0;
  const load = async (url: string, expectedBytes: number) => {
    const asset = await loadFastConformerAsset(url, expectedBytes, (bytesLoaded) => {
      onProgress?.({ phase: "downloading-model", bytesLoaded: completedBytes + bytesLoaded, bytesTotal: totalBytes });
    });
    completedBytes += expectedBytes;
    return asset;
  };
  const model = await load(FASTCONFORMER_MODEL_URL, FASTCONFORMER_MODEL_BYTES);
  const vocabulary = await load(VOCAB_URL, FASTCONFORMER_VOCAB_BYTES);
  const tokenTable = await load(TOKEN_TABLE_URL, FASTCONFORMER_TOKEN_TABLE_BYTES);
  const quran = await load(QURAN_URL, FASTCONFORMER_QURAN_BYTES);
  const cacheStatus = model.diagnostic.cacheStatus === "browser-cache" && vocabulary.diagnostic.cacheStatus === "browser-cache" && tokenTable.diagnostic.cacheStatus === "browser-cache" && quran.diagnostic.cacheStatus === "browser-cache"
    ? "browser-cache"
    : model.diagnostic.cacheStatus === "cache-unavailable" || vocabulary.diagnostic.cacheStatus === "cache-unavailable" || tokenTable.diagnostic.cacheStatus === "cache-unavailable" || quran.diagnostic.cacheStatus === "cache-unavailable"
      ? "cache-unavailable"
      : "cold-download";
  const parsedVocabulary = JSON.parse(new TextDecoder().decode(vocabulary.buffer)) as Vocabulary;
  const parsedTokenTable = JSON.parse(new TextDecoder().decode(tokenTable.buffer)) as TokenTable;
  const parsedQuran = JSON.parse(new TextDecoder().decode(quran.buffer)) as TilawaQuranVerse[];
  const quranText = Object.fromEntries(parsedQuran.map((verse) => [`${verse.surah}:${verse.ayah}`, verse.text_clean ?? normalizeTilawaArabic(verse.text_uthmani)]));
  validateSupportingAssets(parsedVocabulary, parsedTokenTable, quranText);
  return {
    model: model.buffer,
    modelSha256: await sha256Hex(model.buffer),
    vocabulary: parsedVocabulary,
    tokenTable: parsedTokenTable,
    quranText,
    cacheStatus,
    downloadBytes: model.diagnostic.downloadBytes + vocabulary.diagnostic.downloadBytes + tokenTable.diagnostic.downloadBytes + quran.diagnostic.downloadBytes,
    downloadMs: Math.max(model.diagnostic.downloadMs, vocabulary.diagnostic.downloadMs, tokenTable.diagnostic.downloadMs, quran.diagnostic.downloadMs),
    modelDiagnostic: model.diagnostic,
  };
}

function validateSupportingAssets(vocabulary: Vocabulary, tokenTable: TokenTable, quranText: TilawaQuranText) {
  const ids = Object.keys(vocabulary).map(Number);
  const vocabSize = ids.length;
  if (vocabSize !== BLANK_TOKEN_ID + 1 || ids.some((id) => !Number.isInteger(id) || id < 0 || id >= vocabSize) || vocabulary[String(BLANK_TOKEN_ID)] !== "<blank>") {
    throw new Error("Tilawa supporting assets have an unsupported vocabulary/blank-id contract.");
  }
  if (!Object.keys(tokenTable).length || Object.values(tokenTable).some((ids) => !Array.isArray(ids))) {
    throw new Error("Tilawa quran_ctc_tokens.json has an unsupported token-table schema.");
  }
  if (!Object.keys(quranText).length) throw new Error("Tilawa quran.json has an unsupported text schema.");
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("FastConformer model integrity validation requires Web Crypto SHA-256 support.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadModel(onProgress?: FastConformerProgressCallback): Promise<LoadedFastConformer> {
  const modelLoadStartedAt = performance.now();
  let assets: FastConformerAssets;
  try {
    assets = await loadAssets(onProgress);
  } catch (error) {
    throw new FastConformerStageError("asset", error);
  }
  const modelLoadMs = Math.round(performance.now() - modelLoadStartedAt);
  try {
    const ort = await import("fastconformer-onnxruntime-web/wasm") as typeof import("onnxruntime-web");
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;
    const sessionStartedAt = performance.now();
    const session = await ort.InferenceSession.create(assets.model, { executionProviders: ["wasm"] });
    return {
      session,
      ort,
      backend: "wasm",
      sessionCreateMs: Math.round(performance.now() - sessionStartedAt),
      modelLoadMs,
      assets,
    };
  } catch (error) {
    throw new FastConformerStageError("session-create", error);
  }
}

function verseTableKey(verseKey: string) {
  const [surah, ayah] = verseKey.split(":");
  return `${surah}:${ayah}:${ayah}`;
}

/**
 * Exact semantic equivalent of Tilawa's public core normalizer. This is used
 * only for diagnostics; target IDs always come directly from
 * quran_ctc_tokens.json.
 */
function vocabularySize(vocabulary: Vocabulary) {
  return Math.max(-1, ...Object.keys(vocabulary).map(Number)) + 1;
}

function isLexicalToken(tokenId: number, token: string) {
  return tokenId !== BLANK_TOKEN_ID && token !== "" && token !== "<unk>" && token !== "<blank>" && token !== WORD_PREFIX;
}

type CanonicalTextSpan = { wordIndex: number; start: number; end: number };

function tokenLexicalText(tokenId: number, token: string) {
  if (!isLexicalToken(tokenId, token)) return "";
  return normalizeTilawaArabic(token.replaceAll(WORD_PREFIX, "")).replaceAll(" ", "");
}

function canonicalTextSpans(words: readonly string[]): CanonicalTextSpan[] {
  let offset = 0;
  return words.map((word, index) => {
    const text = word.replaceAll(" ", "");
    const span = { wordIndex: index + 1, start: offset, end: offset + text.length };
    offset = span.end;
    return span;
  });
}

function wordIndexAtCharacter(spans: readonly CanonicalTextSpan[], characterIndex: number) {
  return spans.find((span) => characterIndex >= span.start && characterIndex < span.end)?.wordIndex ?? null;
}

function codePoints(value: string) {
  return Array.from(value).map((character, index) => ({ index, character, codePoint: `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}` }));
}

function firstMismatchIndex(left: string, right: string) {
  let index = 0;
  while (index < left.length && index < right.length && left[index] === right[index]) index += 1;
  return index;
}

class FastConformerTargetConstructionError extends Error {
  readonly diagnostic: FastConformerTargetConstructionFailure;

  constructor(diagnostic: FastConformerTargetConstructionFailure) {
    super(`Tilawa BPE target cannot map reconstructed Arabic to canonical words for ${diagnostic.verseKey}.`);
    this.diagnostic = diagnostic;
  }
}

/** Builds exact BPE target ids from Tilawa's published canonical token table. */
export function encodeFastConformerWords(
  canonicalWords: readonly CtcCanonicalWord[],
  tokenTable: TokenTable,
  vocabulary: Vocabulary,
  tilawaQuranText: TilawaQuranText = {},
): { canonicalWords: CtcCanonicalWord[]; targetTokens: CtcTargetToken[]; optionalPreludeTokens: CtcTargetToken[]; targetTokenMapping: FastConformerTargetToken[]; targetValidation: FastConformerTargetValidation[]; optionalPreludeLexicalText: string; optionalPreludeLexicalTextByVerse: ReadonlyMap<string, string> } {
  const words = canonicalWords.map((word) => ({ ...word, alignmentText: normalizeTilawaArabic(word.canonicalArabic) }));
  const targetTokens: CtcTargetToken[] = [];
  const optionalPreludeTokens: CtcTargetToken[] = [];
  const targetTokenMapping: FastConformerTargetToken[] = [];
  const targetValidation: FastConformerTargetValidation[] = [];
  const optionalPreludeLexicalTextByVerse = new Map<string, string>();
  let optionalPreludeLexicalText = "";
  const vocabSize = vocabularySize(vocabulary);
  const wordsByVerse = new Map<string, CtcCanonicalWord[]>();
  for (const word of words) {
    const verseWords = wordsByVerse.get(word.verseKey) ?? [];
    verseWords.push(word);
    wordsByVerse.set(word.verseKey, verseWords);
  }
  for (const [verseKey, verseWords] of wordsByVerse) {
    const ids = tokenTable[verseTableKey(verseKey)];
    if (!ids?.length) throw new Error(`Tilawa's token table has no canonical target for ${verseKey}.`);
    const invalidTokenIds = ids.filter((tokenId) => !Number.isInteger(tokenId) || tokenId < 0 || tokenId >= vocabSize || tokenId === BLANK_TOKEN_ID);
    targetValidation.push({ verseKey, tokenCount: ids.length, firstTokenIds: ids.slice(0, 12), lastTokenIds: ids.slice(-12), invalidTokenIds });
    if (invalidTokenIds.length) throw new Error(`Tilawa's token table has invalid CTC ids for ${verseKey}: ${invalidTokenIds.join(", ")}.`);
    const pieces = ids.map((tokenId) => {
      const token = vocabulary[String(tokenId)];
      if (typeof token !== "string") throw new Error(`Tilawa's vocabulary has no entry for token id ${tokenId} in ${verseKey}.`);
      return { tokenId, token, lexicalText: tokenLexicalText(tokenId, token) };
    });
    const canonicalRaw = verseWords.map((word) => word.canonicalArabic).join(" ");
    const tilawaCanonicalRaw = tilawaQuranText[verseKey] ?? canonicalRaw;
    const tilawaWords = normalizeTilawaArabic(tilawaCanonicalRaw).split(" ").filter(Boolean);
    const canonicalWordTexts = tilawaWords.length >= verseWords.length
      ? tilawaWords.slice(-verseWords.length)
      : verseWords.map((word) => word.alignmentText);
    const spans = canonicalTextSpans(canonicalWordTexts);
    const canonicalText = canonicalWordTexts.join("");
    const canonicalNormalized = canonicalWordTexts.join(" ");
    for (const [index, word] of verseWords.entries()) word.alignmentText = canonicalWordTexts[index]!;
    const reconstructedText = pieces.map((piece) => piece.lexicalText).join("");
    if (!reconstructedText) throw new Error(`Tilawa BPE target reconstructs no normalized Arabic for ${verseKey}.`);
    const tableKey = verseTableKey(verseKey);
    const canonicalOffset = reconstructedText.length - canonicalText.length;
    const suffixMatches = canonicalOffset >= 0 && reconstructedText.slice(canonicalOffset) === canonicalText;
    if (!suffixMatches) {
      throw new FastConformerTargetConstructionError({
        verseKey,
        tableKey,
        tokenIds: [...ids],
        decodedPieces: pieces.map((piece) => piece.token),
        reconstructedRaw: pieces.map((piece) => piece.token).join("").replaceAll(WORD_PREFIX, " "),
        reconstructedNormalized: normalizeTilawaArabic(pieces.map((piece) => piece.token).join("").replaceAll(WORD_PREFIX, " ")),
        canonicalRaw,
        canonicalNormalized,
        canonicalLexicalText: canonicalText,
        firstMismatchIndex: firstMismatchIndex(normalizeTilawaArabic(pieces.map((piece) => piece.token).join("").replaceAll(WORD_PREFIX, " ")), canonicalNormalized),
        reconstructedCodePoints: codePoints(normalizeTilawaArabic(pieces.map((piece) => piece.token).join("").replaceAll(WORD_PREFIX, " "))),
        canonicalCodePoints: codePoints(canonicalNormalized),
      });
    }
    let reconstructedOffset = 0;
    const lexicalOwners = pieces.map((piece) => {
      const start = reconstructedOffset;
      reconstructedOffset += piece.lexicalText.length;
      if (!piece.lexicalText || start < canonicalOffset) return null;
      return wordIndexAtCharacter(spans, start - canonicalOffset);
    });
    const observedWords = new Set(lexicalOwners.filter((owner): owner is number => owner !== null));
    if (observedWords.size !== verseWords.length || verseWords.some((_, index) => !observedWords.has(index + 1))) {
      throw new Error(`Tilawa BPE target has incomplete canonical coverage for ${verseKey}.`);
    }
    // Non-lexical BPE pieces (including Tilawa's published token 0) belong to
    // the canonical target when there is no lexical prefix. Only a real
    // lexical span before the selected Quran text forms an optional prelude.
    const firstCanonicalPieceIndex = canonicalOffset > 0 ? lexicalOwners.findIndex((owner) => owner !== null) : 0;
    const preludePieces = pieces.slice(0, firstCanonicalPieceIndex);
    const preludeLexicalOwners = preludePieces.length ? (() => {
      const lexicalPrelude = normalizeTilawaArabic(preludePieces.map((piece) => piece.token).join("").replaceAll(WORD_PREFIX, " "));
      const preludeSpans = canonicalTextSpans(lexicalPrelude.split(" ").filter(Boolean));
      let preludeOffset = 0;
      const owners = preludePieces.map((piece) => {
        const start = preludeOffset;
        preludeOffset += piece.lexicalText.length;
        return piece.lexicalText ? wordIndexAtCharacter(preludeSpans, start) : null;
      });
      const observed = new Set(owners.filter((owner): owner is number => owner !== null));
      const complete = observed.size === preludeSpans.length && preludeSpans.every((_, index) => observed.has(index + 1));
      return complete ? owners.map((owner, index) => owner
        ?? owners.slice(index + 1).find((candidate): candidate is number => candidate !== null)
        ?? [...owners.slice(0, index)].reverse().find((candidate): candidate is number => candidate !== null)
        ?? null) : undefined;
    })() : undefined;
    if (firstCanonicalPieceIndex > 0) {
      const lexicalPrelude = normalizeTilawaArabic(preludePieces.map((piece) => piece.token).join("").replaceAll(WORD_PREFIX, " "));
      optionalPreludeLexicalText += `${lexicalPrelude} `;
      optionalPreludeLexicalTextByVerse.set(verseKey, lexicalPrelude);
    }
    const verseMapping = pieces.map((piece, index) => {
      if (index < firstCanonicalPieceIndex) {
        const optionalPreludeWordIndex = preludeLexicalOwners?.[index];
        return { tokenId: piece.tokenId, token: piece.token, verseKey, owner: "optional-prelude" as const, ...(optionalPreludeWordIndex ? { optionalPreludeWordIndex } : {}) };
      }
      const canonicalWordIndex = lexicalOwners[index]
        ?? lexicalOwners.slice(index + 1).find((owner): owner is number => owner !== null)
        ?? [...lexicalOwners.slice(firstCanonicalPieceIndex, index)].reverse().find((owner): owner is number => owner !== null);
      if (canonicalWordIndex === undefined) throw new Error(`Tilawa BPE target has no canonical word owner for ${verseKey}.`);
      return { tokenId: piece.tokenId, token: piece.token, verseKey, owner: "canonical" as const, canonicalWordIndex, globalWordIndex: verseWords[canonicalWordIndex - 1]!.globalWordIndex };
    });
    const canonicalMapping = verseMapping.filter((mapped) => mapped.owner === "canonical");
    if (canonicalMapping.some((mapped, index) => index > 0 && mapped.canonicalWordIndex! < canonicalMapping[index - 1]!.canonicalWordIndex!)) {
      throw new Error(`Tilawa BPE target has non-monotonic canonical word ownership for ${verseKey}.`);
    }
    for (const mapped of verseMapping) {
      targetTokenMapping.push(mapped);
      if (mapped.owner === "optional-prelude") optionalPreludeTokens.push({ tokenId: mapped.tokenId, token: mapped.token, owner: "optional-prelude", ...(mapped.optionalPreludeWordIndex ? { optionalPreludeWordIndex: mapped.optionalPreludeWordIndex } : {}) });
      else targetTokens.push({ tokenId: mapped.tokenId, token: mapped.token, globalWordIndex: mapped.globalWordIndex, owner: "canonical" });
    }
  }
  return { canonicalWords: words, targetTokens, optionalPreludeTokens, targetTokenMapping, targetValidation, optionalPreludeLexicalText: optionalPreludeLexicalText.trim(), optionalPreludeLexicalTextByVerse };
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
  return normalizeTilawaArabic(ids
    .map((id) => vocabulary[String(id)] ?? "")
    .filter((token) => token && token !== "<unk>" && token !== "<blank>")
    .join("")
    .replaceAll(WORD_PREFIX, " "));
}

function unavailable(
  reason: string,
  verses: readonly QuranCorpusVerse[],
  startedAt: number,
  analysisRunId?: string,
  options: { failureStage?: FastConformerFailureStage; diagnostic?: FastConformerAssetDiagnostic; vocabSize?: number | null; targetValidation?: FastConformerTargetValidation[]; targetTokenMapping?: FastConformerTargetToken[]; targetConstructionFailure?: FastConformerTargetConstructionFailure } = {},
): FastConformerResult {
  return {
    status: "unavailable",
    reason,
    failureStage: options.failureStage,
    analysisRunId,
    tilawaRelease: FASTCONFORMER_TILAWA_RELEASE,
    modelRevision: FASTCONFORMER_MODEL_REVISION,
    vocabRevision: FASTCONFORMER_VOCAB_REVISION,
    tokenTableRevision: FASTCONFORMER_TOKEN_TABLE_REVISION,
    blankId: BLANK_TOKEN_ID,
    vocabSize: options.vocabSize ?? null,
    targetValidation: options.targetValidation ?? [],
    targetTokenMapping: options.targetTokenMapping ?? [],
    optionalPrelude: { available: false, lexicalText: "", tokenIds: [], candidateWithoutPreludeScore: null, candidateWithPreludeScore: null, selected: "absent", startMs: null, endMs: null },
    firstCanonicalTokenFrame: null,
    firstCanonicalWordStartMs: null,
    targetConstructionFailure: options.targetConstructionFailure,
    upstreamTilawaResult: null,
    detectedRange: verses.length ? { startVerseKey: verses[0]!.verseKey, endVerseKey: verses.at(-1)!.verseKey, source: "known-canonical-passage" } : null,
    upstreamTilawaDetectedPassage: null,
    upstreamTilawaConfidence: null,
    forcedAlignmentMeanScore: null,
    greedyTranscript: "",
    frameCount: null,
    frameDurationMs: null,
    combinedTargetTokenCount: 0,
    alignmentComplete: false,
    ayahTimings: [],
    rawLogits: null,
    alignment: { status: "unavailable", reason, canonicalWords: canonicalCtcWords(verses), targetTokens: [], words: [], verses: [], pauses: [], audibleRepetitions: [], frameCount: 0, frameDurationMs: 0 },
    performance: {
      modelArtifactBytes: FASTCONFORMER_MODEL_BYTES,
      supportingAssetBytes: FASTCONFORMER_TOKEN_TABLE_BYTES + FASTCONFORMER_VOCAB_BYTES + FASTCONFORMER_QURAN_BYTES,
      modelDownloadBytes: options.diagnostic?.downloadBytes ?? 0,
      cacheStatus: "unavailable",
      assetUrlHost: options.diagnostic?.assetUrlHost,
      httpStatus: options.diagnostic?.httpStatus,
      attemptCount: options.diagnostic?.attemptCount,
      retryAfterMs: options.diagnostic?.retryAfterMs,
      downloadBytes: options.diagnostic?.downloadBytes ?? 0,
      downloadMs: options.diagnostic?.downloadMs ?? 0,
      ortImport: FASTCONFORMER_ORT_IMPORT,
      ortVersion: FASTCONFORMER_ORT_VERSION,
      executionProvider: "wasm",
      wasmNumThreads: 1,
      wasmSimd: true,
      modelBytes: FASTCONFORMER_MODEL_BYTES,
      totalMs: Math.round(performance.now() - startedAt),
    },
  };
}

function quranWideIdentificationIndex(assets: FastConformerAssets): Promise<QuranWideLexicalIndex> {
  sharedQuranIdentificationIndexPromise ??= Promise.resolve().then(() => {
    const canonicalWords = canonicalCtcWords(hafsVerses);
    const encoded = encodeFastConformerWords(canonicalWords, assets.tokenTable, assets.vocabulary, assets.quranText);
    const tokenIdsByWord = new Map<number, number[]>();
    const optionalPreludeByVerse = new Map<string, number[]>();
    for (const token of encoded.targetTokens) {
      if (token.globalWordIndex === undefined) continue;
      const ids = tokenIdsByWord.get(token.globalWordIndex) ?? [];
      ids.push(token.tokenId);
      tokenIdsByWord.set(token.globalWordIndex, ids);
    }
    for (const token of encoded.targetTokenMapping.filter((item) => item.owner === "optional-prelude")) {
      const ids = optionalPreludeByVerse.get(token.verseKey) ?? [];
      ids.push(token.tokenId);
      optionalPreludeByVerse.set(token.verseKey, ids);
    }
    return buildQuranWideLexicalIndex(encoded.canonicalWords.map((word) => {
      const [surah, ayah] = word.verseKey.split(":").map(Number);
      return {
        surah: surah!,
        ayah: ayah!,
        canonicalWordIndex: word.canonicalWordIndex,
        globalWordIndex: word.globalWordIndex,
        canonicalArabic: word.canonicalArabic,
        lexicalText: word.alignmentText,
        ctcTokenIds: tokenIdsByWord.get(word.globalWordIndex) ?? [],
        optionalPreludeCtcTokenIds: word.canonicalWordIndex === 1 ? optionalPreludeByVerse.get(word.verseKey) : undefined,
        optionalPreludeLexicalText: word.canonicalWordIndex === 1 ? encoded.optionalPreludeLexicalTextByVerse.get(word.verseKey) : undefined,
      };
    }));
  }).catch((error) => {
    sharedQuranIdentificationIndexPromise = null;
    throw error;
  });
  return sharedQuranIdentificationIndexPromise;
}

function identificationAudioWindows(audio: Float32Array, speechRegions: readonly VadSpeechRegion[]) {
  const durationMs = Math.round(audio.length / SAMPLE_RATE * 1_000);
  const windows: Array<{ startMs: number; endMs: number; startSample: number; endSample: number; voicedMs: number }> = [];
  for (let startMs = 0; startMs < durationMs; startMs += FASTCONFORMER_IDENTIFICATION_DEFAULTS.hopMs) {
    const endMs = Math.min(durationMs, startMs + FASTCONFORMER_IDENTIFICATION_DEFAULTS.windowMs);
    const voicedMs = speechRegions.reduce((sum, region) => sum + Math.max(0, Math.min(endMs, region.endMs) - Math.max(startMs, region.startMs)), 0);
    if (voicedMs >= FASTCONFORMER_IDENTIFICATION_DEFAULTS.minimumVoicedMs) {
      windows.push({
        startMs,
        endMs,
        startSample: Math.max(0, Math.floor(startMs * SAMPLE_RATE / 1_000)),
        endSample: Math.min(audio.length, Math.ceil(endMs * SAMPLE_RATE / 1_000)),
        voicedMs,
      });
    }
    if (endMs === durationMs) break;
  }
  return windows;
}

function unavailableIdentification(reason: string, totalMs: number): FastConformerIdentificationResult {
  return {
    status: "unavailable",
    reason,
    span: null,
    wordLevelSpan: null,
    canonicalSpan: null,
    selectedSurah: null,
    optionalPrelude: null,
    surahConsensus: { selectedSurah: null, strongWindowCount: 0, agreeingStrongWindows: 0 },
    windowResults: [],
    retrievalCandidates: [],
    normalizedCtcScore: null,
    margin: null,
    continuityScore: 0,
    globalHypotheses: [],
    confidence: { composite: null, normalizedBestCtcScore: null, bestVsSecondMargin: null, agreeingWindows: 0, voicedAudioExplained: 0 },
    performance: { inferenceMs: 0, retrievalMs: 0, rerankingMs: 0, candidatesReranked: 0, totalMs },
    CROSS_SURAH_CANDIDATES_REJECTED: 0,
  };
}

/**
 * Creates a Quran-wide FastConformer CTC search runner. It has no Whisper
 * input and never yields caption timing; the production evidence gate owns its
 * later canonical-span decision.
 */
export function createFastConformerIdentificationRunner(audio: Float32Array, speechRegions: readonly VadSpeechRegion[]): FastConformerIdentificationRunner {
  return async (onProgress) => {
    const startedAt = performance.now();
    const audioWindows = identificationAudioWindows(audio, speechRegions);
    if (!audioWindows.length) return unavailableIdentification("No sufficiently voiced VAD window was available for FastConformer identification.", Math.round(performance.now() - startedAt));
    try {
      sharedModelPromise ??= loadModel(onProgress).catch((error) => { sharedModelPromise = null; throw error; });
      const loaded = await sharedModelPromise;
      const index = await quranWideIdentificationIndex(loaded.assets);
      if (!loaded.session.inputNames.includes("audio_signal") || !loaded.session.inputNames.includes("length")) throw new Error(`FastConformer has an unsupported input contract: ${loaded.session.inputNames.join(", ")}.`);
      let inferenceMs = 0;
      const windows = [];
      let continuation: QuranContinuationState | null = null;
      for (const [windowIndex, window] of audioWindows.entries()) {
        const inferenceStartedAt = performance.now();
        const samples = audio.slice(window.startSample, window.endSample);
        const outputs = await loaded.session.run({
          audio_signal: new loaded.ort.Tensor("float32", samples, [1, samples.length]),
          length: new loaded.ort.Tensor("int64", BigInt64Array.from([BigInt(samples.length)]), [1]),
        });
        const output = outputs[loaded.session.outputNames[0]!];
        const [, frames, vocabularySize] = output?.dims ?? [];
        if (!output || !(output.data instanceof Float32Array) || !frames || !vocabularySize || vocabularySize <= BLANK_TOKEN_ID) throw new Error("FastConformer returned an unsupported CTC log-probability shape.");
        inferenceMs += Math.round(performance.now() - inferenceStartedAt);
        const identified = identifyQuranWindow(index, {
          index: windowIndex,
          startMs: window.startMs,
          endMs: window.endMs,
          voicedMs: window.voicedMs,
          logits: { values: output.data, frames, vocabularySize },
          vocabulary: loaded.assets.vocabulary,
          blankTokenId: BLANK_TOKEN_ID,
        }, continuation);
        continuation = advanceQuranContinuationState(continuation, identified);
        windows.push(identified);
        onProgress?.({ phase: "identifying-passage", completed: windowIndex + 1, total: audioWindows.length });
      }
      const summary = summarizeFastConformerIdentification(windows, inferenceMs);
      return { ...summary, performance: { ...summary.performance, totalMs: Math.round(performance.now() - startedAt) } };
    } catch (error) {
      return unavailableIdentification(error instanceof Error ? error.message : String(error), Math.round(performance.now() - startedAt));
    }
  };
}

async function inferFastConformer(loaded: LoadedFastConformer, audio: Float32Array) {
  const outputs = await loaded.session.run({
    audio_signal: new loaded.ort.Tensor("float32", audio, [1, audio.length]),
    length: new loaded.ort.Tensor("int64", BigInt64Array.from([BigInt(audio.length)]), [1]),
  });
  const output = outputs[loaded.session.outputNames[0]!];
  const [, frames, vocabularySize] = output?.dims ?? [];
  if (!output || !(output.data instanceof Float32Array) || !frames || !vocabularySize || vocabularySize <= BLANK_TOKEN_ID) {
    throw new Error("FastConformer returned an unsupported CTC log-probability shape.");
  }
  return { values: output.data, frames, vocabularySize };
}

function emptyBoundaryLocation(edge: "start" | "end", atMs: number) {
  return { edge, searchStartMs: atMs, searchEndMs: atMs, coarseEvaluationCount: 0, fineEvaluationCount: 0, selected: null, candidates: [] } as const;
}

async function verifyAdjacentEdge(input: {
  edge: "start" | "end";
  candidateAyah: number;
  surah: number;
  coreStartMs: number;
  coreEndMs: number;
  durationMs: number;
  audio: Float32Array;
  speechRegions: readonly VadSpeechRegion[];
  loaded: LoadedFastConformer;
}): Promise<EdgeAcousticEvidence> {
  const region = boundedBoundaryRegion({
    edge: input.edge,
    coreStartMs: input.coreStartMs,
    coreEndMs: input.coreEndMs,
    audioDurationMs: input.durationMs,
  });
  const boundaryAudio = input.audio.slice(
    Math.max(0, Math.floor(region.startMs * SAMPLE_RATE / 1_000)),
    Math.min(input.audio.length, Math.ceil(region.endMs * SAMPLE_RATE / 1_000)),
  );
  const candidateVerses = versesForExactRange({ surah: input.surah, startAyah: input.candidateAyah, endAyah: input.candidateAyah });
  const encoded = encodeFastConformerWords(canonicalCtcWords(candidateVerses), input.loaded.assets.tokenTable, input.loaded.assets.vocabulary, input.loaded.assets.quranText);
  const logits = boundaryAudio.length ? await inferFastConformer(input.loaded, boundaryAudio) : null;
  const rawCandidateScore = logits ? ctcForwardScore(logits, encoded.targetTokens.map((token) => token.tokenId), BLANK_TOKEN_ID) : null;
  const candidateScore = rawCandidateScore === null || !logits ? null : rawCandidateScore / logits.frames;
  const noExtensionScore = logits ? normalizedBlankCtcLogLikelihood(logits, BLANK_TOKEN_ID) : null;
  const alignment = logits ? forceAlignCtc(encoded.canonicalWords, encoded.targetTokens, logits, {
    blankTokenId: BLANK_TOKEN_ID,
    startMs: region.startMs,
    endMs: region.endMs,
    finalSpeechEndMs: region.endMs,
    frameExactEndpoints: true,
  }) : null;
  const rawPreludeScore = logits && encoded.optionalPreludeTokens.length
    ? ctcForwardScore(logits, encoded.optionalPreludeTokens.map((token) => token.tokenId), BLANK_TOKEN_ID)
    : null;
  const preludeScore = rawPreludeScore === null || !logits ? null : rawPreludeScore / logits.frames;
  const alignedTokenCount = alignment?.status === "complete" ? alignment.targetTokens.length : 0;
  return {
    edge: input.edge,
    candidateAyah: input.candidateAyah,
    voicedDurationMs: voicedDurationInRegion(input.speechRegions, region.startMs, region.endMs),
    candidateTokenCount: encoded.targetTokens.length,
    alignedTokenCount,
    candidateLogLikelihoodPerFrame: candidateScore ?? Number.NEGATIVE_INFINITY,
    noExtensionLogLikelihoodPerFrame: noExtensionScore ?? Number.NEGATIVE_INFINITY,
    alignmentComplete: alignment?.status === "complete",
    temporallyOrderedOutsideCore: input.edge === "start" ? region.endMs <= input.coreStartMs : region.startMs >= input.coreEndMs,
    overlapsCoreAudio: input.edge === "start" ? region.endMs > input.coreStartMs : region.startMs < input.coreEndMs,
    optionalBasmalahOnly: preludeScore !== null && candidateScore !== null && noExtensionScore !== null
      && preludeScore > candidateScore && candidateScore <= noExtensionScore,
  };
}

/**
 * Resolves the frozen complete-range pipeline and final timing in one worker
 * operation. It performs no Quran-wide search: the supplied identification is
 * the sole global decision, while all later hypotheses are bounded and known.
 */
export function createCompleteRangeFastConformerRunner(
  audio: Float32Array,
  speechRegions: readonly VadSpeechRegion[],
  analysisRunId?: string,
): FastConformerCompleteRangeRunner {
  return async (identification, onProgress) => {
    const coreDecision = resolveQuranCore(identification);
    const baseReuse = {
      pcmReused: true as const,
      vadReused: true as const,
      modelSessionReused: sharedModelPromise !== null,
      fullRecordingLogitsReused: false,
      globalQuranSearches: 1 as const,
      edgeInferenceCount: 0,
    };
    if (!coreDecision.accepted || !coreDecision.core) {
      return { status: "rejected", reason: coreDecision.reason, coreDecision, exactRange: null, canonicalSpan: null, boundaryLocalization: null, edgeVerification: null, alignment: null, reuse: baseReuse };
    }
    const startedAt = performance.now();
    try {
      const memoryWarm = sharedModelPromise !== null;
      sharedModelPromise ??= loadModel(onProgress).catch((error) => { sharedModelPromise = null; throw error; });
      const loaded = await sharedModelPromise;
      const core = coreDecision.core;
      const coreVerses = versesForExactRange(core);
      if (!coreVerses.length) throw new Error("The selected Quran core is outside the canonical corpus.");
      const coreEncoded = encodeFastConformerWords(canonicalCtcWords(coreVerses), loaded.assets.tokenTable, loaded.assets.vocabulary, loaded.assets.quranText);
      onProgress?.({ phase: "aligning-words", step: "inference" });
      const inferenceStartedAt = performance.now();
      const fullLogits = await inferFastConformer(loaded, audio);
      const inferenceMs = Math.round(performance.now() - inferenceStartedAt);
      const durationMs = Math.round(audio.length / SAMPLE_RATE * 1_000);
      const firstSpeechMs = speechRegions[0]?.startMs ?? 0;
      const finalSpeechMs = speechRegions.at(-1)?.endMs ?? durationMs;
      const establishedLogits = sliceCtcLogits(fullLogits, 0, durationMs, firstSpeechMs, finalSpeechMs);
      const established = establishedLogits ? forceAlignCtc(coreEncoded.canonicalWords, coreEncoded.targetTokens, establishedLogits, {
        blankTokenId: BLANK_TOKEN_ID,
        startMs: firstSpeechMs,
        endMs: finalSpeechMs,
        finalSpeechEndMs: finalSpeechMs,
        frameExactEndpoints: true,
      }) : null;
      const establishedStartMs = established?.status === "complete" ? established.words[0]?.startMs ?? null : null;
      const establishedEndMs = established?.status === "complete" ? established.verses.at(-1)?.endMs ?? null : null;
      const surahAyahCount = hafsVerses.filter((verse) => verse.verseKey.startsWith(`${core.surah}:`)).length;
      const anchorCount = FROZEN_CORE_BOUNDARY_RULE.boundaryTargetAyahCount;
      const startAnchor = versesForExactRange({ surah: core.surah, startAyah: core.startAyah, endAyah: Math.min(core.endAyah, core.startAyah + anchorCount - 1) });
      const endAnchor = versesForExactRange({ surah: core.surah, startAyah: Math.max(core.startAyah, core.endAyah - anchorCount + 1), endAyah: core.endAyah });
      const startEncoded = encodeFastConformerWords(canonicalCtcWords(startAnchor), loaded.assets.tokenTable, loaded.assets.vocabulary, loaded.assets.quranText);
      const endEncoded = encodeFastConformerWords(canonicalCtcWords(endAnchor), loaded.assets.tokenTable, loaded.assets.vocabulary, loaded.assets.quranText);
      const startLocation = core.startAyah > 1 ? locateCoreBoundary({
        edge: "start", audioStartMs: 0, audioEndMs: durationMs, firstSpeechMs, finalSpeechMs,
        logits: fullLogits, canonicalWords: startEncoded.canonicalWords, targetTokens: startEncoded.targetTokens, blankTokenId: BLANK_TOKEN_ID,
      }) : emptyBoundaryLocation("start", establishedStartMs ?? firstSpeechMs);
      const endLocation = core.endAyah < surahAyahCount ? locateCoreBoundary({
        edge: "end", audioStartMs: 0, audioEndMs: durationMs, firstSpeechMs, finalSpeechMs,
        logits: fullLogits, canonicalWords: endEncoded.canonicalWords, targetTokens: endEncoded.targetTokens, blankTokenId: BLANK_TOKEN_ID,
      }) : emptyBoundaryLocation("end", establishedEndMs ?? finalSpeechMs);
      const applicable = selectApplicableCoreBoundaries({ core, surahAyahCount, establishedStartMs, establishedEndMs, startLocation, endLocation });
      const coreStartMs = applicable.startMs;
      const coreEndMs = applicable.endMs;
      const localized = coreStartMs !== null && coreEndMs !== null && coreEndMs > coreStartMs
        ? sliceCtcLogits(fullLogits, 0, durationMs, coreStartMs, coreEndMs)
        : null;
      const wholeCore = localized && coreStartMs !== null && coreEndMs !== null ? forceAlignCtc(coreEncoded.canonicalWords, coreEncoded.targetTokens, localized, {
        blankTokenId: BLANK_TOKEN_ID,
        startMs: coreStartMs,
        endMs: coreEndMs,
        finalSpeechEndMs: coreEndMs,
        frameExactEndpoints: true,
      }) : null;
      const wholeCoreComplete = wholeCore?.status === "complete" && wholeCore.targetTokens.length === coreEncoded.targetTokens.length;
      const boundaryLocalization: QuranBoundaryLocalization = { start: startLocation, end: endLocation, coreStartMs, coreEndMs, wholeCoreComplete };
      if (!wholeCoreComplete || coreStartMs === null || coreEndMs === null) {
        return { status: "rejected", reason: "incomplete-whole-core-alignment", coreDecision, exactRange: null, canonicalSpan: null, boundaryLocalization, edgeVerification: null, alignment: null, reuse: { ...baseReuse, modelSessionReused: memoryWarm, fullRecordingLogitsReused: true } };
      }

      const startEvidence = core.startAyah > 1 ? await verifyAdjacentEdge({
        edge: "start", candidateAyah: core.startAyah - 1, surah: core.surah, coreStartMs, coreEndMs,
        durationMs, audio, speechRegions, loaded,
      }) : null;
      const endEvidence = core.endAyah < surahAyahCount ? await verifyAdjacentEdge({
        edge: "end", candidateAyah: core.endAyah + 1, surah: core.surah, coreStartMs, coreEndMs,
        durationMs, audio, speechRegions, loaded,
      }) : null;
      const completed = completeBoundedEdges({ core, surahAyahCount, startEvidence, endEvidence });
      const exactRange = completed.range;
      const finalVerses = versesForExactRange(exactRange);
      const canonicalSpan = canonicalSpanFromExactRange(exactRange);
      if (!finalVerses.length || !canonicalSpan) throw new Error("The exact Quran range could not be expanded canonically.");
      const encoded = encodeFastConformerWords(canonicalCtcWords(finalVerses), loaded.assets.tokenTable, loaded.assets.vocabulary, loaded.assets.quranText);
      const finalStartMs = completed.start.extended || core.startAyah === 1 ? firstSpeechMs : coreStartMs;
      const finalEndMs = completed.end.extended || core.endAyah === surahAyahCount ? finalSpeechMs : coreEndMs;
      const finalLogits = sliceCtcLogits(fullLogits, 0, durationMs, finalStartMs, finalEndMs);
      if (!finalLogits) throw new Error("The exact Quran range has no usable VAD-constrained alignment interval.");
      const finalLogitValues = finalLogits.values instanceof Float32Array ? finalLogits.values : Float32Array.from(finalLogits.values);
      onProgress?.({ phase: "aligning-words", step: "forced-alignment" });
      const alignmentStartedAt = performance.now();
      const alignmentWithoutPrelude = forceAlignCtc(encoded.canonicalWords, encoded.targetTokens, finalLogits, {
        blankTokenId: BLANK_TOKEN_ID, startMs: finalStartMs, endMs: finalEndMs, finalSpeechEndMs: finalEndMs, frameExactEndpoints: true,
      });
      const alignmentWithPrelude = encoded.optionalPreludeTokens.length ? forceAlignCtc(encoded.canonicalWords, [...encoded.optionalPreludeTokens, ...encoded.targetTokens], finalLogits, {
        blankTokenId: BLANK_TOKEN_ID, startMs: finalStartMs, endMs: finalEndMs, finalSpeechEndMs: finalEndMs, frameExactEndpoints: true,
      }) : null;
      const withoutPreludeScore = alignmentWithoutPrelude.status === "complete" ? alignmentWithoutPrelude.normalizedPathScore ?? null : null;
      const withPreludeScore = alignmentWithPrelude?.status === "complete" ? alignmentWithPrelude.normalizedPathScore ?? null : null;
      const preludePresent = withPreludeScore !== null && (withoutPreludeScore === null || withPreludeScore > withoutPreludeScore);
      const ctcAlignment = preludePresent ? alignmentWithPrelude! : alignmentWithoutPrelude;
      const transitionBoundaryWords = ctcAlignment.status === "complete"
        ? deriveCtcTransitionBoundaryWords(ctcAlignment.canonicalWords, ctcAlignment.targetTokens, finalLogits, { blankTokenId: BLANK_TOKEN_ID, startMs: finalStartMs, endMs: finalEndMs }) ?? undefined
        : undefined;
      const alignment = transitionBoundaryWords ? {
        ...ctcAlignment,
        words: ctcAlignment.words.map((word, index) => ({ ...word, endMs: transitionBoundaryWords[index]?.endMs ?? word.endMs })),
      } : ctcAlignment;
      const alignmentMs = Math.round(performance.now() - alignmentStartedAt);
      const forcedAlignmentMeanScore = alignment.status === "complete" && alignment.words.length
        ? Number((alignment.words.reduce((sum, word) => sum + word.confidence, 0) / alignment.words.length).toFixed(4))
        : null;
      const fastConformerResult: FastConformerResult = {
        status: alignment.status,
        reason: alignment.reason,
        analysisRunId,
        tilawaRelease: FASTCONFORMER_TILAWA_RELEASE,
        modelRevision: FASTCONFORMER_MODEL_REVISION,
        vocabRevision: FASTCONFORMER_VOCAB_REVISION,
        tokenTableRevision: FASTCONFORMER_TOKEN_TABLE_REVISION,
        blankId: BLANK_TOKEN_ID,
        vocabSize: fullLogits.vocabularySize,
        targetValidation: encoded.targetValidation,
        targetTokenMapping: encoded.targetTokenMapping,
        optionalPrelude: {
          available: encoded.optionalPreludeTokens.length > 0,
          lexicalText: encoded.optionalPreludeLexicalText,
          tokenIds: encoded.optionalPreludeTokens.map((token) => token.tokenId),
          candidateWithoutPreludeScore: withoutPreludeScore,
          candidateWithPreludeScore: withPreludeScore,
          selected: preludePresent ? "present" : "absent",
          startMs: preludePresent ? alignment.optionalPreludeTiming?.startMs ?? null : null,
          endMs: preludePresent ? alignment.optionalPreludeTiming?.endMs ?? null : null,
          ...(preludePresent && alignment.optionalPreludeWords ? { wordTimings: alignment.optionalPreludeWords.map((word) => ({ canonicalWordIndex: word.wordIndex, startMs: word.startMs, endMs: word.endMs })) } : {}),
        },
        firstCanonicalTokenFrame: alignment.status === "complete" ? alignment.firstCanonicalTokenFrame ?? null : null,
        firstCanonicalWordStartMs: alignment.status === "complete" ? alignment.words[0]?.startMs ?? null : null,
        upstreamTilawaResult: null,
        upstreamTilawaDetectedPassage: null,
        upstreamTilawaConfidence: null,
        detectedRange: { startVerseKey: finalVerses[0]!.verseKey, endVerseKey: finalVerses.at(-1)!.verseKey, source: "known-canonical-passage" },
        forcedAlignmentMeanScore,
        greedyTranscript: greedyDecode(finalLogitValues, finalLogits.frames, finalLogits.vocabularySize, loaded.assets.vocabulary),
        frameCount: finalLogits.frames,
        frameDurationMs: Number(((finalEndMs - finalStartMs) / finalLogits.frames).toFixed(4)),
        combinedTargetTokenCount: encoded.targetTokens.length,
        alignmentComplete: alignment.status === "complete",
        ayahTimings: alignment.verses.map((verse) => {
          const words = alignment.words.filter((word) => word.verseKey === verse.verseKey);
          return { verseKey: verse.verseKey, startMs: verse.startMs, endMs: verse.endMs, acousticScore: words.length ? Number((words.reduce((sum, word) => sum + word.alignmentScore, 0) / words.length).toFixed(4)) : 0 };
        }),
        rawLogits: { frames: finalLogits.frames, vocabularySize: finalLogits.vocabularySize, blankTokenId: BLANK_TOKEN_ID, frameDurationMs: Number(((finalEndMs - finalStartMs) / finalLogits.frames).toFixed(4)) },
        wordEndPolicy: "ctc-transition-boundary",
        alignment,
        performance: {
          modelArtifactBytes: FASTCONFORMER_MODEL_BYTES,
          supportingAssetBytes: FASTCONFORMER_TOKEN_TABLE_BYTES + FASTCONFORMER_VOCAB_BYTES + FASTCONFORMER_QURAN_BYTES,
          modelDownloadBytes: memoryWarm ? 0 : loaded.assets.downloadBytes,
          cacheStatus: memoryWarm ? "memory" : loaded.assets.cacheStatus,
          backend: loaded.backend,
          ortImport: FASTCONFORMER_ORT_IMPORT,
          ortVersion: FASTCONFORMER_ORT_VERSION,
          executionProvider: "wasm",
          wasmNumThreads: 1,
          wasmSimd: true,
          sessionCreateMs: loaded.sessionCreateMs,
          modelLoadMs: loaded.modelLoadMs,
          alignmentMs,
          modelBytes: loaded.assets.model.byteLength,
          modelSha256: loaded.assets.modelSha256,
          inferenceMs,
          totalMs: Math.round(performance.now() - startedAt),
        },
      };
      const edgeInferenceCount = Number(startEvidence !== null) + Number(endEvidence !== null);
      return {
        status: alignment.status === "complete" ? "complete" : "failed",
        reason: alignment.status === "complete" ? null : alignment.reason ?? "incomplete-final-forced-alignment",
        coreDecision,
        exactRange,
        canonicalSpan,
        boundaryLocalization,
        edgeVerification: { start: completed.start, end: completed.end },
        alignment: fastConformerResult,
        reuse: { ...baseReuse, modelSessionReused: memoryWarm, fullRecordingLogitsReused: true, edgeInferenceCount },
      };
    } catch (error) {
      return {
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
        coreDecision,
        exactRange: null,
        canonicalSpan: null,
        boundaryLocalization: null,
        edgeVerification: null,
        alignment: null,
        reuse: baseReuse,
      };
    }
  };
}

/** Creates a lazy browser-only known-passage runner over the same decoded 16 kHz PCM. */
export function createFastConformerRunner(
  audio: Float32Array,
  speechRegions: readonly VadSpeechRegion[],
  analysisRunId?: string,
  options: { includeTransitionBoundaryDiagnostics?: boolean; wordEndPolicy?: "ctc-transition-boundary" | "first-aligned-token" } = {},
): FastConformerRunner {
  return async (verses, matches, onProgress) => {
    const startedAt = performance.now();
    const window = passageWindow(audio, speechRegions, matches);
    if (!window) return unavailable("No VAD-constrained Quran interval was available for FastConformer alignment.", verses, startedAt, analysisRunId, { failureStage: "target-construction" });
    const memoryWarm = sharedModelPromise !== null;
    let encoded: ReturnType<typeof encodeFastConformerWords> | null = null;
    let loaded: LoadedFastConformer | null = null;
    let failureStage: FastConformerFailureStage = "asset";
    try {
      const loadingStartedAt = performance.now();
      sharedModelPromise ??= loadModel(onProgress).catch((error) => { sharedModelPromise = null; throw error; });
      loaded = await sharedModelPromise;
      const loadMs = Math.round(performance.now() - loadingStartedAt);
      failureStage = "target-construction";
      encoded = encodeFastConformerWords(canonicalCtcWords(verses), loaded.assets.tokenTable, loaded.assets.vocabulary, loaded.assets.quranText);
      failureStage = "session-create";
      if (!loaded.session.inputNames.includes("audio_signal") || !loaded.session.inputNames.includes("length")) throw new Error(`FastConformer has an unsupported input contract: ${loaded.session.inputNames.join(", ")}.`);
      failureStage = "inference";
      onProgress?.({ phase: "aligning-words", step: "inference" });
      const inferenceStartedAt = performance.now();
      const outputs = await loaded.session.run({
        audio_signal: new loaded.ort.Tensor("float32", window.audio, [1, window.audio.length]),
        length: new loaded.ort.Tensor("int64", BigInt64Array.from([BigInt(window.audio.length)]), [1]),
      });
      const output = outputs[loaded.session.outputNames[0]!];
      const [, frames, vocabularySize] = output?.dims ?? [];
      if (!output || !(output.data instanceof Float32Array) || !frames || !vocabularySize || vocabularySize <= BLANK_TOKEN_ID) throw new Error("FastConformer returned an unsupported CTC log-probability shape.");
      const inferenceMs = Math.round(performance.now() - inferenceStartedAt);
      failureStage = "forced-alignment";
      onProgress?.({ phase: "aligning-words", step: "forced-alignment" });
      const alignmentStartedAt = performance.now();
      const alignmentWithoutPrelude = forceAlignCtc(encoded.canonicalWords, encoded.targetTokens, { values: output.data, frames, vocabularySize }, {
        blankTokenId: BLANK_TOKEN_ID,
        startMs: window.startMs,
        endMs: window.endMs,
        finalSpeechEndMs: window.endMs,
        frameExactEndpoints: true,
      });
      const alignmentWithPrelude = encoded.optionalPreludeTokens.length
        ? forceAlignCtc(encoded.canonicalWords, [...encoded.optionalPreludeTokens, ...encoded.targetTokens], { values: output.data, frames, vocabularySize }, {
          blankTokenId: BLANK_TOKEN_ID,
          startMs: window.startMs,
          endMs: window.endMs,
          finalSpeechEndMs: window.endMs,
          frameExactEndpoints: true,
        })
        : null;
      // A CTC path score is a sum over every frame. Compare its mean log
      // posterior per frame so adding optional target labels cannot win merely
      // because it changes the raw path length.
      const withoutPreludeScore = alignmentWithoutPrelude.status === "complete" ? alignmentWithoutPrelude.normalizedPathScore ?? null : null;
      const withPreludeScore = alignmentWithPrelude?.status === "complete" ? alignmentWithPrelude.normalizedPathScore ?? null : null;
      const preludePresent = withPreludeScore !== null && (withoutPreludeScore === null || withPreludeScore > withoutPreludeScore);
      const ctcAlignment = preludePresent ? alignmentWithPrelude! : alignmentWithoutPrelude;
      const alignmentMs = Math.round(performance.now() - alignmentStartedAt);
      const greedyTranscript = greedyDecode(output.data, frames, vocabularySize, loaded.assets.vocabulary);
      const transitionBoundaryWords = ctcAlignment.status === "complete"
        ? deriveCtcTransitionBoundaryWords(ctcAlignment.canonicalWords, ctcAlignment.targetTokens, { values: output.data, frames, vocabularySize }, { blankTokenId: BLANK_TOKEN_ID, startMs: window.startMs, endMs: window.endMs }) ?? undefined
        : undefined;
      const wordEndPolicy = options.wordEndPolicy ?? "ctc-transition-boundary";
      const alignment = wordEndPolicy === "ctc-transition-boundary" && transitionBoundaryWords
        ? {
          ...ctcAlignment,
          words: ctcAlignment.words.map((word, index) => ({ ...word, endMs: transitionBoundaryWords[index]?.endMs ?? word.endMs })),
          // Verse starts and inter-ayah continuity remain the authoritative
          // CTC values. Only word ends are replaced by transition evidence.
        }
        : ctcAlignment;
      const forcedAlignmentMeanScore = alignment.status === "complete" && alignment.words.length
        ? Number((alignment.words.reduce((sum, word) => sum + word.confidence, 0) / alignment.words.length).toFixed(4))
        : null;
      return {
        status: alignment.status,
        reason: alignment.reason,
        analysisRunId,
        tilawaRelease: FASTCONFORMER_TILAWA_RELEASE,
        modelRevision: FASTCONFORMER_MODEL_REVISION,
        vocabRevision: FASTCONFORMER_VOCAB_REVISION,
        tokenTableRevision: FASTCONFORMER_TOKEN_TABLE_REVISION,
        blankId: BLANK_TOKEN_ID,
        vocabSize: vocabularySize,
        targetValidation: encoded.targetValidation,
        targetTokenMapping: encoded.targetTokenMapping,
        optionalPrelude: {
          available: encoded.optionalPreludeTokens.length > 0,
          lexicalText: encoded.optionalPreludeLexicalText,
          tokenIds: encoded.optionalPreludeTokens.map((token) => token.tokenId),
          candidateWithoutPreludeScore: withoutPreludeScore,
          candidateWithPreludeScore: withPreludeScore,
          selected: preludePresent ? "present" : "absent",
          startMs: preludePresent ? alignment.optionalPreludeTiming?.startMs ?? null : null,
          endMs: preludePresent ? alignment.optionalPreludeTiming?.endMs ?? null : null,
          ...(preludePresent && alignment.optionalPreludeWords ? {
            wordTimings: alignment.optionalPreludeWords.map((word) => ({ canonicalWordIndex: word.wordIndex, startMs: word.startMs, endMs: word.endMs })),
          } : {}),
        },
        firstCanonicalTokenFrame: alignment.status === "complete" ? alignment.firstCanonicalTokenFrame ?? null : null,
        firstCanonicalWordStartMs: alignment.status === "complete" ? alignment.words[0]?.startMs ?? null : null,
        upstreamTilawaResult: null,
        upstreamTilawaDetectedPassage: null,
        upstreamTilawaConfidence: null,
        detectedRange: verses.length ? { startVerseKey: verses[0]!.verseKey, endVerseKey: verses.at(-1)!.verseKey, source: "known-canonical-passage" } : null,
        forcedAlignmentMeanScore,
        greedyTranscript,
        frameCount: frames,
        frameDurationMs: Number(((window.endMs - window.startMs) / frames).toFixed(4)),
        combinedTargetTokenCount: encoded.targetTokens.length,
        alignmentComplete: alignment.status === "complete",
        ayahTimings: alignment.verses.map((verse) => {
          const words = alignment.words.filter((word) => word.verseKey === verse.verseKey);
          return { verseKey: verse.verseKey, startMs: verse.startMs, endMs: verse.endMs, acousticScore: words.length ? Number((words.reduce((sum, word) => sum + word.alignmentScore, 0) / words.length).toFixed(4)) : 0 };
        }),
        rawLogits: { frames, vocabularySize, blankTokenId: BLANK_TOKEN_ID, frameDurationMs: Number(((window.endMs - window.startMs) / frames).toFixed(4)) },
        wordEndPolicy,
        transitionBoundaryWords: options.includeTransitionBoundaryDiagnostics ? transitionBoundaryWords : undefined,
        alignment,
        performance: {
          modelArtifactBytes: FASTCONFORMER_MODEL_BYTES,
          supportingAssetBytes: FASTCONFORMER_TOKEN_TABLE_BYTES + FASTCONFORMER_VOCAB_BYTES + FASTCONFORMER_QURAN_BYTES,
          modelDownloadBytes: memoryWarm ? 0 : loaded.assets.downloadBytes,
          cacheStatus: memoryWarm ? "memory" : loaded.assets.cacheStatus,
          assetUrlHost: loaded.assets.modelDiagnostic.assetUrlHost,
          httpStatus: loaded.assets.modelDiagnostic.httpStatus,
          attemptCount: loaded.assets.modelDiagnostic.attemptCount,
          retryAfterMs: loaded.assets.modelDiagnostic.retryAfterMs,
          downloadBytes: memoryWarm ? 0 : loaded.assets.downloadBytes,
          downloadMs: memoryWarm ? 0 : loaded.assets.downloadMs,
          backend: loaded.backend,
          ortImport: FASTCONFORMER_ORT_IMPORT,
          ortVersion: FASTCONFORMER_ORT_VERSION,
          executionProvider: "wasm",
          wasmNumThreads: 1,
          wasmSimd: true,
          sessionCreateMs: loaded.sessionCreateMs,
          modelLoadMs: loaded.modelLoadMs,
          alignmentMs,
          modelBytes: loaded.assets.model.byteLength,
          modelSha256: loaded.assets.modelSha256,
          coldModelLoadMs: memoryWarm ? undefined : loadMs,
          warmModelLoadMs: memoryWarm ? loadMs : undefined,
          inferenceMs,
          totalMs: Math.round(performance.now() - startedAt),
        },
      };
    } catch (error) {
      return unavailable(
        error instanceof Error ? error.message : String(error),
        verses,
        startedAt,
        analysisRunId,
        {
          failureStage: error instanceof FastConformerStageError ? error.stage : failureStage,
          diagnostic: error instanceof FastConformerStageError ? error.diagnostic : error instanceof FastConformerAssetError ? error.diagnostic : undefined,
          vocabSize: loaded ? vocabularySize(loaded.assets.vocabulary) : null,
          targetValidation: encoded?.targetValidation,
          targetTokenMapping: encoded?.targetTokenMapping,
          targetConstructionFailure: error instanceof FastConformerTargetConstructionError ? error.diagnostic : undefined,
        },
      );
    }
  };
}
