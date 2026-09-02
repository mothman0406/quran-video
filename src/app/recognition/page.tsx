"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { analyzeTranscript, type RecognitionAnalysis, type RecognitionResult } from "@/lib/recognition/core";
import { createCaptionSegments, createCaptionSegmentsFromForcedAlignment, getActiveCaptionSegment, type CaptionSegment } from "@/lib/editor/captions";
import { recognitionToVerseAlignments, type VerseAlignment } from "@/lib/editor/recognition";
import { getVerses } from "@/lib/quran/local";
import {
  LOCAL_WHISPER_APPROXIMATE_DOWNLOAD_MB,
  LOCAL_WHISPER_MODEL,
  localTranscriptionSupport,
  localWhisperTranscriber,
} from "@/lib/recognition/local-whisper";
import type { LocalTranscriptionResult, TranscriptionProgress } from "@/lib/recognition/transcriber";

function formatMilliseconds(value: number) {
  return `${(value / 1_000).toFixed(1)}s`;
}

function formatTime(value: number) {
  const seconds = Math.max(0, Math.round(value / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatClockMilliseconds(value: number) {
  const milliseconds = Math.max(0, Math.round(value));
  return `${String(Math.floor(milliseconds / 60_000)).padStart(2, "0")}:${String(Math.floor((milliseconds % 60_000) / 1_000)).padStart(2, "0")}.${String(milliseconds % 1_000).padStart(3, "0")}`;
}

type GroundTruthKind = "recitation-start" | "set-start" | "transition" | "recitation-end";
type GroundTruthMark = { id: string; kind: GroundTruthKind; timeMs: number; segmentId: string | null };
type PreviewActivation = { segmentId: string; verseKeys: string[]; timeMs: number };

const INITIAL_RUNTIME_SUPPORT = { supported: false, reason: "Checking browser capabilities…" };

export default function RecognitionSpikePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [support, setSupport] = useState(INITIAL_RUNTIME_SUPPORT);
  const [file, setFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [result, setResult] = useState<LocalTranscriptionResult | null>(null);
  const [matches, setMatches] = useState<RecognitionResult>([]);
  const [analysis, setAnalysis] = useState<RecognitionAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [alignments, setAlignments] = useState<VerseAlignment[]>([]);
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const [marks, setMarks] = useState<GroundTruthMark[]>([]);
  const [editingMarkId, setEditingMarkId] = useState<string | null>(null);
  const [previewActivations, setPreviewActivations] = useState<PreviewActivation[]>([]);
  const lastPreviewSegmentId = useRef<string | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setSupport(localTranscriptionSupport()));
    return () => cancelAnimationFrame(frame);
  }, []);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFile(next);
    setVideoUrl(next ? URL.createObjectURL(next) : null);
    setDurationMs(0);
    setCurrentTimeMs(0);
    setIsPlaying(false);
    setResult(null);
    setMatches([]);
    setAnalysis(null);
    setError(null);
    setProgress(null);
    setAlignments([]);
    setSegments([]);
    setMarks([]);
    setPreviewActivations([]);
    lastPreviewSegmentId.current = null;
  }

  async function transcribe() {
    if (!file || !support.supported) return;
    setError(null);
    setResult(null);
    setMatches([]);
    setIsRunning(true);
    try {
      const output = await localWhisperTranscriber.transcribe(file, setProgress);
      setResult(output);
      const nextAnalysis = analyzeTranscript(output.chunks, { audioAnalysis: output.audioAnalysis });
      setAnalysis(nextAnalysis);
      setMatches(nextAnalysis.matches);
      const nextAlignments = recognitionToVerseAlignments(nextAnalysis.matches);
      setAlignments(nextAlignments);
      const verseContent = nextAlignments.length ? Object.fromEntries(getVerses(nextAlignments[0].verseKey, nextAlignments.at(-1)!.verseKey).map((verse) => [verse.verseKey, verse])) : {};
      setSegments(nextAnalysis.forcedAlignment ? createCaptionSegmentsFromForcedAlignment(nextAnalysis.forcedAlignment, verseContent) : createCaptionSegments(nextAlignments, verseContent));
      (window as Window & { __QURAN_ALIGNMENT_DEBUG__?: unknown }).__QURAN_ALIGNMENT_DEBUG__ = {
        source: { durationMs: output.audioAnalysis.durationMs, sampleRate: output.audioAnalysis.sampleRate },
        transcriber: { model: LOCAL_WHISPER_MODEL, backend: output.backend, timestampMode: output.timestampMode, runtimes: { modelLoadMs: output.modelLoadMs, transcriptionMs: output.transcriptionMs, totalMs: output.durationMs } },
        passage: nextAnalysis.passage,
        wordAlignment: nextAnalysis.forcedAlignment?.wordOccurrences ?? [],
        verseTiming: nextAnalysis.forcedAlignment?.verseTimings ?? [],
        pauses: nextAnalysis.forcedAlignment?.pauseCandidates ?? [],
        displaySets: nextAnalysis.forcedAlignment?.captionSets ?? [],
      };
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Local transcription failed.");
    } finally {
      setIsRunning(false);
    }
  }

  function onVideoTimeUpdate() {
    const next = Math.round((videoRef.current?.currentTime ?? 0) * 1_000);
    setCurrentTimeMs(next);
    recordPreviewActivation(next);
  }
  function seekTo(value: number) {
    const next = Math.max(0, Math.min(durationMs, Math.round(value)));
    if (videoRef.current) videoRef.current.currentTime = next / 1_000;
    setCurrentTimeMs(next);
    recordPreviewActivation(next);
  }
  function recordPreviewActivation(timeMs: number) {
    const active = getActiveCaptionSegment(segments, timeMs);
    const nextId = active?.id ?? null;
    if (nextId === lastPreviewSegmentId.current) return;
    lastPreviewSegmentId.current = nextId;
    if (!active) return;
    setPreviewActivations((current) => [...current.slice(-49), { segmentId: active.id, verseKeys: active.verseKeys, timeMs }]);
  }
  function mark(kind: GroundTruthKind) {
    const active = getActiveCaptionSegment(segments, currentTimeMs);
    const nextSegment = segments.find((segment) => segment.startMs >= currentTimeMs) ?? active;
    setMarks((current) => [...current, { id: crypto.randomUUID(), kind, timeMs: Math.round(currentTimeMs), segmentId: kind === "transition" || kind === "set-start" ? nextSegment?.id ?? null : null }]);
  }
  function updateMark(id: string, patch: Partial<GroundTruthMark>) {
    setMarks((current) => current.map((item) => item.id === id ? { ...item, ...patch, timeMs: patch.timeMs === undefined ? item.timeMs : Math.max(0, Math.min(durationMs, Math.round(patch.timeMs))) } : item));
  }
  function deleteMark(id: string) {
    setMarks((current) => current.filter((item) => item.id !== id));
    if (editingMarkId === id) setEditingMarkId(null);
  }

  function timingDebugPayload() {
    const traceByVerse = new Map((analysis?.timingTrace?.verses ?? []).map((trace) => [trace.verseKey, trace]));
    const segmentByVerse = new Map(segments.map((segment) => [segment.verseKeys[0], segment]));
    const markFor = (segment: CaptionSegment | undefined, kinds: readonly GroundTruthKind[]) => marks.find((mark) => kinds.includes(mark.kind) && (!segment || mark.segmentId === segment.id));
    return {
      source: { durationMs: result?.durationMs ?? durationMs },
      transcriber: result ? { model: LOCAL_WHISPER_MODEL, backend: result.backend, timestampMode: result.timestampMode } : null,
      detectedPassage: { canonicalSpan: analysis?.passage.canonicalSpan, verseRange: matches.map((match) => match.verseKey) },
      firstStartTrace: analysis?.timingTrace,
      verses: matches.map((match) => {
        const segment = segmentByVerse.get(match.verseKey);
        const manual = markFor(segment, match === matches[0] ? ["recitation-start", "set-start"] : ["transition", "set-start"]);
        return {
          verseKey: match.verseKey,
          ...traceByVerse.get(match.verseKey),
          verseAlignmentStartMs: match.startMs,
          captionSegmentStartMs: segment?.startMs ?? null,
          captionSegmentEndMs: segment?.endMs ?? null,
          manualStartMs: manual?.timeMs ?? null,
          signedErrorMs: manual && segment ? segment.startMs - manual.timeMs : null,
        };
      }),
      manualGroundTruthMarks: marks,
      actualPreviewActivations: previewActivations,
      rawAsr: result ? { chunks: result.chunks, timestampValidation: result.timestampValidation } : null,
      forcedAlignment: analysis?.forcedAlignment ?? null,
    };
  }
  function timingReportText() {
    const debug = timingDebugPayload();
    const first = debug.firstStartTrace;
    const value = (item: number | null | undefined) => item === null || item === undefined ? "—" : `${item} ms`;
    return [
      "SOURCE", `duration: ${value(debug.source.durationMs)}`,
      "", "TRANSCRIBER", `model: ${debug.transcriber?.model ?? "—"}`, `backend: ${debug.transcriber?.backend ?? "—"}`, `timestamp mode: ${debug.transcriber?.timestampMode ?? "—"}`,
      "", "DETECTED PASSAGE", `verse range: ${debug.detectedPassage.verseRange.join("–") || "—"}`, `canonical word span: ${debug.detectedPassage.canonicalSpan ? `${debug.detectedPassage.canonicalSpan.firstVerseKey} word ${debug.detectedPassage.canonicalSpan.firstWordIndex} → ${debug.detectedPassage.canonicalSpan.lastVerseKey} word ${debug.detectedPassage.canonicalSpan.lastWordIndex}` : "—"}`,
      "", "FIRST START TRACE", `earliest audio activity candidate: ${value(first?.earliestAudioActivityCandidateMs)}`, `first ASR chunk start: ${value(first?.firstAsrChunkStartMs)}`, `first ASR timestamped word: ${value(first?.firstAsrTimestampedWordMs)}`, `first ASR word aligned to detected Quran: ${value(first?.firstAsrWordAlignedToDetectedQuranMs)}`, `first canonical Quran word supported: ${first?.firstCanonicalQuranWordSupported ?? "—"}`, `first strong alignment anchor: ${value(first?.firstStrongAlignmentAnchorMs)}`, `PCM local onset candidate: ${value(first?.pcmLocalOnsetCandidateMs)}`, `raw VerseAlignment start: ${value(first?.rawVerseAlignmentStartMs)}`, `generated CaptionSegment start: ${value(debug.verses[0]?.captionSegmentStartMs)}`,
      ...debug.verses.flatMap((verse) => ["", `VERSE ${verse.verseKey}`, `first aligned ASR evidence: ${value(verse.firstAlignedAsrEvidenceMs)}`, `alignment timestamp: ${value(verse.firstStrongAlignmentAnchorMs)}`, `PCM-refined start: ${value(verse.pcmLocalOnsetCandidateMs)}`, `VerseAlignment start: ${value(verse.verseAlignmentStartMs)}`, `CaptionSegment start: ${value(verse.captionSegmentStartMs)}`, `manual start: ${value(verse.manualStartMs)}`, `signed error: ${value(verse.signedErrorMs)}`]),
      "", "MANUAL MARKS", ...debug.manualGroundTruthMarks.map((mark) => `${mark.kind}: ${value(mark.timeMs)}`),
      "", "ACTIVE DISPLAY TRACE", ...debug.actualPreviewActivations.map((entry) => `${entry.verseKeys.join(", ")} activated at ${value(entry.timeMs)}`),
    ].join("\n");
  }
  async function copyTimingReport() {
    await navigator.clipboard.writeText(timingReportText());
  }
  function exportDebugJson() {
    const blob = new Blob([JSON.stringify(timingDebugPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "quran-recognition-timing-debug.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
      if (event.key.toLowerCase() === "r") mark("recitation-start");
      if (event.key.toLowerCase() === "m") mark("transition");
      if (event.key.toLowerCase() === "e") mark("recitation-end");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (process.env.NODE_ENV === "production") {
    return <main className="min-h-screen bg-[#f5f2eb] px-5 py-10 text-[#17211b]"><div className="mx-auto max-w-2xl rounded-2xl border border-[#d8d5cc] bg-[#fbfaf6] p-6"><p className="text-xs font-bold uppercase tracking-[0.22em] text-[#a06b31]">Developer tool</p><h1 className="mt-3 font-serif text-3xl text-[#173c32]">Timing Lab unavailable</h1><p className="mt-3 text-[#68716a]">The local recognition timing lab is available in development builds only.</p></div></main>;
  }

  const firstMatch = matches[0];
  const lastMatch = matches.at(-1);
  const canonicalSpan = analysis?.passage.canonicalSpan;
  return (
    <main className="min-h-screen bg-[#f5f2eb] px-5 py-10 text-[#17211b] sm:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#a06b31]">M3B · developer spike</p>
          <h1 className="mt-3 font-serif text-4xl tracking-tight text-[#173c32]">Local recitation recognition</h1>
          <p className="mt-3 max-w-2xl leading-7 text-[#68716a]">The selected video is decoded, transcribed, and matched in this browser. Audio is never sent to this application server or an inference API.</p>
        </header>

        <section className="rounded-2xl border border-[#d8d5cc] bg-[#fbfaf6] p-5">
          <p className="font-semibold text-[#173c32]">Runtime: {support.supported ? support.reason : support.reason}</p>
          <p className="mt-2 text-sm text-[#68716a]">Model: <code>{LOCAL_WHISPER_MODEL}</code> (multilingual Whisper Base; approximately {LOCAL_WHISPER_APPROXIMATE_DOWNLOAD_MB} MB on first q4 download). Browser Cache API is used when available.</p>
        </section>

        <section className="rounded-2xl border border-[#d8d5cc] bg-[#fbfaf6] p-5">
          <label className="block text-sm font-semibold text-[#173c32]" htmlFor="local-video">Local video</label>
          <input accept="video/*" className="mt-3 block text-sm" id="local-video" type="file" onChange={selectFile} />
          {file && <p className="mt-2 text-sm text-[#68716a]">{file.name} · {(file.size / 1_000_000).toFixed(1)} MB</p>}
          <button className="mt-4 rounded-full bg-[#173c32] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!file || !support.supported || isRunning} type="button" onClick={transcribe}>Run recognition locally</button>
          {progress && <p aria-live="polite" className="mt-3 text-sm text-[#35604f]">{progress.message}{progress.phase === "transcribing" && progress.total ? ` ${progress.completed ?? 0}/${progress.total}` : ""}{progress.bytesLoaded && progress.bytesTotal ? ` ${(progress.bytesLoaded / progress.bytesTotal * 100).toFixed(0)}%` : ""}</p>}
          {error && <p className="mt-3 rounded-lg bg-[#fff3ed] p-3 text-sm text-[#984b32]">{error}</p>}
        </section>

        {result && <section className="rounded-2xl border border-[#d8d5cc] bg-[#fbfaf6] p-5">
          <h2 className="font-serif text-2xl font-semibold text-[#173c32]">Recognition result</h2>
          <p className="mt-2 text-sm text-[#68716a]">Transcriber: {LOCAL_WHISPER_MODEL} · backend: {result.backend} · timestamp mode: {result.timestampMode === "word" ? "word" : "chunk fallback"} · model load: {formatMilliseconds(result.modelLoadMs)} · transcription: {formatMilliseconds(result.transcriptionMs)}</p>
          <p className="mt-2 text-sm text-[#68716a]">Timestamp validation: {result.timestampValidation.asrWordCount} ASR words · {result.timestampValidation.timestampedWordCount} timestamped words · {result.timestampValidation.zeroDurationCount} zero-duration · range: {result.timestampValidation.rangeMs ? `${formatTime(result.timestampValidation.rangeMs[0])}–${formatTime(result.timestampValidation.rangeMs[1])}` : "—"}{result.timestampValidation.fallbackReason ? ` · fallback: ${result.timestampValidation.fallbackReason}` : ""}</p>
          <div className="mt-4 flex flex-wrap gap-2"><button className="rounded-full bg-[#173c32] px-4 py-2 text-sm font-semibold text-white" type="button" onClick={() => void copyTimingReport()}>Copy Timing Report</button><button className="rounded-full border border-[#b8cabc] px-4 py-2 text-sm font-semibold text-[#315846]" type="button" onClick={exportDebugJson}>Export Debug JSON</button></div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><dt className="text-xs font-bold uppercase tracking-wide text-[#8b928b]">Surah</dt><dd className="mt-1 font-semibold">{firstMatch ? firstMatch.verseKey.split(":")[0] : "No Quran match"}</dd></div>
            <div><dt className="text-xs font-bold uppercase tracking-wide text-[#8b928b]">Detected ayah range</dt><dd className="mt-1 font-semibold">{firstMatch && lastMatch ? `${firstMatch.verseKey} – ${lastMatch.verseKey}` : "—"}</dd></div>
            <div><dt className="text-xs font-bold uppercase tracking-wide text-[#8b928b]">Passage decision</dt><dd className="mt-1 font-semibold">{analysis?.passage.state.replaceAll("-", " ") ?? "—"}{analysis?.passage.disambiguatedByLaterChunks ? " · later text disambiguated" : ""}</dd></div>
            <div><dt className="text-xs font-bold uppercase tracking-wide text-[#8b928b]">Candidate margin</dt><dd className="mt-1 font-semibold">{analysis?.passage.candidateMargin === null || analysis?.passage.candidateMargin === undefined ? "—" : analysis.passage.candidateMargin.toFixed(3)}</dd></div>
          </dl>
          {matches.length > 0 ? <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-[#68716a]"><tr><th className="py-2">Ayah</th><th className="py-2">Approximate start</th><th className="py-2">Approximate end</th><th className="py-2">Boundary evidence</th><th className="py-2">Confidence</th><th className="py-2">Matched text</th></tr></thead><tbody>{matches.map((match) => <tr className="border-b border-[#e3e0d8]" key={`${match.verseKey}-${match.startMs}`}><td className="py-2 font-semibold">{match.verseKey}</td><td className="py-2">{formatTime(match.startMs)}</td><td className="py-2">{formatTime(match.endMs)}</td><td className="py-2">{match.timing.start.source}</td><td className="py-2">{Math.round(match.confidence * 100)}%</td><td className="py-2" dir="rtl" lang="ar">{match.timing.matchedText || "interpolated"}</td></tr>)}</tbody></table></div> : <p className="mt-5 text-sm text-[#68716a]">The transcript did not reach the deterministic matcher confidence threshold.</p>}
          {analysis && <details className="mt-4 text-sm text-[#68716a]"><summary className="cursor-pointer font-semibold text-[#35604f]">Passage-mapping diagnostics</summary><p className="mt-2" dir="rtl" lang="ar">Complete transcript: {result.rawTranscript || "—"}</p>{canonicalSpan ? <><p className="mt-3 font-semibold text-[#173c32]">Detected canonical span · Surah {canonicalSpan.surah}</p><p>Start: {canonicalSpan.firstVerseKey}, word {canonicalSpan.firstWordIndex} <span dir="rtl" lang="ar">“{canonicalSpan.firstWordText}”</span> ({canonicalSpan.firstBoundary}). End: {canonicalSpan.lastVerseKey}, word {canonicalSpan.lastWordIndex} <span dir="rtl" lang="ar">“{canonicalSpan.lastWordText}”</span> ({canonicalSpan.lastBoundary}).</p><p>Verse coverage: {matches.map((match) => `${match.verseKey} words ${match.wordSupport.canonicalStartWordIndex}-${match.wordSupport.canonicalEndWordIndex}/${match.wordSupport.canonicalWordCount}`).join(" · ")}</p></> : <p className="mt-2">No reliable canonical word span.</p>}<p className="mt-2">Mapping quality: {analysis.passage.mappingQuality ?? "n/a"}; transcript coverage: {analysis.passage.transcriptCoverage ?? "n/a"}; canonical span coverage: {analysis.passage.canonicalSpanCoverage ?? "n/a"}; uniqueness margin: {analysis.passage.uniquenessMargin ?? "n/a"}; boundary confidence: {analysis.passage.firstBoundaryConfidence ?? "n/a"} / {analysis.passage.lastBoundaryConfidence ?? "n/a"}. Boundary completion: {analysis.passage.boundaryCompletion.extendedBackward ? "backward extended" : "no backward extension"}{analysis.passage.boundaryCompletion.extendedForward ? ", forward extended" : ""}.</p><p className="mt-2">Selected passage: {analysis.passage.selectedCandidate ? `${analysis.passage.selectedCandidate.startVerseKey} – ${analysis.passage.selectedCandidate.endVerseKey}` : "none"}; decision: {analysis.passage.state}; later chunks disambiguated: {analysis.passage.disambiguatedByLaterChunks ? "yes" : "no"}.</p>{analysis.passage.candidates.map((candidate) => <p className="mt-2" key={`${candidate.startVerseKey}-${candidate.endVerseKey}-${candidate.firstWordIndex}`}>{candidate.startVerseKey} word {candidate.firstWordIndex} – {candidate.endVerseKey} word {candidate.lastWordIndex}: score {candidate.totalScore}, explained {candidate.explainedTranscriptTokens} tokens, uncovered prefix/suffix {candidate.unexplainedTranscriptBefore}/{candidate.unexplainedTranscriptAfter}, transcript coverage {candidate.transcriptCoverage}, Quran coverage {candidate.canonicalCoverage}, sequence {candidate.sequenceConsistency}.</p>)}{analysis.diagnostics.map((diagnostic) => diagnostic.rejectionReason ? <p className="mt-2" key={`${diagnostic.startMs}-${diagnostic.endMs}`}>Chunk {formatTime(diagnostic.startMs)}–{formatTime(diagnostic.endMs)}: {diagnostic.rejectionReason}; local candidate {diagnostic.topCandidate ? `${diagnostic.topCandidate.startVerseKey} – ${diagnostic.topCandidate.endVerseKey}` : "none"}.</p> : null)}</details>}
          <details className="mt-5"><summary className="cursor-pointer text-sm font-semibold text-[#35604f]">Raw transcript ({result.chunks.length} timestamped chunks)</summary><p className="mt-3 whitespace-pre-wrap rounded-lg bg-[#f7f5ef] p-3 text-sm leading-7" dir="rtl" lang="ar">{result.rawTranscript || "No speech was returned."}</p></details>
        </section>}

        {videoUrl && <section className="rounded-2xl border border-[#d8d5cc] bg-[#fbfaf6] p-5">
          <h2 className="font-serif text-2xl font-semibold text-[#173c32]">Ground-truth timing controls</h2>
          <p className="mt-2 text-sm text-[#68716a]">Watch the local recording and mark what you actually hear. R marks recitation onset, M marks the next transition, and E marks final recitation end.</p>
          <video ref={videoRef} className="mt-4 w-full rounded-xl bg-black" controls playsInline preload="metadata" src={videoUrl} onLoadedMetadata={() => setDurationMs(Math.round((videoRef.current?.duration ?? 0) * 1_000))} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onEnded={() => setIsPlaying(false)} onTimeUpdate={onVideoTimeUpdate} onSeeked={onVideoTimeUpdate} />
          <div className="mt-4 flex flex-wrap items-center gap-3"><button className="rounded-full border border-[#b8cabc] px-4 py-2 text-sm font-semibold text-[#315846]" type="button" onClick={() => void (isPlaying ? videoRef.current?.pause() : videoRef.current?.play())}>{isPlaying ? "Pause" : "Play"}</button><span className="font-mono text-sm text-[#173c32]">{formatClockMilliseconds(currentTimeMs)} · {currentTimeMs} ms / {formatClockMilliseconds(durationMs)}</span></div>
          <input aria-label="Scrub video" className="mt-4 w-full accent-[#b36f3c]" type="range" min="0" max={Math.max(1, durationMs)} step="1" value={Math.min(currentTimeMs, Math.max(1, durationMs))} onChange={(event) => seekTo(Number(event.target.value))} />
          <div className="mt-4 flex flex-wrap gap-2"><button className="rounded-full bg-[#b36f3c] px-4 py-2 text-sm font-semibold text-white" type="button" onClick={() => mark("recitation-start")}>Mark recitation start (R)</button><button className="rounded-full bg-[#315846] px-4 py-2 text-sm font-semibold text-white" type="button" onClick={() => mark("set-start")}>Mark current set start</button><button className="rounded-full border border-[#b8cabc] px-4 py-2 text-sm font-semibold text-[#315846]" type="button" onClick={() => mark("transition")}>Mark next transition (M)</button><button className="rounded-full border border-[#b8cabc] px-4 py-2 text-sm font-semibold text-[#315846]" type="button" onClick={() => mark("recitation-end")}>Mark recitation end (E)</button><button className="rounded-full border border-[#d0a89b] px-4 py-2 text-sm font-semibold text-[#984b32]" type="button" onClick={() => setMarks([])}>Clear all marks</button></div>
          {marks.length > 0 && <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-[#68716a]"><tr><th className="py-2">Kind</th><th className="py-2">Time</th><th className="py-2">Caption set</th><th className="py-2">Actions</th></tr></thead><tbody>{marks.map((item) => <tr className="border-b border-[#e3e0d8]" key={item.id}><td className="py-2 font-semibold">{item.kind}</td><td className="py-2">{editingMarkId === item.id ? <input className="w-28 rounded border border-[#b8cabc] px-2 py-1 font-mono" type="number" min="0" max={durationMs} step="1" value={item.timeMs} onChange={(event) => updateMark(item.id, { timeMs: Number(event.target.value) })} /> : <button className="font-mono text-[#315846] underline" type="button" onClick={() => seekTo(item.timeMs)}>{formatClockMilliseconds(item.timeMs)} <span className="text-[#68716a]">({item.timeMs} ms)</span></button>}</td><td className="py-2"><select aria-label={`Associate ${item.kind} mark`} className="rounded border border-[#d8d5cc] bg-white px-2 py-1" value={item.segmentId ?? ""} onChange={(event) => updateMark(item.id, { segmentId: event.target.value || null })}><option value="">Not associated</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.verseKeys.join(", ")}</option>)}</select></td><td className="py-2"><button className="mr-3 text-[#315846] underline" type="button" onClick={() => setEditingMarkId(editingMarkId === item.id ? null : item.id)}>{editingMarkId === item.id ? "Done" : "Edit"}</button><button className="text-[#984b32] underline" type="button" onClick={() => deleteMark(item.id)}>Delete</button></td></tr>)}</tbody></table></div>}
        </section>}

        {result && <section className="rounded-2xl border border-[#d8d5cc] bg-[#fbfaf6] p-5"><h2 className="font-serif text-2xl font-semibold text-[#173c32]">Authoritative timing model</h2><p className="mt-2 text-sm text-[#68716a]">Preview and timeline use only CaptionSegment startMs/endMs. VerseAlignment remains recognition evidence and reset input.</p>{segments.length > 0 ? <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-[#68716a]"><tr><th className="py-2">Set</th><th className="py-2">Start</th><th className="py-2">End</th><th className="py-2">Recognition evidence</th></tr></thead><tbody>{segments.map((segment) => <tr className="border-b border-[#e3e0d8]" key={segment.id}><td className="py-2 font-semibold">{segment.verseKeys.join(", ")}</td><td className="py-2 font-mono">{segment.startMs} ms</td><td className="py-2 font-mono">{segment.endMs} ms</td><td className="py-2 text-xs">{segment.timingEvidence.start.source} → {segment.timingEvidence.end.source}</td></tr>)}</tbody></table></div> : <p className="mt-3 text-sm text-[#68716a]">No CaptionSegments were created.</p>}<details className="mt-5"><summary className="cursor-pointer text-sm font-semibold text-[#35604f]">Detailed recognition/timing pipeline log</summary><pre className="mt-3 max-h-[32rem] overflow-auto rounded-lg bg-[#f7f5ef] p-3 text-xs leading-5">{JSON.stringify({ recognitionTiming: "VerseAlignment.startMs/endMs + timingEvidence", displayTiming: "CaptionSegment.startMs/endMs (authoritative, half-open)", transcription: { backend: result.backend, timestampMode: result.timestampMode, modelLoadMs: result.modelLoadMs, transcriptionMs: result.transcriptionMs, durationMs: result.durationMs, timestampValidation: result.timestampValidation }, audioAnalysis: { sampleRate: result.audioAnalysis.sampleRate, durationMs: result.audioAnalysis.durationMs, windowMs: result.audioAnalysis.windowMs, rmsWindowCount: result.audioAnalysis.rms.length }, passage: analysis?.passage, diagnostics: analysis?.diagnostics, verseAlignments: alignments, captionSegments: segments, groundTruthMarks: marks }, null, 2)}</pre></details></section>}
      </div>
    </main>
  );
}
