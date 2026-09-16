import { CaptionGenerationProgressController, captionGenerationProgressForDownload, type CaptionGenerationProgress } from "./editor/caption-generation-progress.ts";
import { createCaptionSegmentsFromVerseBoundaries, resolveCaptionTranslationSegments, type CaptionSegment } from "./editor/captions.ts";
import { recognitionToVerseAlignments, type VerseAlignment } from "./editor/recognition.ts";
import { analyzeTranscript, canonicalSpanFromFastConformerIdentification, createPrimaryTranscript, hafsSurahs, hafsVerses } from "./recognition/core.ts";
import { comparePassageIdentification } from "./recognition/fastconformer-identification.ts";
import { decideFastConformerPassage } from "./recognition/passage-decision.ts";
import { quranFallbackDebug, quranFinalIdentityDebug, quranForcedAlignmentDebug, quranRecognitionDebug } from "./recognition/passage-identification-debug.ts";
import type { LocalRecognitionWorkerClient } from "./recognition/recognition-worker-client.ts";
import type { DecodedAudioChannels } from "./recognition/local-audio-decode.ts";
import type { FastConformerProgress } from "./recognition/contracts.ts";
import { getVerses } from "./quran/local.ts";
import type { QuranTranslation } from "./quran/translations.ts";

export type VideoGenerationResult = {
  alignments: VerseAlignment[];
  segments: CaptionSegment[];
};

export type VideoGenerationInput = {
  jobId: number;
  file: File;
  sourceUrl: string | null;
  /** Media preparation owns decoder choice and supplies one canonical PCM. */
  authoritativePcm: DecodedAudioChannels;
  signal?: AbortSignal;
  worker: LocalRecognitionWorkerClient;
  onProgress: (progress: CaptionGenerationProgress) => void;
  fetcher?: typeof fetch;
};

function friendlyTimingFailure(reason: string): Error {
  return new Error(`Quran timing could not be completed. ${reason} Please retry.`);
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Caption generation cancelled.", "AbortError");
}

async function enrichTranslations(segments: CaptionSegment[], fetcher: typeof fetch): Promise<CaptionSegment[]> {
  const keys = [...new Set(segments.flatMap((segment) => segment.verseKeys))];
  if (!keys.length) return segments;
  try {
    const params = new URLSearchParams();
    keys.forEach((key) => params.append("key", key));
    const response = await fetcher(`/api/quran/verse?${params.toString()}`);
    if (!response.ok) return segments;
    const payload = await response.json() as { translations?: Record<string, QuranTranslation | null> };
    if (!payload.translations) return segments;
    return resolveCaptionTranslationSegments(segments.map((segment) => {
      const translation = segment.verseKeys.map((key) => payload.translations?.[key]?.text ?? null).find(Boolean) ?? null;
      return translation ? { ...segment, translation } : segment;
    }));
  } catch {
    return segments;
  }
}

/**
 * Runs the same local Quran identification and authoritative FastConformer
 * alignment used by the advanced editor. It receives one media-prepared PCM;
 * decoder alternatives never participate in passage selection here.
 */
export async function generateVideoCaptions(input: VideoGenerationInput): Promise<VideoGenerationResult> {
  const progress = new CaptionGenerationProgressController();
  const publish = (value: CaptionGenerationProgress | null) => { if (value) input.onProgress(value); };
  const report = (
    phase: "preparing-media" | "analyzing-speech" | "identifying-passage" | "confirming-passage" | "aligning-words" | "building-captions" | "adding-translation" | "finalizing",
    fraction?: number,
    detail?: string,
  ) => publish(progress.report(input.jobId, phase, fraction, detail));
  const reportFastConformer = (next: FastConformerProgress) => {
    if (next.phase === "downloading-model") {
      publish(captionGenerationProgressForDownload(progress, input.jobId, next.bytesLoaded, next.bytesTotal));
    } else if (next.phase === "identifying-passage") {
      report("identifying-passage", next.completed / Math.max(1, next.total), `${next.completed} of ${next.total} audio windows analyzed`);
    } else {
      report("aligning-words", next.step === "forced-alignment" ? 0.5 : 0);
    }
  };

  publish(progress.start(input.jobId));
  assertNotAborted(input.signal);
  report("analyzing-speech");
  const workerPrepared = await input.worker.prepare(input.jobId, input.authoritativePcm.sampleRate, input.authoritativePcm.frameCount, input.authoritativePcm.channelBuffers);
  assertNotAborted(input.signal);
  if (!workerPrepared.speechRegions.length) throw new Error("No credible human speech was detected in this recording, so Quran captions were not timed from background audio.");

  const runFor = (value: typeof workerPrepared) => ({
    analysisRunId: crypto.randomUUID(),
    sourceIdentity: `${input.file.name}:${input.file.size}:${input.file.lastModified}`,
    sourceObjectUrl: input.sourceUrl,
    sourceDurationMs: value.durationMs,
    sampleRate: 16_000,
    pcmIdentity: crypto.randomUUID(),
  });
  const preparedFor = (value: typeof workerPrepared, run: ReturnType<typeof runFor>) => ({
    run,
    chunks: [],
    rawTranscript: "",
    backend: "wasm" as const,
    timestampMode: "chunk-fallback" as const,
    timestampValidation: { asrWordCount: 0, timestampedWordCount: 0, zeroDurationCount: 0, rangeMs: null },
    modelLoadMs: 0,
    transcriptionMs: 0,
    durationMs: value.durationMs,
    audioAnalysis: value.audioAnalysis,
    speechRegions: value.speechRegions,
  });
  const run = runFor(workerPrepared);
  const prepared = preparedFor(workerPrepared, run);

  report("identifying-passage");
  const identification = await input.worker.identify(input.jobId, reportFastConformer);
  assertNotAborted(input.signal);
  const fastConformerSpan = canonicalSpanFromFastConformerIdentification(identification?.canonicalSpan ?? null);
  const decision = decideFastConformerPassage(identification, fastConformerSpan);
  quranRecognitionDebug(identification, decision, { speechRegions: prepared.speechRegions, durationMs: prepared.durationMs });
  const runWhisperComparison = process.env.NODE_ENV !== "production";
  const shouldExecuteWhisper = !decision.accepted || runWhisperComparison;
  quranFallbackDebug(decision, shouldExecuteWhisper);
  const transcriptResult = shouldExecuteWhisper
    ? await (async () => {
        const { transcribePreparedPcm } = await import("./recognition/local-whisper.ts");
        const audio = await input.worker.copyPcm(input.jobId);
        return transcribePreparedPcm(audio, prepared.audioAnalysis, prepared.speechRegions, prepared.run);
      })()
    : prepared;
  const primaryTranscript = createPrimaryTranscript(transcriptResult.chunks, transcriptResult.timestampMode);
  const whisperAnalysis = analyzeTranscript(primaryTranscript, {
    audioAnalysis: transcriptResult.audioAnalysis,
    speechRegions: transcriptResult.speechRegions,
  });
  const useFastConformer = decision.accepted && fastConformerSpan !== null;
  const selectedSpan = useFastConformer ? fastConformerSpan : whisperAnalysis.passage.canonicalSpan;
  const identityAccepted = Boolean(selectedSpan && (useFastConformer || whisperAnalysis.passage.state === "confident-unique"));
  quranFinalIdentityDebug({
    decision: identityAccepted ? "accepted" : "abstained",
    accepted: identityAccepted,
    authority: useFastConformer ? "fastconformer-primary" : "whisper-fallback",
    proposedSurah: selectedSpan ? Number(selectedSpan.firstVerseKey.split(":")[0]) : null,
    startAyah: selectedSpan ? Number(selectedSpan.firstVerseKey.split(":")[1]) : null,
    endAyah: selectedSpan ? Number(selectedSpan.lastVerseKey.split(":")[1]) : null,
    reasons: [useFastConformer
      ? decision.reason
      : identityAccepted ? "Whisper fallback produced a confident unique Quran passage." : `Whisper fallback state was ${whisperAnalysis.passage.state}.`],
  });
  if (selectedSpan) {
    const surah = hafsSurahs.find((item) => item.number === Number(selectedSpan.firstVerseKey.split(":")[0]));
    publish(progress.confirmIdentity(input.jobId, `Detected Surah ${surah?.name ?? selectedSpan.firstVerseKey.split(":")[0]}`));
  } else {
    report("confirming-passage");
  }

  // Keep the editor's comparison path observable in development without
  // allowing Whisper to veto accepted Quran-wide FastConformer evidence.
  if (identification) {
    comparePassageIdentification({
      engine: "whisper-quran-matcher",
      span: whisperAnalysis.passage.canonicalSpan ? {
        firstVerseKey: whisperAnalysis.passage.canonicalSpan.firstVerseKey,
        lastVerseKey: whisperAnalysis.passage.canonicalSpan.lastVerseKey,
        firstWordIndex: whisperAnalysis.passage.canonicalSpan.firstWordIndex,
        lastWordIndex: whisperAnalysis.passage.canonicalSpan.lastWordIndex,
      } : null,
      confidence: whisperAnalysis.passage.identityConfidence,
    }, identification);
  }

  if (!selectedSpan || (!useFastConformer && whisperAnalysis.passage.state !== "confident-unique")) {
    publish(progress.manualCorrection(input.jobId));
    throw new Error("We couldn't confidently identify this recitation. Retry, or open the advanced editor to choose the Quran passage manually.");
  }
  const speechStartMs = transcriptResult.speechRegions[0]?.startMs ?? 0;
  const speechEndMs = transcriptResult.speechRegions.at(-1)?.endMs ?? transcriptResult.audioAnalysis.durationMs;
  const matches = selectedSpan.coveredVerseKeys.map((verseKey) => ({ verseKey, startMs: speechStartMs, endMs: speechEndMs }));
  report("aligning-words");
  quranForcedAlignmentDebug("started", {
    identityAuthority: useFastConformer ? "fastconformer-primary" : "whisper-fallback",
    startAyah: Number(selectedSpan.firstVerseKey.split(":")[1]),
    endAyah: Number(selectedSpan.lastVerseKey.split(":")[1]),
  });
  let aligned: Awaited<ReturnType<LocalRecognitionWorkerClient["align"]>>;
  try {
    aligned = await input.worker.align(
      input.jobId,
      hafsVerses.filter((verse) => selectedSpan.coveredVerseKeys.includes(verse.verseKey)),
      matches,
      run.analysisRunId,
      reportFastConformer,
    );
  } catch (error) {
    quranForcedAlignmentDebug("failed", { reason: error instanceof Error ? error.name : "UnknownError", resultingStartAyah: null, resultingEndAyah: null });
    throw error;
  }
  const firstAlignedKey = aligned.ayahTimings[0]?.verseKey ?? null;
  const lastAlignedKey = aligned.ayahTimings.at(-1)?.verseKey ?? null;
  quranForcedAlignmentDebug(aligned.status === "complete" && aligned.alignmentComplete ? "succeeded" : "failed", {
    status: aligned.status,
    reason: aligned.reason ?? null,
    resultingStartAyah: firstAlignedKey ? Number(firstAlignedKey.split(":")[1]) : null,
    resultingEndAyah: lastAlignedKey ? Number(lastAlignedKey.split(":")[1]) : null,
  });
  const analysis = analyzeTranscript(primaryTranscript, {
    audioAnalysis: transcriptResult.audioAnalysis,
    speechRegions: transcriptResult.speechRegions,
    fastConformerResult: aligned,
    passageOverride: { canonicalSpan: selectedSpan, passageSource: useFastConformer ? "fastconformer-quran" : "whisper-fallback" },
  });
  if (analysis.timingFailure) throw friendlyTimingFailure(analysis.timingFailure.reason);
  if (!analysis.authoritativeTimingEngine || analysis.matches.length === 0) throw friendlyTimingFailure("");

  const alignments = recognitionToVerseAlignments(analysis.matches);
  const verseContent = Object.fromEntries(getVerses(alignments[0]!.verseKey, alignments.at(-1)!.verseKey).map((verse) => [verse.verseKey, verse]));
  let segments = createCaptionSegmentsFromVerseBoundaries(
    analysis.verseBoundaries,
    verseContent,
    aligned.optionalPrelude,
    analysis.authoritativeTimingEngine.wordTimings,
  );
  report("building-captions", 1);
  report("adding-translation");
  segments = await enrichTranslations(segments, input.fetcher ?? fetch);
  report("finalizing", 1);
  publish(progress.complete(input.jobId));
  return { alignments, segments };
}
