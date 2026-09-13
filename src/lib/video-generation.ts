import { CaptionGenerationProgressController, captionGenerationProgressForDownload, type CaptionGenerationProgress } from "./editor/caption-generation-progress.ts";
import { createCaptionSegmentsFromVerseBoundaries, resolveCaptionTranslationSegments, type CaptionSegment } from "./editor/captions.ts";
import { recognitionToVerseAlignments, type VerseAlignment } from "./editor/recognition.ts";
import { analyzeTranscript, canonicalSpanFromFastConformerIdentification, createPrimaryTranscript, hafsSurahs, hafsVerses } from "./recognition/core.ts";
import { comparePassageIdentification } from "./recognition/fastconformer-identification.ts";
import { decideFastConformerPassage } from "./recognition/passage-decision.ts";
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
  preparedAudio?: DecodedAudioChannels;
  worker: LocalRecognitionWorkerClient;
  onProgress: (progress: CaptionGenerationProgress) => void;
  fetcher?: typeof fetch;
};

function friendlyTimingFailure(reason: string): Error {
  return new Error(`Quran timing could not be completed. ${reason} Please retry.`);
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
 * alignment used by the advanced editor. Compatibility normalization happens
 * before this boundary and is never repeated here.
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
  let decoded = input.preparedAudio;
  if (!decoded) {
    const { decodeAudioChannels } = await import("./recognition/local-audio-decode.ts");
    report("preparing-media");
    decoded = await decodeAudioChannels(input.file);
  }
  report("analyzing-speech");
  const workerPrepared = await input.worker.prepare(input.jobId, decoded.sampleRate, decoded.frameCount, decoded.channelBuffers);
  if (!workerPrepared.speechRegions.length) throw new Error("No credible human speech was detected in this recording, so Quran captions were not timed from background audio.");

  const run = {
    analysisRunId: crypto.randomUUID(),
    sourceIdentity: `${input.file.name}:${input.file.size}:${input.file.lastModified}`,
    sourceObjectUrl: input.sourceUrl,
    sourceDurationMs: workerPrepared.durationMs,
    sampleRate: 16_000,
    pcmIdentity: crypto.randomUUID(),
  };
  const prepared = {
    run,
    chunks: [],
    rawTranscript: "",
    backend: "wasm" as const,
    timestampMode: "chunk-fallback" as const,
    timestampValidation: { asrWordCount: 0, timestampedWordCount: 0, zeroDurationCount: 0, rangeMs: null },
    modelLoadMs: 0,
    transcriptionMs: 0,
    durationMs: workerPrepared.durationMs,
    audioAnalysis: workerPrepared.audioAnalysis,
    speechRegions: workerPrepared.speechRegions,
  };

  report("identifying-passage");
  const identification = await input.worker.identify(input.jobId, reportFastConformer);
  const fastConformerSpan = canonicalSpanFromFastConformerIdentification(identification?.canonicalSpan ?? null);
  const decision = decideFastConformerPassage(identification, fastConformerSpan);
  const runWhisperComparison = process.env.NODE_ENV !== "production";
  const transcriptResult = !decision.accepted || runWhisperComparison
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
  const aligned = await input.worker.align(
    input.jobId,
    hafsVerses.filter((verse) => selectedSpan.coveredVerseKeys.includes(verse.verseKey)),
    matches,
    run.analysisRunId,
    reportFastConformer,
  );
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
