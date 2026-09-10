"use client";

import Link from "next/link";
import { Maximize2, Minimize2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type PointerEvent, type SyntheticEvent } from "react";
import type { CaptionBackground, CaptionPositioning, CaptionSegment, TransitionSettings, Typography } from "@/lib/editor/captions";
import type { ProjectAsset, ProjectFormat, ProjectFormatPreset } from "@/lib/schemas/project";
import { EXPORT_QUALITY_PRESETS, exportQualityPreset, type ExportQuality } from "@/lib/export/quality";
import { canExportQuality, watermarkRequiredForExport, type AccountEntitlements } from "@/lib/entitlements";
import type { CompletedExport, ExportPhase, LocalExportDiagnostics } from "@/lib/export/types";
import type { OutputProfile } from "@/lib/export/output";
import type { ExportPreflightAction, ExportPreflightResult } from "@/lib/export/preflight";
import type { CaptionStyle, CaptionLayer, LocalCaptionStyle } from "@/lib/editor/styles";
import type { CaptionObject, CaptionResizeEdge } from "@/components/caption-preview";
import type { QuranContentResponse } from "@/lib/quran/content";
import type { RightInspectorMode } from "@/lib/editor/selection";
import type { CaptionGenerationProgress } from "@/lib/editor/caption-generation-progress";
import { PLAYBACK_RATES, playbackRateLabel, type PlaybackRate } from "@/lib/editor/playback-rate";
import { hafsSurahs } from "@/lib/recognition/core";
import { arabicCaptionDisplay, captionSegmentLabel, getActiveCaptionSegment, translationDisplayText } from "@/lib/editor/captions";
import CaptionPreview from "@/components/caption-preview";
import SafeAreaOverlay from "@/components/safe-area-overlay";
import SocialPlatformGuideOverlay from "@/components/social-platform-guide-overlay";
import AccountPanel from "@/components/account-panel";
import PlanComparisonDialog from "@/components/plan-comparison-dialog";
import type { Session } from "@supabase/supabase-js";
import TikTokPosting from "@/components/tiktok-posting";
import { DEFAULT_SOURCE_VIDEO_FIT, PROJECT_FORMATS, projectFormatDefinition } from "@/lib/editor/formats";
import { BUILT_IN_STYLES, type BuiltInStyleName } from "@/lib/editor/styles";
import { quranFontDefinitions } from "@/lib/quran/content";
import { formatTimelineClock, projectDurationMs, timeToViewportPosition, timelineItemGeometry, timelineRulerTicks, timelineTracks, type MediaSource, type MediaTrim, type TimelineItem, type TimelineViewport } from "@/lib/editor/media";
import { waveformPeaksForViewport, type WaveformData } from "@/lib/editor/waveform";
import type { CaptionCanvasBounds, PlatformCollision, SocialPlatformId } from "@/lib/editor/social-platform-guides";
import { WORKSPACE_LAYOUT_DEFAULTS, clampWorkspacePanelWidth, clampWorkspaceTimelineHeight } from "@/lib/editor/workspace-layout";
import { canFullscreenComposedPreview, isComposedPreviewFullscreen, toggleComposedPreviewFullscreen } from "@/lib/editor/fullscreen";

type VideoMetadata = { durationSeconds: number; width: number; height: number };
type Stage = "idle" | "preparing" | "detecting-speech" | "loading-model" | "transcribing" | "matching" | "captions" | "complete" | "error";
type ExportState = { phase: ExportPhase; fraction: number; elapsedSeconds: number; estimatedRemainingSeconds?: number } | "complete" | "error" | null;
type YouTubeImportStatus = "idle" | "validating" | "fetching-metadata" | "downloading" | "preparing-media" | "ready" | "failed";

type EditorWorkspaceProps = {
  videoFile: File | null;
  videoUrl: string | null;
  videoMetadata: VideoMetadata | null;
  mediaSource: MediaSource | null;
  projectAssets: ProjectAsset[];
  activeMediaAssetId: string | null;
  mediaTrim: MediaTrim;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  previewRef: React.RefObject<HTMLDivElement | null>;
  timelineRef: React.RefObject<HTMLDivElement | null>;
  stage: Stage;
  progress: CaptionGenerationProgress | null;
  support: { supported: boolean; reason: string } | null;
  alignments: { surahNumber: number; ayahNumber: number; confidence: number }[];
  content: Readonly<Record<string, QuranContentResponse>>;
  currentTimeMs: number;
  segments: CaptionSegment[];
  selectedSegmentId: string | null;
  selectedSegment: CaptionSegment | null;
  selectedIndex: number;
  selectedObject: CaptionObject | null;
  rightInspectorMode: RightInspectorMode;
  styleScope: "all" | "segment";
  inspectorStyle: CaptionStyle;
  selectedHasStyleOverrides: boolean;
  splitBoundary: number;
  typography: Typography;
  captionBackground: CaptionBackground;
  projectFormat: ProjectFormat;
  positioning: CaptionPositioning;
  transitionSettings: TransitionSettings;
  playbackRate: PlaybackRate;
  showVerseNumber: boolean;
  showSafeArea: boolean;
  platformPreview: SocialPlatformId;
  platformCollisions: PlatformCollision[];
  projectName: string;
  dirty: boolean;
  session: Session | null;
  accountEntitlements: AccountEntitlements;
  onRefreshEntitlements: () => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  busy: boolean;
  localStyles: LocalCaptionStyle[];
  availableBuiltInStyles: BuiltInStyleName[];
  availableQuranStyles: string[];
  localStyleName: string;
  authOpen: boolean;
  exportOpen: boolean;
  exportPreflight: ExportPreflightResult | null;
  exportQuality: ExportQuality;
  exportFormat: ProjectFormat;
  outputPlan: { sourceHasAudio: boolean; profile: OutputProfile | null } | null;
  exportResult: CompletedExport | null;
  exportIsStale: boolean;
  exportState: ExportState;
  exportError: string | null;
  exportDiagnostics: LocalExportDiagnostics | null;
  tiktokCaption: string;
  errorMessage: string | null;
  onRetrySourceRestore: (() => void) | null;
  timingWarning: string | null;
  timelineTooltip: { label: string; position: number } | null;
  timelineViewport: TimelineViewport;
  waveformData: WaveformData | null;
  showCorrection: boolean;
  surah: number;
  startAyah: number;
  endAyah: number;
  youtubeImportAvailable: boolean;
  youtubeUrl: string;
  youtubeMode: "video" | "audio";
  youtubeImportStatus: YouTubeImportStatus;
  youtubeImportError: string | null;
  selectedFormatDefinition: ReturnType<typeof projectFormatDefinition>;
  onProjectNameChange: (name: string) => void;
  onVideoSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onRelinkAsset: (assetId: string, event: ChangeEvent<HTMLInputElement>) => void;
  onActivateAsset: (assetId: string) => void;
  onRemoveAsset: (assetId: string) => void;
  onYoutubeUrlChange: (value: string) => void;
  onYoutubeModeChange: (value: "video" | "audio") => void;
  onImportYouTube: () => void;
  onCancelYouTubeImport: () => void;
  onLoadedMetadata: (event: SyntheticEvent<HTMLMediaElement>) => void;
  onVideoTimeUpdate: (event: SyntheticEvent<HTMLMediaElement>) => void;
  onMediaPlay: (event: SyntheticEvent<HTMLMediaElement>) => void;
  onMediaPause: (event: SyntheticEvent<HTMLMediaElement>) => void;
  onMediaEnded: (event: SyntheticEvent<HTMLMediaElement>) => void;
  onMediaSeeking: (event: SyntheticEvent<HTMLMediaElement>) => void;
  onTogglePreviewPlayback: () => void;
  onSeekPreview: (ms: number) => void;
  onVideoError: () => void;
  onSelectObject: (segment: CaptionSegment, kind: CaptionObject | null) => void;
  onSetRightInspectorMode: (mode: RightInspectorMode) => void;
  onSelectMedia: () => void;
  onObjectPointerDown: (event: PointerEvent<HTMLDivElement>, segment: CaptionSegment, kind: CaptionObject) => void;
  onResizePointerDown: (event: PointerEvent<HTMLButtonElement>, kind: CaptionObject, edge: CaptionResizeEdge) => void;
  onObjectPointerMove: (event: PointerEvent<HTMLElement>) => void;
  onObjectPointerUp: () => void;
  onCanvasBackgroundPointerDown: () => void;
  onSelectSegment: (segment: CaptionSegment) => void;
  onSegmentPointerDown: (event: PointerEvent<HTMLButtonElement>, segment: CaptionSegment) => void;
  onTimelinePointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPlayheadPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onTimelinePointerMove: (event: PointerEvent<HTMLElement>) => void;
  onEdgeDown: (event: PointerEvent<HTMLElement>, edge: "start" | "end", segment: CaptionSegment) => void;
  onEdgeUp: () => void;
  onMediaTrimPointerDown: (event: PointerEvent<HTMLElement>, edge: "start" | "end") => void;
  onResetMediaTrim: () => void;
  onTimelineZoom: (zoom: number) => void;
  onTimelinePan: (visibleStartMs: number) => void;
  onTimelinePinchZoom: (clientX: number, deltaY: number) => boolean;
  onChangeFormat: (preset: ProjectFormatPreset) => void;
  onDetect: () => void;
  onCopyAlignmentDebug: () => void;
  onCorrectDetection: () => void;
  onToggleCorrection: () => void;
  onSurahChange: (surah: number) => void;
  onStartAyahChange: (ayah: number) => void;
  onEndAyahChange: (ayah: number) => void;
  onClearVideo: () => void;
  onSaveProject: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onHistoryTransactionStart: () => void;
  onHistoryTransactionCommit: () => void;
  onSaveToAccount: () => void;
  onOpenProjects: () => void;
  onOpenCloudProjects: () => void;
  onDiscard: () => void;
  onNewProject: () => void;
  onOpenAuth: () => void;
  onCloseAuth: () => void;
  onBeforeAuthenticate: () => Promise<void>;
  onExportOpen: () => void;
  onExport: () => void;
  onExportAnyway: () => void;
  onExportPreflightAction: (action: ExportPreflightAction, segmentId?: string) => void;
  onCancelExport: () => void;
  onDownloadExport: () => void;
  onSetExportQuality: (quality: ExportQuality) => void;
  onSetExportOpen: (open: boolean) => void;
  onTypographyChange: <K extends keyof Typography>(key: K, value: Typography[K]) => void;
  onBackgroundChange: <K extends keyof CaptionBackground>(key: K, value: CaptionBackground[K]) => void;
  onTransitionChange: (patch: Partial<TransitionSettings>) => void;
  onPlaybackRateChange: (rate: PlaybackRate) => void;
  onSetShowVerseNumber: (value: boolean) => void;
  onSetShowSafeArea: (value: boolean) => void;
  onSetPlatformPreview: (value: SocialPlatformId) => void;
  onMoveToSafeArea: () => void;
  onCaptionBoundsChange: (bounds: CaptionCanvasBounds[]) => void;
  onApplyStyle: (style: CaptionStyle) => void;
  onSaveCurrentStyle: () => void;
  onSetLocalStyleName: (value: string) => void;
  onResetSelectedObjectStyle: () => void;
  onSetStyleScope: (scope: "all" | "segment") => void;
  onAlignTranslation: () => void;
  onSetSplitBoundary: (value: number) => void;
  onSplit: () => void;
  onMergePrevious: () => void;
  onMergeNext: () => void;
  onTranslationFragmentChange: (text: string) => void;
  onResetTranslationFragment: () => void;
  onResetTiming: () => void;
  onResetAllTiming: () => void;
};

const formatDuration = (seconds: number) => {
  if (!Number.isFinite(seconds)) return "—";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

const formatFileSize = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;

const WORD_HIGHLIGHT_PRESETS = [
  ["Electric Lime", "#B7FF00"],
  ["Neon Cyan", "#00F5FF"],
  ["Hot Pink", "#FF2BD6"],
  ["Electric Purple", "#B65CFF"],
  ["Bright Yellow", "#FFE600"],
  ["Electric Orange", "#FF6B00"],
] as const;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="editor-section-label">{children}</p>;
}

function Segmented({ value, options, onChange, label }: { value: string; options: readonly (readonly [string, string])[]; onChange: (value: string) => void; label?: string }) {
  return <div className="editor-segmented" role="group" aria-label={label}>{options.map(([option, optionLabel]) => <button key={option} type="button" aria-pressed={value === option} className={value === option ? "is-active" : ""} onClick={() => onChange(option)}>{optionLabel}</button>)}</div>;
}

const WORKSPACE_PREFERENCES_KEY = "quran-video:editor-workspace:v1";
type WorkspacePreferences = Pick<typeof WORKSPACE_LAYOUT_DEFAULTS, never> & {
  leftPanelWidth?: number;
  rightPanelWidth?: number;
  timelineHeight?: number;
};

export default function EditorWorkspace(props: EditorWorkspaceProps) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [planComparisonOpen, setPlanComparisonOpen] = useState(false);
  const [billingReturn, setBillingReturn] = useState<"checkout" | "plan-update" | null>(null);
  const accountWrapRef = useRef<HTMLDivElement>(null);
  const [assetsExpanded, setAssetsExpanded] = useState(false);
  const [youtubeChoicesOpen, setYoutubeChoicesOpen] = useState(false);
  const [timelineWidth, setTimelineWidth] = useState(600);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [timelineCollapsed, setTimelineCollapsed] = useState(false);
  const [leftPanelWidth, setLeftPanelWidth] = useState<number>(WORKSPACE_LAYOUT_DEFAULTS.leftPanelWidth);
  const [rightPanelWidth, setRightPanelWidth] = useState<number>(WORKSPACE_LAYOUT_DEFAULTS.rightPanelWidth);
  const [timelineHeight, setTimelineHeight] = useState<number>(WORKSPACE_LAYOUT_DEFAULTS.timelineHeight);
  const [workspacePreferencesReady, setWorkspacePreferencesReady] = useState(false);
  const [layoutResizing, setLayoutResizing] = useState(false);
  const [isPreviewFullscreen, setIsPreviewFullscreen] = useState(false);
  const [fullscreenPreviewElement, setFullscreenPreviewElement] = useState<HTMLDivElement | null>(null);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewVolume, setPreviewVolume] = useState(1);
  const [isPreviewMuted, setIsPreviewMuted] = useState(false);
  const fullscreenPreviewRef = useRef<HTMLDivElement>(null);
  const timelineResizeStart = useRef<{ y: number; height: number } | null>(null);
  const panelResizeStart = useRef<{ panel: "left" | "right"; x: number; width: number } | null>(null);
  const {
    videoFile, videoUrl, videoMetadata, mediaSource, projectAssets, activeMediaAssetId, mediaTrim, videoRef, previewRef, timelineRef, stage, progress, support,
    alignments, content, currentTimeMs, segments, selectedSegmentId, selectedSegment, selectedIndex,
    selectedObject, rightInspectorMode, styleScope, inspectorStyle, selectedHasStyleOverrides, splitBoundary, typography, captionBackground, projectFormat, positioning,
    transitionSettings, playbackRate, showVerseNumber, showSafeArea, platformPreview, platformCollisions, projectName, dirty, session, accountEntitlements, onRefreshEntitlements, canUndo, canRedo, busy, localStyles, localStyleName, authOpen, availableBuiltInStyles, availableQuranStyles,
    exportOpen, exportPreflight, exportQuality, exportFormat, outputPlan, exportResult, exportIsStale, exportState, exportError, exportDiagnostics, tiktokCaption, errorMessage, onRetrySourceRestore, timingWarning,
    showCorrection, surah, startAyah, endAyah, youtubeImportAvailable, youtubeUrl, youtubeMode, youtubeImportStatus, youtubeImportError, selectedFormatDefinition, timelineTooltip, timelineViewport, waveformData,
    onProjectNameChange, onVideoSelect, onRelinkAsset, onActivateAsset, onRemoveAsset, onYoutubeUrlChange, onYoutubeModeChange, onImportYouTube, onCancelYouTubeImport, onLoadedMetadata, onVideoTimeUpdate, onMediaPlay, onMediaPause, onMediaEnded, onMediaSeeking, onTogglePreviewPlayback, onSeekPreview, onVideoError, onSelectObject,
    onObjectPointerDown, onResizePointerDown, onObjectPointerMove, onObjectPointerUp, onCanvasBackgroundPointerDown, onSetRightInspectorMode, onSelectMedia,
    onSelectSegment, onSegmentPointerDown, onTimelinePointerDown, onPlayheadPointerDown, onTimelinePointerMove, onEdgeDown, onEdgeUp, onMediaTrimPointerDown, onResetMediaTrim, onTimelineZoom, onTimelinePan, onChangeFormat, onDetect, onCopyAlignmentDebug,
    onCorrectDetection, onToggleCorrection, onSurahChange, onStartAyahChange, onEndAyahChange, onClearVideo, onSaveProject, onUndo, onRedo, onHistoryTransactionStart, onHistoryTransactionCommit, onSaveToAccount, onOpenProjects,
    onOpenCloudProjects, onDiscard, onNewProject, onOpenAuth, onCloseAuth, onBeforeAuthenticate, onExportOpen, onExport: onStartExport, onExportAnyway, onExportPreflightAction, onCancelExport, onDownloadExport,
    onSetExportQuality, onSetExportOpen, onTypographyChange, onBackgroundChange, onTransitionChange, onPlaybackRateChange,
    onSetShowVerseNumber, onSetShowSafeArea, onSetPlatformPreview, onMoveToSafeArea, onCaptionBoundsChange, onApplyStyle, onSaveCurrentStyle, onSetLocalStyleName,
    onResetSelectedObjectStyle, onSetStyleScope, onAlignTranslation, onSetSplitBoundary, onSplit, onMergePrevious,
    onMergeNext, onTranslationFragmentChange, onResetTranslationFragment, onResetTiming, onResetAllTiming, onTimelinePinchZoom,
  } = props;
  const onExport = exportPreflight?.status === "warnings" ? onExportAnyway : onStartExport;
  const fullscreenSupported = typeof document !== "undefined" && canFullscreenComposedPreview(fullscreenPreviewElement, document);
  const setFullscreenPreviewRef = useCallback((node: HTMLDivElement | null) => {
    fullscreenPreviewRef.current = node;
    setFullscreenPreviewElement(node);
  }, []);
  useEffect(() => {
    const syncFullscreenState = () => setIsPreviewFullscreen(isComposedPreviewFullscreen(fullscreenPreviewRef.current, document));
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    syncFullscreenState();
    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenState);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenState);
    };
  }, [fullscreenPreviewElement]);
  const togglePreviewFullscreen = useCallback(() => {
    const preview = fullscreenPreviewRef.current;
    if (!preview || !canFullscreenComposedPreview(preview, document)) return;
    setFullscreenError(null);
    void toggleComposedPreviewFullscreen(preview, document).catch((error: unknown) => {
      console.warn("Composed preview fullscreen request failed", error);
      setFullscreenError("Fullscreen couldn't start. Try again.");
    });
  }, []);
  const syncPreviewVolume = useCallback((event: SyntheticEvent<HTMLMediaElement>) => {
    setPreviewVolume(event.currentTarget.volume);
    setIsPreviewMuted(event.currentTarget.muted);
  }, []);
  const setPreviewMuted = useCallback(() => {
    const media = videoRef.current as unknown as HTMLMediaElement | null;
    if (!media) return;
    media.muted = !media.muted;
    setIsPreviewMuted(media.muted);
  }, [videoRef]);
  const setPreviewVolumeFromControl = useCallback((value: number) => {
    const media = videoRef.current as unknown as HTMLMediaElement | null;
    if (!media) return;
    media.muted = false;
    media.volume = value;
    setPreviewVolume(value);
    setIsPreviewMuted(false);
  }, [videoRef]);
  const setPreviewMediaRef = useCallback((node: HTMLMediaElement | null) => {
    (videoRef as React.MutableRefObject<HTMLMediaElement | null>).current = node;
    if (!node) return;
    setIsPreviewPlaying(!node.paused);
    setPreviewVolume(node.volume);
    setIsPreviewMuted(node.muted);
  }, [videoRef]);
  useEffect(() => {
    if (!session) return;
    const billing = new URLSearchParams(window.location.search).get("billing");
    const returnFlow = billing === "success" ? "checkout" : billing === "plan-update" ? "plan-update" : null;
    if (!returnFlow) return;
    const frame = window.requestAnimationFrame(() => {
      setBillingReturn(returnFlow); setPlanComparisonOpen(true);
      window.history.replaceState({}, "", window.location.pathname);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [session]);
  const durationMs = projectDurationMs(mediaSource);
  const tracks = timelineTracks(mediaSource, segments, mediaTrim);
  const rulerTicks = timelineRulerTicks(timelineViewport, timelineWidth);
  const waveform = useMemo(() => waveformPeaksForViewport(waveformData, timelineViewport, Math.max(96, Math.floor(timelineWidth))), [timelineViewport, timelineWidth, waveformData]);
  const displayedAssets = useMemo(() => [
    ...projectAssets,
    { id: "project-text:quran-captions", type: "text" as const, name: "Quran Captions", sourceOrigin: "project-text" as const, createdAt: "", availability: "available" as const, segmentCount: segments.length },
    ...(typography.translationVisible ? [{ id: "project-text:translation", type: "text" as const, name: "Translation", sourceOrigin: "project-text" as const, createdAt: "", availability: "available" as const, segmentCount: segments.length }] : []),
    ...(typography.transliterationVisible ? [{ id: "project-text:transliteration", type: "text" as const, name: "Transliteration", sourceOrigin: "project-text" as const, createdAt: "", availability: "available" as const, segmentCount: segments.length }] : []),
  ], [projectAssets, segments.length, typography.translationVisible, typography.transliterationVisible]);
  const visibleDuration = Math.max(1, timelineViewport.visibleEndMs - timelineViewport.visibleStartMs);
  useEffect(() => {
    if (!accountMenuOpen) return;
    const onPointerDown = (event: globalThis.PointerEvent) => { if (!accountWrapRef.current?.contains(event.target as Node)) setAccountMenuOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setAccountMenuOpen(false); } };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [accountMenuOpen]);
  const clampTimelineHeight = (value: number) => clampWorkspaceTimelineHeight(value, typeof window === "undefined" ? 620 : window.innerHeight - 48);
  const clampPanelWidth = (panel: "left" | "right", value: number) => clampWorkspacePanelWidth(
    panel,
    value,
    typeof window === "undefined" ? 1_440 : window.innerWidth,
    panel === "left" ? rightPanelWidth : leftPanelWidth,
    panel === "left" ? rightCollapsed : leftCollapsed,
  );
  const toggleTimeline = () => setTimelineCollapsed((collapsed) => !collapsed);
  const onTimelineResizeDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (timelineCollapsed) return;
    event.preventDefault();
    timelineResizeStart.current = { y: event.clientY, height: timelineHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
    setLayoutResizing(true);
  };
  const onTimelineResizeMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = timelineResizeStart.current;
    if (!start) return;
    setTimelineHeight(clampTimelineHeight(start.height + start.y - event.clientY));
  };
  const onTimelineResizeUp = () => { timelineResizeStart.current = null; setLayoutResizing(false); };
  const onPanelResizeDown = (event: PointerEvent<HTMLButtonElement>, panel: "left" | "right") => {
    event.preventDefault();
    panelResizeStart.current = { panel, x: event.clientX, width: panel === "left" ? leftPanelWidth : rightPanelWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    setLayoutResizing(true);
  };
  const onPanelResizeMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = panelResizeStart.current;
    if (!start) return;
    const delta = event.clientX - start.x;
    const requested = start.panel === "left" ? start.width + delta : start.width - delta;
    if (start.panel === "left") setLeftPanelWidth(clampPanelWidth("left", requested));
    else setRightPanelWidth(clampPanelWidth("right", requested));
  };
  const onPanelResizeUp = () => { panelResizeStart.current = null; setLayoutResizing(false); };
  const onPanelResizeKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, panel: "left" | "right") => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    if (panel === "left") setLeftPanelWidth((width) => clampPanelWidth("left", width + direction * 16));
    else setRightPanelWidth((width) => clampPanelWidth("right", width - direction * 16));
  };
  useEffect(() => {
    let saved: WorkspacePreferences = {};
    try {
      saved = JSON.parse(window.localStorage.getItem(WORKSPACE_PREFERENCES_KEY) ?? "{}") as WorkspacePreferences;
    } catch {
      // Invalid browser-local preferences must never affect the editor project.
    }
    const restore = window.requestAnimationFrame(() => {
      if (typeof saved.leftPanelWidth === "number") setLeftPanelWidth(clampPanelWidth("left", saved.leftPanelWidth));
      if (typeof saved.rightPanelWidth === "number") setRightPanelWidth(clampPanelWidth("right", saved.rightPanelWidth));
      if (typeof saved.timelineHeight === "number") setTimelineHeight(clampTimelineHeight(saved.timelineHeight));
      setWorkspacePreferencesReady(true);
    });
    return () => window.cancelAnimationFrame(restore);
  // Browser-local layout settings are intentionally restored only once per editor mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!workspacePreferencesReady) return;
    window.localStorage.setItem(WORKSPACE_PREFERENCES_KEY, JSON.stringify({ leftPanelWidth, rightPanelWidth, timelineHeight } satisfies WorkspacePreferences));
  }, [leftPanelWidth, rightPanelWidth, timelineHeight, workspacePreferencesReady]);
  useEffect(() => {
    const onWindowResize = () => {
      setLeftPanelWidth((width) => clampPanelWidth("left", width));
      setRightPanelWidth((width) => clampPanelWidth("right", width));
      setTimelineHeight((height) => clampTimelineHeight(height));
    };
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  // Width limits intentionally use the latest state through the rendered callback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftPanelWidth, rightPanelWidth, leftCollapsed, rightCollapsed]);
  useEffect(() => {
    const node = timelineRef.current;
    if (!node) return;
    const update = () => setTimelineWidth(node.clientWidth || 600);
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [timelineRef, videoUrl]);
  useEffect(() => {
    const node = timelineRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey || !onTimelinePinchZoom(event.clientX, event.deltaY)) return;
      event.preventDefault();
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [onTimelinePinchZoom, timelineRef, videoUrl]);
  const selectedLayer: CaptionLayer = selectedObject ?? "arabic";
  const objectLabel = selectedLayer === "arabic" ? "Arabic" : selectedLayer === "translation" ? "Translation" : "Transliteration";
  const inspectorTypography = inspectorStyle.typography;
  const inspectorBackground = inspectorStyle.captionBackground;
  const inspectorPositioning = inspectorStyle.positioning;
  const contextualPlatformCollisions = useMemo(() => {
    const relevant = selectedSegmentId ? platformCollisions.filter((collision) => collision.segmentId === selectedSegmentId) : platformCollisions;
    return [...new Map(relevant.map((collision) => [`${collision.kind}:${collision.obstructionId}`, collision])).values()];
  }, [platformCollisions, selectedSegmentId]);
  const updateObjectTypography = <K extends keyof Typography>(key: K, value: Typography[K]) => onTypographyChange(key, value);
  const renderTimelineItem = (item: TimelineItem) => {
    const geometry = timelineItemGeometry(item.startMs, item.endMs, timelineViewport);
    if (!geometry) return null;
    const style = { width: `${geometry.width * 100}%`, left: `${geometry.left * 100}%` };
    if (!item.captionSegmentId) return <div key={item.id} className="editor-media-block" style={style}><span>{item.label}</span><button type="button" className="editor-media-trim-handle editor-media-trim-handle-start" aria-label={`Trim ${item.label} start`} onPointerDown={(event) => onMediaTrimPointerDown(event, "start")} onPointerUp={onEdgeUp} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} /><button type="button" className="editor-media-trim-handle editor-media-trim-handle-end" aria-label={`Trim ${item.label} end`} onPointerDown={(event) => onMediaTrimPointerDown(event, "end")} onPointerUp={onEdgeUp} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} /></div>;
    const segment = segments.find((value) => value.id === item.captionSegmentId);
    if (!segment) return null;
    const displayText = arabicCaptionDisplay(segment, false).text;
    return <button key={item.id} type="button" aria-label={`Caption ${displayText}`} onPointerDown={(event) => onSegmentPointerDown(event, segment)} onPointerUp={onEdgeUp} onClick={(event) => { event.stopPropagation(); onSelectSegment(segment); }} className={`editor-caption-block ${segment.id === selectedSegmentId ? "is-selected" : ""} ${getActiveCaptionSegment(segments, currentTimeMs)?.id === segment.id ? "is-active" : ""}`} style={style}><span className="editor-caption-block-label" dir="rtl">{item.label}</span><span className="editor-timing-handle editor-timing-handle-start" aria-label={`Resize ${captionSegmentLabel(segment)} start`} onPointerDown={(event) => onEdgeDown(event, "start", segment)} onPointerUp={onEdgeUp} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} /><span className="editor-timing-handle editor-timing-handle-end" aria-label={`Resize ${captionSegmentLabel(segment)} end`} onPointerDown={(event) => onEdgeDown(event, "end", segment)} onPointerUp={onEdgeUp} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} /></button>;
  };

  return <div className={`editor-shell ${layoutResizing ? "is-resizing-layout" : ""}`} style={{ "--timeline-height": `${timelineCollapsed ? 38 : timelineHeight}px`, "--left-panel-width": `${leftPanelWidth}px`, "--right-panel-width": `${rightPanelWidth}px` } as CSSProperties}>
    <header className="editor-topbar">
      <Link className="editor-brand" href="/" aria-label="Quran Video home"><span className="editor-brand-mark">۝</span><div><p>Quran Video</p><span>Recitation editor</span></div></Link>
      <div className="editor-project-title"><input aria-label="Project name" value={projectName} onChange={(event) => onProjectNameChange(event.target.value)} /><span>{videoFile?.name ?? "No local source"}</span></div>
      <div className="editor-top-actions">
        <div className="editor-format-switcher" aria-label="Project format">{(Object.keys(PROJECT_FORMATS) as ProjectFormatPreset[]).map((preset) => <button key={preset} type="button" className={projectFormat.preset === preset ? "is-active" : ""} onClick={() => onChangeFormat(preset)}>{preset === "vertical" ? "9:16" : preset === "landscape" ? "16:9" : "1:1"}</button>)}</div>
        <span className={`editor-save-state ${dirty ? "is-dirty" : ""}`}><i />{dirty ? "Unsaved" : "Saved"}</span>
        <button className="editor-icon-button" type="button" aria-label="Undo" title="Undo ⌘Z" disabled={!canUndo} onClick={onUndo}>↶</button>
        <button className="editor-icon-button" type="button" aria-label="Redo" title="Redo ⇧⌘Z" disabled={!canRedo} onClick={onRedo}>↷</button>
        <button className="editor-button editor-button-quiet" type="button" title="Save this editable project to your account" onClick={onSaveProject}>Save</button>
        <button className="editor-button editor-button-accent" type="button" disabled={!segments.length || Boolean(exportState && typeof exportState === "object")} onClick={onExportOpen}>Export</button>
        <div className="editor-account-wrap" ref={accountWrapRef} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setAccountMenuOpen(false); }}><button aria-label="Account" aria-expanded={session ? accountMenuOpen : authOpen} className="editor-icon-button" type="button" onClick={() => session ? setAccountMenuOpen((value) => !value) : onOpenAuth()}>Account</button>{accountMenuOpen && session && <div className="editor-account-popover"><AccountPanel session={session} entitlements={accountEntitlements} onEntitlementsRefresh={onRefreshEntitlements} onClose={() => setAccountMenuOpen(false)} onOpenPlanComparison={() => { setAccountMenuOpen(false); setPlanComparisonOpen(true); }} /></div>}{authOpen && <AccountPanel session={null} onClose={onCloseAuth} onBeforeAuthenticate={onBeforeAuthenticate} />}</div>
      </div>
    </header>

    <div className={`editor-body ${leftCollapsed ? "is-left-collapsed" : ""} ${rightCollapsed ? "is-right-collapsed" : ""} ${timelineCollapsed ? "is-timeline-collapsed" : ""}`}>
      <aside className="editor-sidebar editor-sidebar-left">
        <button className="editor-panel-collapse editor-panel-collapse-left" type="button" aria-label={leftCollapsed ? "Expand left sidebar" : "Collapse left sidebar"} title={leftCollapsed ? "Expand Media panel" : "Collapse Media panel"} aria-expanded={!leftCollapsed} onClick={() => setLeftCollapsed((value) => !value)}>{leftCollapsed ? "›" : "‹"}</button>
        <div className="editor-sidebar-scroll">
          <div className="editor-panel-heading"><div><SectionLabel>Media</SectionLabel><h2>{videoFile ? mediaSource?.kind === "audio" ? "Audio source" : "Video source" : "Import a source"}</h2></div><span className="editor-status-dot" /></div>
          <label className="editor-upload-mini"><span>↑</span><strong>Import</strong><small>Video or browser-supported audio</small><input accept="video/*,audio/*" type="file" onChange={onVideoSelect} /></label>
          {videoFile && <>
            <p className="editor-muted editor-truncate" title={videoFile.name}>{videoFile.name}</p>
            {videoMetadata && <p className="editor-meta-line">{formatDuration(videoMetadata.durationSeconds)}{mediaSource?.hasVideo ? ` · ${videoMetadata.width} × ${videoMetadata.height}` : " · audio"}</p>}
            {stage === "complete" && <button className="editor-button editor-button-primary editor-full-button" disabled={busy || !support?.supported} type="button" onClick={onDetect}>Detect again</button>}
            {process.env.NODE_ENV !== "production" && (stage === "complete" || stage === "error") && <button className="editor-text-button" type="button" onClick={onCopyAlignmentDebug}>Copy Alignment Debug</button>}
            {stage === "complete" && alignments.length > 0 && <button className="editor-button editor-button-quiet editor-full-button" type="button" onClick={onToggleCorrection}>Correct detection</button>}
            <button className="editor-text-button" type="button" onClick={onClearVideo}>Clear active source</button>
          </>}
          <div className="editor-youtube-import" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setYoutubeChoicesOpen(false); }} onKeyDown={(event) => { if (event.key === "Escape") { setYoutubeChoicesOpen(false); (event.target as HTMLElement).blur(); } }}>
            <SectionLabel>YouTube</SectionLabel>
            {youtubeImportAvailable ? <>
              <div className="editor-youtube-row"><input aria-label="YouTube URL" type="url" placeholder="Paste YouTube link…" value={youtubeUrl} disabled={!['idle', 'failed', 'ready'].includes(youtubeImportStatus)} onFocus={() => setYoutubeChoicesOpen(true)} onPointerDown={() => setYoutubeChoicesOpen(true)} onChange={(event) => onYoutubeUrlChange(event.target.value)} /><button className="editor-button editor-button-primary" type="button" disabled={!youtubeUrl.trim() || !['idle', 'failed', 'ready'].includes(youtubeImportStatus)} onClick={() => { setYoutubeChoicesOpen(false); onImportYouTube(); }}>Import</button></div>
              {youtubeChoicesOpen && <div className="editor-youtube-choices" aria-label="YouTube import type"><button type="button" className={youtubeMode === "video" ? "is-active" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => onYoutubeModeChange("video")}>Video</button><button type="button" className={youtubeMode === "audio" ? "is-active" : ""} onPointerDown={(event) => event.preventDefault()} onClick={() => onYoutubeModeChange("audio")}>Audio only</button></div>}
              {!['idle', 'failed', 'ready'].includes(youtubeImportStatus) && <div className="editor-youtube-progress" role="status"><span>{youtubeImportStatus === "validating" ? "Validating URL" : youtubeImportStatus === "fetching-metadata" ? "Fetching metadata" : youtubeImportStatus === "downloading" ? "Downloading" : "Preparing media"}…</span><button className="editor-text-button" type="button" onClick={onCancelYouTubeImport}>Cancel</button></div>}
              {youtubeImportStatus === "ready" && <p className="editor-youtube-help">Added to Project Assets for this browser session.</p>}
              {youtubeImportError && <p className="editor-alert">{youtubeImportError}</p>}
              {youtubeImportStatus !== "ready" && <p className="editor-youtube-help">Imports are local and temporary.</p>}
            </> : <p className="editor-youtube-help">YouTube import is available only in local development. Upload a media file to edit in this deployment.</p>}
          </div>

          <div className="editor-divider" />
          <section className="editor-project-assets">
            <button className="editor-project-assets-toggle" type="button" aria-expanded={assetsExpanded} onClick={() => setAssetsExpanded((value) => !value)}><span>Project Assets <b>· {displayedAssets.length}</b></span><span aria-hidden="true">{assetsExpanded ? "⌄" : "›"}</span></button>
            {assetsExpanded && <div className="editor-asset-list">{displayedAssets.map((asset) => <div className={`editor-asset-row ${asset.id === activeMediaAssetId ? "is-active" : ""}`} key={asset.id}><span className="editor-asset-icon">{asset.type === "video" ? "▶" : asset.type === "audio" ? "♪" : asset.type === "image" ? "▧" : "T"}</span><div><strong title={asset.name}>{asset.name}</strong><small>{asset.availability === "needs-relink" ? "Needs relink" : asset.type === "text" ? `${asset.segmentCount ?? 0} segments` : `${asset.type[0].toUpperCase()}${asset.type.slice(1)}${asset.durationMs ? ` · ${formatDuration(asset.durationMs / 1000)}` : ""}`}{asset.id === activeMediaAssetId ? " · Active" : ""}</small></div>{asset.type !== "text" && <span className="editor-asset-actions">{asset.availability === "available" && asset.id !== activeMediaAssetId && <button type="button" onClick={() => onActivateAsset(asset.id)}>Use</button>}{asset.availability === "needs-relink" && <label>Relink<input accept="video/*,audio/*" type="file" onChange={(event) => onRelinkAsset(asset.id, event)} /></label>}<button type="button" aria-label={`Remove ${asset.name}`} onClick={() => onRemoveAsset(asset.id)}>×</button></span>}</div>)}</div>}
          </section>

          <div className="editor-divider" />
          <SectionLabel>Canvas</SectionLabel>
          <p className="editor-muted">{selectedFormatDefinition.label} · {selectedFormatDefinition.width} × {selectedFormatDefinition.height}</p>
          <label className="editor-toggle"><input checked={showSafeArea} type="checkbox" onChange={(event) => onSetShowSafeArea(event.target.checked)} /><span />Safe area guides</label>
          <label className="editor-toggle"><input checked={showVerseNumber} type="checkbox" onChange={(event) => onSetShowVerseNumber(event.target.checked)} /><span />Verse number</label>
          <label className="editor-toggle"><input checked={typography.translationVisible} type="checkbox" onChange={(event) => onTypographyChange("translationVisible", event.target.checked)} /><span />Show translation</label>
          <label className="editor-field-label">Playback speed
            <select aria-label="Playback speed" className="editor-select" value={playbackRate} onChange={(event) => onPlaybackRateChange(Number(event.currentTarget.value) as PlaybackRate)}>
              {PLAYBACK_RATES.map((rate) => <option key={rate} value={rate}>{playbackRateLabel(rate)}</option>)}
            </select>
          </label>

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

      <button className="editor-panel-resize editor-panel-resize-left" type="button" aria-label="Resize left panel" title="Drag to resize left panel · double-click to reset" onPointerDown={(event) => onPanelResizeDown(event, "left")} onPointerMove={onPanelResizeMove} onPointerUp={onPanelResizeUp} onDoubleClick={() => setLeftPanelWidth(WORKSPACE_LAYOUT_DEFAULTS.leftPanelWidth)} onKeyDown={(event) => onPanelResizeKeyDown(event, "left")} />

      <section className="editor-main-stage">
        <div className="editor-stage-header"><div><SectionLabel>Canvas</SectionLabel><h1>{videoFile ? "Caption composition" : "Begin with a recitation"}</h1></div><div className="editor-stage-info"><span>{selectedFormatDefinition.label}</span><span>{formatDuration(durationMs / 1000)}</span></div></div>
        <div className="editor-canvas-well">
          {videoUrl ? <div ref={setFullscreenPreviewRef} className="editor-fullscreen-preview" data-project-format={projectFormat.preset}>
            <div ref={previewRef} className={`project-preview-canvas editor-canvas ${mediaSource?.hasVideo ? "" : "editor-audio-canvas"}`} data-project-aspect-ratio={selectedFormatDefinition.aspectRatio} data-project-format={projectFormat.preset} style={{ aspectRatio: `${projectFormat.width} / ${projectFormat.height}` }} onPointerDown={onCanvasBackgroundPointerDown}>
              {mediaSource?.hasVideo ? <video ref={setPreviewMediaRef} className="h-full w-full object-contain" playsInline preload="metadata" src={videoUrl} data-video-fit={DEFAULT_SOURCE_VIDEO_FIT} onPointerDown={onSelectMedia} onLoadStart={() => setIsPreviewPlaying(false)} onLoadedMetadata={(event) => { onLoadedMetadata(event); syncPreviewVolume(event); }} onTimeUpdate={onVideoTimeUpdate} onPlay={(event) => { setIsPreviewPlaying(true); onMediaPlay(event); }} onPause={(event) => { setIsPreviewPlaying(false); onMediaPause(event); }} onEnded={(event) => { setIsPreviewPlaying(false); onMediaEnded(event); }} onSeeking={onMediaSeeking} onSeeked={onMediaSeeking} onVolumeChange={syncPreviewVolume} onError={onVideoError}>Your browser does not support video playback.</video> : <audio ref={setPreviewMediaRef} className="editor-audio-element" preload="metadata" src={videoUrl} onPointerDown={onSelectMedia} onLoadStart={() => setIsPreviewPlaying(false)} onLoadedMetadata={(event) => { onLoadedMetadata(event); syncPreviewVolume(event); }} onTimeUpdate={onVideoTimeUpdate} onPlay={(event) => { setIsPreviewPlaying(true); onMediaPlay(event); }} onPause={(event) => { setIsPreviewPlaying(false); onMediaPause(event); }} onEnded={(event) => { setIsPreviewPlaying(false); onMediaEnded(event); }} onSeeking={onMediaSeeking} onSeeked={onMediaSeeking} onVolumeChange={syncPreviewVolume} onError={onVideoError}>Your browser does not support audio playback.</audio>}
              {showSafeArea && <SafeAreaOverlay format={projectFormat} />}
              <SocialPlatformGuideOverlay platform={platformPreview} />
              <CaptionPreview currentTimeMs={currentTimeMs} segments={segments} content={content} typography={typography} captionBackground={captionBackground} positioning={positioning} format={projectFormat} transitionSettings={transitionSettings} showVerseNumber={showVerseNumber} selectedSegmentId={selectedSegmentId} selectedObject={selectedObject} onSelectObject={onSelectObject} onObjectPointerDown={onObjectPointerDown} onResizePointerDown={onResizePointerDown} onPointerMove={onObjectPointerMove} onPointerUp={onObjectPointerUp} onCaptionBoundsChange={onCaptionBoundsChange} />
            </div>
            <div className="editor-player-controls" aria-label="Preview controls">
              <button className="editor-player-button" type="button" data-player-control="playback" aria-label={isPreviewPlaying ? "Pause" : "Play"} title={isPreviewPlaying ? "Pause" : "Play"} onClick={onTogglePreviewPlayback}>{isPreviewPlaying ? <Pause aria-hidden="true" size={16} strokeWidth={2.25} /> : <Play aria-hidden="true" size={16} strokeWidth={2.25} fill="currentColor" />}</button>
              <span className="editor-player-time">{formatDuration(currentTimeMs / 1000)} <i>/</i> {formatDuration(durationMs / 1000)}</span>
              <input className="editor-player-seek" data-player-control="seek" aria-label="Seek preview" title="Seek" type="range" min="0" max={Math.max(0, durationMs / 1000)} step="0.01" value={Math.min(Math.max(0, currentTimeMs / 1000), Math.max(0, durationMs / 1000))} disabled={durationMs <= 0} onChange={(event) => onSeekPreview(Number(event.currentTarget.value) * 1000)} />
              <button className="editor-player-button" type="button" data-player-control="mute" aria-label={isPreviewMuted ? "Unmute" : "Mute"} title={isPreviewMuted ? "Unmute" : "Mute"} onClick={setPreviewMuted}>{isPreviewMuted ? <VolumeX aria-hidden="true" size={16} strokeWidth={2.25} /> : <Volume2 aria-hidden="true" size={16} strokeWidth={2.25} />}</button>
              <input className="editor-player-volume" data-player-control="volume" aria-label="Preview volume" title="Volume" type="range" min="0" max="1" step="0.05" value={previewVolume} onChange={(event) => setPreviewVolumeFromControl(Number(event.currentTarget.value))} />
              {fullscreenSupported && <button className="editor-player-button" type="button" data-player-control="fullscreen" aria-label={isPreviewFullscreen ? "Exit fullscreen" : "Enter fullscreen"} title={isPreviewFullscreen ? "Exit fullscreen" : "Enter fullscreen"} onClick={togglePreviewFullscreen}>{isPreviewFullscreen ? <Minimize2 aria-hidden="true" size={16} strokeWidth={2.25} /> : <Maximize2 aria-hidden="true" size={16} strokeWidth={2.25} />}</button>}
              {fullscreenError && <span className="editor-playback-fullscreen-error" role="status">{fullscreenError}</span>}
            </div>
          </div> : <label className="editor-empty-canvas"><span className="editor-upload-icon">↑</span><strong>Choose media to begin</strong><small>Your source stays on this device. Nothing is uploaded.</small><input accept="video/*,audio/*" type="file" onChange={onVideoSelect} /></label>}
        </div>
        {videoUrl && <div className="editor-timeline-panel"><button className="editor-timeline-resize" type="button" aria-label="Resize timeline" title="Drag to resize · double-click to reset" onPointerDown={onTimelineResizeDown} onPointerMove={onTimelineResizeMove} onPointerUp={onTimelineResizeUp} onDoubleClick={() => setTimelineHeight(WORKSPACE_LAYOUT_DEFAULTS.timelineHeight)} /><div className="editor-timeline-heading"><div><SectionLabel>Timeline</SectionLabel><strong>{segments.length} caption segments</strong></div><div className="editor-timeline-controls"><button type="button" aria-label={timelineCollapsed ? "Expand timeline" : "Collapse timeline"} title={timelineCollapsed ? "Expand timeline" : "Collapse timeline"} onClick={toggleTimeline}>{timelineCollapsed ? "↑" : "↓"}</button><button type="button" aria-label="Zoom out timeline" title="Zoom out" onClick={() => onTimelineZoom(timelineViewport.zoom / 2)}>−</button><input aria-label="Timeline zoom" title="Timeline zoom" type="range" min="1" max="128" step="1" value={timelineViewport.zoom} onChange={(event) => onTimelineZoom(Number(event.target.value))} /><button type="button" aria-label="Zoom in timeline" title="Zoom in" onClick={() => onTimelineZoom(timelineViewport.zoom * 2)}>+</button><button type="button" title="Fit the full project in the timeline" onClick={() => onTimelineZoom(1)}>Fit</button><button type="button" title="Reset media trim" onClick={onResetMediaTrim}>Reset trim</button></div><span>{formatDuration(currentTimeMs / 1000)} / {formatDuration(durationMs / 1000)}</span></div><div className="editor-timeline">
          <div className="editor-timeline-labels">{tracks.map((track) => <span className="editor-track-label" key={track.kind}>{track.label}</span>)}</div>
          <div ref={timelineRef} className="editor-timeline-content" onPointerDown={onTimelinePointerDown} onPointerMove={onTimelinePointerMove}>
            <div className="editor-timeline-ruler">{rulerTicks.map((tick) => <span key={tick} style={{ left: `${timeToViewportPosition(tick, timelineViewport) * 100}%` }}>{formatTimelineClock(tick, visibleDuration < 2_000)}</span>)}</div>
            {currentTimeMs >= timelineViewport.visibleStartMs && currentTimeMs <= timelineViewport.visibleEndMs && <button className="editor-playhead" aria-label="Drag playhead to seek" type="button" onPointerDown={onPlayheadPointerDown} style={{ left: `${timeToViewportPosition(currentTimeMs, timelineViewport) * 100}%` }} />}
            <div className="editor-timeline-tracks">{tracks.map((track) => <div className={`editor-timeline-track editor-timeline-track-${track.kind}`} key={track.kind}>{track.kind === "audio" && <div className="editor-waveform" aria-label={waveform.length ? "Audio waveform" : "Audio waveform loading"}>{waveform.length ? <svg preserveAspectRatio="none" viewBox={`0 0 ${waveform.length} 100`}><path d={waveform.map((peak, index) => `M${index} ${50 - Math.min(48, peak.max * 48)}V${50 - Math.max(-48, peak.min * 48)}`).join("")} /></svg> : <span>Audio · loading waveform</span>}</div>}{track.items.map(renderTimelineItem)}</div>)}</div>
            {timelineTooltip && timelineTooltip.position >= 0 && timelineTooltip.position <= 1 && <div className="editor-timeline-tooltip" role="status" style={{ left: `${timelineTooltip.position * 100}%` }}>{timelineTooltip.label}</div>}
          </div>
        </div>{timelineViewport.zoom > 1 && <input className="editor-timeline-pan" aria-label="Pan timeline" type="range" min="0" max={Math.max(0, durationMs - visibleDuration)} value={Math.min(timelineViewport.visibleStartMs, Math.max(0, durationMs - visibleDuration))} onChange={(event) => onTimelinePan(Number(event.target.value))} />}</div>}
        {(busy || (stage === "complete" && alignments.length > 0) || showCorrection || errorMessage || timingWarning || exportState) && <div className="editor-notices">
          {busy && progress && <div className="editor-generation-progress" aria-live="polite">
            <div className="editor-generation-progress-heading"><strong>Generating Quran captions</strong><output>{Math.round(progress.progress * 100)}%</output></div>
            <div className="editor-generation-progress-track" role="progressbar" aria-label="Caption generation progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.progress * 100)}><span style={{ width: `${Math.round(progress.progress * 100)}%` }} /></div>
            <strong className="editor-generation-progress-label">{progress.label}</strong>
            <span>{progress.detail ?? "Your recitation stays in this browser."}</span>
          </div>}
          {stage === "complete" && alignments.length > 0 && <div className="editor-notice editor-notice-success"><strong>Detected Surah {alignments[0].surahNumber} · ayat {alignments[0].ayahNumber}–{alignments.at(-1)?.ayahNumber}</strong><span>{Math.round((alignments.reduce((sum, item) => sum + item.confidence, 0) / alignments.length) * 100)}% overall confidence</span></div>}
          {timingWarning && <div className="editor-notice">{timingWarning}</div>}
          {showCorrection && <div className="editor-correction"><SectionLabel>Choose the Quran passage</SectionLabel><div><select aria-label="Surah" className="editor-select" value={surah} onChange={(event) => onSurahChange(Number(event.target.value))}><option value={0} disabled>Choose a Surah</option>{hafsSurahs.map((item) => <option key={item.number} value={item.number}>Surah {item.number} · {item.name}</option>)}</select><input aria-label="First ayah" type="number" min="1" value={startAyah} onChange={(event) => onStartAyahChange(Number(event.target.value))} /><input aria-label="Last ayah" type="number" min="1" value={endAyah} onChange={(event) => onEndAyahChange(Number(event.target.value))} /><button className="editor-button editor-button-primary" type="button" onClick={onCorrectDetection}>Use range</button></div></div>}
          {errorMessage && <div className="editor-notice editor-notice-error"><span>{errorMessage}</span>{(onRetrySourceRestore || videoFile) && <button className="editor-text-button" type="button" onClick={onRetrySourceRestore ?? onDetect}>Try again</button>}{videoFile && <button className="editor-text-button" type="button" onClick={onToggleCorrection}>Correct detection</button>}</div>}
          {exportResult && exportState !== "error" ? <div className="editor-export-complete" role="status"><div><strong>✓ Export complete</strong><span>{exportQualityPreset(exportResult.quality).label} · {exportQualityPreset(exportResult.quality).resolutionLabel} · {exportResult.watermarkRequired ? "Watermark included" : "No watermark"}</span><span>{exportResult.width} × {exportResult.height} · {exportResult.mimeType.split(";")[0]?.replace("video/", "").toUpperCase()} · {playbackRateLabel(exportResult.playbackRate)} · {formatFileSize(exportResult.fileSizeBytes)}</span>{exportIsStale && <small>Project changed since this export.</small>}</div><div className="editor-export-complete-actions"><button className="editor-button editor-button-accent" type="button" onClick={onDownloadExport}>Download video</button><TikTokPosting exported={exportResult} generatedCaption={tiktokCaption} onExportStandardVersion={() => { onSetExportQuality("standard"); onExportOpen(); }} /><button className="editor-button editor-button-quiet" type="button" disabled={Boolean(exportState && typeof exportState === "object")} onClick={onExportOpen}>Export another version</button></div></div> : null}
          {exportState && exportState !== "complete" && <div className="editor-notice"><strong>{exportState === "error" ? "Export stopped" : `Exporting · ${exportState.phase}`}</strong><span>{exportError ?? "Source media is processed locally."}</span></div>}
        </div>}
      </section>

      <button className="editor-panel-resize editor-panel-resize-right" type="button" aria-label="Resize right panel" title="Drag to resize right panel · double-click to reset" onPointerDown={(event) => onPanelResizeDown(event, "right")} onPointerMove={onPanelResizeMove} onPointerUp={onPanelResizeUp} onDoubleClick={() => setRightPanelWidth(WORKSPACE_LAYOUT_DEFAULTS.rightPanelWidth)} onKeyDown={(event) => onPanelResizeKeyDown(event, "right")} />

      <aside className="editor-sidebar editor-sidebar-right">
        <button className="editor-panel-collapse editor-panel-collapse-right" type="button" aria-label={rightCollapsed ? "Expand inspector" : "Collapse inspector"} title={rightCollapsed ? "Expand Inspector" : "Collapse Inspector"} aria-expanded={!rightCollapsed} onClick={() => setRightCollapsed((value) => !value)}>{rightCollapsed ? "‹" : "›"}</button>
        <div className="editor-sidebar-scroll">
          <div className="editor-inspector-mode"><Segmented label="Inspector mode" value={rightInspectorMode} options={[["settings", "Settings"], ["subtitles", "Subtitles"]]} onChange={(mode) => onSetRightInspectorMode(mode as RightInspectorMode)} /></div>
          {rightInspectorMode === "settings" ? <div className="editor-settings-inspector">
            <SectionLabel>Canvas settings</SectionLabel>
            <p className="editor-muted">{selectedFormatDefinition.label} · {selectedFormatDefinition.width} × {selectedFormatDefinition.height}</p>
            <label className="editor-field-label">Playback speed
              <select aria-label="Project playback speed" className="editor-select" value={playbackRate} onChange={(event) => onPlaybackRateChange(Number(event.currentTarget.value) as PlaybackRate)}>
                {PLAYBACK_RATES.map((rate) => <option key={rate} value={rate}>{playbackRateLabel(rate)}</option>)}
              </select>
            </label>
            <label className="editor-toggle"><input checked={showSafeArea} type="checkbox" onChange={(event) => onSetShowSafeArea(event.target.checked)} /><span />Safe area guides</label>
            <div className="editor-platform-preview"><SectionLabel>Platform preview</SectionLabel><Segmented label="Platform preview" value={platformPreview} options={[["none", "None"], ["tiktok", "TikTok"], ["instagram-reels", "Instagram Reels"], ["youtube-shorts", "YouTube Shorts"]]} onChange={(value) => onSetPlatformPreview(value as SocialPlatformId)} />
              {platformPreview !== "none" && projectFormat.preset !== "vertical" && <p className="editor-muted">Platform safe-zone guides are optimized for 9:16 video.</p>}
              {platformPreview !== "none" && <p className="editor-platform-guide-note">Approximate safe-zone guide · platform interfaces can change.</p>}
              {contextualPlatformCollisions.length > 0 && <div className="editor-platform-warning" role="status"><strong>{contextualPlatformCollisions.map((collision) => `${collision.kind === "arabic" ? "Arabic" : collision.kind === "translation" ? "Translation" : "Transliteration"} may be covered by ${platformPreview === "instagram-reels" ? "Reels" : platformPreview === "youtube-shorts" ? "Shorts" : "TikTok"} ${collision.obstructionLabel}`).at(0)}</strong><button className="editor-button editor-button-quiet editor-full-button" type="button" onClick={onMoveToSafeArea}>Move to safe area</button></div>}
            </div>
            {selectedSegment ? <div className="editor-inspector-context"><SectionLabel>Selected subtitle</SectionLabel><strong>{captionSegmentLabel(selectedSegment)} · {objectLabel}</strong><p className="editor-muted">Its caption controls remain available in Subtitles.</p></div> : <div className="editor-inspector-context"><SectionLabel>Selected object</SectionLabel><strong>{mediaSource?.hasVideo ? "Video" : mediaSource ? "Audio" : "Canvas"}</strong><p className="editor-muted">Select caption text or a timeline caption to edit subtitle styling and timing.</p></div>}
          </div> : <>
          {selectedSegment ? <>
            <div className="editor-inspector-title"><div><SectionLabel>Selected subtitle</SectionLabel><h2>{captionSegmentLabel(selectedSegment)} · {objectLabel}</h2></div><button className="editor-close-selection" type="button" aria-label="Clear selected subtitle layer" title="Clear selected layer" onClick={() => onSelectObject(selectedSegment, null)}>×</button></div>
            <p className="editor-muted">Drag on canvas to move · handles change width</p>
            {selectedLayer === "arabic" ? <>
              <SectionLabel>Quran style</SectionLabel><select className="editor-select" value={inspectorTypography.quranStyle} onChange={(event) => onTypographyChange("quranStyle", event.target.value as Typography["quranStyle"])}>{Object.entries(quranFontDefinitions).map(([value, font]) => <option key={value} value={value} disabled={!availableQuranStyles.includes(value)}>{font.label}</option>)}</select>
              <div className="editor-control-row"><label>Size <input type="range" min="16" max="96" value={inspectorTypography.arabicFontSize} onFocus={onHistoryTransactionStart} onPointerDown={onHistoryTransactionStart} onPointerUp={onHistoryTransactionCommit} onBlur={onHistoryTransactionCommit} onChange={(event) => updateObjectTypography("arabicFontSize", Number(event.target.value))} /></label><output>{inspectorTypography.arabicFontSize}px</output></div>
              <div className="editor-control-row"><label>Opacity <input type="range" min="0" max="1" step="0.01" value={inspectorTypography.arabicOpacity} onFocus={onHistoryTransactionStart} onPointerDown={onHistoryTransactionStart} onPointerUp={onHistoryTransactionCommit} onBlur={onHistoryTransactionCommit} onChange={(event) => updateObjectTypography("arabicOpacity", Number(event.target.value))} /></label><output>{Math.round(inspectorTypography.arabicOpacity * 100)}%</output></div>
              <div className="editor-color-row"><label>Arabic text color</label><input aria-label="Arabic text color" type="color" value={inspectorTypography.textColor} onFocus={onHistoryTransactionStart} onBlur={onHistoryTransactionCommit} onChange={(event) => updateObjectTypography("textColor", event.target.value)} /></div>
              <label className="editor-field-label">Word highlight<select aria-label="Word Highlight" className="editor-select" value={inspectorTypography.wordHighlightMode} onChange={(event) => updateObjectTypography("wordHighlightMode", event.target.value as Typography["wordHighlightMode"])}><option value="off">Off</option><option value="current-word">Current word</option><option value="read-so-far">Read so far</option></select></label>
              <div className="editor-color-row"><label>Highlight color</label><input aria-label="Highlight color" type="color" value={inspectorTypography.wordHighlightColor} onFocus={onHistoryTransactionStart} onBlur={onHistoryTransactionCommit} onChange={(event) => updateObjectTypography("wordHighlightColor", event.target.value)} /></div>
              <div className="editor-highlight-presets" role="group" aria-label="Highlight color presets">{WORD_HIGHLIGHT_PRESETS.map(([name, color]) => <button key={color} type="button" aria-label={name} title={name} className={inspectorTypography.wordHighlightColor.toUpperCase() === color ? "is-selected" : ""} style={{ backgroundColor: color }} onClick={() => updateObjectTypography("wordHighlightColor", color)} />)}</div>
              <div className="editor-control-row"><label>Highlight intensity <input aria-label="Highlight intensity" type="range" min="0" max="1" step="0.01" value={inspectorTypography.wordHighlightIntensity} onPointerDown={onHistoryTransactionStart} onPointerUp={onHistoryTransactionCommit} onBlur={onHistoryTransactionCommit} onChange={(event) => updateObjectTypography("wordHighlightIntensity", Number(event.target.value))} /></label><output>{Math.round(inspectorTypography.wordHighlightIntensity * 100)}%</output></div>
              <SectionLabel>Alignment & layout</SectionLabel><Segmented label="Arabic alignment" value={inspectorTypography.textAlign} options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]} onChange={(value) => updateObjectTypography("textAlign", value as Typography["textAlign"])} />
              <label className="editor-toggle"><input checked={inspectorTypography.arabicOutlineEnabled} type="checkbox" onChange={(event) => updateObjectTypography("arabicOutlineEnabled", event.target.checked)} /><span />Outline</label>{inspectorTypography.arabicOutlineEnabled && <div className="editor-color-row"><label>Outline color</label><input type="color" value={inspectorTypography.arabicOutlineColor} onFocus={onHistoryTransactionStart} onBlur={onHistoryTransactionCommit} onChange={(event) => updateObjectTypography("arabicOutlineColor", event.target.value)} /></div>}<label className="editor-toggle"><input checked={inspectorTypography.arabicShadowEnabled} type="checkbox" onChange={(event) => updateObjectTypography("arabicShadowEnabled", event.target.checked)} /><span />Shadow</label>
              <div className="editor-control-row"><label>Line spacing <input type="range" min="1" max="2" step="0.05" value={inspectorTypography.arabicLineSpacing} onPointerDown={onHistoryTransactionStart} onPointerUp={onHistoryTransactionCommit} onBlur={onHistoryTransactionCommit} onChange={(event) => updateObjectTypography("arabicLineSpacing", Number(event.target.value))} /></label><output>{inspectorTypography.arabicLineSpacing}</output></div>
            </> : <>
              <SectionLabel>Translation</SectionLabel><select className="editor-select" value={inspectorTypography.translationFontFamily} onChange={(event) => updateObjectTypography("translationFontFamily", event.target.value)}><option>Arial, Helvetica, sans-serif</option><option>Georgia, serif</option><option>Verdana, sans-serif</option></select>
              <div className="editor-control-row"><label>Size <input type="range" min="10" max="48" value={inspectorTypography.translationFontSize} onPointerDown={onHistoryTransactionStart} onPointerUp={onHistoryTransactionCommit} onBlur={onHistoryTransactionCommit} onChange={(event) => updateObjectTypography("translationFontSize", Number(event.target.value))} /></label><output>{inspectorTypography.translationFontSize}px</output></div>
              <div className="editor-control-row"><label>Opacity <input type="range" min="0" max="1" step="0.01" value={inspectorTypography.translationOpacity} onPointerDown={onHistoryTransactionStart} onPointerUp={onHistoryTransactionCommit} onBlur={onHistoryTransactionCommit} onChange={(event) => updateObjectTypography("translationOpacity", Number(event.target.value))} /></label><output>{Math.round(inspectorTypography.translationOpacity * 100)}%</output></div>
              <div className="editor-color-row"><label>Text color</label><input type="color" value={inspectorTypography.translationTextColor} onFocus={onHistoryTransactionStart} onBlur={onHistoryTransactionCommit} onChange={(event) => updateObjectTypography("translationTextColor", event.target.value)} /></div>
              <SectionLabel>Alignment & layout</SectionLabel><Segmented label="Translation alignment" value={inspectorTypography.translationTextAlign} options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]} onChange={(value) => updateObjectTypography("translationTextAlign", value as Typography["translationTextAlign"])} />
              <label className="editor-toggle"><input checked={inspectorTypography.translationOutlineEnabled} type="checkbox" onChange={(event) => updateObjectTypography("translationOutlineEnabled", event.target.checked)} /><span />Outline</label>{inspectorTypography.translationOutlineEnabled && <div className="editor-color-row"><label>Outline color</label><input type="color" value={inspectorTypography.translationOutlineColor} onFocus={onHistoryTransactionStart} onBlur={onHistoryTransactionCommit} onChange={(event) => updateObjectTypography("translationOutlineColor", event.target.value)} /></div>}<label className="editor-toggle"><input checked={inspectorTypography.translationShadowEnabled} type="checkbox" onChange={(event) => updateObjectTypography("translationShadowEnabled", event.target.checked)} /><span />Shadow</label>
              <label className="editor-toggle"><input checked={inspectorTypography.translationVisible} type="checkbox" onChange={(event) => updateObjectTypography("translationVisible", event.target.checked)} /><span />Visible</label>
            </>}
            <div className="editor-divider" /><SectionLabel>Apply to</SectionLabel><Segmented label="Style scope" value={styleScope} options={[["all", "All captions"], ["segment", "This segment"]]} onChange={(value) => onSetStyleScope(value as "all" | "segment")} />
            {selectedHasStyleOverrides && <p className="editor-style-indicator">Custom on this segment · <button className="editor-text-button" type="button" onClick={onResetSelectedObjectStyle}>Use global style</button></p>}
            <SectionLabel>Caption surface</SectionLabel><label className="editor-toggle"><input checked={inspectorBackground.enabled} type="checkbox" onChange={(event) => onBackgroundChange("enabled", event.target.checked)} /><span />Background</label>{inspectorBackground.enabled && <div className="editor-color-row"><label>Surface color</label><input type="color" value={inspectorBackground.color} onChange={(event) => onBackgroundChange("color", event.target.value)} /></div>}
            {selectedLayer === "translation" && !inspectorPositioning.translationPositionLinked && <button className="editor-button editor-button-quiet editor-full-button" type="button" onClick={onAlignTranslation}>Align below Arabic</button>}
            {!selectedHasStyleOverrides && <button className="editor-text-button" type="button" onClick={onResetSelectedObjectStyle}>{styleScope === "segment" ? "Use global style" : `Reset ${objectLabel.toLowerCase()} style`}</button>}
          </> : <div className="editor-inspector-empty"><span className="editor-inspector-glyph">＋</span><h2>Select a subtitle</h2><p>Click Quran or translation text on the canvas, or select a caption in the timeline.</p></div>}

            {selectedSegment && <div className="editor-segment-inspector"><div className="editor-divider" /><SectionLabel>Caption segment</SectionLabel><strong>{captionSegmentLabel(selectedSegment)}</strong><div className="editor-time-readout"><span>In <b>{(selectedSegment.startMs / 1000).toFixed(3)}s</b></span><span>Out <b>{(selectedSegment.endMs / 1000).toFixed(3)}s</b></span></div><p className="editor-muted">Drag the block or either edge to edit timing. Gaps and overlaps are allowed.</p><div className="editor-segment-actions"><select aria-label="Split Quran word boundary" className="editor-select" disabled={selectedSegment.contentKind !== "ayah"} value={splitBoundary} onChange={(event) => onSetSplitBoundary(Number(event.target.value))}>{Array.from({ length: Math.max(0, selectedSegment.arabic.trim().split(/\s+/).length - 1) }, (_, index) => <option key={index + 1} value={index + 1}>After word {index + 1}</option>)}</select><button className="editor-button editor-button-primary" type="button" disabled={selectedSegment.contentKind !== "ayah"} onClick={onSplit}>Split</button><button className="editor-button editor-button-quiet" type="button" disabled={selectedSegment.contentKind !== "ayah" || selectedIndex < 1 || segments[selectedIndex - 1]?.contentKind !== "ayah"} onClick={onMergePrevious}>Merge ←</button><button className="editor-button editor-button-quiet" type="button" disabled={selectedSegment.contentKind !== "ayah" || selectedIndex >= segments.length - 1 || segments[selectedIndex + 1]?.contentKind !== "ayah"} onClick={onMergeNext}>Merge →</button></div>{selectedSegment.contentKind === "ayah" && translationDisplayText(selectedSegment) && <div className="editor-translation-fragment"><SectionLabel>Translation segment</SectionLabel><textarea aria-label="Translation segment" className="editor-input" value={translationDisplayText(selectedSegment) ?? ""} onFocus={onHistoryTransactionStart} onBlur={onHistoryTransactionCommit} onChange={(event) => onTranslationFragmentChange(event.target.value)} /><p className="editor-muted">{selectedSegment.translationSegment?.reviewStatus === "needs-review" ? "Uses the full translation until reviewed." : "Edits affect this display segment only."}</p><button className="editor-text-button" type="button" onClick={onResetTranslationFragment}>Reset translation segment</button></div>}<div className="editor-segment-reset-actions"><button className="editor-text-button" type="button" onClick={onResetTiming}>Reset this timing</button><button className="editor-text-button" type="button" onClick={onResetAllTiming}>Reset all timing</button></div></div>}
          </>}
        </div>
        <div className="editor-sidebar-footer"><button className="editor-text-button" type="button" onClick={onSaveToAccount}>Save to cloud</button><button className="editor-text-button" type="button" onClick={onDiscard}>Discard changes</button></div>
      </aside>
    </div>

    {exportOpen && <div className="editor-modal-backdrop" role="dialog" aria-modal="true" aria-label="Export video"><div className="editor-modal"><div className="editor-modal-heading"><div><SectionLabel>{exportState === "error" ? "Export error" : exportPreflight ? "Export preflight" : "Export video"}</SectionLabel><h2>{exportState === "error" ? "Export couldn't start" : exportPreflight?.status === "blocked" ? "Export needs attention" : exportPreflight ? "Things to review" : "Choose export settings"}</h2></div><button type="button" aria-label="Close export settings" onClick={() => onSetExportOpen(false)}>×</button></div>{exportState === "error" ? <><p className="editor-alert">{exportError}</p><div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" onClick={() => onSetExportOpen(false)}>Cancel</button><button className="editor-button editor-button-accent" type="button" onClick={onExportOpen}>Back to settings</button></div></> : !exportPreflight ? <><div className="editor-export-settings"><SectionLabel>Quality</SectionLabel><div className="editor-export-quality-options" role="radiogroup" aria-label="Export quality">{Object.values(EXPORT_QUALITY_PRESETS).map((preset) => { const available = canExportQuality(accountEntitlements, preset.id); return <div className="editor-export-quality-choice" key={preset.id}><button type="button" role="radio" aria-checked={exportQuality === preset.id} disabled={!available} className={exportQuality === preset.id ? "is-selected" : ""} onClick={() => onSetExportQuality(preset.id)}><strong>{preset.label}</strong><span>{preset.resolutionLabel}</span><small>{available ? (watermarkRequiredForExport(accountEntitlements, preset.id) ? "Watermark included" : preset.id === "standard" ? "Recommended · No watermark" : "Highest quality · No watermark") : preset.id === "standard" ? "Locked · Requires Pro" : "Locked · Requires Premium"}</small></button>{!available && <button className="editor-export-upgrade" type="button" onClick={() => setPlanComparisonOpen(true)}>Upgrade</button>}</div>; })}</div><div className="editor-export-summary"><label>Playback speed<select aria-label="Export playback speed" className="editor-select" value={playbackRate} onChange={(event) => onPlaybackRateChange(Number(event.currentTarget.value) as PlaybackRate)}>{PLAYBACK_RATES.map((rate) => <option key={rate} value={rate}>{playbackRateLabel(rate)}</option>)}</select></label><div><SectionLabel>Project format</SectionLabel><strong>{projectFormat.preset === "vertical" ? "9:16" : projectFormat.preset === "landscape" ? "16:9" : "1:1"}</strong><small>Canvas stays unchanged</small></div><div><SectionLabel>Expected output</SectionLabel><strong>{exportFormat.width} × {exportFormat.height}</strong><small>{watermarkRequiredForExport(accountEntitlements, exportQuality) ? "Watermark included" : "No watermark"}</small></div><div><SectionLabel>Output</SectionLabel><strong>MP4</strong><small>Processed locally</small></div></div></div><div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" onClick={() => onSetExportOpen(false)}>Cancel</button><button className="editor-button editor-button-accent" type="button" onClick={onExport}>Export video</button></div></> : <><div className="editor-export-grid"><div><SectionLabel>Selected version</SectionLabel><strong>{exportQualityPreset(exportQuality).label} · {exportQualityPreset(exportQuality).resolutionLabel}</strong><small>{exportFormat.width} × {exportFormat.height} · {playbackRateLabel(playbackRate)} · {watermarkRequiredForExport(accountEntitlements, exportQuality) ? "Watermark included" : "No watermark"}</small></div><div><SectionLabel>Output</SectionLabel><strong>{outputPlan?.profile?.container.toUpperCase() ?? "MP4"}</strong><small>Processed locally</small></div></div>{exportPreflight.checks.filter((item) => item.severity !== "pass").map((item) => <div className={item.severity === "blocking" ? "editor-notice editor-notice-error" : "editor-platform-warning"} key={`${item.id}:${item.affectedSegmentId ?? "project"}`}><strong>{item.severity === "blocking" ? "✕" : "⚠"} {item.title}</strong><span>{item.message}</span>{item.action && <button className="editor-button editor-button-quiet" type="button" onClick={() => onExportPreflightAction(item.action!, item.affectedSegmentId)}>{item.action === "move-to-safe-area" ? "Move to safe area" : item.action === "relink-source" ? "Relink source" : "Review"}</button>}</div>)}<div className="editor-modal-actions"><button className="editor-button editor-button-quiet" type="button" disabled={Boolean(exportState && typeof exportState === "object")} onClick={onExportOpen}>Back to settings</button>{exportPreflight.status === "warnings" && <button className="editor-button editor-button-accent" type="button" disabled={Boolean(exportState && typeof exportState === "object")} onClick={onExport}>Export anyway</button>}</div></>}{exportState && typeof exportState === "object" && <button className="editor-button editor-button-quiet" type="button" onClick={onCancelExport}>Cancel</button>}{exportDiagnostics && <details className="editor-diagnostics"><summary>Export diagnostics</summary><p>{exportDiagnostics.outputContainer} · {exportDiagnostics.renderedFrameCount} frames · {exportDiagnostics.effectiveRenderingFps.toFixed(1)} fps · {playbackRateLabel(playbackRate)}</p></details>}</div></div>}
    {planComparisonOpen && <PlanComparisonDialog entitlements={accountEntitlements} session={session} billingReturn={billingReturn} onEntitlementsRefresh={onRefreshEntitlements} onClose={() => { setPlanComparisonOpen(false); setBillingReturn(null); }} />}
  </div>;
}
