"use client";

import { useState, type ChangeEvent, type PointerEvent, type SyntheticEvent } from "react";
import type { CaptionBackground, CaptionPositioning, CaptionSegment, TransitionSettings, Typography } from "@/lib/editor/captions";
import type { ProjectFormat, ProjectFormatPreset } from "@/lib/schemas/project";
import type { ExportQuality } from "@/lib/export/quality";
import type { ExportPhase, LocalExportDiagnostics, LocalExportResult } from "@/lib/export/types";
import type { OutputProfile } from "@/lib/export/output";
import type { LocalCaptionStyle } from "@/lib/editor/styles";
import type { CaptionObject, CaptionResizeEdge } from "@/components/caption-preview";
import type { QuranContentResponse } from "@/lib/quran/content";
import { captionSegmentLabel, getActiveCaptionSegment } from "@/lib/editor/captions";
import CaptionPreview from "@/components/caption-preview";
import SafeAreaOverlay from "@/components/safe-area-overlay";
import AccountPanel from "@/components/account-panel";
import { DEFAULT_SOURCE_VIDEO_FIT, PROJECT_FORMATS, projectFormatDefinition } from "@/lib/editor/formats";
import { BUILT_IN_STYLES, type BuiltInStyleName, type CaptionStyle } from "@/lib/editor/styles";
import { quranFontDefinitions } from "@/lib/quran/content";

type VideoMetadata = { durationSeconds: number; width: number; height: number };
type Stage = "idle" | "preparing" | "detecting-speech" | "loading-model" | "transcribing" | "matching" | "captions" | "complete" | "error";
type ExportState = { phase: ExportPhase; fraction: number; elapsedSeconds: number; estimatedRemainingSeconds?: number } | "complete" | "error" | null;

type EditorWorkspaceProps = {
  videoFile: File | null;
  videoUrl: string | null;
  videoMetadata: VideoMetadata | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  previewRef: React.RefObject<HTMLDivElement | null>;
  timelineRef: React.RefObject<HTMLDivElement | null>;
  stage: Stage;
  progress: { phase?: string; completed?: number; total?: number } | null;
  support: { supported: boolean; reason: string } | null;
  alignments: { surahNumber: number; ayahNumber: number; confidence: number }[];
  content: Readonly<Record<string, QuranContentResponse>>;
  currentTimeMs: number;
  segments: CaptionSegment[];
  selectedSegmentId: string | null;
  selectedSegment: CaptionSegment | null;
  selectedIndex: number;
  selectedObject: CaptionObject | null;
  splitBoundary: number;
  typography: Typography;
  captionBackground: CaptionBackground;
  projectFormat: ProjectFormat;
  positioning: CaptionPositioning;
  transitionSettings: TransitionSettings;
  showVerseNumber: boolean;
  showSafeArea: boolean;
  projectName: string;
  dirty: boolean;
  busy: boolean;
  localStyles: LocalCaptionStyle[];
  availableBuiltInStyles: BuiltInStyleName[];
  availableQuranStyles: string[];
  localStyleName: string;
  exportOpen: boolean;
  exportQuality: ExportQuality;
  outputPlan: { sourceHasAudio: boolean; profile: OutputProfile | null } | null;
  exportResult: LocalExportResult | null;
  exportState: ExportState;
  exportError: string | null;
  exportDiagnostics: LocalExportDiagnostics | null;
  errorMessage: string | null;
  timingWarning: string | null;
  timelineTooltip: string | null;
  showCorrection: boolean;
  surah: number;
  startAyah: number;
  endAyah: number;
  entitlements: { watermarkRequired: boolean };
  selectedFormatDefinition: ReturnType<typeof projectFormatDefinition>;
  onProjectNameChange: (name: string) => void;
  onVideoSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadedMetadata: (event: SyntheticEvent<HTMLVideoElement>) => void;
  onVideoTimeUpdate: (event: SyntheticEvent<HTMLVideoElement>) => void;
  onVideoError: () => void;
  onSelectObject: (kind: CaptionObject | null) => void;
  onObjectPointerDown: (event: PointerEvent<HTMLDivElement>, kind: CaptionObject) => void;
  onResizePointerDown: (event: PointerEvent<HTMLButtonElement>, kind: CaptionObject, edge: CaptionResizeEdge) => void;
  onObjectPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onObjectPointerUp: () => void;
  onCanvasBackgroundPointerDown: () => void;
  onSelectSegment: (segment: CaptionSegment) => void;
  onSegmentPointerDown: (event: PointerEvent<HTMLButtonElement>, segment: CaptionSegment) => void;
  onTimelinePointerDown: (event: PointerEvent<HTMLElement>) => void;
  onTimelinePointerMove: (event: PointerEvent<HTMLElement>) => void;
  onEdgeDown: (event: PointerEvent<HTMLElement>, edge: "start" | "end", segment: CaptionSegment) => void;
  onEdgeUp: () => void;
  onChangeFormat: (preset: ProjectFormatPreset) => void;
  onDetect: () => void;
  onCopyAlignmentDebug: () => void;
  onCorrectDetection: () => void;
  onToggleCorrection: () => void;
  onClearVideo: () => void;
  onSaveProject: () => void;
  onSaveToAccount: () => void;
  onOpenProjects: () => void;
  onOpenCloudProjects: () => void;
  onSessionChange: (session: import("@supabase/supabase-js").Session | null) => void;
  onPlanChange: (plan: "Free" | "Creator" | "Pro") => void;
  onDiscard: () => void;
  onNewProject: () => void;
  onExportOpen: () => void;
  onExport: () => void;
  onCancelExport: () => void;
  onDownloadExport: () => void;
  onSetExportQuality: (quality: ExportQuality) => void;
  onSetExportOpen: (open: boolean) => void;
  onTypographyChange: <K extends keyof Typography>(key: K, value: Typography[K]) => void;
  onBackgroundChange: <K extends keyof CaptionBackground>(key: K, value: CaptionBackground[K]) => void;
  onTransitionChange: (patch: Partial<TransitionSettings>) => void;
  onSetShowVerseNumber: (value: boolean) => void;
  onSetShowSafeArea: (value: boolean) => void;
  onApplyStyle: (style: CaptionStyle) => void;
  onSaveCurrentStyle: () => void;
  onSetLocalStyleName: (value: string) => void;
  onResetSelectedObjectStyle: () => void;
  onAlignTranslation: () => void;
  onSetSplitBoundary: (value: number) => void;
  onSplit: () => void;
  onMergePrevious: () => void;
  onMergeNext: () => void;
  onResetTiming: () => void;
  onResetAllTiming: () => void;
};

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "—";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="editor-section-label">{children}</p>;
}

function Segmented({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (value: string) => void }) {
  return <div className="editor-segmented">{options.map(([option, label]) => <button key={option} type="button" className={value === option ? "is-active" : ""} onClick={() => onChange(option)}>{label}</button>)}</div>;
}

export default function EditorWorkspace(props: EditorWorkspaceProps) {
  const [accountOpen, setAccountOpen] = useState(false);
  const {
    videoFile, videoUrl, videoMetadata, videoRef, previewRef, timelineRef, stage, progress, support,
    alignments, content, currentTimeMs, segments, selectedSegmentId, selectedSegment, selectedIndex,
    selectedObject, splitBoundary, typography, captionBackground, projectFormat, positioning,
    transitionSettings, showVerseNumber, showSafeArea, projectName, dirty, busy, localStyles, localStyleName, availableBuiltInStyles, availableQuranStyles,
    exportOpen, exportQuality, outputPlan, exportResult, exportState, exportError, exportDiagnostics, errorMessage, timingWarning,
    showCorrection, surah, startAyah, endAyah, entitlements, selectedFormatDefinition, timelineTooltip,
    onProjectNameChange, onVideoSelect, onLoadedMetadata, onVideoTimeUpdate, onVideoError, onSelectObject,
    onObjectPointerDown, onResizePointerDown, onObjectPointerMove, onObjectPointerUp, onCanvasBackgroundPointerDown,
    onSelectSegment, onSegmentPointerDown, onTimelinePointerDown, onTimelinePointerMove, onEdgeDown, onEdgeUp, onChangeFormat, onDetect, onCopyAlignmentDebug,
    onCorrectDetection, onToggleCorrection, onClearVideo, onSaveProject, onSaveToAccount, onOpenProjects,
    onOpenCloudProjects, onSessionChange, onPlanChange, onDiscard, onNewProject, onExportOpen, onExport, onCancelExport, onDownloadExport,
    onSetExportQuality, onSetExportOpen, onTypographyChange, onBackgroundChange, onTransitionChange,
    onSetShowVerseNumber, onSetShowSafeArea, onApplyStyle, onSaveCurrentStyle, onSetLocalStyleName,
    onResetSelectedObjectStyle, onAlignTranslation, onSetSplitBoundary, onSplit, onMergePrevious,
    onMergeNext, onResetTiming, onResetAllTiming,
  } = props;
  const maxTime = Math.max(1, (videoMetadata?.durationSeconds ?? 0) * 1000);
  const objectLabel = selectedObject === "arabic" ? "Arabic" : selectedObject === "translation" ? "Translation" : null;
  const updateObjectTypography = <K extends keyof Typography>(key: K, value: Typography[K]) => onTypographyChange(key, value);

  return <div className="editor-shell">
    <header className="editor-topbar">
      <div className="editor-brand"><span className="editor-brand-mark">۝</span><div><p>Quran Video</p><span>Recitation editor</span></div></div>
      <div className="editor-project-title"><input aria-label="Project name" value={projectName} onChange={(event) => onProjectNameChange(event.target.value)} /><span>{videoFile?.name ?? "No source video"}</span></div>
      <div className="editor-top-actions">
        <div className="editor-format-switcher" aria-label="Project format">{(Object.keys(PROJECT_FORMATS) as ProjectFormatPreset[]).map((preset) => <button key={preset} type="button" className={projectFormat.preset === preset ? "is-active" : ""} onClick={() => onChangeFormat(preset)}>{preset === "vertical" ? "9:16" : preset === "landscape" ? "16:9" : "1:1"}</button>)}</div>
        <span className={`editor-save-state ${dirty ? "is-dirty" : ""}`}><i />{dirty ? "Unsaved" : "Saved"}</span>
        <button className="editor-button editor-button-quiet" type="button" onClick={onSaveProject}>Save</button>
        <button className="editor-button editor-button-accent" type="button" disabled={!segments.length || Boolean(exportState && typeof exportState === "object")} onClick={onExportOpen}>Export</button>
        <div className="editor-account-wrap"><button aria-label="Account" className="editor-icon-button" type="button" onClick={() => setAccountOpen((value) => !value)}>Account</button>{accountOpen && <div className="editor-account-popover"><AccountPanel onSessionChange={onSessionChange} onPlanChange={onPlanChange} /></div>}</div>
      </div>
    </header>

    <div className="editor-body">
      <aside className="editor-sidebar editor-sidebar-left">
        <div className="editor-sidebar-scroll">
          <div className="editor-panel-heading"><div><SectionLabel>Source</SectionLabel><h2>{videoFile ? "Local video" : "Start a project"}</h2></div><span className="editor-status-dot" /></div>
          {videoFile ? <>
            <p className="editor-muted editor-truncate" title={videoFile.name}>{videoFile.name}</p>
            {videoMetadata && <p className="editor-meta-line">{formatDuration(videoMetadata.durationSeconds)} · {videoMetadata.width} × {videoMetadata.height}</p>}
            <button className="editor-button editor-button-primary editor-full-button" disabled={busy || !support?.supported} type="button" onClick={onDetect}>{stage === "complete" ? "Detect again" : "Detect Quran"}</button>
            {process.env.NODE_ENV !== "production" && stage === "complete" && <button className="editor-text-button" type="button" onClick={onCopyAlignmentDebug}>Copy Alignment Debug</button>}
            {stage === "complete" && alignments.length > 0 && <button className="editor-button editor-button-quiet editor-full-button" type="button" onClick={onToggleCorrection}>Correct detection</button>}
            <button className="editor-text-button" type="button" onClick={onClearVideo}>Choose a different video</button>
          </> : <label className="editor-upload-mini"><span>↑</span><strong>Choose a video</strong><small>MP4, WebM, or browser-supported video</small><input accept="video/*" type="file" onChange={onVideoSelect} /></label>}

          <div className="editor-divider" />
          <SectionLabel>Canvas</SectionLabel>
          <p className="editor-muted">{selectedFormatDefinition.label} · {selectedFormatDefinition.width} × {selectedFormatDefinition.height}</p>
          <label className="editor-toggle"><input checked={showSafeArea} type="checkbox" onChange={(event) => onSetShowSafeArea(event.target.checked)} /><span />Safe area guides</label>
          <label className="editor-toggle"><input checked={showVerseNumber} type="checkbox" onChange={(event) => onSetShowVerseNumber(event.target.checked)} /><span />Verse number</label>
          <label className="editor-toggle"><input checked={typography.translationVisible} type="checkbox" onChange={(event) => onTypographyChange("translationVisible", event.target.checked)} /><span />Show translation</label>

          <div className="editor-divider" />
          <SectionLabel>Style library</SectionLabel>
          <select className="editor-select" aria-label="Caption style preset" defaultValue="" onChange={(event) => { const value = event.currentTarget.value; if (value in BUILT_IN_STYLES) onApplyStyle(BUILT_IN_STYLES[value as BuiltInStyleName]); else { const saved = localStyles.find((item) => item.id === value); if (saved) onApplyStyle(saved.style); } event.currentTarget.value = ""; }}>
            <option value="">Apply a preset…</option>{availableBuiltInStyles.map((name) => <option key={name} value={name}>{name}</option>)}{localStyles.length > 0 && <optgroup label="My styles">{localStyles.map((style) => <option key={style.id} value={style.id}>{style.name}</option>)}</optgroup>}
          </select>
          <div className="editor-inline-form"><input aria-label="Local style name" value={localStyleName} onChange={(event) => onSetLocalStyleName(event.target.value)} /><button className="editor-button editor-button-quiet" type="button" onClick={onSaveCurrentStyle}>Save</button></div>
          <details className="editor-advanced"><summary>Motion</summary><label className="editor-field-label">Transition<select className="editor-select" value={transitionSettings.type} onChange={(event) => onTransitionChange({ type: event.target.value as TransitionSettings["type"] })}><option value="fade">Fade</option><option value="none">None</option></select></label>{transitionSettings.type === "fade" && <div className="editor-time-grid"><label>In (ms)<input type="number" min="0" step="25" value={transitionSettings.fadeInMs} onChange={(event) => onTransitionChange({ fadeInMs: Number(event.target.value) })} /></label><label>Out (ms)<input type="number" min="0" step="25" value={transitionSettings.fadeOutMs} onChange={(event) => onTransitionChange({ fadeOutMs: Number(event.target.value) })} /></label></div>}<label className="editor-toggle"><input checked={transitionSettings.blurFadeEnabled} type="checkbox" onChange={(event) => onTransitionChange({ blurFadeEnabled: event.target.checked })} /><span />Blur fade</label></details>
          {support && !support.supported && <p className="editor-alert">Recognition unavailable: {support.reason}</p>}
        </div>
        <div className="editor-sidebar-footer"><button className="editor-text-button" type="button" onClick={onOpenProjects}>Open local projects</button><button className="editor-text-button" type="button" onClick={onOpenCloudProjects}>Cloud projects</button><button className="editor-text-button" type="button" onClick={onNewProject}>New project</button></div>
      </aside>

      <section className="editor-main-stage">
        <div className="editor-stage-header"><div><SectionLabel>Canvas</SectionLabel><h1>{videoFile ? "Caption composition" : "Begin with a recitation"}</h1></div><div className="editor-stage-info"><span>{selectedFormatDefinition.label}</span><span>{formatDuration(videoMetadata?.durationSeconds ?? 0)}</span></div></div>
        <div className="editor-canvas-well">
          {videoUrl ? <div ref={previewRef} className="project-preview-canvas editor-canvas" data-project-aspect-ratio={selectedFormatDefinition.aspectRatio} data-project-format={projectFormat.preset} style={{ aspectRatio: `${projectFormat.width} / ${projectFormat.height}` }} onPointerDown={onCanvasBackgroundPointerDown}>
            <video ref={videoRef} className="h-full w-full object-cover" controls playsInline preload="metadata" src={videoUrl} data-video-fit={DEFAULT_SOURCE_VIDEO_FIT} onLoadedMetadata={onLoadedMetadata} onTimeUpdate={onVideoTimeUpdate} onSeeked={onVideoTimeUpdate} onError={onVideoError}>Your browser does not support video playback.</video>
            {showSafeArea && <SafeAreaOverlay format={projectFormat} />}
            <CaptionPreview videoRef={videoRef} segments={segments} content={content} typography={typography} captionBackground={captionBackground} positioning={positioning} format={projectFormat} transitionSettings={transitionSettings} showVerseNumber={showVerseNumber} selectedObject={selectedObject} onSelectObject={onSelectObject} onObjectPointerDown={onObjectPointerDown} onResizePointerDown={onResizePointerDown} onPointerMove={onObjectPointerMove} onPointerUp={onObjectPointerUp} />
          </div> : <label className="editor-empty-canvas"><span className="editor-upload-icon">↑</span><strong>Choose a video to begin</strong><small>Your source stays on this device. Nothing is uploaded.</small><input accept="video/*" type="file" onChange={onVideoSelect} /></label>}
        </div>
        <div className="editor-playback-row"><span className="editor-playback-time">{formatDuration(currentTimeMs / 1000)} <i>/</i> {formatDuration(videoMetadata?.durationSeconds ?? 0)}</span><span className="editor-playback-hint">Space to play · ← → to nudge</span></div>
        {segments.length > 0 && <div className="editor-timeline-panel"><div className="editor-timeline-heading"><div><SectionLabel>Timeline</SectionLabel><strong>{segments.length} caption segments</strong></div><span>{formatDuration(currentTimeMs / 1000)} / {formatDuration(videoMetadata?.durationSeconds ?? 0)}</span></div><div ref={timelineRef} className="editor-timeline" onPointerDown={onTimelinePointerDown} onPointerMove={onTimelinePointerMove}>
          <div className="editor-playhead" style={{ left: `${(currentTimeMs / maxTime) * 100}%` }} />
          <div className="editor-timeline-track">{segments.map((segment) => <button key={segment.id} type="button" aria-label={`Caption ${captionSegmentLabel(segment)}`} onPointerDown={(event) => onSegmentPointerDown(event, segment)} onPointerUp={onEdgeUp} onClick={(event) => { event.stopPropagation(); onSelectSegment(segment); }} className={`editor-caption-block ${segment.id === selectedSegmentId ? "is-selected" : ""} ${getActiveCaptionSegment(segments, currentTimeMs)?.id === segment.id ? "is-active" : ""}`} style={{ width: `${Math.max(1, ((segment.endMs - segment.startMs) / maxTime) * 100)}%`, left: `${(segment.startMs / maxTime) * 100}%` }}><span>{captionSegmentLabel(segment)}</span><span className="editor-caption-block-range">{(segment.startMs / 1000).toFixed(2)}–{(segment.endMs / 1000).toFixed(2)}s</span><span className="editor-timing-handle editor-timing-handle-start" aria-label={`Resize ${captionSegmentLabel(segment)} start`} onPointerDown={(event) => onEdgeDown(event, "start", segment)} onPointerUp={onEdgeUp} /><span className="editor-timing-handle editor-timing-handle-end" aria-label={`Resize ${captionSegmentLabel(segment)} end`} onPointerDown={(event) => onEdgeDown(event, "end", segment)} onPointerUp={onEdgeUp} /></button>)}</div>
          {timelineTooltip && <div className="editor-timeline-tooltip" role="status">{timelineTooltip}</div>}
        </div></div>}
        {(busy || (stage === "complete" && alignments.length > 0) || showCorrection || errorMessage || timingWarning || exportState) && <div className="editor-notices">
          {busy && <div className="editor-notice"><strong>{stage === "detecting-speech" ? "Checking local speech" : stage === "loading-model" ? "Loading recognition model" : stage === "transcribing" ? "Transcribing locally" : stage === "matching" ? "Matching Quran" : "Preparing captions"}</strong><span>Audio stays in this browser{progress?.total ? ` · ${progress.completed ?? 0}/${progress.total} chunks` : ""}.</span></div>}
          {stage === "complete" && alignments.length > 0 && <div className="editor-notice editor-notice-success"><strong>Detected Surah {alignments[0].surahNumber} · ayat {alignments[0].ayahNumber}–{alignments.at(-1)?.ayahNumber}</strong><span>{Math.round((alignments.reduce((sum, item) => sum + item.confidence, 0) / alignments.length) * 100)}% overall confidence</span></div>}
          {timingWarning && <div className="editor-notice">{timingWarning}</div>}
          {showCorrection && <div className="editor-correction"><SectionLabel>Correct detection</SectionLabel><div><select aria-label="Surah" className="editor-select" value={surah}><option value={surah}>Surah {surah}</option></select><input aria-label="First ayah" type="number" value={startAyah} readOnly /><input aria-label="Last ayah" type="number" value={endAyah} readOnly /><button className="editor-button editor-button-primary" type="button" onClick={onCorrectDetection}>Use range</button></div></div>}
          {errorMessage && <div className="editor-notice editor-notice-error">{errorMessage}</div>}
          {exportState && <div className="editor-notice"><strong>{exportState === "complete" ? "Export complete" : exportState === "error" ? "Export stopped" : `Exporting · ${exportState.phase}`}</strong><span>{exportError ?? "Source media is processed locally."}</span></div>}
        </div>}
      </section>

      <aside className="editor-sidebar editor-sidebar-right">
        <div className="editor-sidebar-scroll">
          {selectedObject ? <>
            <div className="editor-inspector-title"><div><SectionLabel>Selected object</SectionLabel><h2>{objectLabel}</h2></div><button className="editor-close-selection" type="button" onClick={() => onSelectObject(null)}>×</button></div>
            <p className="editor-muted">Drag on canvas to move · handles change width</p>
            {selectedObject === "arabic" ? <>
              <SectionLabel>Quran style</SectionLabel><select className="editor-select" value={typography.quranStyle} onChange={(event) => onTypographyChange("quranStyle", event.target.value as Typography["quranStyle"])}>{Object.entries(quranFontDefinitions).map(([value, font]) => <option key={value} value={value} disabled={!availableQuranStyles.includes(value)}>{font.label}</option>)}</select>
              <div className="editor-control-row"><label>Size <input type="range" min="16" max="96" value={typography.arabicFontSize} onChange={(event) => updateObjectTypography("arabicFontSize", Number(event.target.value))} /></label><output>{typography.arabicFontSize}px</output></div>
              <div className="editor-control-row"><label>Opacity <input type="range" min="0" max="1" step="0.01" value={typography.arabicOpacity} onChange={(event) => updateObjectTypography("arabicOpacity", Number(event.target.value))} /></label><output>{Math.round(typography.arabicOpacity * 100)}%</output></div>
              <div className="editor-color-row"><label>Arabic text color</label><input aria-label="Arabic text color" type="color" value={typography.textColor} onChange={(event) => updateObjectTypography("textColor", event.target.value)} /></div>
              <SectionLabel>Alignment</SectionLabel><Segmented value={typography.textAlign} options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]} onChange={(value) => updateObjectTypography("textAlign", value as Typography["textAlign"])} />
              <label className="editor-toggle"><input checked={typography.arabicOutlineEnabled} type="checkbox" onChange={(event) => updateObjectTypography("arabicOutlineEnabled", event.target.checked)} /><span />Outline</label>{typography.arabicOutlineEnabled && <div className="editor-color-row"><label>Outline color</label><input type="color" value={typography.arabicOutlineColor} onChange={(event) => updateObjectTypography("arabicOutlineColor", event.target.value)} /></div>}<label className="editor-toggle"><input checked={typography.arabicShadowEnabled} type="checkbox" onChange={(event) => updateObjectTypography("arabicShadowEnabled", event.target.checked)} /><span />Shadow</label>
              <div className="editor-control-row"><label>Line spacing <input type="range" min="1" max="2" step="0.05" value={typography.arabicLineSpacing} onChange={(event) => updateObjectTypography("arabicLineSpacing", Number(event.target.value))} /></label><output>{typography.arabicLineSpacing}</output></div>
            </> : <>
              <SectionLabel>Translation</SectionLabel><select className="editor-select" value={typography.translationFontFamily} onChange={(event) => updateObjectTypography("translationFontFamily", event.target.value)}><option>Arial, Helvetica, sans-serif</option><option>Georgia, serif</option><option>Verdana, sans-serif</option></select>
              <div className="editor-control-row"><label>Size <input type="range" min="10" max="48" value={typography.translationFontSize} onChange={(event) => updateObjectTypography("translationFontSize", Number(event.target.value))} /></label><output>{typography.translationFontSize}px</output></div>
              <div className="editor-control-row"><label>Opacity <input type="range" min="0" max="1" step="0.01" value={typography.translationOpacity} onChange={(event) => updateObjectTypography("translationOpacity", Number(event.target.value))} /></label><output>{Math.round(typography.translationOpacity * 100)}%</output></div>
              <div className="editor-color-row"><label>Text color</label><input type="color" value={typography.translationTextColor} onChange={(event) => updateObjectTypography("translationTextColor", event.target.value)} /></div>
              <SectionLabel>Alignment</SectionLabel><Segmented value={typography.translationTextAlign} options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]} onChange={(value) => updateObjectTypography("translationTextAlign", value as Typography["translationTextAlign"])} />
              <label className="editor-toggle"><input checked={typography.translationOutlineEnabled} type="checkbox" onChange={(event) => updateObjectTypography("translationOutlineEnabled", event.target.checked)} /><span />Outline</label>{typography.translationOutlineEnabled && <div className="editor-color-row"><label>Outline color</label><input type="color" value={typography.translationOutlineColor} onChange={(event) => updateObjectTypography("translationOutlineColor", event.target.value)} /></div>}<label className="editor-toggle"><input checked={typography.translationShadowEnabled} type="checkbox" onChange={(event) => updateObjectTypography("translationShadowEnabled", event.target.checked)} /><span />Shadow</label>
              <label className="editor-toggle"><input checked={typography.translationVisible} type="checkbox" onChange={(event) => updateObjectTypography("translationVisible", event.target.checked)} /><span />Visible</label>
            </>}
            <div className="editor-divider" /><SectionLabel>Caption surface</SectionLabel><label className="editor-toggle"><input checked={captionBackground.enabled} type="checkbox" onChange={(event) => onBackgroundChange("enabled", event.target.checked)} /><span />Background</label>{captionBackground.enabled && <div className="editor-color-row"><label>Surface color</label><input type="color" value={captionBackground.color} onChange={(event) => onBackgroundChange("color", event.target.value)} /></div>}
            {selectedObject === "translation" && !positioning.translationPositionLinked && <button className="editor-button editor-button-quiet editor-full-button" type="button" onClick={onAlignTranslation}>Align below Arabic</button>}
            <button className="editor-text-button" type="button" onClick={onResetSelectedObjectStyle}>Reset {(objectLabel ?? "object").toLowerCase()} style</button>
          </> : <div className="editor-inspector-empty"><span className="editor-inspector-glyph">＋</span><h2>Select a caption</h2><p>Click Arabic or translation on the canvas to edit its style, position, and width.</p></div>}

          {selectedSegment && <div className="editor-segment-inspector"><div className="editor-divider" /><SectionLabel>Caption segment</SectionLabel><strong>{captionSegmentLabel(selectedSegment)}</strong><div className="editor-time-readout"><span>In <b>{(selectedSegment.startMs / 1000).toFixed(3)}s</b></span><span>Out <b>{(selectedSegment.endMs / 1000).toFixed(3)}s</b></span></div><p className="editor-muted">Drag the block or either edge to edit timing. Gaps and overlaps are allowed.</p><div className="editor-segment-actions"><select aria-label="Split Quran word boundary" className="editor-select" disabled={selectedSegment.contentKind !== "ayah"} value={splitBoundary} onChange={(event) => onSetSplitBoundary(Number(event.target.value))}>{Array.from({ length: Math.max(0, selectedSegment.arabic.trim().split(/\s+/).length - 1) }, (_, index) => <option key={index + 1} value={index + 1}>After word {index + 1}</option>)}</select><button className="editor-button editor-button-primary" type="button" disabled={selectedSegment.contentKind !== "ayah"} onClick={onSplit}>Split</button><button className="editor-button editor-button-quiet" type="button" disabled={selectedSegment.contentKind !== "ayah" || selectedIndex < 1 || segments[selectedIndex - 1]?.contentKind !== "ayah"} onClick={onMergePrevious}>Merge ←</button><button className="editor-button editor-button-quiet" type="button" disabled={selectedSegment.contentKind !== "ayah" || selectedIndex >= segments.length - 1 || segments[selectedIndex + 1]?.contentKind !== "ayah"} onClick={onMergeNext}>Merge →</button></div><div className="editor-segment-reset-actions"><button className="editor-text-button" type="button" onClick={onResetTiming}>Reset this timing</button><button className="editor-text-button" type="button" onClick={onResetAllTiming}>Reset all timing</button></div></div>}
        </div>
        <div className="editor-sidebar-footer"><button className="editor-text-button" type="button" onClick={onSaveToAccount}>Save to account</button><button className="editor-text-button" type="button" onClick={onDiscard}>Discard changes</button></div>
      </aside>
    </div>

    {exportOpen && <div className="editor-modal-backdrop" role="dialog" aria-modal="true" aria-label="Export video"><div className="editor-modal"><div className="editor-modal-heading"><div><SectionLabel>Export</SectionLabel><h2>Render your video</h2></div><button type="button" onClick={() => onSetExportOpen(false)}>×</button></div><div className="editor-export-grid"><label>Quality<select className="editor-select" value={exportQuality} disabled={Boolean(exportState && typeof exportState === "object")} onChange={(event) => onSetExportQuality(event.target.value as ExportQuality)}><option value="draft">Draft</option><option value="standard">Standard</option><option value="high">High</option></select></label><div><SectionLabel>Resolution</SectionLabel><strong>{selectedFormatDefinition.width} × {selectedFormatDefinition.height}</strong><small>{entitlements.watermarkRequired ? "Small watermark included" : "No watermark"}</small></div><div><SectionLabel>Output</SectionLabel><strong>{outputPlan?.profile?.container.toUpperCase() ?? "MP4 preferred"}</strong><small>Processed locally</small></div></div><div className="editor-modal-actions"><button className="editor-button editor-button-accent" type="button" disabled={Boolean(exportState && typeof exportState === "object")} onClick={onExport}>Export video</button>{exportResult && exportState === "complete" && <button className="editor-button editor-button-primary" type="button" onClick={onDownloadExport}>Download {exportResult.fileName}</button>}{exportState && typeof exportState === "object" && <button className="editor-button editor-button-quiet" type="button" onClick={onCancelExport}>Cancel</button>}</div>{exportError && <p className="editor-alert">{exportError}</p>}{exportDiagnostics && <details className="editor-diagnostics"><summary>Export diagnostics</summary><p>{exportDiagnostics.outputContainer} · {exportDiagnostics.renderedFrameCount} frames · {exportDiagnostics.effectiveRenderingFps.toFixed(1)} fps</p></details>}</div></div>}
  </div>;
}
