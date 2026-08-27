"use client";

import { ChangeEvent, SyntheticEvent, useEffect, useState } from "react";
import {
  isQuranScript,
  quranFontDefinitions,
} from "@/lib/quran/content";
import type { QuranContentResponse, QuranScript } from "@/lib/quran/content";

type VideoMetadata = {
  durationSeconds: number;
  width: number;
  height: number;
};

const defaultVerseKey = "93:1";

function formatDuration(durationSeconds: number) {
  if (!Number.isFinite(durationSeconds)) {
    return "—";
  }

  const totalSeconds = Math.round(durationSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function Home() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quranContent, setQuranContent] = useState<QuranContentResponse | null>(null);
  const [quranScript, setQuranScript] = useState<QuranScript>("uthmani");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/quran/verse?key=${defaultVerseKey}`)
      .then(async (response) => (await response.json()) as QuranContentResponse)
      .then((result) => {
        if (!cancelled) setQuranContent(result);
      })
      .catch(() => {
        if (!cancelled) setQuranContent({ status: "error", message: "Could not load Quran Foundation content." });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (quranContent?.status !== "ready") return;
    const font = quranFontDefinitions[quranScript];
    const style = document.createElement("style");
    style.textContent = `@font-face { font-family: "${font.family}"; src: url("${font.source}") format("woff2"); font-display: swap; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [quranContent, quranScript]);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  function handleVideoChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];

    if (!nextFile) {
      return;
    }

    if (!nextFile.type.startsWith("video/")) {
      setErrorMessage("Choose a video file to start a local editing session.");
      return;
    }

    setVideoFile(nextFile);
    setVideoUrl(URL.createObjectURL(nextFile));
    setVideoMetadata(null);
    setErrorMessage(null);
  }

  function handleVideoMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;

    setVideoMetadata({
      durationSeconds: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    });
  }

  function clearVideo() {
    setVideoFile(null);
    setVideoUrl(null);
    setVideoMetadata(null);
    setErrorMessage(null);
  }

  return (
    <main className="min-h-screen bg-[#f5f2eb] text-[#17211b]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
        <header className="flex items-center justify-between border-b border-[#d8d5cc] pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#173c32] text-[#f7d88b] shadow-sm">
              <span aria-hidden="true" className="text-lg">
                ✦
              </span>
            </div>
            <div>
              <p className="font-serif text-lg font-semibold tracking-tight text-[#173c32]">
                Quran Video
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a8179]">
                Recitation editor
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-full border border-[#c8d4cc] bg-[#edf4ef] px-3 py-2 text-xs font-medium text-[#2e6250]">
            <span className="h-2 w-2 rounded-full bg-[#4d9a73]" />
            Local session
          </div>
        </header>

        <div className="grid flex-1 gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-12 lg:py-12">
          <section className="flex min-w-0 flex-col justify-center">
            <div className="mb-8 max-w-2xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[#a06b31]">
                M2 · Canonical Quran content
              </p>
              <h1 className="max-w-xl font-serif text-4xl leading-[1.08] tracking-[-0.03em] text-[#173c32] sm:text-5xl lg:text-6xl">
                Begin with a recitation.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-[#68716a]">
                Select a video from your device to preview it with canonical Quran
                content. Your source stays in this browser session.
              </p>
            </div>

            {videoUrl ? (
              <div className="overflow-hidden rounded-[28px] border border-[#d8d5cc] bg-[#16231e] p-2 shadow-[0_20px_60px_rgba(23,60,50,0.12)]">
                <div className="relative aspect-video overflow-hidden rounded-[22px] bg-[#0e1713]">
                  <video
                    className="h-full w-full object-contain"
                    controls
                    playsInline
                    preload="metadata"
                    src={videoUrl}
                    onError={() =>
                      setErrorMessage(
                        "This video could not be previewed in your browser.",
                      )
                    }
                    onLoadedMetadata={handleVideoMetadata}
                  >
                    Your browser does not support video playback.
                  </video>

                  <div className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center px-5 sm:bottom-12">
                    <div className="max-w-[90%] rounded-2xl border border-white/20 bg-[#10221dcc] px-5 py-4 text-center text-white shadow-lg backdrop-blur-md sm:px-8 sm:py-5">
                      {quranContent?.status === "ready" ? (
                        <div translate="no">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#f7d88b]">
                            {quranContent.verse.verseKey}
                          </p>
                          <p
                            className="text-3xl leading-tight sm:text-4xl"
                            dir="rtl"
                            lang="ar"
                            style={{ fontFamily: quranFontDefinitions[quranScript].family }}
                          >
                            {quranContent.verse.arabic[quranScript]}
                          </p>
                          {quranContent.verse.transliteration && (
                            <p className="mt-2 text-sm italic text-white/70">
                              {quranContent.verse.transliteration}
                            </p>
                          )}
                          {quranContent.verse.translation && (
                            <p className="mt-2 text-sm text-white/75">
                              {quranContent.verse.translation}
                            </p>
                          )}
                        </div>
                      ) : (
                        <p className="text-sm text-[#f7d88b]">
                          {quranContent?.message ?? "Loading canonical Quran content…"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <label className="group flex min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed border-[#b9b9aa] bg-[#eeece4] px-6 text-center transition-colors hover:border-[#6b907e] hover:bg-[#e7ebe4] sm:min-h-[430px]">
                <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#173c32] text-[#f7d88b] shadow-lg shadow-[#173c32]/15 transition-transform group-hover:scale-105">
                  <svg
                    aria-hidden="true"
                    className="h-7 w-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 16V4m0 0L8 8m4-4 4 4M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14"
                    />
                  </svg>
                </span>
                <span className="font-serif text-2xl font-semibold text-[#173c32]">
                  Choose a video
                </span>
                <span className="mt-2 max-w-xs text-sm leading-6 text-[#737b73]">
                  MP4, WebM, or another video supported by your browser
                </span>
                <span className="mt-6 rounded-full bg-[#173c32] px-5 py-2.5 text-sm font-semibold text-white transition-colors group-hover:bg-[#245746]">
                  Browse files
                </span>
                <input
                  accept="video/*"
                  className="sr-only"
                  type="file"
                  onChange={handleVideoChange}
                />
              </label>
            )}

            {errorMessage && (
              <p className="mt-3 rounded-xl border border-[#e3b9a9] bg-[#fff3ed] px-4 py-3 text-sm text-[#984b32]">
                {errorMessage}
              </p>
            )}
          </section>

          <aside className="flex flex-col justify-center lg:pb-8">
            <div className="rounded-[24px] border border-[#d8d5cc] bg-[#fbfaf6] p-6 shadow-[0_16px_45px_rgba(23,60,50,0.06)]">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="font-serif text-xl font-semibold text-[#173c32]">
                  Session details
                </h2>
                <span className="rounded-full bg-[#f4e7c6] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#8d642f]">
                  Browser only
                </span>
              </div>

              <div className="mb-6 rounded-2xl border border-[#e3e0d8] bg-[#f7f5ef] p-4">
                <label className="block text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b928b]" htmlFor="quran-script">
                  Quran typography
                </label>
                <select
                  className="mt-2 w-full rounded-xl border border-[#c8d4cc] bg-white px-3 py-2 text-sm text-[#35443b]"
                  id="quran-script"
                  value={quranScript}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (isQuranScript(value)) setQuranScript(value);
                  }}
                >
                  {Object.entries(quranFontDefinitions).map(([value, font]) => (
                    <option key={value} value={value}>{font.label}</option>
                  ))}
                </select>
                <p className="mt-2 text-xs leading-5 text-[#737b73]">
                  Arabic, Saheeh International translation, and optional transliteration come from Quran Foundation.
                </p>
              </div>

              {videoFile ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b928b]">
                      Source video
                    </p>
                    <p className="mt-1 truncate text-sm font-semibold text-[#35443b]">
                      {videoFile.name}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 border-y border-[#e3e0d8] py-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b928b]">
                        Duration
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#35443b]">
                        {videoMetadata
                          ? formatDuration(videoMetadata.durationSeconds)
                          : "Loading…"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b928b]">
                        Size
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[#35443b]">
                        {videoMetadata
                          ? `${videoMetadata.width} × ${videoMetadata.height}`
                          : "Loading…"}
                      </p>
                    </div>
                  </div>
                  <button
                    className="w-full rounded-full border border-[#c8d4cc] px-4 py-2.5 text-sm font-semibold text-[#35604f] transition-colors hover:border-[#9bb8a8] hover:bg-[#edf4ef]"
                    type="button"
                    onClick={clearVideo}
                  >
                    Choose a different video
                  </button>
                </div>
              ) : (
                <div className="space-y-4 text-sm leading-6 text-[#737b73]">
                  <p>
                    Nothing is uploaded until a future processing step needs it.
                    This preview uses a temporary browser object URL.
                  </p>
                  <div className="rounded-2xl bg-[#edf4ef] p-4 text-[#35604f]">
                    <p className="font-semibold">What you can do in M1</p>
                    <p className="mt-1 text-xs leading-5 text-[#527566]">
                      Select a local video, play it, and see the fixed caption
                      overlay in context.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <p className="mt-5 text-center text-xs leading-5 text-[#8b928b] lg:text-left">
              Source media is not saved or sent to a server by this preview.
            </p>
          </aside>
        </div>
      </div>
    </main>
  );
}
