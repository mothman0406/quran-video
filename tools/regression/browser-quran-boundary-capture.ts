import * as ort from "fastconformer-onnxruntime-web/wasm";
import { canonicalCtcWords, forceAlignCtc } from "../../src/lib/recognition/ctc-forced-alignment.ts";
import { ctcForwardScore } from "../../src/lib/recognition/fastconformer-identification.ts";
import {
  FASTCONFORMER_BASE_URL,
  FASTCONFORMER_MODEL_URL,
} from "../../src/lib/recognition/contracts.ts";
import {
  createFastConformerRunner,
  encodeFastConformerWords,
} from "../../src/lib/recognition/local-fastconformer.ts";
import { hafsVerses } from "../../src/lib/recognition/core.ts";
import { detectLocalSpeechRegions } from "../../src/lib/recognition/vad.ts";
import { completeBoundedEdges } from "./quran-edge-completion.ts";
import {
  BOUNDARY_CAPTURE_DESIGNATIONS,
  BOUNDARY_EVIDENCE_SCHEMA_VERSION,
  boundedBoundaryRegion,
  normalizedBlankCtcLogLikelihood,
  voicedDurationInRegion,
  type PrivacySafeBoundaryFixture,
} from "./quran-boundary-evidence.ts";

const SAMPLE_RATE = 16_000;
const BLANK_TOKEN_ID = 1_024;
const CACHE_NAME = "quran-video-fastconformer-v3";

async function canonicalMonoPcm() {
  const bytes = await fetch("/__source", { cache: "no-store" }).then((response) => {
    if (!response.ok) throw new Error(`Unable to read designated media: HTTP ${response.status}.`);
    return response.arrayBuffer();
  });
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(bytes);
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * SAMPLE_RATE), SAMPLE_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    return rendered.getChannelData(0).slice();
  } finally {
    await context.close();
  }
}

async function cachedAsset(url: string) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(url);
  if (cached) return cached.arrayBuffer();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Boundary capture asset failed: HTTP ${response.status}.`);
  return response.arrayBuffer();
}

async function jsonAsset<T>(name: string) {
  const bytes = await cachedAsset(`${FASTCONFORMER_BASE_URL}/${name}`);
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function verses(surah: number, startAyah: number, endAyah: number) {
  return hafsVerses.filter((verse) => {
    const [verseSurah, ayah] = verse.verseKey.split(":").map(Number);
    return verseSurah === surah && ayah! >= startAyah && ayah! <= endAyah;
  });
}

async function directBoundaryInference(audio: Float32Array) {
  const model = await cachedAsset(FASTCONFORMER_MODEL_URL);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  const session = await ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
  const outputs = await session.run({
    audio_signal: new ort.Tensor("float32", audio, [1, audio.length]),
    length: new ort.Tensor("int64", BigInt64Array.from([BigInt(audio.length)]), [1]),
  });
  const output = outputs[session.outputNames[0]!];
  const [, frames, vocabularySize] = output?.dims ?? [];
  if (!output || !(output.data instanceof Float32Array) || !frames || !vocabularySize) throw new Error("Boundary FastConformer output is invalid.");
  return { values: output.data, frames, vocabularySize };
}

async function runBoundaryCapture(designationId: string): Promise<PrivacySafeBoundaryFixture> {
  const startedAt = performance.now();
  const designation = BOUNDARY_CAPTURE_DESIGNATIONS.find((entry) => entry.id === designationId);
  if (!designation) throw new Error("Unknown predesignated boundary capture.");
  const audio = await canonicalMonoPcm();
  const durationMs = Math.round(audio.length / SAMPLE_RATE * 1_000);
  const speechRegions = await detectLocalSpeechRegions(audio, SAMPLE_RATE);
  const coreVerses = verses(designation.core.surah, designation.core.startAyah, designation.core.endAyah);
  const firstSpeech = speechRegions[0]?.startMs ?? 0;
  const finalSpeech = speechRegions.at(-1)?.endMs ?? durationMs;
  const coreAlignment = await createFastConformerRunner(audio, speechRegions)(coreVerses, [{ startMs: firstSpeech, endMs: finalSpeech }]);
  if (coreAlignment.status !== "complete" || coreAlignment.firstCanonicalWordStartMs === null || !coreAlignment.ayahTimings.length) {
    throw new Error(`Core localization failed: ${coreAlignment.reason ?? coreAlignment.status}.`);
  }
  const coreStartMs = coreAlignment.firstCanonicalWordStartMs;
  const coreEndMs = coreAlignment.ayahTimings.at(-1)!.endMs;
  const region = boundedBoundaryRegion({ edge: designation.edge, coreStartMs, coreEndMs, audioDurationMs: durationMs });
  const startSample = Math.max(0, Math.floor(region.startMs * SAMPLE_RATE / 1_000));
  const endSample = Math.min(audio.length, Math.ceil(region.endMs * SAMPLE_RATE / 1_000));
  const boundaryPcm = audio.slice(startSample, endSample);
  const candidateVerses = verses(designation.core.surah, designation.candidateAyah, designation.candidateAyah);
  const vocabulary = await jsonAsset<Record<string, string>>("vocab.json");
  const tokenTable = await jsonAsset<Record<string, number[]>>("quran_ctc_tokens.json");
  const tilawaQuran = await jsonAsset<Array<{ surah: number; ayah: number; text_clean?: string; text_uthmani: string }>>("quran.json");
  const tilawaText = Object.fromEntries(tilawaQuran.map((verse) => [`${verse.surah}:${verse.ayah}`, verse.text_clean ?? verse.text_uthmani]));
  const encoded = encodeFastConformerWords(canonicalCtcWords(candidateVerses), tokenTable, vocabulary, tilawaText);
  const logits = boundaryPcm.length ? await directBoundaryInference(boundaryPcm) : null;
  const candidateScore = logits ? ctcForwardScore(logits, encoded.targetTokens.map((token) => token.tokenId), BLANK_TOKEN_ID) : null;
  const normalizedCandidateScore = candidateScore === null || !logits ? null : Number((candidateScore / logits.frames).toFixed(6));
  const blankScore = logits ? normalizedBlankCtcLogLikelihood(logits, BLANK_TOKEN_ID) : null;
  const alignment = logits ? forceAlignCtc(encoded.canonicalWords, encoded.targetTokens, logits, {
    blankTokenId: BLANK_TOKEN_ID,
    startMs: region.startMs,
    endMs: region.endMs,
    finalSpeechEndMs: region.endMs,
    frameExactEndpoints: true,
  }) : null;
  const optionalPreludeScore = logits && encoded.optionalPreludeTokens.length
    ? ctcForwardScore(logits, encoded.optionalPreludeTokens.map((token) => token.tokenId), BLANK_TOKEN_ID) : null;
  const normalizedPreludeScore = optionalPreludeScore === null || !logits ? null : optionalPreludeScore / logits.frames;
  const optionalBasmalahOnly = normalizedPreludeScore !== null && normalizedCandidateScore !== null && blankScore !== null
    && normalizedPreludeScore > normalizedCandidateScore && normalizedCandidateScore <= blankScore;
  const candidateTokenCount = encoded.targetTokens.length;
  const alignedTokenCount = alignment?.status === "complete" ? alignment.targetTokens.length : 0;
  const voicedDurationMs = voicedDurationInRegion(speechRegions, region.startMs, region.endMs);
  const edgeEvidence = {
    edge: designation.edge,
    candidateAyah: designation.candidateAyah,
    voicedDurationMs,
    candidateTokenCount,
    alignedTokenCount,
    candidateLogLikelihoodPerFrame: normalizedCandidateScore ?? Number.NEGATIVE_INFINITY,
    noExtensionLogLikelihoodPerFrame: blankScore ?? Number.NEGATIVE_INFINITY,
    alignmentComplete: alignment?.status === "complete",
    temporallyOrderedOutsideCore: designation.edge === "start" ? region.endMs <= coreStartMs : region.startMs >= coreEndMs,
    overlapsCoreAudio: designation.edge === "start" ? region.endMs > coreStartMs : region.startMs < coreEndMs,
    optionalBasmalahOnly,
  };
  const completed = completeBoundedEdges({
    core: designation.core,
    surahAyahCount: hafsVerses.filter((verse) => verse.verseKey.startsWith(`${designation.core.surah}:`)).length,
    startEvidence: designation.edge === "start" ? edgeEvidence : null,
    endEvidence: designation.edge === "end" ? edgeEvidence : null,
  });
  const decision = designation.edge === "start" ? completed.start : completed.end;
  const difference = normalizedCandidateScore !== null && blankScore !== null
    ? Number((normalizedCandidateScore - blankScore).toFixed(6)) : null;
  return {
    schemaVersion: BOUNDARY_EVIDENCE_SCHEMA_VERSION,
    id: designation.id,
    role: designation.role,
    expectedEdgePresent: designation.expectedEdgePresent,
    edge: designation.edge,
    core: designation.core,
    candidateAyah: designation.candidateAyah,
    relativeBoundaryStartMs: Math.round(region.startMs - (designation.edge === "start" ? coreStartMs : coreEndMs)),
    relativeBoundaryEndMs: Math.round(region.endMs - (designation.edge === "start" ? coreStartMs : coreEndMs)),
    boundaryDurationMs: Math.round(region.endMs - region.startMs),
    voicedDurationMs,
    candidateTokenCount,
    alignedTokenCount,
    targetCoverage: candidateTokenCount ? Number((alignedTokenCount / candidateTokenCount).toFixed(6)) : 0,
    candidateLogLikelihoodPerFrame: normalizedCandidateScore,
    noExtensionLogLikelihoodPerFrame: blankScore,
    likelihoodDifference: difference,
    alignmentComplete: alignment?.status === "complete",
    orderingValid: edgeEvidence.temporallyOrderedOutsideCore,
    coreOverlap: edgeEvidence.overlapsCoreAudio,
    stealsCoreAudio: edgeEvidence.overlapsCoreAudio,
    optionalBasmalahOnly,
    decision: decision.extended,
    decisionReasons: decision.reasons,
    runtimeMs: Math.round(performance.now() - startedAt),
  };
}

declare global {
  interface Window {
    runQuranBoundaryCapture: typeof runBoundaryCapture;
  }
}

window.runQuranBoundaryCapture = runBoundaryCapture;
document.body.dataset.ready = "true";

