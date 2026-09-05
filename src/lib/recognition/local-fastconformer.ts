import {
  canonicalCtcWords,
  forceAlignCtc,
  type CtcCanonicalWord,
  type CtcForcedAlignmentResult,
  type CtcTargetToken,
} from "./ctc-forced-alignment.ts";
import { hafsVerses, type QuranCorpusVerse } from "./core.ts";
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
export const FASTCONFORMER_SHADOW_RUNTIME = "ONNX Runtime Web 1.24.2 (WASM only; Tilawa-compatible)";
export const FASTCONFORMER_SHADOW_ORT_IMPORT = "fastconformer-onnxruntime-web/wasm";
export const FASTCONFORMER_SHADOW_ORT_VERSION = "1.24.2";
/** Public Tilawa release whose browser assets and core contract were audited. */
export const FASTCONFORMER_TILAWA_RELEASE = "v0.2.0";
export const FASTCONFORMER_SHADOW_VOCAB_REVISION = FASTCONFORMER_SHADOW_MODEL_REVISION;
export const FASTCONFORMER_SHADOW_TOKEN_TABLE_REVISION = FASTCONFORMER_SHADOW_MODEL_REVISION;
const FASTCONFORMER_BASE_URL = `https://huggingface.co/${FASTCONFORMER_SHADOW_MODEL}/resolve/${FASTCONFORMER_SHADOW_MODEL_REVISION}`;
export const FASTCONFORMER_SHADOW_MODEL_URL = `${FASTCONFORMER_BASE_URL}/${FASTCONFORMER_SHADOW_MODEL_ARTIFACT}`;
const VOCAB_URL = `${FASTCONFORMER_BASE_URL}/vocab.json`;
const TOKEN_TABLE_URL = `${FASTCONFORMER_BASE_URL}/quran_ctc_tokens.json`;
const CACHE_NAME = "quran-video-fastconformer-shadow-v2";
const SAMPLE_RATE = 16_000;
const BLANK_TOKEN_ID = 1_024;
const WORD_PREFIX = "▁";
const MAX_DOWNLOAD_ATTEMPTS = 3;
const RETRY_BASE_MS = 1_000;

type OrtTensor = { data: unknown; dims: readonly number[] };
type TokenTable = Record<string, number[]>;
type Vocabulary = Record<string, string>;
export type FastConformerTargetToken = {
  tokenId: number;
  token: string;
  verseKey: string;
  /** Null for upstream non-lexical entries such as the table's `<unk>` ID. */
  canonicalWordIndex: number | null;
  globalWordIndex: number | null;
};
export type FastConformerTargetValidation = {
  verseKey: string;
  tokenCount: number;
  firstTokenIds: number[];
  lastTokenIds: number[];
  invalidTokenIds: number[];
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

export type FastConformerShadowResult = {
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
  upstreamTilawaResult: UpstreamTilawaResult | null;
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

export type FastConformerShadowRunner = (verses: readonly QuranCorpusVerse[], matches: readonly { startMs: number; endMs: number }[]) => Promise<FastConformerShadowResult>;

let sharedModelPromise: Promise<LoadedFastConformer> | null = null;
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

async function loadPinnedAsset(url: string, expectedBytes: number): Promise<FastConformerAsset> {
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
      const buffer = await response.arrayBuffer();
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
export function loadFastConformerAsset(url: string, expectedBytes: number): Promise<FastConformerAsset> {
  const existing = sharedAssetPromises.get(url);
  if (existing) return existing;
  const loading = loadPinnedAsset(url, expectedBytes).catch((error) => {
    sharedAssetPromises.delete(url);
    throw error;
  });
  sharedAssetPromises.set(url, loading);
  return loading;
}

async function loadAssets(): Promise<FastConformerAssets> {
  // Hugging Face's unauthenticated resolver can reject bursts while its queue
  // is full. Keep cold resolver traffic to one pinned asset at a time.
  const model = await loadFastConformerAsset(FASTCONFORMER_SHADOW_MODEL_URL, FASTCONFORMER_SHADOW_MODEL_BYTES);
  const vocabulary = await loadFastConformerAsset(VOCAB_URL, FASTCONFORMER_SHADOW_VOCAB_BYTES);
  const tokenTable = await loadFastConformerAsset(TOKEN_TABLE_URL, FASTCONFORMER_SHADOW_TOKEN_TABLE_BYTES);
  const cacheStatus = model.diagnostic.cacheStatus === "browser-cache" && vocabulary.diagnostic.cacheStatus === "browser-cache" && tokenTable.diagnostic.cacheStatus === "browser-cache"
    ? "browser-cache"
    : model.diagnostic.cacheStatus === "cache-unavailable" || vocabulary.diagnostic.cacheStatus === "cache-unavailable" || tokenTable.diagnostic.cacheStatus === "cache-unavailable"
      ? "cache-unavailable"
      : "cold-download";
  const parsedVocabulary = JSON.parse(new TextDecoder().decode(vocabulary.buffer)) as Vocabulary;
  const parsedTokenTable = JSON.parse(new TextDecoder().decode(tokenTable.buffer)) as TokenTable;
  validateSupportingAssets(parsedVocabulary, parsedTokenTable);
  return {
    model: model.buffer,
    modelSha256: await sha256Hex(model.buffer),
    vocabulary: parsedVocabulary,
    tokenTable: parsedTokenTable,
    cacheStatus,
    downloadBytes: model.diagnostic.downloadBytes + vocabulary.diagnostic.downloadBytes + tokenTable.diagnostic.downloadBytes,
    downloadMs: Math.max(model.diagnostic.downloadMs, vocabulary.diagnostic.downloadMs, tokenTable.diagnostic.downloadMs),
    modelDiagnostic: model.diagnostic,
  };
}

function validateSupportingAssets(vocabulary: Vocabulary, tokenTable: TokenTable) {
  const ids = Object.keys(vocabulary).map(Number);
  const vocabSize = ids.length;
  if (vocabSize !== BLANK_TOKEN_ID + 1 || ids.some((id) => !Number.isInteger(id) || id < 0 || id >= vocabSize) || vocabulary[String(BLANK_TOKEN_ID)] !== "<blank>") {
    throw new Error("Tilawa supporting assets have an unsupported vocabulary/blank-id contract.");
  }
  if (!Object.keys(tokenTable).length || Object.values(tokenTable).some((ids) => !Array.isArray(ids))) {
    throw new Error("Tilawa quran_ctc_tokens.json has an unsupported token-table schema.");
  }
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error("FastConformer model integrity validation requires Web Crypto SHA-256 support.");
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadModel(): Promise<LoadedFastConformer> {
  const modelLoadStartedAt = performance.now();
  let assets: FastConformerAssets;
  try {
    assets = await loadAssets();
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
 * only for shadow diagnostics; target IDs always come directly from
 * quran_ctc_tokens.json.
 */
function normalizeTilawaArabic(value: string) {
  return value
    .replace(/\ufeff/g, "")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DE\u06DF-\u06ED\u0640]/g, "")
    .replace(/[\u0623\u0625\u0622\u0671\u0629\u0649]/g, (character) => ({ "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا", "ة": "ه", "ى": "ي" })[character] ?? character)
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function vocabularySize(vocabulary: Vocabulary) {
  return Math.max(-1, ...Object.keys(vocabulary).map(Number)) + 1;
}

function isLexicalToken(tokenId: number, token: string) {
  return tokenId !== BLANK_TOKEN_ID && token !== "" && token !== "<unk>" && token !== "<blank>" && token !== WORD_PREFIX;
}

/** Builds exact BPE target ids from Tilawa's published canonical token table. */
export function encodeFastConformerWords(
  canonicalWords: readonly CtcCanonicalWord[],
  tokenTable: TokenTable,
  vocabulary: Vocabulary,
): { canonicalWords: CtcCanonicalWord[]; targetTokens: CtcTargetToken[]; targetTokenMapping: FastConformerTargetToken[]; targetValidation: FastConformerTargetValidation[] } {
  const words = canonicalWords.map((word) => ({ ...word, alignmentText: normalizeTilawaArabic(word.canonicalArabic) }));
  const targetTokens: CtcTargetToken[] = [];
  const targetTokenMapping: FastConformerTargetToken[] = [];
  const targetValidation: FastConformerTargetValidation[] = [];
  const vocabSize = vocabularySize(vocabulary);
  for (const verseKey of [...new Set(words.map((word) => word.verseKey))]) {
    const verseWords = words.filter((word) => word.verseKey === verseKey);
    const ids = tokenTable[verseTableKey(verseKey)];
    if (!ids?.length) throw new Error(`Tilawa's token table has no canonical target for ${verseKey}.`);
    const invalidTokenIds = ids.filter((tokenId) => !Number.isInteger(tokenId) || tokenId < 0 || tokenId >= vocabSize || tokenId === BLANK_TOKEN_ID);
    targetValidation.push({ verseKey, tokenCount: ids.length, firstTokenIds: ids.slice(0, 12), lastTokenIds: ids.slice(-12), invalidTokenIds });
    if (invalidTokenIds.length) throw new Error(`Tilawa's token table has invalid CTC ids for ${verseKey}: ${invalidTokenIds.join(", ")}.`);
    let wordIndex = -1;
    let pendingWordBoundary = false;
    const verseMapping = ids.map((tokenId) => {
      const token = vocabulary[String(tokenId)];
      if (typeof token !== "string") throw new Error(`Tilawa's vocabulary has no entry for token id ${tokenId} in ${verseKey}.`);
      let canonicalWordIndex: number | null = null;
      if (token === WORD_PREFIX) pendingWordBoundary = true;
      if (isLexicalToken(tokenId, token)) {
        if (pendingWordBoundary || token.startsWith(WORD_PREFIX)) wordIndex += 1;
        pendingWordBoundary = false;
        if (wordIndex < 0 || wordIndex >= verseWords.length) throw new Error(`Tilawa BPE word boundaries exceed the selected canonical words for ${verseKey}.`);
        canonicalWordIndex = wordIndex + 1;
      }
      return { tokenId, token, verseKey, canonicalWordIndex, globalWordIndex: canonicalWordIndex === null ? null : verseWords[canonicalWordIndex - 1]!.globalWordIndex };
    });
    if (wordIndex + 1 !== verseWords.length) throw new Error(`Tilawa BPE word boundaries have incomplete canonical coverage for ${verseKey}.`);
    for (const [index, mapped] of verseMapping.entries()) {
      targetTokenMapping.push(mapped);
      const owner = mapped.globalWordIndex
        ?? verseMapping.slice(index + 1).find((candidate) => candidate.globalWordIndex !== null)?.globalWordIndex
        ?? [...verseMapping.slice(0, index)].reverse().find((candidate) => candidate.globalWordIndex !== null)?.globalWordIndex;
      if (owner === null || owner === undefined) throw new Error(`Tilawa BPE target has no canonical word owner for ${verseKey}.`);
      targetTokens.push({ tokenId: mapped.tokenId, token: mapped.token, globalWordIndex: owner });
    }
  }
  return { canonicalWords: words, targetTokens, targetTokenMapping, targetValidation };
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
  options: { failureStage?: FastConformerFailureStage; diagnostic?: FastConformerAssetDiagnostic; vocabSize?: number | null; targetValidation?: FastConformerTargetValidation[]; targetTokenMapping?: FastConformerTargetToken[] } = {},
): FastConformerShadowResult {
  return {
    status: "unavailable",
    reason,
    failureStage: options.failureStage,
    analysisRunId,
    tilawaRelease: FASTCONFORMER_TILAWA_RELEASE,
    modelRevision: FASTCONFORMER_SHADOW_MODEL_REVISION,
    vocabRevision: FASTCONFORMER_SHADOW_VOCAB_REVISION,
    tokenTableRevision: FASTCONFORMER_SHADOW_TOKEN_TABLE_REVISION,
    blankId: BLANK_TOKEN_ID,
    vocabSize: options.vocabSize ?? null,
    targetValidation: options.targetValidation ?? [],
    targetTokenMapping: options.targetTokenMapping ?? [],
    upstreamTilawaResult: null,
    detectedRange: verses.length ? { startVerseKey: verses[0]!.verseKey, endVerseKey: verses.at(-1)!.verseKey, source: "known-canonical-passage" } : null,
    confidence: null,
    greedyTranscript: "",
    rawLogits: null,
    alignment: { status: "unavailable", reason, canonicalWords: canonicalCtcWords(verses), targetTokens: [], words: [], verses: [], pauses: [], audibleRepetitions: [], frameCount: 0, frameDurationMs: 0 },
    performance: {
      modelArtifactBytes: FASTCONFORMER_SHADOW_MODEL_BYTES,
      supportingAssetBytes: FASTCONFORMER_SHADOW_TOKEN_TABLE_BYTES + FASTCONFORMER_SHADOW_VOCAB_BYTES,
      modelDownloadBytes: options.diagnostic?.downloadBytes ?? 0,
      cacheStatus: "unavailable",
      assetUrlHost: options.diagnostic?.assetUrlHost,
      httpStatus: options.diagnostic?.httpStatus,
      attemptCount: options.diagnostic?.attemptCount,
      retryAfterMs: options.diagnostic?.retryAfterMs,
      downloadBytes: options.diagnostic?.downloadBytes ?? 0,
      downloadMs: options.diagnostic?.downloadMs ?? 0,
      ortImport: FASTCONFORMER_SHADOW_ORT_IMPORT,
      ortVersion: FASTCONFORMER_SHADOW_ORT_VERSION,
      executionProvider: "wasm",
      wasmNumThreads: 1,
      wasmSimd: true,
      modelBytes: FASTCONFORMER_SHADOW_MODEL_BYTES,
      totalMs: Math.round(performance.now() - startedAt),
    },
  };
}

async function runUpstreamTilawaOracle(
  audio: Float32Array,
  logits: Float32Array,
  frames: number,
  vocabSize: number,
  assets: FastConformerAssets,
): Promise<UpstreamTilawaResult> {
  try {
    const { createTilawaSession } = await import("@tilawa/core");
    const quran = hafsVerses.map((verse) => {
      const [surah, ayah] = verse.verseKey.split(":").map(Number);
      return { surah, ayah, text_uthmani: verse.text, surah_name: "", surah_name_en: "" };
    });
    const session = createTilawaSession(
      { run: async () => ({ logprobs: logits, timeSteps: frames, vocabSize }) },
      { vocab: assets.vocabulary, quranCtcTokens: assets.tokenTable, quran, blankId: BLANK_TOKEN_ID },
    );
    const result = await session.transcribeRaw(audio);
    return {
      status: "complete",
      transcript: result.text,
      detectedPassage: result.championMatch
        ? { startVerseKey: `${result.championMatch.surah}:${result.championMatch.ayah}`, endVerseKey: `${result.championMatch.surah}:${result.championMatch.ayah_end ?? result.championMatch.ayah}` }
        : null,
      confidence: result.championMatch?.score ?? null,
      tokenCount: result.tokenIds?.length ?? 0,
    };
  } catch (error) {
    return { status: "unavailable", transcript: "", detectedPassage: null, confidence: null, tokenCount: 0, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Creates a lazy browser-only shadow runner over the same decoded 16 kHz PCM. */
export function createFastConformerShadowRunner(audio: Float32Array, speechRegions: readonly VadSpeechRegion[], analysisRunId?: string): FastConformerShadowRunner {
  return async (verses, matches) => {
    const startedAt = performance.now();
    const window = passageWindow(audio, speechRegions, matches);
    if (!window) return unavailable("No VAD-constrained Quran interval was available for FastConformer shadow alignment.", verses, startedAt, analysisRunId, { failureStage: "target-construction" });
    const memoryWarm = sharedModelPromise !== null;
    let encoded: ReturnType<typeof encodeFastConformerWords> | null = null;
    let loaded: LoadedFastConformer | null = null;
    let failureStage: FastConformerFailureStage = "asset";
    try {
      const loadingStartedAt = performance.now();
      sharedModelPromise ??= loadModel().catch((error) => { sharedModelPromise = null; throw error; });
      loaded = await sharedModelPromise;
      const loadMs = Math.round(performance.now() - loadingStartedAt);
      failureStage = "target-construction";
      encoded = encodeFastConformerWords(canonicalCtcWords(verses), loaded.assets.tokenTable, loaded.assets.vocabulary);
      failureStage = "session-create";
      if (!loaded.session.inputNames.includes("audio_signal") || !loaded.session.inputNames.includes("length")) throw new Error(`FastConformer has an unsupported input contract: ${loaded.session.inputNames.join(", ")}.`);
      failureStage = "inference";
      const inferenceStartedAt = performance.now();
      const outputs = await loaded.session.run({
        audio_signal: new loaded.ort.Tensor("float32", window.audio, [1, window.audio.length]),
        length: new loaded.ort.Tensor("int64", BigInt64Array.from([BigInt(window.audio.length)]), [1]),
      });
      const output = outputs[loaded.session.outputNames[0]!];
      const [, frames, vocabularySize] = output?.dims ?? [];
      if (!output || !(output.data instanceof Float32Array) || !frames || !vocabularySize || vocabularySize <= BLANK_TOKEN_ID) throw new Error("FastConformer returned an unsupported CTC log-probability shape.");
      const inferenceMs = Math.round(performance.now() - inferenceStartedAt);
      const upstreamTilawaResult = await runUpstreamTilawaOracle(window.audio, output.data, frames, vocabularySize, loaded.assets);
      failureStage = "forced-alignment";
      const alignmentStartedAt = performance.now();
      const alignment = forceAlignCtc(encoded.canonicalWords, encoded.targetTokens, { values: output.data, frames, vocabularySize }, {
        blankTokenId: BLANK_TOKEN_ID,
        startMs: window.startMs,
        endMs: window.endMs,
        finalSpeechEndMs: window.endMs,
        frameExactEndpoints: true,
      });
      const alignmentMs = Math.round(performance.now() - alignmentStartedAt);
      const greedyTranscript = greedyDecode(output.data, frames, vocabularySize, loaded.assets.vocabulary);
      const confidence = alignment.status === "complete" && alignment.words.length
        ? Number((alignment.words.reduce((sum, word) => sum + word.confidence, 0) / alignment.words.length).toFixed(4))
        : null;
      return {
        status: alignment.status,
        reason: alignment.reason,
        analysisRunId,
        tilawaRelease: FASTCONFORMER_TILAWA_RELEASE,
        modelRevision: FASTCONFORMER_SHADOW_MODEL_REVISION,
        vocabRevision: FASTCONFORMER_SHADOW_VOCAB_REVISION,
        tokenTableRevision: FASTCONFORMER_SHADOW_TOKEN_TABLE_REVISION,
        blankId: BLANK_TOKEN_ID,
        vocabSize: vocabularySize,
        targetValidation: encoded.targetValidation,
        targetTokenMapping: encoded.targetTokenMapping,
        upstreamTilawaResult,
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
          assetUrlHost: loaded.assets.modelDiagnostic.assetUrlHost,
          httpStatus: loaded.assets.modelDiagnostic.httpStatus,
          attemptCount: loaded.assets.modelDiagnostic.attemptCount,
          retryAfterMs: loaded.assets.modelDiagnostic.retryAfterMs,
          downloadBytes: memoryWarm ? 0 : loaded.assets.downloadBytes,
          downloadMs: memoryWarm ? 0 : loaded.assets.downloadMs,
          backend: loaded.backend,
          ortImport: FASTCONFORMER_SHADOW_ORT_IMPORT,
          ortVersion: FASTCONFORMER_SHADOW_ORT_VERSION,
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
        },
      );
    }
  };
}
