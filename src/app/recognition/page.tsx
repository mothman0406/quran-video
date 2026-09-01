"use client";

import { type ChangeEvent, useEffect, useState } from "react";
import { analyzeTranscript, type RecognitionAnalysis, type RecognitionResult } from "@/lib/recognition/core";
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

const INITIAL_RUNTIME_SUPPORT = { supported: false, reason: "Checking browser capabilities…" };

export default function RecognitionSpikePage() {
  const [support, setSupport] = useState(INITIAL_RUNTIME_SUPPORT);
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [result, setResult] = useState<LocalTranscriptionResult | null>(null);
  const [matches, setMatches] = useState<RecognitionResult>([]);
  const [analysis, setAnalysis] = useState<RecognitionAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setSupport(localTranscriptionSupport()));
    return () => cancelAnimationFrame(frame);
  }, []);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    setFile(next);
    setResult(null);
    setMatches([]);
    setAnalysis(null);
    setError(null);
    setProgress(null);
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Local transcription failed.");
    } finally {
      setIsRunning(false);
    }
  }

  const firstMatch = matches[0];
  const lastMatch = matches.at(-1);
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
          <button className="mt-4 rounded-full bg-[#173c32] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!file || !support.supported || isRunning} type="button" onClick={transcribe}>Transcribe locally</button>
          {progress && <p aria-live="polite" className="mt-3 text-sm text-[#35604f]">{progress.message}{progress.phase === "transcribing" && progress.total ? ` ${progress.completed ?? 0}/${progress.total}` : ""}{progress.bytesLoaded && progress.bytesTotal ? ` ${(progress.bytesLoaded / progress.bytesTotal * 100).toFixed(0)}%` : ""}</p>}
          {error && <p className="mt-3 rounded-lg bg-[#fff3ed] p-3 text-sm text-[#984b32]">{error}</p>}
        </section>

        {result && <section className="rounded-2xl border border-[#d8d5cc] bg-[#fbfaf6] p-5">
          <h2 className="font-serif text-2xl font-semibold text-[#173c32]">Recognition result</h2>
          <p className="mt-2 text-sm text-[#68716a]">Backend: {result.backend} · transcription time: {formatMilliseconds(result.durationMs)}</p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div><dt className="text-xs font-bold uppercase tracking-wide text-[#8b928b]">Surah</dt><dd className="mt-1 font-semibold">{firstMatch ? firstMatch.verseKey.split(":")[0] : "No Quran match"}</dd></div>
            <div><dt className="text-xs font-bold uppercase tracking-wide text-[#8b928b]">Detected ayah range</dt><dd className="mt-1 font-semibold">{firstMatch && lastMatch ? `${firstMatch.verseKey} – ${lastMatch.verseKey}` : "—"}</dd></div>
            <div><dt className="text-xs font-bold uppercase tracking-wide text-[#8b928b]">Passage decision</dt><dd className="mt-1 font-semibold">{analysis?.passage.state.replaceAll("-", " ") ?? "—"}{analysis?.passage.disambiguatedByLaterChunks ? " · later text disambiguated" : ""}</dd></div>
            <div><dt className="text-xs font-bold uppercase tracking-wide text-[#8b928b]">Candidate margin</dt><dd className="mt-1 font-semibold">{analysis?.passage.candidateMargin === null || analysis?.passage.candidateMargin === undefined ? "—" : analysis.passage.candidateMargin.toFixed(3)}</dd></div>
          </dl>
          {matches.length > 0 ? <div className="mt-5 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b text-[#68716a]"><tr><th className="py-2">Ayah</th><th className="py-2">Approximate start</th><th className="py-2">Approximate end</th><th className="py-2">Boundary evidence</th><th className="py-2">Confidence</th><th className="py-2">Matched text</th></tr></thead><tbody>{matches.map((match) => <tr className="border-b border-[#e3e0d8]" key={`${match.verseKey}-${match.startMs}`}><td className="py-2 font-semibold">{match.verseKey}</td><td className="py-2">{formatTime(match.startMs)}</td><td className="py-2">{formatTime(match.endMs)}</td><td className="py-2">{match.timing.start.source}</td><td className="py-2">{Math.round(match.confidence * 100)}%</td><td className="py-2" dir="rtl" lang="ar">{match.timing.matchedText || "interpolated"}</td></tr>)}</tbody></table></div> : <p className="mt-5 text-sm text-[#68716a]">The transcript did not reach the deterministic matcher confidence threshold.</p>}
          {analysis && <details className="mt-4 text-sm text-[#68716a]"><summary className="cursor-pointer font-semibold text-[#35604f]">Two-stage diagnostics</summary><p className="mt-2" dir="rtl" lang="ar">Complete transcript: {result.rawTranscript || "—"}</p><p className="mt-2">Selected passage: {analysis.passage.selectedCandidate ? `${analysis.passage.selectedCandidate.startVerseKey} – ${analysis.passage.selectedCandidate.endVerseKey}` : "none"}; decision: {analysis.passage.state}; uniqueness margin: {analysis.passage.candidateMargin ?? "n/a"}; later chunks disambiguated: {analysis.passage.disambiguatedByLaterChunks ? "yes" : "no"}.</p>{analysis.passage.candidates.map((candidate) => <p className="mt-2" key={`${candidate.startVerseKey}-${candidate.endVerseKey}`}>{candidate.startVerseKey} – {candidate.endVerseKey}: global score {candidate.totalScore}, transcript coverage {candidate.transcriptCoverage}, Quran coverage {candidate.canonicalCoverage}, sequence {candidate.sequenceConsistency}.</p>)}{analysis.diagnostics.map((diagnostic) => diagnostic.rejectionReason ? <p className="mt-2" key={`${diagnostic.startMs}-${diagnostic.endMs}`}>Chunk {formatTime(diagnostic.startMs)}–{formatTime(diagnostic.endMs)}: {diagnostic.rejectionReason}; local candidate {diagnostic.topCandidate ? `${diagnostic.topCandidate.startVerseKey} – ${diagnostic.topCandidate.endVerseKey}` : "none"}.</p> : null)}</details>}
          <details className="mt-5"><summary className="cursor-pointer text-sm font-semibold text-[#35604f]">Raw transcript ({result.chunks.length} timestamped chunks)</summary><p className="mt-3 whitespace-pre-wrap rounded-lg bg-[#f7f5ef] p-3 text-sm leading-7" dir="rtl" lang="ar">{result.rawTranscript || "No speech was returned."}</p></details>
        </section>}
      </div>
    </main>
  );
}
