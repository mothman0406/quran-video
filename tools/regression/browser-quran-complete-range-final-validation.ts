import * as ort from "fastconformer-onnxruntime-web/wasm";
import { canonicalCtcWords, forceAlignCtc } from "../../src/lib/recognition/ctc-forced-alignment.ts";
import {
  FASTCONFORMER_IDENTIFICATION_DEFAULTS,
  advanceQuranContinuationState,
  buildQuranWideLexicalIndex,
  ctcForwardScore,
  identifyQuranWindow,
  summarizeFastConformerIdentification,
  type QuranContinuationState,
  type QuranPassageCandidate,
} from "../../src/lib/recognition/fastconformer-identification.ts";
import { FASTCONFORMER_BASE_URL, FASTCONFORMER_MODEL_URL } from "../../src/lib/recognition/contracts.ts";
import { encodeFastConformerWords } from "../../src/lib/recognition/local-fastconformer.ts";
import { hafsVerses } from "../../src/lib/recognition/core.ts";
import type { VadSpeechRegion } from "../../src/lib/recognition/speech-regions.ts";
import { detectLocalSpeechRegions } from "../../src/lib/recognition/vad.ts";
import {
  expandCanonicalAyahRange,
  reconstructCanonicalPassage,
  type CanonicalPassageWindowEvidence,
  type CanonicalRange,
} from "./canonical-passage-reconstruction.ts";
import { completeBoundedEdges, type EdgeAcousticEvidence } from "./quran-edge-completion.ts";
import { boundedBoundaryRegion, normalizedBlankCtcLogLikelihood, voicedDurationInRegion } from "./quran-boundary-evidence.ts";
import { summarizeCoreBoundary } from "./quran-core-boundary-evidence.ts";
import {
  FROZEN_CORE_BOUNDARY_RULE,
  locateCoreBoundary,
  selectApplicableCoreBoundaries,
  sliceCtcLogits,
} from "./quran-core-boundary-localizer.ts";
import { exposeProvisionalLocalCore } from "./quran-local-core.ts";
import { validateWholeRecordingIntegrity } from "./quran-whole-recording-integrity.ts";

const SAMPLE_RATE = 16_000;
const BLANK_TOKEN_ID = 1_024;
const CACHE_NAME = "quran-video-fastconformer-v3";

type Logits = { values: Float32Array; frames: number; vocabularySize: number };
type Session = Awaited<ReturnType<typeof createInferenceSession>>;

function round(value: number) {
  return Number(value.toFixed(6));
}

function range(value: CanonicalRange | null) {
  return value ? `${value.surah}:${value.startAyah}-${value.endAyah}` : "none";
}

function compactCandidate(candidate: QuranPassageCandidate | null) {
  return candidate ? `${candidate.start.surah}:${candidate.start.ayah}-${candidate.end.ayah}` : "none";
}

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
  if (!response.ok) throw new Error(`Validation asset failed: HTTP ${response.status}.`);
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

async function infer(session: Session, audio: Float32Array): Promise<Logits> {
  const outputs = await session.run({
    audio_signal: new ort.Tensor("float32", audio, [1, audio.length]),
    length: new ort.Tensor("int64", BigInt64Array.from([BigInt(audio.length)]), [1]),
  });
  const output = outputs[session.outputNames[0]!];
  const [, frames, vocabularySize] = output?.dims ?? [];
  if (!output || !(output.data instanceof Float32Array) || !frames || !vocabularySize) {
    throw new Error("FastConformer output is invalid.");
  }
  return { values: output.data, frames, vocabularySize };
}

function identificationWindows(audio: Float32Array, speechRegions: readonly { startMs: number; endMs: number }[]) {
  const durationMs = Math.round(audio.length / SAMPLE_RATE * 1_000);
  const windows: Array<{ startMs: number; endMs: number; voicedMs: number; audio: Float32Array }> = [];
  for (let startMs = 0; startMs < durationMs; startMs += FASTCONFORMER_IDENTIFICATION_DEFAULTS.hopMs) {
    const endMs = Math.min(durationMs, startMs + FASTCONFORMER_IDENTIFICATION_DEFAULTS.windowMs);
    const voicedMs = speechRegions.reduce((sum, region) => sum + Math.max(0, Math.min(endMs, region.endMs) - Math.max(startMs, region.startMs)), 0);
    if (voicedMs >= FASTCONFORMER_IDENTIFICATION_DEFAULTS.minimumVoicedMs) {
      windows.push({
        startMs,
        endMs,
        voicedMs,
        audio: audio.slice(Math.floor(startMs * SAMPLE_RATE / 1_000), Math.ceil(endMs * SAMPLE_RATE / 1_000)),
      });
    }
    if (endMs === durationMs) break;
  }
  return windows;
}

function evidenceFromIdentification(identification: ReturnType<typeof summarizeFastConformerIdentification>): CanonicalPassageWindowEvidence[] {
  const coherentPath = new Map((identification.globalHypotheses[0]?.path ?? []).map((entry) => [entry.windowIndex, entry.candidate]));
  const coherentCandidates = [...coherentPath.values()].filter((candidate): candidate is QuranPassageCandidate => candidate !== null);
  const origin = coherentCandidates.length ? Math.min(...coherentCandidates.map((candidate) => candidate.start.globalWordIndex)) : null;
  const coherentSurah = coherentCandidates[0]?.start.surah ?? null;
  return identification.windowResults.map((window) => {
    const local = window.selectedCandidate;
    const coherent = coherentPath.get(window.index) ?? null;
    const localComparable = local && origin !== null && coherentSurah !== null
      && local.start.surah === coherentSurah && local.end.surah === coherentSurah;
    return {
      windowIndex: window.index,
      localWinner: local ? {
        surah: local.start.surah,
        startAyah: local.start.ayah,
        endAyah: local.end.ayah,
        relativeStartWord: localComparable ? local.start.globalWordIndex - origin : null,
        relativeEndWord: localComparable ? local.end.globalWordIndex - origin : null,
        ctc: local.normalizedCtcScore,
        coverage: local.targetCoverage,
        origin: "independent-window-winner",
      } : null,
      coherentPathCandidate: coherent && origin !== null ? {
        surah: coherent.start.surah,
        startAyah: coherent.start.ayah,
        endAyah: coherent.end.ayah,
        relativeStartWord: coherent.start.globalWordIndex - origin,
        relativeEndWord: coherent.end.globalWordIndex - origin,
        ctc: coherent.normalizedCtcScore,
        coverage: coherent.targetCoverage,
        origin: "coherent-path",
        origins: [...(coherent.origins ?? [])],
      } : null,
      anchorEvent: window.continuation.event,
    };
  });
}

function edgeEvidence(input: {
  edge: "start" | "end";
  surah: number;
  candidateAyah: number;
  coreStartMs: number;
  coreEndMs: number;
  durationMs: number;
  audio: Float32Array;
  speechRegions: readonly VadSpeechRegion[];
  session: Session;
  tokenTable: Record<string, number[]>;
  vocabulary: Record<string, string>;
  tilawaText: Record<string, string>;
}) {
  return (async () => {
    const region = boundedBoundaryRegion({
      edge: input.edge,
      coreStartMs: input.coreStartMs,
      coreEndMs: input.coreEndMs,
      audioDurationMs: input.durationMs,
    });
    const pcm = input.audio.slice(
      Math.max(0, Math.floor(region.startMs * SAMPLE_RATE / 1_000)),
      Math.min(input.audio.length, Math.ceil(region.endMs * SAMPLE_RATE / 1_000)),
    );
    const candidateVerse = verses(input.surah, input.candidateAyah, input.candidateAyah);
    const encoded = encodeFastConformerWords(canonicalCtcWords(candidateVerse), input.tokenTable, input.vocabulary, input.tilawaText);
    const startedAt = performance.now();
    const logits = pcm.length ? await infer(input.session, pcm) : null;
    const inferenceMs = Math.round(performance.now() - startedAt);
    const rawScore = logits ? ctcForwardScore(logits, encoded.targetTokens.map((token) => token.tokenId), BLANK_TOKEN_ID) : null;
    const candidateScore = rawScore === null || !logits ? null : round(rawScore / logits.frames);
    const noExtensionScore = logits ? normalizedBlankCtcLogLikelihood(logits, BLANK_TOKEN_ID) : null;
    const alignment = logits ? forceAlignCtc(encoded.canonicalWords, encoded.targetTokens, logits, {
      blankTokenId: BLANK_TOKEN_ID,
      startMs: region.startMs,
      endMs: region.endMs,
      finalSpeechEndMs: region.endMs,
      frameExactEndpoints: true,
    }) : null;
    const preludeScoreRaw = logits && encoded.optionalPreludeTokens.length
      ? ctcForwardScore(logits, encoded.optionalPreludeTokens.map((token) => token.tokenId), BLANK_TOKEN_ID) : null;
    const preludeScore = preludeScoreRaw === null || !logits ? null : preludeScoreRaw / logits.frames;
    const optionalBasmalahOnly = preludeScore !== null && candidateScore !== null && noExtensionScore !== null
      && preludeScore > candidateScore && candidateScore <= noExtensionScore;
    const alignedTokenCount = alignment?.status === "complete" ? alignment.targetTokens.length : 0;
    const evidence: EdgeAcousticEvidence = {
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
      optionalBasmalahOnly,
    };
    return {
      evidence,
      summary: {
        candidateAyah: input.candidateAyah,
        relativeBoundaryStartMs: Math.round(region.startMs - (input.edge === "start" ? input.coreStartMs : input.coreEndMs)),
        relativeBoundaryEndMs: Math.round(region.endMs - (input.edge === "start" ? input.coreStartMs : input.coreEndMs)),
        boundaryDurationMs: Math.round(region.endMs - region.startMs),
        voicedDurationMs: evidence.voicedDurationMs,
        candidateTokenCount: evidence.candidateTokenCount,
        alignedTokenCount,
        targetCoverage: evidence.candidateTokenCount ? round(alignedTokenCount / evidence.candidateTokenCount) : 0,
        candidateLogLikelihoodPerFrame: candidateScore,
        noExtensionLogLikelihoodPerFrame: noExtensionScore,
        likelihoodDifference: candidateScore !== null && noExtensionScore !== null ? round(candidateScore - noExtensionScore) : null,
        alignmentComplete: evidence.alignmentComplete,
        optionalBasmalahOnly,
        inferenceMs,
      },
    };
  })();
}

async function runCompleteRangeFinalValidation(id: string) {
  const startedAt = performance.now();
  const audio = await canonicalMonoPcm();
  const durationMs = Math.round(audio.length / SAMPLE_RATE * 1_000);
  const speechRegions = await detectLocalSpeechRegions(audio, SAMPLE_RATE);
  const firstSpeech = speechRegions[0]?.startMs ?? 0;
  const finalSpeech = speechRegions.at(-1)?.endMs ?? durationMs;
  const vocabulary = await jsonAsset<Record<string, string>>("vocab.json");
  const tokenTable = await jsonAsset<Record<string, number[]>>("quran_ctc_tokens.json");
  const tilawaQuran = await jsonAsset<Array<{ surah: number; ayah: number; text_clean?: string; text_uthmani: string }>>("quran.json");
  const tilawaText = Object.fromEntries(tilawaQuran.map((verse) => [`${verse.surah}:${verse.ayah}`, verse.text_clean ?? verse.text_uthmani]));
  const allEncoded = encodeFastConformerWords(canonicalCtcWords(hafsVerses), tokenTable, vocabulary, tilawaText);
  const tokenIdsByWord = new Map<number, number[]>();
  const optionalPreludeByVerse = new Map<string, number[]>();
  for (const token of allEncoded.targetTokens) {
    if (token.globalWordIndex === undefined) continue;
    const ids = tokenIdsByWord.get(token.globalWordIndex) ?? [];
    ids.push(token.tokenId);
    tokenIdsByWord.set(token.globalWordIndex, ids);
  }
  for (const token of allEncoded.targetTokenMapping.filter((item) => item.owner === "optional-prelude")) {
    const ids = optionalPreludeByVerse.get(token.verseKey) ?? [];
    ids.push(token.tokenId);
    optionalPreludeByVerse.set(token.verseKey, ids);
  }
  const index = buildQuranWideLexicalIndex(allEncoded.canonicalWords.map((word) => {
    const [surah, ayah] = word.verseKey.split(":").map(Number);
    return {
      surah: surah!, ayah: ayah!, canonicalWordIndex: word.canonicalWordIndex,
      globalWordIndex: word.globalWordIndex, canonicalArabic: word.canonicalArabic,
      lexicalText: word.alignmentText, ctcTokenIds: tokenIdsByWord.get(word.globalWordIndex) ?? [],
      optionalPreludeCtcTokenIds: word.canonicalWordIndex === 1 ? optionalPreludeByVerse.get(word.verseKey) : undefined,
      optionalPreludeLexicalText: word.canonicalWordIndex === 1 ? allEncoded.optionalPreludeLexicalTextByVerse.get(word.verseKey) : undefined,
    };
  }));
  const session = await createInferenceSession();
  const windows = identificationWindows(audio, speechRegions);
  const identifiedWindows = [];
  let continuation: QuranContinuationState | null = null;
  let identificationInferenceMs = 0;
  for (const [windowIndex, window] of windows.entries()) {
    const inferenceStartedAt = performance.now();
    const logits = await infer(session, window.audio);
    identificationInferenceMs += Math.round(performance.now() - inferenceStartedAt);
    const identified = identifyQuranWindow(index, {
      index: windowIndex, startMs: window.startMs, endMs: window.endMs,
      voicedMs: window.voicedMs, logits, vocabulary, blankTokenId: BLANK_TOKEN_ID,
    }, continuation);
    continuation = advanceQuranContinuationState(continuation, identified);
    identifiedWindows.push(identified);
  }
  const identification = summarizeFastConformerIdentification(identifiedWindows, identificationInferenceMs);
  const evidence = evidenceFromIdentification(identification);
  const reconstruction = reconstructCanonicalPassage(evidence);
  const provisional = exposeProvisionalLocalCore(evidence);
  const core = reconstruction.passage ?? provisional.core;
  const integrity = core ? validateWholeRecordingIntegrity(core, evidence) : null;
  const common = {
    schemaVersion: 1,
    id,
    audioDurationMs: durationMs,
    generatedWindows: identifiedWindows.length,
    localWinners: identifiedWindows.map((window) => compactCandidate(window.selectedCandidate)),
    coherentPath: identification.globalHypotheses[0]?.path.map((entry) => compactCandidate(entry.candidate)) ?? identifiedWindows.map(() => "none"),
    canonicalRange: range(reconstruction.passage),
    canonicalRejectionReasons: reconstruction.rejectionReasons,
    provisionalRange: range(provisional.core),
    provisionalRejectionReasons: provisional.rejectionReasons,
    selectedCoreRange: range(core),
    coreSupportingWindows: core?.evidence.supportingWindows ?? [],
    integrityValid: integrity?.valid ?? null,
    integrityVetoes: integrity?.vetoes ?? [],
    integrityMetrics: integrity?.metrics ?? null,
    identificationInferenceMs,
  };
  if (!core || !integrity?.valid) {
    return {
      ...common,
      boundaryLogicRan: false,
      startBoundary: null,
      endBoundary: null,
      finalRange: "none",
      accepted: false,
      rejectionReason: !core ? "no-canonical-or-provisional-core" : `whole-recording-integrity:${integrity?.vetoes.join(",") ?? "unavailable"}`,
      canonicalAyahs: [],
      forcedAlignment: { status: "not-run", startAyah: null, endAyah: null },
      fastConformerPasses: identifiedWindows.length,
      boundarySearchEvaluations: 0,
      fullRecordingInferenceMs: 0,
      edgeInferenceMs: 0,
      totalRuntimeMs: Math.round(performance.now() - startedAt),
      reuse: { pcmReused: true, modelSessionReused: true, fullRecordingLogitsReused: false },
    };
  }

  const coreVerses = verses(core.surah, core.startAyah, core.endAyah);
  const coreEncoded = encodeFastConformerWords(canonicalCtcWords(coreVerses), tokenTable, vocabulary, tilawaText);
  const fullInferenceStartedAt = performance.now();
  const fullLogits = await infer(session, audio);
  const fullRecordingInferenceMs = Math.round(performance.now() - fullInferenceStartedAt);
  const establishedLogits = sliceCtcLogits(fullLogits, 0, durationMs, firstSpeech, finalSpeech);
  const establishedAlignment = establishedLogits ? forceAlignCtc(coreEncoded.canonicalWords, coreEncoded.targetTokens, establishedLogits, {
    blankTokenId: BLANK_TOKEN_ID, startMs: firstSpeech, endMs: finalSpeech, finalSpeechEndMs: finalSpeech, frameExactEndpoints: true,
  }) : null;
  const establishedStartMs = establishedAlignment?.status === "complete" ? establishedAlignment.words[0]?.startMs ?? null : null;
  const establishedEndMs = establishedAlignment?.status === "complete" ? establishedAlignment.verses.at(-1)?.endMs ?? null : null;
  const anchorCount = FROZEN_CORE_BOUNDARY_RULE.boundaryTargetAyahCount;
  const startAnchorVerses = verses(core.surah, core.startAyah, Math.min(core.endAyah, core.startAyah + anchorCount - 1));
  const endAnchorVerses = verses(core.surah, Math.max(core.startAyah, core.endAyah - anchorCount + 1), core.endAyah);
  const startEncoded = encodeFastConformerWords(canonicalCtcWords(startAnchorVerses), tokenTable, vocabulary, tilawaText);
  const endEncoded = encodeFastConformerWords(canonicalCtcWords(endAnchorVerses), tokenTable, vocabulary, tilawaText);
  const startLocation = locateCoreBoundary({
    edge: "start", audioStartMs: 0, audioEndMs: durationMs, firstSpeechMs: firstSpeech, finalSpeechMs: finalSpeech,
    logits: fullLogits, canonicalWords: startEncoded.canonicalWords, targetTokens: startEncoded.targetTokens, blankTokenId: BLANK_TOKEN_ID,
  });
  const endLocation = locateCoreBoundary({
    edge: "end", audioStartMs: 0, audioEndMs: durationMs, firstSpeechMs: firstSpeech, finalSpeechMs: finalSpeech,
    logits: fullLogits, canonicalWords: endEncoded.canonicalWords, targetTokens: endEncoded.targetTokens, blankTokenId: BLANK_TOKEN_ID,
  });
  const surahAyahCount = hafsVerses.filter((verse) => verse.verseKey.startsWith(`${core.surah}:`)).length;
  const applicable = selectApplicableCoreBoundaries({
    core, surahAyahCount, establishedStartMs, establishedEndMs, startLocation, endLocation,
  });
  const coreStartMs = applicable.startMs;
  const coreEndMs = applicable.endMs;
  const localized = coreStartMs !== null && coreEndMs !== null && coreEndMs > coreStartMs
    ? sliceCtcLogits(fullLogits, 0, durationMs, coreStartMs, coreEndMs) : null;
  const wholeCoreAlignment = localized && coreStartMs !== null && coreEndMs !== null
    ? forceAlignCtc(coreEncoded.canonicalWords, coreEncoded.targetTokens, localized, {
      blankTokenId: BLANK_TOKEN_ID, startMs: coreStartMs, endMs: coreEndMs, finalSpeechEndMs: coreEndMs, frameExactEndpoints: true,
    }) : null;
  const wholeCoreComplete = wholeCoreAlignment?.status === "complete"
    && wholeCoreAlignment.targetTokens.length === coreEncoded.targetTokens.length;
  let startCapture: Awaited<ReturnType<typeof edgeEvidence>> | null = null;
  let endCapture: Awaited<ReturnType<typeof edgeEvidence>> | null = null;
  if (coreStartMs !== null && coreEndMs !== null && core.startAyah > 1) {
    startCapture = await edgeEvidence({
      edge: "start", surah: core.surah, candidateAyah: core.startAyah - 1, coreStartMs, coreEndMs, durationMs,
      audio, speechRegions, session, tokenTable, vocabulary, tilawaText,
    });
  }
  if (coreStartMs !== null && coreEndMs !== null && core.endAyah < surahAyahCount) {
    endCapture = await edgeEvidence({
      edge: "end", surah: core.surah, candidateAyah: core.endAyah + 1, coreStartMs, coreEndMs, durationMs,
      audio, speechRegions, session, tokenTable, vocabulary, tilawaText,
    });
  }
  const completed = completeBoundedEdges({
    core, surahAyahCount,
    startEvidence: startCapture?.evidence ?? null,
    endEvidence: endCapture?.evidence ?? null,
  });
  const finalRange = wholeCoreComplete ? completed.range : null;
  const finalVerses = finalRange ? verses(finalRange.surah, finalRange.startAyah, finalRange.endAyah) : [];
  const finalEncoded = finalRange ? encodeFastConformerWords(canonicalCtcWords(finalVerses), tokenTable, vocabulary, tilawaText) : null;
  const finalAlignment = finalEncoded ? forceAlignCtc(finalEncoded.canonicalWords, finalEncoded.targetTokens, fullLogits, {
    blankTokenId: BLANK_TOKEN_ID, startMs: 0, endMs: durationMs, finalSpeechEndMs: finalSpeech, frameExactEndpoints: true,
  }) : null;
  const canonicalAyahs = finalRange ? expandCanonicalAyahRange(finalRange).map((ayah) => ayah.startAyah) : [];
  const edgeInferenceMs = (startCapture?.summary.inferenceMs ?? 0) + (endCapture?.summary.inferenceMs ?? 0);
  return {
    ...common,
    boundaryLogicRan: true,
    startLocator: summarizeCoreBoundary(startLocation),
    endLocator: summarizeCoreBoundary(endLocation),
    selectedCoreStartMs: coreStartMs,
    selectedCoreEndMs: coreEndMs,
    wholeCoreAlignmentComplete: wholeCoreComplete,
    wholeCoreTargetTokenCount: coreEncoded.targetTokens.length,
    wholeCoreAlignedTokenCount: wholeCoreAlignment?.status === "complete" ? wholeCoreAlignment.targetTokens.length : 0,
    startBoundary: startCapture ? { ...startCapture.summary, decision: completed.start.extended, decisionReasons: completed.start.reasons } : null,
    endBoundary: endCapture ? { ...endCapture.summary, decision: completed.end.extended, decisionReasons: completed.end.reasons } : null,
    finalRange: range(finalRange),
    accepted: finalRange !== null && finalAlignment?.status === "complete",
    rejectionReason: !wholeCoreComplete ? "incomplete-whole-core-alignment"
      : finalAlignment?.status !== "complete" ? "incomplete-final-forced-alignment" : null,
    canonicalAyahs,
    forcedAlignment: {
      status: finalAlignment?.status ?? "not-run",
      startAyah: finalRange?.startAyah ?? null,
      endAyah: finalRange?.endAyah ?? null,
      ayahTimingCount: finalAlignment?.status === "complete" ? finalAlignment.verses.length : 0,
    },
    fastConformerPasses: identifiedWindows.length + 1 + Number(startCapture !== null) + Number(endCapture !== null),
    boundarySearchEvaluations: startLocation.coarseEvaluationCount + startLocation.fineEvaluationCount
      + endLocation.coarseEvaluationCount + endLocation.fineEvaluationCount,
    fullRecordingInferenceMs,
    edgeInferenceMs,
    totalRuntimeMs: Math.round(performance.now() - startedAt),
    reuse: { pcmReused: true, modelSessionReused: true, fullRecordingLogitsReused: true },
  };
}

declare global {
  interface Window {
    runCompleteRangeFinalValidation: typeof runCompleteRangeFinalValidation;
  }
}

window.runCompleteRangeFinalValidation = runCompleteRangeFinalValidation;
document.body.dataset.ready = "true";
