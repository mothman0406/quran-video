"use client";

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import DashboardShell from "@/components/dashboard-shell";
import { arabicIndicNumber, captionPositionBounds, resolveWordHighlightPresentation } from "@/lib/editor/captions";
import { PROJECT_FORMATS, projectFormatForPreset } from "@/lib/editor/formats";
import { DEFAULT_PRE_GENERATION_PRESENTATION_SECTION, FULL_AYAH_DISPLAY_INHERENT, PRE_GENERATION_PRESENTATION_SECTIONS, defaultCaptionPresentationSettings, presentationForFormat, videoDimOpacity, type CaptionPresentationSettings, type PreGenerationPresentationSection } from "@/lib/editor/presentation-settings";
import { MEDIA_FILE_ACCEPT, mediaFileError, mediaKindForFile, mediaSourceFromFile } from "@/lib/editor/media";
import { projectAssetFromMediaSource } from "@/lib/editor/project-assets";
import { accountEntitlementsForPlan, type AccountEntitlements } from "@/lib/entitlements";
import { getAccountEntitlements } from "@/lib/entitlements/client";
import { getAuthSession, getSupabaseClient, listCloudProjectRecords } from "@/lib/cloud-sync";
import { getVerse } from "@/lib/quran/local";
import { quranFontDefinitions, type QuranScript } from "@/lib/quran/content";
import { mediaCompatibilityErrorMessage } from "@/lib/media-compatibility";
import type { MediaInspection } from "@/lib/media-compatibility";
import { LocalMediaPreparationProgressController, type LocalMediaPreparationProgress } from "@/lib/recognition/local-media-progress";
import type { DecodedAudioChannels } from "@/lib/recognition/local-audio-decode";
import type { ProjectFormatPreset, SavedProject } from "@/lib/schemas/project";
import { videoJobManager } from "@/lib/video-jobs";

type PreparedSelection = {
  originalSource: File;
  editorMedia: File;
  editorPlaybackUrl: string | null;
  disposeEditorMedia(): Promise<void>;
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
    case "preparing-editor": return "Preparing video…";
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
  const [activeSection, setActiveSection] = useState<PreGenerationPresentationSection>(DEFAULT_PRE_GENERATION_PRESENTATION_SECTION);
  const [presentation, setPresentation] = useState<CaptionPresentationSettings>(() => defaultCaptionPresentationSettings());
  const [session, setSession] = useState<Session | null>(null);
  const [entitlements, setEntitlements] = useState<AccountEntitlements>(() => accountEntitlementsForPlan("free"));
  const [cloudCount, setCloudCount] = useState(0);
  const [dragging, setDragging] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const preparedRef = useRef<PreparedSelection | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const preparationId = useRef(0);
  const progressController = useRef(new LocalMediaPreparationProgressController());
  const previewRef = useRef<HTMLDivElement>(null);
  const format = presentation.projectFormat.preset;
  const { positioning, typography, transitionSettings, captionEffects, showVerseNumber } = presentation;

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

  useEffect(() => {
    const font = quranFontDefinitions[typography.quranStyle];
    if (font.source.includes("{page}")) return;
    const style = document.createElement("style");
    style.textContent = `@font-face { font-family: "${font.family}"; src: url("${font.source}") format("woff2"); font-display: swap; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [typography.quranStyle]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    void preparedRef.current?.disposeEditorMedia();
  }, []);

  useEffect(() => {
    const abandon = (event: PageTransitionEvent) => {
      if (!event.persisted) void preparedRef.current?.disposeEditorMedia();
    };
    window.addEventListener("pagehide", abandon);
    return () => window.removeEventListener("pagehide", abandon);
  }, []);

  function replacePreviewUrl(next: string) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = next;
    setPreviewUrl(next);
  }

  function applyDetectedFormat(inspection: Pick<MediaInspection, "width" | "height">) {
    if (!inspection.width || !inspection.height) return;
    const inferred = inspection.width > inspection.height * 1.1 ? "landscape" : inspection.height > inspection.width * 1.1 ? "vertical" : "square";
    setPresentation((current) => presentationForFormat(current, PROJECT_FORMATS[inferred]));
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
    const superseded = preparedRef.current;
    preparedRef.current = null;
    if (superseded) await superseded.disposeEditorMedia();
    const abort = new AbortController();
    abortRef.current = abort;
    const job = ++preparationId.current;
    setSelected(next); setPrepared(null); setError(null); setPreviewPlayable(true);
    setProgress(progressController.current.start(job, "checking"));
    const originalUrl = URL.createObjectURL(next);
    replacePreviewUrl(originalUrl);
    try {
      const { prepareLocalMedia, prepareRecognitionAudio } = await import("@/lib/recognition/local-media-compatibility");
      // Recognition and editor preparation are independent branches. Both
      // begin from the immutable original source; neither waits on the other.
      const editorPromise = prepareLocalMedia(next, abort.signal, (event) => publishPreparation(job, event));
      const recognitionPromise = prepareRecognitionAudio(next, abort.signal, (event) => publishPreparation(job, event));
      const [editorOutcome, recognitionOutcome] = await Promise.allSettled([editorPromise, recognitionPromise]);
      if (editorOutcome.status === "rejected") {
        abort.abort();
        throw editorOutcome.reason;
      }
      if (recognitionOutcome.status === "rejected") {
        abort.abort();
        await editorOutcome.value.dispose();
        throw recognitionOutcome.reason;
      }
      const result = editorOutcome.value;
      const recognition = recognitionOutcome.value;
      const preparedAudio = recognition.pcm;
      if (abort.signal.aborted || job !== preparationId.current) { await result.dispose(); return; }
      const assetId = crypto.randomUUID();
      const source = mediaSourceFromFile(result.originalSource, result.kind, {
        assetId,
        compatibility: result.route,
        originalFileName: result.originalSource.name,
        originalMimeType: result.originalSource.type || undefined,
        displayName: result.originalSource.name,
        durationMs: result.inspection.durationMs,
        width: result.inspection.width,
        height: result.inspection.height,
      });
      applyDetectedFormat(result.inspection);
      if (result.editorPlaybackUrl) {
        replacePreviewUrl(result.editorPlaybackUrl);
        setPreviewPlayable(true);
      } else if (result.editorMedia !== next) {
        replacePreviewUrl(URL.createObjectURL(result.editorMedia));
        setPreviewPlayable(true);
      }
      const selection = { originalSource: next, editorMedia: result.editorMedia, editorPlaybackUrl: result.editorPlaybackUrl, disposeEditorMedia: result.dispose, source, preparedAudio };
      preparedRef.current = selection;
      setPrepared(selection);
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
    const [, maximum] = captionPositionBounds(presentation.projectFormat).y;
    const y = Math.min(maximum, Math.max(0.06, (event.clientY - bounds.top) / bounds.height));
    setPresentation((current) => ({ ...current, positioning: { ...current.positioning, y, translationY: y + 0.12 } }));
  }

  function generate() {
    if (!prepared) return;
    const now = new Date().toISOString();
    const projectFormat = projectFormatForPreset(format);
    const assetId = prepared.source.assetId!;
    const project: SavedProject = {
      version: 2,
      id: crypto.randomUUID(),
      title: cleanTitle(prepared.originalSource.name),
      sourceMedia: prepared.source,
      projectAssets: [projectAssetFromMediaSource(prepared.source, assetId, now)],
      activeMediaAssetId: assetId,
      mediaTrim: { startMs: 0, endMs: prepared.source.durationMs ?? 0 },
      format: projectFormat,
      verseAlignments: [],
      captionSegments: [],
      captions: { arabic: true, translation: typography.translationVisible, transliteration: false, translationEdition: "english_saheeh" },
      positioning,
      captionBackground: presentation.captionBackground,
      typography,
      transitionSettings,
      captionEffects,
      playbackRate: 1,
      showVerseNumber,
      createdAt: now,
      updatedAt: now,
    };
    videoJobManager.start({ project, originalSource: prepared.originalSource, editorMedia: prepared.editorMedia, editorPlaybackUrl: prepared.editorPlaybackUrl, disposeEditorMedia: prepared.disposeEditorMedia, preparedAudio: prepared.preparedAudio, session, entitlements });
    preparedRef.current = null;
    router.push("/videos");
  }

  function updateTypography(patch: Partial<CaptionPresentationSettings["typography"]>) {
    setPresentation((current) => ({ ...current, typography: { ...current.typography, ...patch } }));
  }

  function updatePositioning(patch: Partial<CaptionPresentationSettings["positioning"]>) {
    setPresentation((current) => ({ ...current, positioning: { ...current.positioning, ...patch } }));
  }

  function updateEffects(patch: Partial<CaptionPresentationSettings["captionEffects"]>) {
    setPresentation((current) => ({ ...current, captionEffects: { ...current.captionEffects, ...patch } }));
  }

  function chooseFormat(preset: ProjectFormatPreset) {
    setPresentation((current) => presentationForFormat(current, projectFormatForPreset(preset)));
  }

  const kind = selected ? mediaKindForFile(selected) : null;
  const status = preparationLabel(progress, Boolean(prepared));
  const replacementNotice = Boolean(session && entitlements.plan === "free" && entitlements.cloudProjectLimit !== null && cloudCount >= entitlements.cloudProjectLimit);
  const sampleWords = SAMPLE_VERSE.arabic.uthmani.split(/\s+/u);
  const highlightedWord = resolveWordHighlightPresentation({ baseTextColor: typography.textColor, highlightColor: typography.wordHighlightColor, intensity: typography.wordHighlightIntensity, isHighlighted: true });
  const shadow = typography.arabicShadowEnabled ? typography.arabicShadowBlur : 0;
  const outline = typography.arabicOutlineEnabled ? typography.arabicOutlineWidth : 0;
  const positionMaximum = captionPositionBounds(presentation.projectFormat).y[1];
  const quranFont = quranFontDefinitions[typography.quranStyle];
  const sectionLabel: Record<PreGenerationPresentationSection, string> = { layout: "Layout", quran: "Quran", translation: "Translation", effects: "Effects", toggles: "Toggles" };

  return <DashboardShell current="create"><section className="quick-create-page">
    <header className="quick-create-header"><div><p>QUICK CREATE</p><h1>Create Quran captions</h1><span>Upload your recitation, preview the result, and choose its caption appearance before generation.</span></div></header>
    <div className="quick-create-grid">
      <div className="quick-create-stage">
        {!selected ? <label className="quick-create-drop" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
          <input type="file" accept={MEDIA_FILE_ACCEPT} onChange={selectFile} />
          <span aria-hidden="true">＋</span><strong>Choose a recitation</strong><small>Video or audio from Photos, Camera Roll, Finder, or your device</small><b>Browse files</b>
        </label> : <div ref={previewRef} className={`quick-create-preview is-${format}`} style={{ aspectRatio: `${presentation.projectFormat.width} / ${presentation.projectFormat.height}` }}>
          {previewUrl && kind === "video" && previewPlayable && <video src={previewUrl} controls playsInline preload="metadata" onError={() => setPreviewPlayable(false)} />}
          {previewUrl && kind === "audio" && <div className="quick-create-audio"><span aria-hidden="true">◌</span><strong>{selected.name}</strong><audio src={previewUrl} controls preload="metadata" /></div>}
          {(!previewPlayable || !previewUrl) && <div className="quick-create-neutral"><span aria-hidden="true">۝</span><p>Your preview will appear when local preparation finishes.</p></div>}
          <div className="quick-create-preview-dim" aria-hidden="true" style={{ backgroundColor: `rgba(0, 0, 0, ${videoDimOpacity(captionEffects)})` }} />
          <div className="quick-create-sample" style={{ top: `${positioning.y * 100}%`, gap: `${typography.translationSpacingBelowArabic}px`, transitionDuration: `${transitionSettings.fadeInMs}ms` }} aria-label="Sample caption placement. This is preview content, not detected Quran text." onPointerDown={moveCaption} onPointerMove={moveCaption} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)}>
            <span>Sample preview</span>
            <p dir="rtl" lang="ar" style={{ color: typography.textColor, fontFamily: `${quranFont.family}, ${quranFont.fallbackFamily}`, fontSize: `${typography.arabicFontSize}px`, opacity: typography.arabicOpacity, WebkitTextStroke: outline ? `${outline}px ${typography.arabicOutlineColor}` : "0 transparent", textShadow: shadow ? `0 2px ${shadow}px rgba(0,0,0,${typography.arabicShadowStrength})` : "none" }}>{sampleWords.map((word, index) => { const read = typography.wordHighlightMode !== "off" && index < Math.ceil(sampleWords.length / 2); return <b style={read ? { color: highlightedWord.color, textShadow: `0 0 ${highlightedWord.glowBlurPx}px ${highlightedWord.glowColor}` } : undefined} key={`${word}-${index}`}>{word}{" "}</b>; })}{showVerseNumber && <b>{arabicIndicNumber(1)}</b>}</p>
            {typography.translationVisible && <small style={{ color: typography.translationTextColor, fontFamily: typography.translationFontFamily, fontSize: `${typography.translationFontSize}px`, fontWeight: typography.translationFontWeight, fontStyle: typography.translationItalic ? "italic" : "normal", opacity: typography.translationOpacity, WebkitTextStroke: typography.translationOutlineEnabled ? `${typography.translationOutlineWidth}px ${typography.translationOutlineColor}` : "0 transparent", textShadow: typography.translationShadowEnabled ? `0 2px ${typography.translationShadowBlur}px rgba(0,0,0,${typography.translationShadowStrength})` : "none" }}>By the morning brightness</small>}
          </div>
        </div>}
        {selected && <div className="quick-create-file"><div><strong>{selected.name}</strong><span>{(selected.size / 1024 / 1024).toFixed(1)} MB · Prepared locally on this device</span></div><label><input type="file" accept={MEDIA_FILE_ACCEPT} onChange={selectFile} />Choose another</label></div>}
      </div>
      <aside className="quick-create-controls" aria-label="Caption setup">
        <div className="quick-create-status" role="status" aria-live="polite"><span className={prepared ? "is-ready" : ""} /> <div><strong>{selected ? status : "Choose media to begin"}</strong><small>{progress?.percentage === undefined ? "No media leaves your device during preparation." : `${progress.percentage}% complete`}</small></div></div>
        <nav className="quick-create-sections" aria-label="Caption customization sections">{PRE_GENERATION_PRESENTATION_SECTIONS.map((section) => <button type="button" key={section} aria-current={activeSection === section ? "page" : undefined} className={activeSection === section ? "is-active" : ""} onClick={() => setActiveSection(section)}>{sectionLabel[section]}</button>)}</nav>
        <div className="quick-create-panel" data-section={activeSection}>
          <div className="quick-create-panel-heading"><div><span>{sectionLabel[activeSection]}</span><strong>Caption appearance</strong></div><small>Changes preview instantly</small></div>
          {activeSection === "layout" && <fieldset disabled={!selected}>
            <legend>Aspect ratio</legend><div className="quick-create-options is-four" role="radiogroup" aria-label="Aspect ratio">{(["vertical", "square", "portrait", "landscape"] as const).map((preset) => <button type="button" role="radio" aria-checked={format === preset} className={format === preset ? "is-selected" : ""} key={preset} onClick={() => chooseFormat(preset)}>{preset === "vertical" ? "9:16" : preset === "square" ? "1:1" : preset === "portrait" ? "4:5" : "16:9"}</button>)}</div>
            <label className="quick-create-range"><span>Caption position <output>{Math.round(positioning.y * 100)}%</output></span><input aria-label="Caption vertical position" type="range" min="6" max={Math.round(positionMaximum * 100)} value={Math.round(positioning.y * 100)} onChange={(event) => { const y = Number(event.currentTarget.value) / 100; updatePositioning({ y, translationY: y + 0.12 }); }} /><small>Drag the sample on the preview or use this slider.</small></label>
            <label className="quick-create-range"><span>Text spacing <output>{typography.translationSpacingBelowArabic}px</output></span><input aria-label="Text spacing" type="range" min="0" max="32" value={typography.translationSpacingBelowArabic} onChange={(event) => updateTypography({ translationSpacingBelowArabic: Number(event.currentTarget.value) })} /></label>
          </fieldset>}
          {activeSection === "quran" && <fieldset disabled={!selected}>
            <label className="quick-create-field">Quran font<select aria-label="Quran font" value={typography.quranStyle} onChange={(event) => { const quranStyle = event.currentTarget.value as QuranScript; updateTypography({ quranStyle, arabicFontFamily: quranFontDefinitions[quranStyle].family }); }}>{Object.entries(quranFontDefinitions).filter(([, font]) => !font.source.includes("{page}")).map(([value, font]) => <option key={value} value={value}>{font.label}</option>)}</select></label>
            <label className="quick-create-range"><span>Size <output>{typography.arabicFontSize}px</output></span><input aria-label="Quran caption size" type="range" min="24" max="64" value={typography.arabicFontSize} onChange={(event) => updateTypography({ arabicFontSize: Number(event.currentTarget.value) })} /></label>
            <label className="quick-create-color"><span>Color</span><input aria-label="Quran color picker" type="color" value={typography.textColor} onChange={(event) => updateTypography({ textColor: event.currentTarget.value })} /><input aria-label="Quran color hex" value={typography.textColor} pattern="#[0-9A-Fa-f]{6}" onChange={(event) => updateTypography({ textColor: event.currentTarget.value })} /></label>
          </fieldset>}
          {activeSection === "translation" && <fieldset disabled={!selected}>
            <label className="quick-create-field">Language<select aria-label="Translation language" value="english_saheeh" disabled><option value="english_saheeh">English · Saheeh International</option></select></label>
            <label className="quick-create-field">Font<select aria-label="Translation font" value={typography.translationFontFamily} onChange={(event) => updateTypography({ translationFontFamily: event.currentTarget.value })}><option>Arial, Helvetica, sans-serif</option><option>Georgia, serif</option><option>Verdana, sans-serif</option></select></label>
            <label className="quick-create-range"><span>Size <output>{typography.translationFontSize}px</output></span><input aria-label="Translation size" type="range" min="10" max="32" value={typography.translationFontSize} onChange={(event) => updateTypography({ translationFontSize: Number(event.currentTarget.value) })} /></label>
            <div className="quick-create-choice"><span>Weight</span><div role="radiogroup" aria-label="Translation weight">{(["400", "600", "700"] as const).map((weight) => <button type="button" role="radio" aria-checked={typography.translationFontWeight === weight} className={typography.translationFontWeight === weight ? "is-selected" : ""} key={weight} onClick={() => updateTypography({ translationFontWeight: weight })}>{weight === "400" ? "Regular" : weight === "600" ? "Semibold" : "Bold"}</button>)}</div></div>
            <label className="quick-create-switch"><span><strong>Italic</strong><small>Use an italic translation style.</small></span><input type="checkbox" checked={typography.translationItalic} onChange={(event) => updateTypography({ translationItalic: event.currentTarget.checked })} /></label>
            <label className="quick-create-color"><span>Color</span><input aria-label="Translation color picker" type="color" value={typography.translationTextColor} onChange={(event) => updateTypography({ translationTextColor: event.currentTarget.value })} /><input aria-label="Translation color hex" value={typography.translationTextColor} pattern="#[0-9A-Fa-f]{6}" onChange={(event) => updateTypography({ translationTextColor: event.currentTarget.value })} /></label>
          </fieldset>}
          {activeSection === "effects" && <fieldset disabled={!selected}>
            <label className="quick-create-range"><span>Dim level <output>{captionEffects.videoDimLevel}%</output></span><input aria-label="Video dim level" type="range" min="0" max="70" value={captionEffects.videoDimLevel} onChange={(event) => updateEffects({ videoDimLevel: Number(event.currentTarget.value) })} /></label>
            <label className="quick-create-range"><span>Outline <output>{outline}px</output></span><input aria-label="Outline width" type="range" min="0" max="6" step="0.5" value={outline} onChange={(event) => { const width = Number(event.currentTarget.value); updateTypography({ arabicOutlineEnabled: width > 0, arabicOutlineWidth: width, translationOutlineEnabled: width > 0, translationOutlineWidth: width }); }} /></label>
            <label className="quick-create-color"><span>Outline color</span><input aria-label="Outline color picker" type="color" value={typography.arabicOutlineColor} onChange={(event) => updateTypography({ arabicOutlineColor: event.currentTarget.value, translationOutlineColor: event.currentTarget.value })} /><input aria-label="Outline color hex" value={typography.arabicOutlineColor} pattern="#[0-9A-Fa-f]{6}" onChange={(event) => updateTypography({ arabicOutlineColor: event.currentTarget.value, translationOutlineColor: event.currentTarget.value })} /></label>
            <label className="quick-create-range"><span>Shadow <output>{shadow}px</output></span><input aria-label="Shadow intensity" type="range" min="0" max="16" value={shadow} onChange={(event) => { const blur = Number(event.currentTarget.value); updateTypography({ arabicShadowEnabled: blur > 0, arabicShadowBlur: blur, arabicShadowStrength: Math.min(0.85, 0.3 + blur / 24), translationShadowEnabled: blur > 0, translationShadowBlur: blur, translationShadowStrength: Math.min(0.85, 0.3 + blur / 24) }); }} /></label>
            <label className="quick-create-range"><span>Fade <output>{transitionSettings.fadeInMs}ms</output></span><input aria-label="Caption fade duration" type="range" min="0" max="600" step="25" value={transitionSettings.fadeInMs} onChange={(event) => { const fadeMs = Number(event.currentTarget.value); setPresentation((current) => ({ ...current, transitionSettings: { ...current.transitionSettings, type: fadeMs ? "fade" : "none", fadeInMs: fadeMs, fadeOutMs: fadeMs } })); }} /><small>Presentation only; caption timing remains unchanged.</small></label>
          </fieldset>}
          {activeSection === "toggles" && <fieldset disabled={!selected} className="quick-create-toggles">
            <label className="quick-create-switch"><span><strong>Translation</strong><small>Show the saved English translation.</small></span><input type="checkbox" checked={typography.translationVisible} onChange={(event) => updateTypography({ translationVisible: event.currentTarget.checked })} /></label>
            <label className="quick-create-switch"><span><strong>Ayah numbers</strong><small>Add canonical ayah-end markers.</small></span><input type="checkbox" checked={showVerseNumber} onChange={(event) => setPresentation((current) => ({ ...current, showVerseNumber: event.currentTarget.checked }))} /></label>
            <label className="quick-create-switch"><span><strong>Full Ayah</strong><small>Canonical complete-ayah captions are always used.</small></span><input aria-label="Full Ayah is always enabled" type="checkbox" checked={FULL_AYAH_DISPLAY_INHERENT} disabled readOnly /></label>
            <label className="quick-create-switch"><span><strong>Word highlighting</strong><small>Use Quran AutoCaption’s read-so-far highlight.</small></span><input type="checkbox" checked={typography.wordHighlightMode !== "off"} onChange={(event) => updateTypography({ wordHighlightMode: event.currentTarget.checked ? "read-so-far" : "off" })} /></label>
            <button className="quick-create-reset" type="button" onClick={() => setPresentation(defaultCaptionPresentationSettings())}>Reset presentation defaults</button>
          </fieldset>}
        </div>
        {replacementNotice && <p className="quick-create-fifo">Free keeps your 3 most recent saved videos. Generating this will replace your oldest saved video.</p>}
        {error && <div className="quick-create-error" role="alert"><strong>We couldn’t prepare this recording.</strong><p>{error}</p><span>Choose another recording</span></div>}
        <button className="quick-create-generate" type="button" disabled={!prepared} onClick={generate}>{prepared ? "Generate captions" : selected ? "Preparing recording…" : "Choose a recording"}</button>
        <p className="quick-create-local-note">Generation continues locally while this tab stays open. A finished MP4 is rendered only when you download.</p>
      </aside>
    </div>
  </section></DashboardShell>;
}
