"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import DashboardShell from "@/components/dashboard-shell";
import { DEFAULT_CAPTION_BACKGROUND, DEFAULT_TRANSITION_SETTINGS, DEFAULT_TYPOGRAPHY, clampCaptionPositioning, resetCaptionPositioning, resolveWordHighlightPresentation } from "@/lib/editor/captions";
import { PROJECT_FORMATS, projectFormatForPreset } from "@/lib/editor/formats";
import { MEDIA_FILE_ACCEPT, mediaFileError, mediaKindForFile, mediaSourceFromFile } from "@/lib/editor/media";
import { projectAssetFromMediaSource } from "@/lib/editor/project-assets";
import { accountEntitlementsForPlan, type AccountEntitlements } from "@/lib/entitlements";
import { getAccountEntitlements } from "@/lib/entitlements/client";
import { getAuthSession, getSupabaseClient, listCloudProjectRecords } from "@/lib/cloud-sync";
import { getVerse } from "@/lib/quran/local";
import { mediaCompatibilityErrorMessage } from "@/lib/media-compatibility";
import type { MediaInspection } from "@/lib/media-compatibility";
import { LocalMediaPreparationProgressController, type LocalMediaPreparationProgress } from "@/lib/recognition/local-media-progress";
import type { DecodedAudioChannels } from "@/lib/recognition/local-audio-decode";
import type { ProjectFormatPreset, SavedProject } from "@/lib/schemas/project";
import { videoJobManager } from "@/lib/video-jobs";

type PreparedSelection = {
  file: File;
  original: File;
  source: NonNullable<SavedProject["sourceMedia"]>;
  preparedAudio?: DecodedAudioChannels;
};

const SAMPLE_VERSE = getVerse("93:1")!;
function cleanTitle(name: string): string {
  const value = name.replace(/\.[^.]+$/u, "").replace(/[_-]+/gu, " ").replace(/\s+/gu, " ").trim();
  return value.slice(0, 200) || "New Quran video";
}

function preparationLabel(progress: LocalMediaPreparationProgress | null, ready: boolean): string {
  if (ready) return "Ready to generate";
  switch (progress?.stage) {
    case "preparing-converter": return "Preparing converter…";
    case "inspecting-recording": return "Inspecting recording…";
    case "converting-recording": return "Converting recording…";
    case "preparing-audio": return "Preparing audio for detection…";
    case "preparing-editor": return "Finishing media preparation…";
    default: return "Checking compatibility…";
  }
}

export default function QuickCreate() {
  const router = useRouter();
  const [selected, setSelected] = useState<File | null>(null);
  const [prepared, setPrepared] = useState<PreparedSelection | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewPlayable, setPreviewPlayable] = useState(true);
  const [progress, setProgress] = useState<LocalMediaPreparationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [format, setFormat] = useState<ProjectFormatPreset>("vertical");
  const [captionY, setCaptionY] = useState(resetCaptionPositioning(PROJECT_FORMATS.vertical).y);
  const [captionSize, setCaptionSize] = useState(DEFAULT_TYPOGRAPHY.arabicFontSize);
  const [translationVisible, setTranslationVisible] = useState(true);
  const [highlightEnabled, setHighlightEnabled] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [entitlements, setEntitlements] = useState<AccountEntitlements>(() => accountEntitlementsForPlan("free"));
  const [cloudCount, setCloudCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const preparationId = useRef(0);
  const progressController = useRef(new LocalMediaPreparationProgressController());
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    void getAuthSession().then(async (next) => {
      if (!active) return;
      setSession(next);
      if (!next) return;
      const [account, records] = await Promise.all([getAccountEntitlements(next).catch(() => accountEntitlementsForPlan("free")), listCloudProjectRecords().catch(() => [])]);
      if (active) { setEntitlements(account); setCloudCount(records.length); }
    });
    return () => { active = false; };
  }, []);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  function replacePreviewUrl(next: string) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = next;
    setPreviewUrl(next);
  }

  function applyDetectedFormat(inspection: Pick<MediaInspection, "width" | "height">) {
    if (!inspection.width || !inspection.height) return;
    const inferred = inspection.width > inspection.height * 1.1 ? "landscape" : inspection.height > inspection.width * 1.1 ? "vertical" : "square";
    setFormat(inferred);
    setCaptionY(resetCaptionPositioning(PROJECT_FORMATS[inferred]).y);
  }

  function publishPreparation(job: number, event: { stage: LocalMediaPreparationProgress["stage"]; inspection?: MediaInspection; processedTimeMs?: number; sourceDurationMs?: number; complete?: boolean }) {
    if (job !== preparationId.current) return;
    if (event.inspection) applyDetectedFormat(event.inspection);
    let next = event.stage === "converting-recording" || event.stage === "preparing-audio"
      ? event.complete
        ? progressController.current.complete(job, event.stage, event.sourceDurationMs)
        : event.processedTimeMs === undefined
          ? progressController.current.stage(job, event.stage)
          : progressController.current.reportProcessedTime(job, event.stage, event.processedTimeMs, event.sourceDurationMs)
      : progressController.current.stage(job, event.stage);
    if (!next && (event.stage === "converting-recording" || event.stage === "preparing-audio")) next = progressController.current.stage(job, event.stage);
    if (next) setProgress({ ...next });
  }

  async function prepare(next: File | undefined) {
    if (!next) return;
    const validation = mediaFileError(next);
    if (validation) { setError(validation); return; }
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;
    const job = ++preparationId.current;
    setSelected(next); setPrepared(null); setError(null); setPreviewPlayable(true);
    setProgress(progressController.current.start(job, "checking"));
    const originalUrl = URL.createObjectURL(next);
    replacePreviewUrl(originalUrl);
    try {
      const { prepareLocalMedia, decodeRecognitionAudioFallback } = await import("@/lib/recognition/local-media-compatibility");
      const result = await prepareLocalMedia(next, abort.signal, (event) => publishPreparation(job, event));
      if (abort.signal.aborted || job !== preparationId.current) return;
      let preparedAudio: DecodedAudioChannels | undefined;
      if (result.route === "audio-fallback") {
        preparedAudio = await decodeRecognitionAudioFallback(result.file, abort.signal, (event) => publishPreparation(job, event));
      }
      if (abort.signal.aborted || job !== preparationId.current) return;
      const assetId = crypto.randomUUID();
      const source = mediaSourceFromFile(result.file, result.kind, {
        assetId,
        compatibility: result.route,
        originalFileName: result.original.name,
        originalMimeType: result.original.type || undefined,
        displayName: result.original.name,
        durationMs: result.inspection.durationMs,
        width: result.inspection.width,
        height: result.inspection.height,
      });
      applyDetectedFormat(result.inspection);
      if (result.file !== next) {
        replacePreviewUrl(URL.createObjectURL(result.file));
        setPreviewPlayable(true);
      }
      setPrepared({ file: result.file, original: next, source, preparedAudio });
      setProgress(null);
    } catch (caught) {
      if (!abort.signal.aborted) {
        setPrepared(null);
        setProgress(null);
        setError(mediaCompatibilityErrorMessage(caught) ?? "We couldn't prepare this recording. Choose another recording.");
      }
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    void prepare(event.currentTarget.files?.[0]);
    event.currentTarget.value = "";
  }

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void prepare(event.dataTransfer.files[0]);
  }

  function moveCaption(event: PointerEvent<HTMLDivElement>) {
    if (!dragging && event.type !== "pointerdown") return;
    const bounds = previewRef.current?.getBoundingClientRect();
    if (!bounds?.height) return;
    if (event.type === "pointerdown") {
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    const y = Math.min(format === "vertical" ? 0.82 : 0.94, Math.max(0.06, (event.clientY - bounds.top) / bounds.height));
    setCaptionY(y);
  }

  function generate() {
    if (!prepared) return;
    const now = new Date().toISOString();
    const projectFormat = projectFormatForPreset(format);
    const positioning = clampCaptionPositioning({ ...resetCaptionPositioning(projectFormat), y: captionY, translationY: captionY + 0.12 }, projectFormat);
    const typography = {
      ...DEFAULT_TYPOGRAPHY,
      arabicFontSize: captionSize,
      translationVisible,
      wordHighlightMode: highlightEnabled ? "read-so-far" as const : "off" as const,
    };
    const assetId = prepared.source.assetId!;
    const project: SavedProject = {
      version: 2,
      id: crypto.randomUUID(),
      title: cleanTitle(prepared.original.name),
      sourceMedia: prepared.source,
      projectAssets: [projectAssetFromMediaSource(prepared.source, assetId, now)],
      activeMediaAssetId: assetId,
      mediaTrim: { startMs: 0, endMs: prepared.source.durationMs ?? 0 },
      format: projectFormat,
      verseAlignments: [],
      captionSegments: [],
      captions: { arabic: true, translation: translationVisible, transliteration: false, translationEdition: "english_saheeh" },
      positioning,
      captionBackground: DEFAULT_CAPTION_BACKGROUND,
      typography,
      transitionSettings: DEFAULT_TRANSITION_SETTINGS,
      playbackRate: 1,
      showVerseNumber: false,
      createdAt: now,
      updatedAt: now,
    };
    videoJobManager.start({ project, file: prepared.file, preparedAudio: prepared.preparedAudio, session, entitlements });
    router.push("/videos");
  }

  const kind = selected ? mediaKindForFile(selected) : null;
  const status = preparationLabel(progress, Boolean(prepared));
  const replacementNotice = Boolean(session && entitlements.plan === "free" && entitlements.cloudProjectLimit !== null && cloudCount >= entitlements.cloudProjectLimit);
  const sampleWords = SAMPLE_VERSE.arabic.uthmani.split(/\s+/u);
  const highlightedWord = resolveWordHighlightPresentation({ baseTextColor: DEFAULT_TYPOGRAPHY.textColor, highlightColor: DEFAULT_TYPOGRAPHY.wordHighlightColor, intensity: DEFAULT_TYPOGRAPHY.wordHighlightIntensity, isHighlighted: true });

  return <DashboardShell current="create"><section className="quick-create-page">
    <header className="quick-create-header"><div><p>QUICK CREATE</p><h1>Create Quran captions</h1><span>Prepare your recitation and choose a clean starting layout. Fine-tune everything later in the advanced editor.</span></div></header>
    <div className="quick-create-grid">
      <div className="quick-create-stage">
        {!selected ? <label className="quick-create-drop" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
          <input type="file" accept={MEDIA_FILE_ACCEPT} onChange={selectFile} />
          <span aria-hidden="true">＋</span><strong>Choose a recitation</strong><small>Video or audio from Photos, Camera Roll, Finder, or your device</small><b>Browse files</b>
        </label> : <div ref={previewRef} className={`quick-create-preview is-${format}`}>
          {previewUrl && kind === "video" && previewPlayable && <video src={previewUrl} controls playsInline preload="metadata" onError={() => setPreviewPlayable(false)} />}
          {previewUrl && kind === "audio" && <div className="quick-create-audio"><span aria-hidden="true">◌</span><strong>{selected.name}</strong><audio src={previewUrl} controls preload="metadata" /></div>}
          {(!previewPlayable || !previewUrl) && <div className="quick-create-neutral"><span aria-hidden="true">۝</span><p>Your preview will appear when local preparation finishes.</p></div>}
          <div className="quick-create-sample" style={{ top: `${captionY * 100}%` }} aria-label="Sample caption placement. This is preview content, not detected Quran text." onPointerDown={moveCaption} onPointerMove={moveCaption} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
            <span>Sample preview</span>
            <p dir="rtl" lang="ar" style={{ fontSize: `${captionSize}px` }}>{sampleWords.map((word, index) => { const read = highlightEnabled && index < Math.ceil(sampleWords.length / 2); return <b style={read ? { color: highlightedWord.color, textShadow: `0 0 ${highlightedWord.glowBlurPx}px ${highlightedWord.glowColor}` } : undefined} key={`${word}-${index}`}>{word}{" "}</b>; })}</p>
            {translationVisible && <small>By the morning brightness</small>}
          </div>
        </div>}
        {selected && <div className="quick-create-file"><div><strong>{selected.name}</strong><span>{(selected.size / 1024 / 1024).toFixed(1)} MB · Prepared locally on this device</span></div><label><input type="file" accept={MEDIA_FILE_ACCEPT} onChange={selectFile} />Choose another</label></div>}
      </div>
      <aside className="quick-create-controls" aria-label="Caption setup">
        <div className="quick-create-status" role="status" aria-live="polite"><span className={prepared ? "is-ready" : ""} /> <div><strong>{selected ? status : "Choose media to begin"}</strong><small>{progress?.percentage === undefined ? "No media leaves your device during preparation." : `${progress.percentage}% complete`}</small></div></div>
        <fieldset disabled={!selected}><legend>Canvas</legend><div className="quick-create-options" role="radiogroup" aria-label="Aspect ratio">{(["vertical", "square", "landscape"] as const).map((preset) => <button type="button" role="radio" aria-checked={format === preset} className={format === preset ? "is-selected" : ""} key={preset} onClick={() => { setFormat(preset); setCaptionY((value) => clampCaptionPositioning({ ...resetCaptionPositioning(PROJECT_FORMATS[preset]), y: value }, PROJECT_FORMATS[preset]).y); }}>{preset === "vertical" ? "9:16" : preset === "square" ? "1:1" : "16:9"}</button>)}</div></fieldset>
        <fieldset disabled={!selected}><legend>Caption position <output>{Math.round(captionY * 100)}%</output></legend><input aria-label="Caption vertical position" type="range" min="6" max={format === "vertical" ? "82" : "94"} value={Math.round(captionY * 100)} onChange={(event) => setCaptionY(Number(event.currentTarget.value) / 100)} /><small>Drag the sample caption on the preview or use this control.</small></fieldset>
        <fieldset disabled={!selected}><legend>Caption size <output>{captionSize}px</output></legend><input aria-label="Caption size" type="range" min="24" max="52" value={captionSize} onChange={(event) => setCaptionSize(Number(event.currentTarget.value))} /></fieldset>
        <div className="quick-create-toggles"><label><span><strong>Show translation</strong><small>Add the saved English translation.</small></span><input type="checkbox" checked={translationVisible} onChange={(event) => setTranslationVisible(event.currentTarget.checked)} /></label><label><span><strong>Word highlighting</strong><small>Use Quran AutoCaption’s read-so-far highlight.</small></span><input type="checkbox" checked={highlightEnabled} onChange={(event) => setHighlightEnabled(event.currentTarget.checked)} /></label></div>
        {replacementNotice && <p className="quick-create-fifo">Free keeps your 3 most recent saved videos. Generating this will replace your oldest saved video.</p>}
        {error && <div className="quick-create-error" role="alert"><strong>We couldn’t prepare this recording.</strong><p>{error}</p><span>Choose another recording</span></div>}
        <button className="quick-create-generate" type="button" disabled={!prepared} onClick={generate}>{prepared ? "Generate captions" : selected ? "Preparing recording…" : "Choose a recording"}</button>
        <p className="quick-create-local-note">Generation continues locally while this tab stays open. A finished MP4 is rendered only when you download.</p>
      </aside>
    </div>
  </section></DashboardShell>;
}
