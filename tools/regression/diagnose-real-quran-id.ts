#!/usr/bin/env node
/**
 * Local-only real-recording passage diagnostic.
 *
 * The source media and derived PCM belong outside the repository. This tool
 * consumes a previously decoded 16 kHz mono float PCM file and emits only
 * model/decision evidence suitable for audit reports or a compact fixture.
 */
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { canonicalCtcWords } from "../../src/lib/recognition/ctc-forced-alignment.ts";
import { hafsVerses } from "../../src/lib/recognition/core.ts";
import { buildQuranWideLexicalIndex, identifyQuranWindow, retrieveQuranCandidates, rerankQuranCandidates, summarizeFastConformerIdentification, type QuranIdentificationWord } from "../../src/lib/recognition/fastconformer-identification.ts";
import { encodeFastConformerWords } from "../../src/lib/recognition/local-fastconformer.ts";

const SAMPLE_RATE = 16_000;
const BLANK_TOKEN_ID = 1_024;
// Keep this standalone so it can execute unmodified against historical
// worktrees which predate contracts.ts. These are the pinned public artifact
// identifiers, not a second model configuration.
const FASTCONFORMER_BASE_URL = "https://huggingface.co/acibZ/tilawa-quran-onnx/resolve/0cd79471524bc9cfa1c9296055242a935a1873e4";
const FASTCONFORMER_MODEL_ARTIFACT = "fastconformer_full_mixed.onnx";
const FASTCONFORMER_MODEL_BYTES = 88_307_366;
const FASTCONFORMER_TOKEN_TABLE_BYTES = 12_211_783;
const FASTCONFORMER_VOCAB_BYTES = 21_062;
const FASTCONFORMER_QURAN_BYTES = 3_186_385;
const defaults = { windowMs: 12_000, hopMs: 6_000, coarseCandidateLimit: 48, rerankCandidateLimit: 24 } as const;
const pcmPath = process.argv[2];
const assetDirectory = process.argv[3];
if (!pcmPath || !assetDirectory) throw new Error("Usage: diagnose-real-quran-id.ts <mono-16k-f32le.pcm> <tilawa-assets-directory>");

const assetSizes: Record<string, number> = {
  [FASTCONFORMER_MODEL_ARTIFACT]: FASTCONFORMER_MODEL_BYTES,
  "vocab.json": FASTCONFORMER_VOCAB_BYTES,
  "quran_ctc_tokens.json": FASTCONFORMER_TOKEN_TABLE_BYTES,
  "quran.json": FASTCONFORMER_QURAN_BYTES,
};
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const request = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!request.startsWith(FASTCONFORMER_BASE_URL)) return nativeFetch(input, init);
  const name = basename(new URL(request).pathname);
  const bytes = await readFile(join(assetDirectory, name));
  const expected = assetSizes[name];
  if (!expected || bytes.byteLength !== expected) throw new Error(`Unexpected local asset ${name}.`);
  return new Response(bytes, { status: 200 });
};

const raw = await readFile(pcmPath);
const audio = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / Float32Array.BYTES_PER_ELEMENT)).slice();
const [{ InferenceSession, Tensor, env }, vocabularyFile, tokenTableFile, quranFile] = await Promise.all([
  import("fastconformer-onnxruntime-web/wasm"),
  readFile(join(assetDirectory, "vocab.json"), "utf8"),
  readFile(join(assetDirectory, "quran_ctc_tokens.json"), "utf8"),
  readFile(join(assetDirectory, "quran.json"), "utf8"),
]);
env.wasm.numThreads = 1;
env.wasm.simd = true;
const session = await InferenceSession.create(await readFile(join(assetDirectory, FASTCONFORMER_MODEL_ARTIFACT)), { executionProviders: ["wasm"] });
const vocabulary = JSON.parse(vocabularyFile) as Record<string, string>;
const tokenTable = JSON.parse(tokenTableFile) as Record<string, number[]>;
const quranText = Object.fromEntries((JSON.parse(quranFile) as Array<{ surah: number; ayah: number; text_clean?: string; text_uthmani: string }>).map((verse) => [`${verse.surah}:${verse.ayah}`, verse.text_clean ?? verse.text_uthmani]));
const encoded = encodeFastConformerWords(canonicalCtcWords(hafsVerses), tokenTable, vocabulary, quranText);
const tokenIdsByWord = new Map<number, number[]>();
const preludeByVerse = new Map<string, number[]>();
for (const token of encoded.targetTokens) {
  if (token.globalWordIndex === undefined) continue;
  tokenIdsByWord.set(token.globalWordIndex, [...(tokenIdsByWord.get(token.globalWordIndex) ?? []), token.tokenId]);
}
for (const token of encoded.targetTokenMapping.filter((token) => token.owner === "optional-prelude")) {
  preludeByVerse.set(token.verseKey, [...(preludeByVerse.get(token.verseKey) ?? []), token.tokenId]);
}
const index = buildQuranWideLexicalIndex(encoded.canonicalWords.map((word): QuranIdentificationWord => {
  const [surah, ayah] = word.verseKey.split(":").map(Number);
  return { surah: surah!, ayah: ayah!, canonicalWordIndex: word.canonicalWordIndex, globalWordIndex: word.globalWordIndex, canonicalArabic: word.canonicalArabic, lexicalText: word.alignmentText, ctcTokenIds: tokenIdsByWord.get(word.globalWordIndex) ?? [], optionalPreludeCtcTokenIds: word.canonicalWordIndex === 1 ? preludeByVerse.get(word.verseKey) : undefined, optionalPreludeLexicalText: word.canonicalWordIndex === 1 ? encoded.optionalPreludeLexicalTextByVerse.get(word.verseKey) : undefined };
}));

const durationMs = Math.round(audio.length / SAMPLE_RATE * 1_000);
const windows = [];
const details = [];
for (let startMs = 0, windowIndex = 0; startMs < durationMs; startMs += defaults.hopMs, windowIndex += 1) {
  const endMs = Math.min(durationMs, startMs + defaults.windowMs);
  const startSample = Math.floor(startMs * SAMPLE_RATE / 1_000);
  const endSample = Math.ceil(endMs * SAMPLE_RATE / 1_000);
  const samples = audio.slice(startSample, endSample);
  const output = (await session.run({ audio_signal: new Tensor("float32", samples, [1, samples.length]), length: new Tensor("int64", BigInt64Array.of(BigInt(samples.length)), [1]) }))[session.outputNames[0]!];
  if (!output || !(output.data instanceof Float32Array)) throw new Error("Unexpected FastConformer output.");
  const [, frames, vocabularySize] = output.dims;
  if (!frames || !vocabularySize) throw new Error("Unexpected FastConformer output shape.");
  const logits = { values: output.data, frames, vocabularySize };
  const probe = identifyQuranWindow(index, { index: windowIndex, startMs, endMs, voicedMs: endMs - startMs, logits, vocabulary, blankTokenId: BLANK_TOKEN_ID });
  const rawRetrieval = retrieveQuranCandidates(index, probe.greedy.lexicalTokens, defaults.coarseCandidateLimit);
  const rawRerank = rerankQuranCandidates(index, rawRetrieval, logits, BLANK_TOKEN_ID, defaults.rerankCandidateLimit);
  const rank = (candidates: typeof rawRetrieval) => candidates.findIndex((candidate) => candidate.start.surah === 74 && candidate.start.ayah <= 1 && candidate.end.ayah >= 9) + 1;
  details.push({ index: windowIndex, startMs, endMs, greedy: probe.greedy, expectedRetrievalRank: rank(rawRetrieval), expectedRerankRank: rank(rawRerank), retrievalCount: rawRetrieval.length, rerankedCount: rawRerank.length, topRetrieval: rawRetrieval.slice(0, 10), topReranked: rawRerank.slice(0, 10) });
  windows.push(probe);
  if (endMs === durationMs) break;
}
const summary = summarizeFastConformerIdentification(windows, 0);
console.log(JSON.stringify({ pcm: { sampleRate: SAMPLE_RATE, samples: audio.length, durationMs }, windows: details, summary }, null, 2));
