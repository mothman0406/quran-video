"use client";

import { ChangeEvent, SyntheticEvent, useEffect, useRef, useState } from "react";
import { analyzeTranscript, hafsSurahs } from "@/lib/recognition/core";
import type { TranscriptionProgress } from "@/lib/recognition/transcriber";
import { captionForPlaybackTime, recognitionToVerseAlignments, type VerseAlignment } from "@/lib/editor/recognition";
import { isQuranScript, quranFontDefinitions } from "@/lib/quran/content";
import type { QuranContentResponse, QuranScript } from "@/lib/quran/content";
import { localTranscriptionSupport } from "@/lib/recognition/local-whisper";

type VideoMetadata = { durationSeconds: number; width: number; height: number };
type Stage = "idle" | "preparing" | "loading-model" | "transcribing" | "matching" | "captions" | "complete" | "error";
const busyStages: Stage[] = ["preparing", "loading-model", "transcribing", "matching", "captions"];

function formatDuration(seconds: number) { if (!Number.isFinite(seconds)) return "—"; const total = Math.round(seconds); return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`; }
function stageLabel(stage: Stage) { return ({ preparing: "Preparing audio", "loading-model": "Loading local recognition model", transcribing: "Transcribing locally", matching: "Matching Quran", captions: "Preparing captions" } as Record<string, string>)[stage] ?? ""; }

export default function Home() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [support, setSupport] = useState<{ supported: boolean; reason: string } | null>(null);
  const [alignments, setAlignments] = useState<VerseAlignment[]>([]);
  const [content, setContent] = useState<Record<string, QuranContentResponse>>({});
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [quranScript, setQuranScript] = useState<QuranScript>("uthmani");
  const [showCorrection, setShowCorrection] = useState(false);
  const [surah, setSurah] = useState(93);
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(5);
  const generation = useRef(0);

  useEffect(() => { const frame = requestAnimationFrame(() => setSupport(localTranscriptionSupport())); return () => cancelAnimationFrame(frame); }, []);
  useEffect(() => () => { if (videoUrl) URL.revokeObjectURL(videoUrl); }, [videoUrl]);
  useEffect(() => {
    const font = quranFontDefinitions[quranScript];
    const style = document.createElement("style");
    style.textContent = `@font-face { font-family: "${font.family}"; src: url("${font.source}") format("woff2"); font-display: swap; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [quranScript]);

  async function loadCanonical(keys: string[], job: number) {
    const entries = await Promise.all(keys.map(async (key) => { const response = await fetch(`/api/quran/verse?key=${key}`); return [key, (await response.json()) as QuranContentResponse] as const; }));
    if (job === generation.current) setContent(Object.fromEntries(entries));
  }

  async function detect() {
    if (!videoFile || !support?.supported || busyStages.includes(stage)) return;
    const job = ++generation.current;
    setErrorMessage(null); setProgress(null); setAlignments([]); setContent({}); setStage("preparing");
    try {
      const { localWhisperTranscriber } = await import("@/lib/recognition/local-whisper");
      const result = await localWhisperTranscriber.transcribe(videoFile, (next) => { if (job !== generation.current) return; setProgress(next); setStage(next.phase === "decoding" ? "preparing" : next.phase); });
      if (job !== generation.current) return;
      setStage("matching"); const analysis = analyzeTranscript(result.chunks);
      if (analysis.matches.length === 0) throw new Error("No confident Quran passage was detected. You can try again or correct it manually.");
      const next = recognitionToVerseAlignments(analysis.matches); const first = next[0]; const last = next.at(-1)!;
      setAlignments(next); setSurah(first.surahNumber); setStartAyah(first.ayahNumber); setEndAyah(last.ayahNumber); setStage("captions");
      await loadCanonical(next.map((item) => item.verseKey), job); if (job === generation.current) setStage("complete");
    } catch (caught) { if (job === generation.current) { setStage("error"); setErrorMessage(caught instanceof Error ? caught.message : "Local recognition failed. Try again."); } }
  }

  function selectVideo(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0]; if (!next) return;
    if (!next.type.startsWith("video/")) { setErrorMessage("Choose a video file to start a local editing session."); return; }
    generation.current += 1; if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(next); setVideoUrl(URL.createObjectURL(next)); setVideoMetadata(null); setErrorMessage(null); setStage("idle"); setProgress(null); setAlignments([]); setContent({}); setCurrentTimeMs(0);
  }
  function clearVideo() { generation.current += 1; if (videoUrl) URL.revokeObjectURL(videoUrl); setVideoFile(null); setVideoUrl(null); setVideoMetadata(null); setAlignments([]); setContent({}); setProgress(null); setStage("idle"); setErrorMessage(null); setCurrentTimeMs(0); }
  async function correctDetection() {
    const selected = hafsSurahs.find((item) => item.number === surah);
    if (!selected || startAyah < 1 || endAyah < startAyah || endAyah > selected.verseCount) { setErrorMessage("Enter a valid surah and ayah range."); return; }
    const job = ++generation.current; const rangeStart = alignments[0]?.startMs ?? 0; const rangeEnd = alignments.at(-1)?.endMs ?? (videoMetadata?.durationSeconds ?? 1) * 1000; const count = endAyah - startAyah + 1;
    const next = Array.from({ length: count }, (_, index) => ({ verseKey: `${surah}:${startAyah + index}`, surahNumber: surah, ayahNumber: startAyah + index, startMs: Math.round(rangeStart + (rangeEnd - rangeStart) * index / count), endMs: Math.round(rangeStart + (rangeEnd - rangeStart) * (index + 1) / count), confidence: 0, timingEvidence: { start: { timestampMs: rangeStart, source: "interpolation" as const }, end: { timestampMs: rangeEnd, source: "interpolation" as const }, matchedText: "" } }));
    setAlignments(next); setStage("captions"); setErrorMessage(null);
    try { await loadCanonical(next.map((item) => item.verseKey), job); if (job === generation.current) { setStage("complete"); setShowCorrection(false); } } catch { if (job === generation.current) { setStage("error"); setErrorMessage("Canonical captions could not be loaded. Check Quran Foundation configuration and try again."); } }
  }

  function updateTime(event: SyntheticEvent<HTMLVideoElement>) { setCurrentTimeMs(event.currentTarget.currentTime * 1000); }
  const active = captionForPlaybackTime(alignments, currentTimeMs); const activeContent = active ? content[active.verseKey] : null; const busy = busyStages.includes(stage);

  return <main className="min-h-screen bg-[#f5f2eb] text-[#17211b]"><div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
    <header className="flex items-center justify-between border-b border-[#d8d5cc] pb-5"><div><p className="font-serif text-lg font-semibold text-[#173c32]">Quran Video</p><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a8179]">Recitation editor</p></div><span className="rounded-full border border-[#c8d4cc] bg-[#edf4ef] px-3 py-2 text-xs font-medium text-[#2e6250]">Local session</span></header>
    <div className="grid flex-1 gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-12 lg:py-12"><section className="flex min-w-0 flex-col justify-center"><div className="mb-8 max-w-2xl"><p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[#a06b31]">M3C/M4 · Automatic Quran detection</p><h1 className="max-w-xl font-serif text-4xl leading-[1.08] tracking-[-0.03em] text-[#173c32] sm:text-5xl">Begin with a recitation.</h1><p className="mt-5 max-w-lg text-base leading-7 text-[#68716a]">Select a video, detect its Quran passage, and preview canonical captions timed to the recitation. Audio stays in this browser and is never uploaded.</p></div>
      {videoUrl ? <div className="overflow-hidden rounded-[28px] border border-[#d8d5cc] bg-[#16231e] p-2 shadow-[0_20px_60px_rgba(23,60,50,0.12)]"><div className="relative aspect-video overflow-hidden rounded-[22px] bg-[#0e1713]"><video className="h-full w-full object-contain" controls playsInline preload="metadata" src={videoUrl} onLoadedMetadata={(event) => setVideoMetadata({ durationSeconds: event.currentTarget.duration, width: event.currentTarget.videoWidth, height: event.currentTarget.videoHeight })} onTimeUpdate={updateTime} onSeeked={updateTime} onError={() => setErrorMessage("This video could not be previewed in your browser.")}>Your browser does not support video playback.</video>{activeContent?.status === "ready" && <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-5 sm:bottom-12"><div className="max-w-[90%] rounded-2xl border border-white/20 bg-[#10221dcc] px-5 py-4 text-center text-white shadow-lg backdrop-blur-md" translate="no"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#f7d88b]">{activeContent.verse.verseKey}</p><p className="text-3xl leading-tight sm:text-4xl" dir="rtl" lang="ar" style={{ fontFamily: quranFontDefinitions[quranScript].family }}>{activeContent.verse.arabic[quranScript]}</p>{activeContent.verse.transliteration && <p className="mt-2 text-sm italic text-white/70">{activeContent.verse.transliteration}</p>}{activeContent.verse.translation && <p className="mt-2 text-sm text-white/75">{activeContent.verse.translation}</p>}</div></div>}</div></div> : <label className="group flex min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed border-[#b9b9aa] bg-[#eeece4] px-6 text-center hover:border-[#6b907e] hover:bg-[#e7ebe4]"><span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#173c32] text-3xl text-[#f7d88b]">↑</span><span className="font-serif text-2xl font-semibold text-[#173c32]">Choose a video</span><span className="mt-2 max-w-xs text-sm leading-6 text-[#737b73]">MP4, WebM, or another video supported by your browser</span><span className="mt-6 rounded-full bg-[#173c32] px-5 py-2.5 text-sm font-semibold text-white">Browse files</span><input accept="video/*" className="sr-only" type="file" onChange={selectVideo} /></label>}
      {videoFile && <div className="mt-4 flex flex-wrap items-center gap-3"><button className="rounded-full bg-[#173c32] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={busy || !support?.supported} type="button" onClick={detect}>{stage === "complete" ? "Detect again" : "Detect Quran"}</button>{stage === "complete" && alignments.length > 0 && <button className="rounded-full border border-[#c8d4cc] px-4 py-2.5 text-sm font-semibold text-[#35604f]" type="button" onClick={() => setShowCorrection((value) => !value)}>Correct detection</button>}<button className="rounded-full border border-[#c8d4cc] px-4 py-2.5 text-sm font-semibold text-[#35604f]" type="button" onClick={clearVideo}>Choose a different video</button></div>}
      {busy && <div aria-live="polite" className="mt-4 rounded-2xl border border-[#c8d4cc] bg-[#edf4ef] px-4 py-3 text-sm text-[#35604f]"><p className="font-semibold">{stageLabel(stage)}</p><p className="mt-1 text-xs">Audio is processed locally and is not uploaded.{progress?.phase === "transcribing" && progress.total ? ` ${progress.completed ?? 0}/${progress.total} audio chunks.` : ""}</p></div>}
      {stage === "complete" && alignments.length > 0 && <div className="mt-4 rounded-2xl border border-[#c8d4cc] bg-[#edf4ef] p-4 text-sm text-[#35604f]"><p className="font-semibold">Detected: Surah {alignments[0].surahNumber} ({hafsSurahs.find((item) => item.number === alignments[0].surahNumber)?.transliteration}) · ayat {alignments[0].ayahNumber}–{alignments.at(-1)?.ayahNumber}</p><p className="mt-1">{Math.round(alignments.reduce((sum, item) => sum + item.confidence, 0) / alignments.length * 100)}% overall confidence</p>{Object.values(content).some((item) => item.status === "setup_required") && <p className="mt-2 text-xs">Recognition completed, but canonical display needs Quran Foundation server configuration.</p>}</div>}
      {showCorrection && <div className="mt-4 rounded-2xl border border-[#d8d5cc] bg-[#fbfaf6] p-4"><p className="font-semibold text-[#173c32]">Correct detection</p><div className="mt-3 grid grid-cols-3 gap-2"><select aria-label="Surah" className="rounded-xl border px-2 py-2 text-sm" value={surah} onChange={(event) => setSurah(Number(event.target.value))}>{hafsSurahs.map((item) => <option key={item.number} value={item.number}>{item.number} · {item.name}</option>)}</select><input aria-label="First ayah" className="rounded-xl border px-2 py-2 text-sm" min={1} type="number" value={startAyah} onChange={(event) => setStartAyah(Number(event.target.value))} /><input aria-label="Last ayah" className="rounded-xl border px-2 py-2 text-sm" min={1} type="number" value={endAyah} onChange={(event) => setEndAyah(Number(event.target.value))} /></div><button className="mt-3 rounded-full bg-[#173c32] px-4 py-2 text-sm font-semibold text-white" type="button" onClick={correctDetection}>Use this range</button></div>}
      {errorMessage && <p className="mt-3 rounded-xl border border-[#e3b9a9] bg-[#fff3ed] px-4 py-3 text-sm text-[#984b32]">{errorMessage} {stage === "error" && <button className="ml-2 font-semibold underline" type="button" onClick={detect}>Retry</button>}</p>}
    </section><aside className="flex flex-col justify-center lg:pb-8"><div className="rounded-[24px] border border-[#d8d5cc] bg-[#fbfaf6] p-6 shadow-[0_16px_45px_rgba(23,60,50,0.06)]"><h2 className="font-serif text-xl font-semibold text-[#173c32]">Session details</h2>{videoFile ? <div className="mt-5 space-y-4"><p className="truncate text-sm font-semibold text-[#35443b]">{videoFile.name}</p><p className="border-y border-[#e3e0d8] py-4 text-sm text-[#68716a]">{videoMetadata ? `${formatDuration(videoMetadata.durationSeconds)} · ${videoMetadata.width} × ${videoMetadata.height}` : "Reading video metadata…"}</p><label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b928b]" htmlFor="quran-script">Quran typography</label><select className="w-full rounded-xl border border-[#c8d4cc] bg-white px-3 py-2 text-sm" id="quran-script" value={quranScript} onChange={(event) => { if (isQuranScript(event.target.value)) setQuranScript(event.target.value); }}>{Object.entries(quranFontDefinitions).map(([value, font]) => <option key={value} value={value}>{font.label}</option>)}</select><p className="text-xs leading-5 text-[#737b73]">Canonical Hafs Arabic, Saheeh International, and optional transliteration are used for captions.</p></div> : <p className="mt-5 text-sm leading-6 text-[#737b73]">Your source video remains a temporary local browser object. Nothing is uploaded or saved.</p>}</div>{support && !support.supported && <p className="mt-4 rounded-xl bg-[#fff3ed] p-3 text-xs leading-5 text-[#984b32]">Local recognition is unavailable: {support.reason}</p>}{support?.supported && <p className="mt-4 text-xs leading-5 text-[#8b928b]">{support.reason}</p>}</aside></div></div></main>;
}
