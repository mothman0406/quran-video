import * as ort from "fastconformer-onnxruntime-web/wasm";
import { canonicalCtcWords, forceAlignCtc } from "../../src/lib/recognition/ctc-forced-alignment.ts";
import { ctcForwardScore } from "../../src/lib/recognition/fastconformer-identification.ts";
import {
  FASTCONFORMER_BASE_URL,
  FASTCONFORMER_MODEL_URL,
} from "../../src/lib/recognition/contracts.ts";
import {
  encodeFastConformerWords,
} from "../../src/lib/recognition/local-fastconformer.ts";
import { hafsVerses } from "../../src/lib/recognition/core.ts";
import { detectLocalSpeechRegions } from "../../src/lib/recognition/vad.ts";
import { completeBoundedEdges } from "./quran-edge-completion.ts";
import {
  BOUNDARY_CAPTURE_DESIGNATIONS,
  boundedBoundaryRegion,
  normalizedBlankCtcLogLikelihood,
  voicedDurationInRegion,
} from "./quran-boundary-evidence.ts";
import {
  CORE_BOUNDARY_EVIDENCE_SCHEMA_VERSION,
  summarizeCoreBoundary,
  type PrivacySafeCoreBoundaryFixture,
} from "./quran-core-boundary-evidence.ts";
import {
  FROZEN_CORE_BOUNDARY_RULE,
  locateCoreBoundary,
  selectApplicableCoreBoundaries,
  sliceCtcLogits,
} from "./quran-core-boundary-localizer.ts";

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

async function createInferenceSession() {
  const model = await cachedAsset(FASTCONFORMER_MODEL_URL);
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.simd = true;
  return ort.InferenceSession.create(model, { executionProviders: ["wasm"] });
}

async function directBoundaryInference(session: Awaited<ReturnType<typeof createInferenceSession>>, audio: Float32Array) {
  const outputs = await session.run({
    audio_signal: new ort.Tensor("float32", audio, [1, audio.length]),
    length: new ort.Tensor("int64", BigInt64Array.from([BigInt(audio.length)]), [1]),
  });
  const output = outputs[session.outputNames[0]!];
  const [, frames, vocabularySize] = output?.dims ?? [];
  if (!output || !(output.data instanceof Float32Array) || !frames || !vocabularySize) throw new Error("Boundary FastConformer output is invalid.");
  return { values: output.data, frames, vocabularySize };
}

async function runBoundaryCapture(designationId: string): Promise<PrivacySafeCoreBoundaryFixture> {
  const startedAt = performance.now();
  const designation = BOUNDARY_CAPTURE_DESIGNATIONS.find((entry) => entry.id === designationId);
  if (!designation) throw new Error("Unknown predesignated boundary capture.");
  const audio = await canonicalMonoPcm();
  const durationMs = Math.round(audio.length / SAMPLE_RATE * 1_000);
  const speechRegions = await detectLocalSpeechRegions(audio, SAMPLE_RATE);
  const coreVerses = verses(designation.core.surah, designation.core.startAyah, designation.core.endAyah);
  const firstSpeech = speechRegions[0]?.startMs ?? 0;
  const finalSpeech = speechRegions.at(-1)?.endMs ?? durationMs;
  const vocabulary = await jsonAsset<Record<string, string>>("vocab.json");
  const tokenTable = await jsonAsset<Record<string, number[]>>("quran_ctc_tokens.json");
  const tilawaQuran = await jsonAsset<Array<{ surah: number; ayah: number; text_clean?: string; text_uthmani: string }>>("quran.json");
  const tilawaText = Object.fromEntries(tilawaQuran.map((verse) => [`${verse.surah}:${verse.ayah}`, verse.text_clean ?? verse.text_uthmani]));
  const session = await createInferenceSession();
  const fullInferenceStartedAt = performance.now();
  const fullLogits = await directBoundaryInference(session, audio);
  const fullRecordingInferenceMs = Math.round(performance.now() - fullInferenceStartedAt);
  const coreEncoded = encodeFastConformerWords(canonicalCtcWords(coreVerses), tokenTable, vocabulary, tilawaText);
  const oldCoreLogits = sliceCtcLogits(fullLogits, 0, durationMs, firstSpeech, finalSpeech);
  const oldCoreAlignment = oldCoreLogits ? forceAlignCtc(coreEncoded.canonicalWords, coreEncoded.targetTokens, oldCoreLogits, {
    blankTokenId: BLANK_TOKEN_ID,
    startMs: firstSpeech,
    endMs: finalSpeech,
    finalSpeechEndMs: finalSpeech,
    frameExactEndpoints: true,
  }) : null;
  const oldCoreStartMs = oldCoreAlignment?.status === "complete" ? oldCoreAlignment.words[0]?.startMs ?? null : null;
  const oldCoreEndMs = oldCoreAlignment?.status === "complete" ? oldCoreAlignment.verses.at(-1)?.endMs ?? null : null;

  const anchorAyahs = FROZEN_CORE_BOUNDARY_RULE.boundaryTargetAyahCount;
  const startAnchorVerses = verses(
    designation.core.surah,
    designation.core.startAyah,
    Math.min(designation.core.endAyah, designation.core.startAyah + anchorAyahs - 1),
  );
  const endAnchorVerses = verses(
    designation.core.surah,
    Math.max(designation.core.startAyah, designation.core.endAyah - anchorAyahs + 1),
    designation.core.endAyah,
  );
  const startEncoded = encodeFastConformerWords(canonicalCtcWords(startAnchorVerses), tokenTable, vocabulary, tilawaText);
  const endEncoded = encodeFastConformerWords(canonicalCtcWords(endAnchorVerses), tokenTable, vocabulary, tilawaText);
  const startLocation = locateCoreBoundary({
    edge: "start", audioStartMs: 0, audioEndMs: durationMs, firstSpeechMs: firstSpeech, finalSpeechMs: finalSpeech,
    logits: fullLogits, canonicalWords: startEncoded.canonicalWords, targetTokens: startEncoded.targetTokens,
    blankTokenId: BLANK_TOKEN_ID,
  });
  const endLocation = locateCoreBoundary({
    edge: "end", audioStartMs: 0, audioEndMs: durationMs, firstSpeechMs: firstSpeech, finalSpeechMs: finalSpeech,
    logits: fullLogits, canonicalWords: endEncoded.canonicalWords, targetTokens: endEncoded.targetTokens,
    blankTokenId: BLANK_TOKEN_ID,
  });
  const surahAyahCount = hafsVerses.filter((verse) => verse.verseKey.startsWith(`${designation.core.surah}:`)).length;
  // A locator is needed only where a canonical adjacent ayah exists. At a
  // surah edge there is no extension hypothesis, so preserve the established
  // outer alignment boundary instead of allowing an irrelevant search to
  // truncate the known core.
  const applicable = selectApplicableCoreBoundaries({
    core: designation.core,
    surahAyahCount,
    establishedStartMs: oldCoreStartMs,
    establishedEndMs: oldCoreEndMs,
    startLocation,
    endLocation,
  });
  const coreStartMs = applicable.startMs;
  const coreEndMs = applicable.endMs;
  const localizedCoreLogits = coreStartMs !== null && coreEndMs !== null && coreEndMs > coreStartMs
    ? sliceCtcLogits(fullLogits, 0, durationMs, coreStartMs, coreEndMs) : null;
  const wholeCoreAlignment = localizedCoreLogits && coreStartMs !== null && coreEndMs !== null
    ? forceAlignCtc(coreEncoded.canonicalWords, coreEncoded.targetTokens, localizedCoreLogits, {
      blankTokenId: BLANK_TOKEN_ID,
      startMs: coreStartMs,
      endMs: coreEndMs,
      finalSpeechEndMs: coreEndMs,
      frameExactEndpoints: true,
    }) : null;
  const wholeCoreAlignmentComplete = wholeCoreAlignment?.status === "complete";
  const wholeCoreTargetTokenCount = coreEncoded.targetTokens.length;
  const wholeCoreAlignedTokenCount = wholeCoreAlignmentComplete ? wholeCoreAlignment.targetTokens.length : 0;

  const region = coreStartMs !== null && coreEndMs !== null
    ? boundedBoundaryRegion({ edge: designation.edge, coreStartMs, coreEndMs, audioDurationMs: durationMs })
    : { startMs: 0, endMs: 0 };
  const startSample = Math.max(0, Math.floor(region.startMs * SAMPLE_RATE / 1_000));
  const endSample = Math.min(audio.length, Math.ceil(region.endMs * SAMPLE_RATE / 1_000));
  const boundaryPcm = audio.slice(startSample, endSample);
  const candidateVerses = verses(designation.core.surah, designation.candidateAyah, designation.candidateAyah);
  const encoded = encodeFastConformerWords(canonicalCtcWords(candidateVerses), tokenTable, vocabulary, tilawaText);
  const edgeInferenceStartedAt = performance.now();
  const logits = boundaryPcm.length ? await directBoundaryInference(session, boundaryPcm) : null;
  const edgeInferenceMs = Math.round(performance.now() - edgeInferenceStartedAt);
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
    temporallyOrderedOutsideCore: coreStartMs !== null && coreEndMs !== null
      && (designation.edge === "start" ? region.endMs <= coreStartMs : region.startMs >= coreEndMs),
    overlapsCoreAudio: coreStartMs === null || coreEndMs === null
      || (designation.edge === "start" ? region.endMs > coreStartMs : region.startMs < coreEndMs),
    optionalBasmalahOnly,
  };
  const completed = completeBoundedEdges({
    core: designation.core,
    surahAyahCount,
    startEvidence: designation.edge === "start" ? edgeEvidence : null,
    endEvidence: designation.edge === "end" ? edgeEvidence : null,
  });
  const edgeDecision = designation.edge === "start" ? completed.start : completed.end;
  const decision = edgeDecision.extended && wholeCoreAlignmentComplete;
  const decisionReasons = [
    ...edgeDecision.reasons,
    ...(!wholeCoreAlignmentComplete ? ["incomplete-whole-core-alignment"] : []),
  ];
  const difference = normalizedCandidateScore !== null && blankScore !== null
    ? Number((normalizedCandidateScore - blankScore).toFixed(6)) : null;
  return {
    schemaVersion: CORE_BOUNDARY_EVIDENCE_SCHEMA_VERSION,
    id: designation.id,
    role: designation.role,
    expectedEdgePresent: designation.expectedEdgePresent,
    edge: designation.edge,
    core: designation.core,
    candidateAyah: designation.candidateAyah,
    audioDurationMs: durationMs,
    oldCoreStartMs,
    oldCoreEndMs,
    startLocator: summarizeCoreBoundary(startLocation),
    endLocator: summarizeCoreBoundary(endLocation),
    selectedCoreStartMs: coreStartMs,
    selectedCoreEndMs: coreEndMs,
    wholeCoreAlignmentComplete,
    wholeCoreTargetTokenCount,
    wholeCoreAlignedTokenCount,
    wholeCoreTargetCoverage: wholeCoreTargetTokenCount
      ? Number((wholeCoreAlignedTokenCount / wholeCoreTargetTokenCount).toFixed(6)) : 0,
    relativeBoundaryStartMs: coreStartMs === null || coreEndMs === null ? null
      : Math.round(region.startMs - (designation.edge === "start" ? coreStartMs : coreEndMs)),
    relativeBoundaryEndMs: coreStartMs === null || coreEndMs === null ? null
      : Math.round(region.endMs - (designation.edge === "start" ? coreStartMs : coreEndMs)),
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
    decision,
    decisionReasons,
    finalRange: decision
      ? `${completed.range.surah}:${completed.range.startAyah}-${completed.range.endAyah}`
      : `${designation.core.surah}:${designation.core.startAyah}-${designation.core.endAyah}`,
    fullRecordingInferenceMs,
    edgeInferenceMs,
    totalRuntimeMs: Math.round(performance.now() - startedAt),
  };
}

declare global {
  interface Window {
    runQuranBoundaryCapture: typeof runBoundaryCapture;
  }
}

window.runQuranBoundaryCapture = runBoundaryCapture;
document.body.dataset.ready = "true";
