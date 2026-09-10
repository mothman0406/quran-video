"use client";

/* The cancellation controller is intentionally an imperative job handle; UI rendering uses exportActive state. */
import {
  ChangeEvent,
  PointerEvent,
  SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { analyzeTranscript, canonicalSpanFromFastConformerIdentification, createPrimaryTranscript, hafsSurahs, hafsVerses } from "@/lib/recognition/core";
import { FASTCONFORMER_MODEL, FASTCONFORMER_MODEL_ARTIFACT, FASTCONFORMER_MODEL_BYTES, FASTCONFORMER_MODEL_LICENSE, FASTCONFORMER_RUNTIME, type FastConformerProgress } from "@/lib/recognition/contracts";
import { comparePassageIdentification } from "@/lib/recognition/fastconformer-identification";
import { decideFastConformerPassage } from "@/lib/recognition/passage-decision";
import {
  CaptionGenerationProgressController,
  captionGenerationProgressForDownload,
  type CaptionGenerationProgress,
} from "@/lib/editor/caption-generation-progress";
import {
  recognitionToVerseAlignments,
  AutomaticRecognitionController,
  type VerseAlignment,
} from "@/lib/editor/recognition";
import {
  clampCaptionPositioning,
  createCaptionSegments,
  createCaptionSegmentsFromVerseBoundaries,
  generatedCaptionBoundaryTrace,
  DEFAULT_CAPTION_BACKGROUND,
  DEFAULT_CAPTION_PRESENTATION,
  DEFAULT_TRANSITION_SETTINGS,
  DEFAULT_TYPOGRAPHY,
  getActiveCaptionSegment,
  mergeCaptionWithNext,
  mergeCaptionWithPrevious,
  resetCaptionPositioning,
  resetCaptionTranslationSegment,
  resolveCaptionTranslationSegments,
  resetAllCaptionSegmentTiming,
  resetCaptionSegmentTiming,
  resetTypography as resetTypographyDefaults,
  resizeCaptionBoundary,
  resizeCaptionWidth,
  splitCaptionSegment,
  updateCaptionTranslationSegment,
  updateCaptionPosition,
  updateCaptionSegmentTiming,
  type CaptionBackground,
  type CaptionPositioning,
  type CaptionSegment,
  type TransitionSettings,
  type Typography,
} from "@/lib/editor/captions";
import {
  DEFAULT_PROJECT_FORMAT,
  PROJECT_FORMATS,
  projectFormatForSourceDimensions,
  projectFormatDefinition,
} from "@/lib/editor/formats";
import type { ProjectFormat, ProjectFormatPreset } from "@/lib/schemas/project";
import type { Project, ProjectAsset, SavedProject } from "@/lib/schemas/project";
import {
  createProjectRepository,
  verifySourceFile,
  type ProjectRepository,
} from "@/lib/project-storage";
import {
  BUILT_IN_STYLES,
  captionStyleFromState,
  captionStyleToState,
  loadLocalStyles,
  saveLocalStyle,
  clearCaptionLayerStyleOverrides,
  hasCaptionLayerStyleOverrides,
  patchCaptionLayerStyleOverrides,
  resolveCaptionLayerStyle,
  type BuiltInStyleName,
  type CaptionStyle,
  type CaptionLayer,
  type LocalCaptionStyle,
} from "@/lib/editor/styles";
import { quranFontDefinitions } from "@/lib/quran/content";
import { getVerses } from "@/lib/quran/local";
import type { QuranContentResponse } from "@/lib/quran/content";
import type { QuranTranslation } from "@/lib/quran/translations";
import { localTranscriptionSupport } from "@/lib/recognition/support";
import { type CaptionObject, type CaptionResizeEdge } from "@/components/caption-preview";
import EditorWorkspace from "@/components/editor-workspace";
import {
  basmalahDiagnosticsEnabled,
  createBasmalahDiagnostic,
  shouldShowBasmalahDiagnostics,
  type BasmalahDiagnosticsPrelude,
} from "@/lib/editor/basmalah-diagnostics";
import { snapshotLocalExportConfiguration } from "@/lib/export/config";
import { offlineWebCodecsSupport } from "@/lib/export/support";
import {
  DEFAULT_EXPORT_QUALITY,
  exportFormatForQuality,
  type ExportQuality,
} from "@/lib/export/quality";
import { ExportCoordinator, ExportPreflightOverride, localExportFailureMessage } from "@/lib/export/lifecycle";
import { validateLocalExportInputs } from "@/lib/export/validation";
import { runExportPreflight, type ExportPreflightAction, type ExportPreflightResult } from "@/lib/export/preflight";
import type {
  ExportPhase,
  CompletedExport,
  LocalExportDiagnostics,
  LocalExportConfiguration,
} from "@/lib/export/types";
import type { OutputProfile } from "@/lib/export/output";
import {
  beginCloudProjectSave,
  cancelCloudProjectSave,
  cleanupReplacedCloudMedia,
  completeCloudProjectSave,
  createProjectThumbnail,
  deleteCloudProject,
  downloadCloudProjectSource,
  getAuthSession,
  getCloudProject,
  getCloudProjectRecord,
  getSupabaseClient,
  listCloudProjects,
  newCloudSourcePath,
  newCloudThumbnailPath,
  removePrivateProjectObjects,
  uploadPrivateProjectObject,
  cloudProjectError,
  type CloudSaveStage,
  type CloudProjectRecord,
} from "@/lib/cloud-sync";
import { exportAuthIntent, rememberAuthContinuation, rememberAuthResumeProject, takeAuthContinuation, takeAuthResumeProject } from "@/lib/auth-flow";
import type { Session } from "@supabase/supabase-js";
import { accountEntitlementsForPlan, canExportQuality, defaultExportQualityForPlan, getCustomStyleLimit, isBuiltInStyleAvailable, isFontAvailable, type AccountEntitlements, type ExportAuthorization } from "@/lib/entitlements";
import { authorizeAccountExport, getAccountEntitlements } from "@/lib/entitlements/client";
import { DEV_BUILD_VERSION } from "@/lib/build-info";
import { clampMediaTrim, clampTimelineViewport, createMediaTrim, createTimelineViewport, mediaKindForFile, mediaSourceFromFile, panTimelineViewport, pinchTimelineViewport, playbackStartForMediaTrim, projectDurationMs, resizeMediaTrim, snapCaptionBoundaryToPlayhead, timelineContentPosition, viewportPositionToTime, zoomTimelineViewport, type MediaSource, type MediaTrim, type TimelineViewport } from "@/lib/editor/media";
import { MediaPlaybackClock } from "@/lib/editor/playback-clock";
import { waveformPeaksFromPcm, type WaveformData } from "@/lib/editor/waveform";
import { projectAssetFromMediaSource } from "@/lib/editor/project-assets";
import { clearCaptionSelection, rightInspectorModeForSelection, selectCaptionLayer, selectTimelineCaption, type CaptionSelection, type RightInspectorMode } from "@/lib/editor/selection";
import { EditorHistory } from "@/lib/editor/history";
import { DEFAULT_SOCIAL_PLATFORM_PREVIEW, moveRectToSafeArea, platformCaptionCollisions, socialPlatformGuide, type CaptionCanvasBounds, type SocialPlatformId } from "@/lib/editor/social-platform-guides";
import { applyPlaybackRate, DEFAULT_PLAYBACK_RATE, resolvePlaybackRate, type PlaybackRate } from "@/lib/editor/playback-rate";
import { createTikTokCaption } from "@/lib/tiktok/caption";
import { cloudProjectName, quranProjectMetadata } from "@/lib/cloud-projects";
import { beginTimelineScrub, endTimelineScrub, isActiveTimelineScrubMove, type TimelineScrubSession } from "@/lib/editor/timeline-scrub";

type VideoMetadata = { durationSeconds: number; width: number; height: number };
type Stage =
  | "idle"
  | "preparing"
  | "detecting-speech"
  | "loading-model"
  | "transcribing"
  | "matching"
  | "captions"
  | "complete"
  | "error";
type ExportState =
  | {
      phase: ExportPhase;
      fraction: number;
      elapsedSeconds: number;
      estimatedRemainingSeconds?: number;
    }
  | "complete"
  | "error"
  | null;
type YouTubeImportStatus = "idle" | "validating" | "fetching-metadata" | "downloading" | "preparing-media" | "ready" | "failed";
type YouTubeImportResponse = { sessionId: string; sourceUrl: string; fileName: string; mimeType: string; title?: string; durationMs?: number; width?: number; height?: number; hasVideo: boolean; mediaUrl: string };
type AutomaticRecognitionRequest = { identity: string; file: File; sourceUrl: string | null; restoredCompletedRecognition: boolean };
type EditorProjectHistoryState = {
  segments: CaptionSegment[];
  mediaTrim: MediaTrim;
  typography: Typography;
  captionBackground: CaptionBackground;
  projectFormat: ProjectFormat;
  positioning: CaptionPositioning;
  transitionSettings: TransitionSettings;
  playbackRate: PlaybackRate;
  showVerseNumber: boolean;
};

type AuthorizedExportRequest = {
  source: File;
  configuration: LocalExportConfiguration;
  preflight: ExportPreflightResult;
  authorization: Extract<ExportAuthorization, { allowed: true }>;
  activeMediaAssetId: string | null;
};

function sameEditorProjectHistoryState(left: EditorProjectHistoryState, right: EditorProjectHistoryState) {
  return JSON.stringify(left) === JSON.stringify(right);
}
function validateYouTubeImportUrl(value: string): boolean {
  if (/[^\x20-\x7e]/.test(value) || /[\r\n]/.test(value)) return false;
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (!(["youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"].includes(host)) || !["https:", "http:"].includes(parsed.protocol)) return false;
    return host === "youtu.be" ? parsed.pathname.length > 1 : parsed.pathname === "/watch" ? Boolean(parsed.searchParams.get("v")) : /^\/(shorts|live|embed)\/[^/]+/.test(parsed.pathname);
  } catch {
    return false;
  }
}
const busyStages: Stage[] = [
  "preparing",
  "detecting-speech",
  "loading-model",
  "transcribing",
  "matching",
  "captions",
];

function recognitionStageLabel(stage: Stage) {
  switch (stage) {
    case "preparing": return "Preparing audio";
    case "detecting-speech": return "Analyzing recitation";
    case "loading-model": return "Preparing recognition";
    case "transcribing": return "Analyzing recitation";
    case "matching": return "Identifying Quran passage";
    case "captions": return "Preparing captions";
    case "complete": return "Captions ready";
    case "error": return "Recognition needs attention";
    default: return "Ready to recognize";
  }
}

function publishAlignmentDebug(value: unknown) {
  if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
    Object.defineProperty(window, "__QURAN_ALIGNMENT_DEBUG__", { value, configurable: true });
  }
}

type AlignmentDebug = {
  transitions?: Array<{
    previousVerseKey: string;
    nextVerseKey: string;
    selectedTransitionMs: number;
    candidateNextAyahEvidence: Array<{ timestampMs: number }>;
  }>;
  [key: string]: unknown;
};

export default function Home() {
  const youtubeImportAvailable = process.env.NODE_ENV !== "production";
  const basmalahDiagnosticCaptureEnabled = typeof window !== "undefined" && basmalahDiagnosticsEnabled(window.location.search);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(
    null,
  );
  const [mediaSource, setMediaSource] = useState<MediaSource | null>(null);
  const [projectAssets, setProjectAssets] = useState<ProjectAsset[]>([]);
  const [activeMediaAssetId, setActiveMediaAssetId] = useState<string | null>(null);
  const [mediaTrim, setMediaTrim] = useState<MediaTrim>(createMediaTrim(0));
  const [stage, setStage] = useState<Stage>("idle");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- consumed by JSX below; this ESLint setup does not mark JSX expressions as references.
  const recognitionStatusLabel = recognitionStageLabel(stage);
  const [progress, setProgress] = useState<CaptionGenerationProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timingWarning, setTimingWarning] = useState<string | null>(null);
  const [support, setSupport] = useState<{
    supported: boolean;
    reason: string;
  } | null>(null);
  const [alignments, setAlignments] = useState<VerseAlignment[]>([]);
  const [content, setContent] = useState<Record<string, QuranContentResponse>>(
    {},
  );
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [timelineTooltip, setTimelineTooltip] = useState<{ label: string; position: number } | null>(null);
  const [timelineViewport, setTimelineViewport] = useState<TimelineViewport>({ zoom: 1, visibleStartMs: 0, visibleEndMs: 0 });
  const [waveformData, setWaveformData] = useState<WaveformData | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [youtubeMode, setYoutubeMode] = useState<"video" | "audio">("video");
  const [youtubeImportStatus, setYoutubeImportStatus] = useState<YouTubeImportStatus>("idle");
  const [youtubeImportError, setYoutubeImportError] = useState<string | null>(null);
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    null,
  );
  const [selectedObject, setSelectedObject] = useState<CaptionObject | null>(null);
  const [rightInspectorMode, setRightInspectorMode] = useState<RightInspectorMode>("settings");
  const [styleScope, setStyleScope] = useState<"all" | "segment">("all");
  const [splitBoundary, setSplitBoundary] = useState(1);
  const [typography, setTypography] = useState<Typography>(DEFAULT_TYPOGRAPHY);
  const [captionBackground, setCaptionBackground] = useState<CaptionBackground>(
    DEFAULT_CAPTION_BACKGROUND,
  );
  const [projectFormat, setProjectFormat] = useState<ProjectFormat>(
    DEFAULT_PROJECT_FORMAT,
  );
  const [projectFormatExplicitlyChosen, setProjectFormatExplicitlyChosen] = useState(false);
  const [positioning, setPositioning] = useState<CaptionPositioning>(
    resetCaptionPositioning(DEFAULT_PROJECT_FORMAT),
  );
  const [transitionSettings, setTransitionSettings] =
    useState<TransitionSettings>(DEFAULT_TRANSITION_SETTINGS);
  const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(DEFAULT_PLAYBACK_RATE);
  const [showVerseNumber, setShowVerseNumber] = useState(
    DEFAULT_CAPTION_PRESENTATION.showVerseNumber,
  );
  const [localStyles, setLocalStyles] = useState<LocalCaptionStyle[]>([]);
  const [localStyleName, setLocalStyleName] = useState("My Style");
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [platformPreview, setPlatformPreview] = useState<SocialPlatformId>(DEFAULT_SOCIAL_PLATFORM_PREVIEW);
  const [captionCanvasBounds, setCaptionCanvasBounds] = useState<CaptionCanvasBounds[]>([]);
  const [showCorrection, setShowCorrection] = useState(false);
  const [exportState, setExportState] = useState<ExportState>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDiagnostics, setExportDiagnostics] =
    useState<LocalExportDiagnostics | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authRestoreReady, setAuthRestoreReady] = useState(false);
  const [cloudSaveOpen, setCloudSaveOpen] = useState(false);
  const [cloudSaveName, setCloudSaveName] = useState("");
  const [cloudSaveStatus, setCloudSaveStatus] = useState<string | null>(null);
  const [exportPreflight, setExportPreflight] = useState<ExportPreflightResult | null>(null);
  const [exportQuality, setExportQuality] = useState<ExportQuality>(
    DEFAULT_EXPORT_QUALITY,
  );
  const [outputPlan, setOutputPlan] = useState<{
    sourceHasAudio: boolean;
    profile: OutputProfile | null;
  } | null>(null);
  const [exportResult, setExportResult] = useState<CompletedExport | null>(
    null,
  );
  const [exportActive, setExportActive] = useState(false);
  const [surah, setSurah] = useState(93);
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(5);
  const [projectName, setProjectName] = useState("Untitled project");
  const [savedProject, setSavedProject] = useState<SavedProject | null>(null);
  const [cloudProjectId, setCloudProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [localRepositoryReady, setLocalRepositoryReady] = useState(false);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [cloudProjects, setCloudProjects] = useState<SavedProject[]>([]);
  const [cloudProjectsOpen, setCloudProjectsOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [accountEntitlements, setAccountEntitlements] = useState<AccountEntitlements>(() => accountEntitlementsForPlan("free"));
  const [pendingOpenProject, setPendingOpenProject] =
    useState<SavedProject | null>(null);
  const [cloudSourceRestoreRetry, setCloudSourceRestoreRetry] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [automaticRecognitionRequest, setAutomaticRecognitionRequest] = useState<AutomaticRecognitionRequest | null>(null);
  const plan = accountEntitlements.plan;
  const repository = useRef<ProjectRepository | null>(null);
  const savedSignature = useRef<string | null>(null);
  const cloudBaselineUpdatedAt = useRef<string | null>(null);
  const cloudMedia = useRef<{ sourcePath: string | null; thumbnailPath: string | null; thumbnailSize: number | null; sourceFingerprint: string | null }>({ sourcePath: null, thumbnailPath: null, thumbnailSize: null, sourceFingerprint: null });
  const cloudProjectLoadStarted = useRef(false);
  const pendingCloudSourceRestore = useRef<CloudProjectRecord | null>(null);
  const localSafetyProjectId = useRef<string | null>(null);
  const generation = useRef(0);
  const automaticRecognition = useRef(new AutomaticRecognitionController());
  const captionProgress = useRef(new CaptionGenerationProgressController());
  const alignmentDebug = useRef<AlignmentDebug | null>(null);
  const basmalahDiagnosticsPrelude = useRef<BasmalahDiagnosticsPrelude | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const canvasInteraction = useRef<{
    kind: CaptionObject;
    mode: "drag" | "resize";
    edge?: CaptionResizeEdge;
    pointerX: number;
    pointerY: number;
    positioning: CaptionPositioning;
  } | null>(null);
  const draggingEdge = useRef<"start" | "end" | null>(null);
  const draggingMediaTrim = useRef<"start" | "end" | null>(null);
  const playheadScrub = useRef<TimelineScrubSession | null>(null);
  const timelinePointerCapture = useRef<{ pointerId: number; target: HTMLElement } | null>(null);
  const timelineCleanup = useRef<() => void>(() => undefined);
  const timelineInteraction = useRef<{
    id: string;
    mode: "start" | "end" | "body";
    pointerStartMs: number;
    initialStartMs: number;
    initialEndMs: number;
  } | null>(null);
  const mediaTrimInteraction = useRef<{ edge: "start" | "end" } | null>(null);
  const mediaTrimRef = useRef(mediaTrim);
  const waveformGeneration = useRef(0);
  const exportAbort = useRef<AbortController | null>(null);
  const completedExport = useRef<CompletedExport | null>(null);
  const exportStarting = useRef(false);
  const youtubeImportAbort = useRef<AbortController | null>(null);
  const youtubeImportSession = useRef<string | null>(null);
  const assetFiles = useRef(new Map<string, { file: File; source: MediaSource }>());
  const assetYouTubeSessions = useRef(new Map<string, string>());
  const exportCoordinator = useRef(new ExportCoordinator());
  const exportPreflightOverride = useRef(new ExportPreflightOverride<AuthorizedExportRequest>());
  const playbackClock = useRef<MediaPlaybackClock | null>(null);
  const projectHistory = useRef(new EditorHistory<EditorProjectHistoryState>(sameEditorProjectHistoryState));
  const [, setHistoryVersion] = useState(0);
  const projectHistoryStateRef = useRef<EditorProjectHistoryState>({
    segments,
    mediaTrim,
    typography,
    captionBackground,
    projectFormat,
    positioning,
    transitionSettings,
    playbackRate,
    showVerseNumber,
  });
  function clearCompletedExport() {
    const previous = completedExport.current;
    if (previous) URL.revokeObjectURL(previous.objectUrl);
    completedExport.current = null;
    setExportResult(null);
  }
  function replaceCompletedExport(next: CompletedExport) {
    const previous = completedExport.current;
    if (previous) URL.revokeObjectURL(previous.objectUrl);
    completedExport.current = next;
    setExportResult(next);
  }
  projectHistoryStateRef.current = {
    segments,
    mediaTrim,
    typography,
    captionBackground,
    projectFormat,
    positioning,
    transitionSettings,
    playbackRate,
    showVerseNumber,
  };

  function applyProjectHistoryState(next: EditorProjectHistoryState) {
    projectHistoryStateRef.current = next;
    mediaTrimRef.current = next.mediaTrim;
    setSegments(next.segments);
    setMediaTrim(next.mediaTrim);
    setTypography(next.typography);
    setCaptionBackground(next.captionBackground);
    setProjectFormat(next.projectFormat);
    setPositioning(next.positioning);
    setTransitionSettings(next.transitionSettings);
    setPlaybackRate(next.playbackRate);
    setShowVerseNumber(next.showVerseNumber);
  }
  function updateProjectHistory(
    updater: (current: EditorProjectHistoryState) => EditorProjectHistoryState,
    transactional = false,
  ) {
    const previous = projectHistoryStateRef.current;
    const next = updater(previous);
    applyProjectHistoryState(next);
    if (!transactional && !projectHistory.current.snapshot().transactionOpen && projectHistory.current.record(previous, next)) setHistoryVersion((value) => value + 1);
  }
  function beginProjectHistoryTransaction() {
    projectHistory.current.begin(projectHistoryStateRef.current);
  }
  function commitProjectHistoryTransaction() {
    if (projectHistory.current.commit(projectHistoryStateRef.current)) setHistoryVersion((value) => value + 1);
  }
  function resetProjectHistory() {
    projectHistory.current.reset();
    setHistoryVersion((value) => value + 1);
  }
  function undoProjectHistory() {
    const previous = projectHistory.current.undo(projectHistoryStateRef.current);
    if (!previous) return;
    applyProjectHistoryState(previous);
    setHistoryVersion((value) => value + 1);
    setSelectedSegmentId((selected) => previous.segments.some((segment) => segment.id === selected) ? selected : previous.segments[0]?.id ?? null);
  }
  function redoProjectHistory() {
    const next = projectHistory.current.redo(projectHistoryStateRef.current);
    if (!next) return;
    applyProjectHistoryState(next);
    setHistoryVersion((value) => value + 1);
    setSelectedSegmentId((selected) => next.segments.some((segment) => segment.id === selected) ? selected : next.segments[0]?.id ?? null);
  }

  useEffect(() => {
    const clock = new MediaPlaybackClock({
      onSample: (timeMs) => {
        const trim = mediaTrimRef.current;
        const media = videoRef.current;
        if (media && !media.paused && trim.endMs > trim.startMs && timeMs >= trim.endMs) {
          media.currentTime = trim.endMs / 1_000;
          media.pause();
          setCurrentTimeMs(trim.endMs);
          return;
        }
        setCurrentTimeMs((current) => current === timeMs ? current : timeMs);
      },
    });
    playbackClock.current = clock;
    return () => {
      clock.dispose();
      if (playbackClock.current === clock) playbackClock.current = null;
    };
  }, []);

  useEffect(() => {
    mediaTrimRef.current = mediaTrim;
  }, [mediaTrim]);

  useEffect(() => {
    playbackClock.current?.setMedia(videoUrl ? videoRef.current : null);
  }, [videoUrl]);

  useEffect(() => {
    const media = videoRef.current;
    if (!media) return;
    // HTML media currentTime remains source time at every presentation rate.
    applyPlaybackRate(media, playbackRate);
  }, [playbackRate, videoUrl]);

  useEffect(() => {
    const durationMs = projectDurationMs(mediaSource);
    if (!durationMs || draggingEdge.current || draggingMediaTrim.current || playheadScrub.current || videoRef.current?.paused) return;
    setTimelineViewport((current) => {
      const viewport = clampTimelineViewport(current, durationMs);
      const windowMs = viewport.visibleEndMs - viewport.visibleStartMs;
      if (!windowMs || (currentTimeMs >= viewport.visibleStartMs && currentTimeMs <= viewport.visibleStartMs + windowMs * .85)) return viewport;
      return panTimelineViewport(viewport, durationMs, currentTimeMs - windowMs * .6);
    });
  }, [currentTimeMs, mediaSource]);

  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setSupport(localTranscriptionSupport()),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() =>
      setLocalStyles(loadLocalStyles()),
    );
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        repository.current = createProjectRepository();
        void repository.current
          .list()
          .then(async (localProjects) => {
            setProjects(localProjects);
            const resumeProjectId = takeAuthResumeProject();
            const resumeProject = resumeProjectId ? localProjects.find((project) => project.id === resumeProjectId) : null;
            if (resumeProject) await openProject(resumeProject, false);
          })
          .catch((error: unknown) =>
            setErrorMessage(
              error instanceof Error
                ? error.message
                : "Local project storage is unavailable.",
            ),
          ).finally(() => { setLocalRepositoryReady(true); setAuthRestoreReady(true); });
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Local project storage is unavailable.",
        );
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const handleSessionChange = useCallback((next: Session | null) => {
    setSession(next);
    if (!next) {
      setCloudProjects([]);
      setAccountEntitlements(accountEntitlementsForPlan("free"));
      return;
    }
    void getAccountEntitlements(next)
      .then((entitlements) => {
        setAccountEntitlements(entitlements);
        setExportQuality((current) => canExportQuality(entitlements, current) ? current : defaultExportQualityForPlan(entitlements.plan));
      })
      .catch(() => setAccountEntitlements(accountEntitlementsForPlan("free")));
    void listCloudProjects()
      .then(setCloudProjects)
      .catch((error: unknown) =>
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Could not list cloud projects.",
        ),
      );
  }, []);
  useEffect(() => {
    const supabase = getSupabaseClient();
    if (!supabase) return;
    let active = true;
    void getAuthSession().then((next) => { if (active) handleSessionChange(next); }).catch((error: unknown) => {
      if (active) setErrorMessage(error instanceof Error ? error.message : "Could not read account session.");
    });
    const subscription = supabase.auth.onAuthStateChange((_event, next) => handleSessionChange(next));
    return () => { active = false; subscription.data.subscription.unsubscribe(); };
  }, [handleSessionChange]);
  useEffect(() => {
    if (!authRestoreReady || !session) return;
    const continuation = takeAuthContinuation();
    if (!continuation) return;
    const frame = requestAnimationFrame(() => {
      setAuthOpen(false);
      if (continuation === "export") openExportSettings();
      else {
        setCloudSaveName(projectName || "Untitled Quran Project");
        setCloudSaveOpen(true);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [authRestoreReady, projectName, session]);
  useEffect(() => {
    if (!authRestoreReady || !session || cloudProjectLoadStarted.current) return;
    const projectId = new URLSearchParams(window.location.search).get("project");
    if (!projectId) return;
    cloudProjectLoadStarted.current = true;
    void (async () => {
      try {
        const record = await getCloudProjectRecord(projectId);
        if (!record) throw new Error("This cloud project was not found or is not available to your account.");
        if (!(await openProject(record.project, true))) return;
        setCloudProjectId(record.row.id);
        cloudMedia.current = { sourcePath: record.row.source_media_path, thumbnailPath: record.row.thumbnail_path, thumbnailSize: record.row.thumbnail_size_bytes, sourceFingerprint: record.project.sourceMedia?.fingerprint ?? null };
        pendingCloudSourceRestore.current = record;
        await restoreCloudProjectSource(record);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "We couldn't load this cloud project.");
      }
    })();
  }, [authRestoreReady, session]);
  useEffect(
    () => () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );
  useEffect(() => () => {
    exportAbort.current?.abort();
    youtubeImportAbort.current?.abort();
    const previous = completedExport.current;
    if (previous) URL.revokeObjectURL(previous.objectUrl);
    for (const sessionId of assetYouTubeSessions.current.values()) {
      void fetch(`/api/local-youtube-import?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" });
    }
  }, []);
  useEffect(() => {
    const font = quranFontDefinitions[typography.quranStyle];
    const style = document.createElement("style");
    style.textContent = `@font-face { font-family: "${font.family}"; src: url("${font.source}") format("woff2"); font-display: swap; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [typography.quranStyle]);
  const editorSignature = JSON.stringify({
    projectName,
    sourceMedia: videoFile ? mediaSource : (savedProject?.sourceMedia ?? null),
    projectAssets,
    activeMediaAssetId,
    mediaTrim,
    format: projectFormat,
    verseAlignments: alignments,
    captionSegments: segments,
    captions: {
      translationVisible: typography.translationVisible,
      translationEdition: "english_saheeh",
    },
    positioning,
    captionBackground,
    typography,
    transitionSettings,
    playbackRate,
    showVerseNumber,
  });
  const currentExportFingerprint = JSON.stringify({
    source: videoFile ? { name: videoFile.name, size: videoFile.size, lastModified: videoFile.lastModified } : null,
    activeMediaAssetId,
    mediaTrim,
    projectFormat,
    segments,
    typography,
    captionBackground,
    positioning,
    transitionSettings,
    showVerseNumber,
    playbackRate,
    exportQuality,
  });
  useEffect(() => {
    setDirty(
      savedSignature.current === null
        ? Boolean(videoFile || alignments.length || segments.length)
        : editorSignature !== savedSignature.current,
    );
  }, [editorSignature, videoFile, alignments.length, segments.length]);
  // IndexedDB remains a background safety checkpoint; it intentionally never changes cloud-sync state.
  useEffect(() => {
    if (!localRepositoryReady || !repository.current || !(videoFile || alignments.length || segments.length)) return;
    const timer = window.setTimeout(() => {
      const now = new Date().toISOString();
      const id = savedProject?.id ?? localSafetyProjectId.current ?? crypto.randomUUID();
      localSafetyProjectId.current = id;
      const checkpoint = projectSnapshot(id, projectName || "Untitled project", savedProject?.createdAt ?? now);
      void repository.current?.put(checkpoint).then(async () => {
        setSavedProject((current) => current?.id === checkpoint.id ? current : checkpoint);
        setProjects(await repository.current!.list());
      }).catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [alignments.length, editorSignature, localRepositoryReady, projectName, savedProject?.createdAt, savedProject?.id, segments.length, videoFile]);
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function loadCanonical(keys: string[], job: number) {
    const verses = keys.length ? getVerses(keys[0], keys.at(-1)) : [];
    if (job === generation.current)
      setContent(
        Object.fromEntries(
          verses.map((verse) => [
            verse.verseKey,
            { status: "ready", verse } satisfies QuranContentResponse,
          ]),
        ),
      );
  }
  async function loadTranslations(keys: string[], job: number) {
    if (!keys.length) return;
    try {
      const params = new URLSearchParams();
      keys.forEach((key) => params.append("key", key));
      const response = await fetch(`/api/quran/verse?${params.toString()}`);
      if (!response.ok) return;
      const payload = (await response.json()) as {
        translations?: Record<string, QuranTranslation | null>;
      };
      if (job !== generation.current || !payload.translations) return;
      setContent((current) =>
        Object.fromEntries(
          Object.entries(current).map(([key, item]) => {
            const translation = payload.translations?.[key];
            if (item.status !== "ready" || !translation) return [key, item];
            return [
              key,
              {
                ...item,
                verse: {
                  ...item.verse,
                  translation: translation.text,
                  translationMetadata: translation.metadata,
                },
              },
            ];
          }),
        ),
      );
      setSegments((current) =>
        resolveCaptionTranslationSegments(current.map((segment) => {
          const translation =
            segment.verseKeys
              .map((key) => payload.translations?.[key]?.text ?? null)
              .find(Boolean) ?? null;
          return translation ? { ...segment, translation } : segment;
        })),
      );
    } catch {
      /* Arabic remains available when translation enrichment fails. */
    }
  }
  function releaseYouTubeImport(sessionId: string | null | undefined) {
    if (!sessionId) return;
    if (youtubeImportSession.current === sessionId) youtubeImportSession.current = null;
    void fetch(`/api/local-youtube-import?sessionId=${encodeURIComponent(sessionId)}`, { method: "DELETE" }).catch(() => undefined);
  }
  function loadSelectedSource(next: File, nextSource: MediaSource, options?: { preserveCaptions?: boolean; restoredCompletedRecognition?: boolean }) {
    exportAbort.current?.abort();
    clearCompletedExport();
    generation.current += 1;
    captionProgress.current.reset();
    const waveformJob = ++waveformGeneration.current;
    setWaveformData(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const opening = pendingOpenProject;
    setVideoFile(next);
    const nextUrl = URL.createObjectURL(next);
    setVideoUrl(nextUrl);
    setMediaSource(nextSource);
    setMediaTrim(opening?.mediaTrim ?? (options?.preserveCaptions ? mediaTrim : createMediaTrim(projectDurationMs(nextSource))));
    setTimelineViewport(createTimelineViewport(projectDurationMs(nextSource)));
    void loadWaveform(next, waveformJob);
    setVideoMetadata(null);
    setErrorMessage(opening ? `Reselect source media: ${opening.sourceMedia?.fileName ?? next.name}` : null);
    setShowCorrection(false);
    setStage("idle");
    setProgress(null);
    setAutomaticRecognitionRequest({
      identity: `${nextSource.assetId ?? "source"}:${nextSource.fingerprint ?? `${next.name}:${next.size}:${next.type}`}:${next.lastModified}`,
      file: next,
      sourceUrl: nextUrl,
      restoredCompletedRecognition: options?.restoredCompletedRecognition ?? Boolean((options?.preserveCaptions || opening) && (opening?.captionSegments.length || segments.length)),
    });
    if (!opening && !options?.preserveCaptions) {
      resetProjectHistory();
      setAlignments([]);
      setSegments([]);
      basmalahDiagnosticsPrelude.current = null;
      setContent({});
      setCurrentTimeMs(0);
      setPositioning(resetCaptionPositioning(projectFormat));
      setExportState(null);
      setExportError(null);
      setExportDiagnostics(null);
    }
  }
  function cloudSourceRestoreMessage(status: Exclude<Awaited<ReturnType<typeof downloadCloudProjectSource>>["status"], "ready">, code?: string | null): string {
    const message = status === "no-saved-source"
      ? "This project doesn't have a saved source file. Relink the original media to continue."
      : status === "missing"
        ? "This project's saved source file is no longer available. Relink the original media to continue."
        : status === "access-denied"
          ? "Saved source media could not be accessed."
          : "We couldn't load the saved source media. Try again.";
    return process.env.NODE_ENV !== "production" && status !== "no-saved-source"
      ? `${message} [stage: source-restore${code ? `; code: ${code}` : ""}; path: ${status}]`
      : message;
  }
  async function restoreCloudProjectSource(record: CloudProjectRecord) {
    setCloudSourceRestoreRetry(false);
    const restored = await downloadCloudProjectSource(record.row);
    if (restored.status !== "ready") {
      setCloudSourceRestoreRetry(restored.status === "access-denied" || restored.status === "fetch-failed");
      setErrorMessage(cloudSourceRestoreMessage(restored.status, "code" in restored ? restored.code : null));
      return;
    }
    setPendingOpenProject(null);
    setErrorMessage(null);
    loadSelectedSource(restored.file, record.project.sourceMedia ?? mediaSourceFromFile(restored.file, record.row.source_media_type?.startsWith("audio/") ? "audio" : "video"), { preserveCaptions: true, restoredCompletedRecognition: record.project.captionSegments.length > 0 });
  }
  function retryCloudSourceRestore() {
    const record = pendingCloudSourceRestore.current;
    if (record) void restoreCloudProjectSource(record);
  }
  function resetEditorState() {
    exportAbort.current?.abort();
    clearCompletedExport();
    setProjectFormatExplicitlyChosen(false);
    generation.current += 1;
    captionProgress.current.reset();
    waveformGeneration.current += 1;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    for (const sessionId of assetYouTubeSessions.current.values()) releaseYouTubeImport(sessionId);
    assetYouTubeSessions.current.clear();
    assetFiles.current.clear();
    setYoutubeImportStatus("idle");
    setYoutubeImportError(null);
    setVideoFile(null);
    setVideoUrl(null);
    setVideoMetadata(null);
    setMediaSource(null);
    setProjectAssets([]);
    setActiveMediaAssetId(null);
    setMediaTrim(createMediaTrim(0));
    setAlignments([]);
    setSegments([]);
    basmalahDiagnosticsPrelude.current = null;
    setContent({});
    setCurrentTimeMs(0);
    setTimelineTooltip(null);
    setTimelineViewport(createTimelineViewport(0));
    setWaveformData(null);
    setSelectedSegmentId(null);
    setSelectedObject(null);
    setStage("idle");
    setProgress(null);
    setShowCorrection(false);
    setErrorMessage(null);
    setTimingWarning(null);
    setPositioning(resetCaptionPositioning(projectFormat));
    setTypography(resetTypographyDefaults());
    setCaptionBackground(DEFAULT_CAPTION_BACKGROUND);
    setTransitionSettings(DEFAULT_TRANSITION_SETTINGS);
    setPlaybackRate(DEFAULT_PLAYBACK_RATE);
    setShowVerseNumber(DEFAULT_CAPTION_PRESENTATION.showVerseNumber);
    setExportQuality(DEFAULT_EXPORT_QUALITY);
    setExportOpen(false);
    setExportPreflight(null);
    setOutputPlan(null);
    setExportState(null);
    setExportError(null);
    setExportDiagnostics(null);
    setSavedProject(null);
    setCloudProjectId(null);
    setPendingOpenProject(null);
    setCloudSourceRestoreRetry(false);
    setProjectName("Untitled project");
    setAutomaticRecognitionRequest(null);
    automaticRecognition.current.reset();
    localSafetyProjectId.current = null;
    savedSignature.current = null;
    cloudBaselineUpdatedAt.current = null;
    cloudMedia.current = { sourcePath: null, thumbnailPath: null, thumbnailSize: null, sourceFingerprint: null };
    resetProjectHistory();
  }
  function projectSnapshot(
    id: string,
    title: string,
    createdAt: string,
  ): SavedProject {
    return {
      version: 2,
      id,
      title,
      sourceMedia: videoFile
        ? mediaSource
        : (savedProject?.sourceMedia ?? null),
      projectAssets,
      activeMediaAssetId,
      mediaTrim: clampMediaTrim(mediaTrim, projectDurationMs(videoFile ? mediaSource : savedProject?.sourceMedia ?? null)),
      format: projectFormat,
      verseAlignments: alignments,
      captionSegments: segments,
      captions: {
        arabic: true,
        translation: typography.translationVisible,
        transliteration: typography.transliterationVisible,
        translationEdition: "english_saheeh",
      },
      positioning,
      captionBackground,
      typography,
      transitionSettings,
      playbackRate,
      showVerseNumber,
      createdAt,
      updatedAt: new Date().toISOString(),
    };
  }
  async function saveProject() {
    if (!repository.current) {
      setErrorMessage("Local project storage is unavailable.");
      return;
    }
    const title = window
      .prompt(
        "Project name",
        projectName || videoFile?.name || "Untitled project",
      )
      ?.trim();
    if (!title) return;
    const now = new Date().toISOString();
    const existing = savedProject;
    const project = projectSnapshot(
      existing?.id ?? crypto.randomUUID(),
      title,
      existing?.createdAt ?? now,
    );
    try {
      await repository.current.put(project);
      setSavedProject(project);
      setProjectName(title);
      setProjects(await repository.current.list());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save the project locally.",
      );
    }
  }
  async function checkpointProjectForAuthentication() {
    if (!repository.current) throw new Error("Local project storage is unavailable, so this editor cannot safely leave for sign-in.");
    const now = new Date().toISOString();
    const snapshot = projectSnapshot(savedProject?.id ?? crypto.randomUUID(), projectName || videoFile?.name || "Untitled project", savedProject?.createdAt ?? now);
    await repository.current.put(snapshot);
    rememberAuthResumeProject(snapshot.id);
    setSavedProject(snapshot);
    setProjects(await repository.current.list());
  }
  function startCloudSave() {
    if (!session || !getSupabaseClient()) {
      rememberAuthContinuation("save");
      setAuthOpen(true);
      return;
    }
    if (!cloudProjectId) {
      const now = new Date().toISOString();
      const draft = projectSnapshot(savedProject?.id ?? crypto.randomUUID(), projectName || "Untitled project", savedProject?.createdAt ?? now);
      setCloudSaveName(cloudProjectName(draft));
      setCloudSaveStatus(null);
      setCloudSaveOpen(true);
      return;
    }
    void saveToCloud(projectName);
  }
  async function saveToCloud(requestedName: string) {
    if (!session || !repository.current) return;
    const name = requestedName.trim();
    if (!name) { setCloudSaveStatus("Enter a project name."); return; }
    const now = new Date().toISOString();
    const id = cloudProjectId ?? savedProject?.id ?? crypto.randomUUID();
    const snapshot = projectSnapshot(id, name, savedProject?.createdAt ?? now);
    let reserved = false;
    let cloudSaveStage: CloudSaveStage = "database";
    const uploaded: string[] = [];
    const oldSourcePath = cloudMedia.current.sourcePath;
    const oldThumbnailPath = cloudMedia.current.thumbnailPath;
    try {
      setCloudSaveStatus("Preparing your project…");
      await repository.current.put(snapshot);
      setProjects(await repository.current.list());
      if (!cloudProjectId) { await beginCloudProjectSave(snapshot); reserved = true; }
      else {
        const remote = await getCloudProject(cloudProjectId);
        if (remote && cloudBaselineUpdatedAt.current && remote.updatedAt !== cloudBaselineUpdatedAt.current && !window.confirm("The cloud version changed since this project was opened. Choose OK to replace it with this local version, or Cancel to open the cloud version.")) return;
      }
      const sourceChanged = Boolean(videoFile && (videoFile !== null && (mediaSource?.fingerprint ?? `${videoFile.name}:${videoFile.size}`) !== cloudMedia.current.sourceFingerprint));
      let sourcePath = oldSourcePath;
      let sourceType = savedProject?.sourceMedia?.mimeType ?? null;
      let sourceName = savedProject?.sourceMedia?.fileName ?? null;
      let sourceSize = savedProject?.sourceMedia?.fileSize ?? null;
      let thumbnailPath = oldThumbnailPath;
      let thumbnailSize: number | null = cloudMedia.current.thumbnailSize;
      if (sourceChanged && videoFile) {
        cloudSaveStage = "source-upload";
        setCloudSaveStatus("Uploading source media…");
        sourcePath = newCloudSourcePath(session.user.id, id, videoFile);
        await uploadPrivateProjectObject(sourcePath, videoFile, videoFile.type || "application/octet-stream", cloudSaveStage);
        uploaded.push(sourcePath);
        sourceType = videoFile.type || mediaSource?.mimeType || "application/octet-stream";
        sourceName = videoFile.name; sourceSize = videoFile.size;
      }
      if (sourceChanged || !thumbnailPath) {
        cloudSaveStage = "thumbnail";
        setCloudSaveStatus("Creating project thumbnail…");
        const thumbnail = await createProjectThumbnail(videoFile, Boolean(mediaSource?.hasVideo));
        thumbnailPath = newCloudThumbnailPath(session.user.id, id);
        setCloudSaveStatus("Uploading project thumbnail…");
        await uploadPrivateProjectObject(thumbnailPath, thumbnail, "image/webp", cloudSaveStage);
        uploaded.push(thumbnailPath); thumbnailSize = thumbnail.size;
      }
      cloudSaveStage = "finalize";
      setCloudSaveStatus("Saving project state…");
      const row = await completeCloudProjectSave(snapshot, { source_media_path: sourcePath, source_media_type: sourceType, source_media_name: sourceName, source_media_size_bytes: sourceSize, thumbnail_path: thumbnailPath, thumbnail_size_bytes: thumbnailSize });
      void cleanupReplacedCloudMedia(id, [oldSourcePath, oldThumbnailPath], [row.source_media_path, row.thumbnail_path]).catch((cleanupError: unknown) => {
        console.warn("Cloud project media cleanup failed after save.", cleanupError);
      });
      const saved = { ...snapshot, title: row.name, createdAt: row.created_at, updatedAt: row.updated_at };
      cloudBaselineUpdatedAt.current = row.updated_at;
      cloudMedia.current = { sourcePath: row.source_media_path, thumbnailPath: row.thumbnail_path, thumbnailSize: row.thumbnail_size_bytes, sourceFingerprint: snapshot.sourceMedia?.fingerprint ?? null };
      savedSignature.current = JSON.stringify({ projectName: row.name, sourceMedia: snapshot.sourceMedia, projectAssets: snapshot.projectAssets, activeMediaAssetId: snapshot.activeMediaAssetId, mediaTrim: snapshot.mediaTrim, format: snapshot.format, verseAlignments: snapshot.verseAlignments, captionSegments: snapshot.captionSegments, captions: snapshot.captions, positioning: snapshot.positioning, captionBackground: snapshot.captionBackground, typography: snapshot.typography, transitionSettings: snapshot.transitionSettings, playbackRate: snapshot.playbackRate, showVerseNumber: snapshot.showVerseNumber });
      setCloudProjectId(row.id); setSavedProject(saved); setProjectName(row.name); setCloudSaveOpen(false); setCloudSaveStatus(null); setDirty(false);
      setCloudProjects(await listCloudProjects()); setErrorMessage(null);
    } catch (error) {
      if (uploaded.length) void removePrivateProjectObjects(id, uploaded).catch(() => undefined);
      if (reserved) void cancelCloudProjectSave(id).catch(() => undefined);
      const message = cloudProjectError(error, cloudSaveStage).message;
      setCloudSaveStatus(message); setErrorMessage(message);
    }
  }
  async function openProject(project: SavedProject, fromCloud = cloudProjectsOpen): Promise<boolean> {
    if (
      dirty &&
      !window.confirm("Discard unsaved changes and open this project?")
    )
      return false;
    setProjectsOpen(false);
    clearVideo();
    setExportQuality(DEFAULT_EXPORT_QUALITY);
    setExportPreflight(null);
    setOutputPlan(null);
    setSavedProject(project);
    if (fromCloud) setCloudProjectId(project.id);
    setProjectAssets(project.projectAssets.map((asset) => asset.type === "text" ? asset : { ...asset, availability: "needs-relink" }));
    setActiveMediaAssetId(project.activeMediaAssetId);
    assetFiles.current.clear();
    assetYouTubeSessions.current.clear();
    setPendingOpenProject(project);
    setProjectName(project.title);
    setProjectFormat(project.format);
    setProjectFormatExplicitlyChosen(true);
    basmalahDiagnosticsPrelude.current = null;
    setAlignments(project.verseAlignments as VerseAlignment[]);
    setSegments(resolveCaptionTranslationSegments(project.captionSegments as CaptionSegment[]));
    setPositioning(project.positioning);
    setCaptionBackground(project.captionBackground);
    setTypography(project.typography);
    setTransitionSettings(project.transitionSettings);
    setPlaybackRate(resolvePlaybackRate(project.playbackRate));
    setShowVerseNumber(project.showVerseNumber);
    setMediaTrim(project.mediaTrim);
    setSelectedSegmentId(null);
    setSelectedObject(null);
    setContent({});
    if (project.sourceMedia?.origin === "youtube-import") {
      setErrorMessage("This YouTube source was temporary. Re-import or relink it before editing; it will not download automatically.");
    }
    cloudBaselineUpdatedAt.current = fromCloud ? project.updatedAt : null;
    savedSignature.current = JSON.stringify({
      projectName: project.title,
      sourceMedia: project.sourceMedia,
      projectAssets: project.projectAssets,
      activeMediaAssetId: project.activeMediaAssetId,
      mediaTrim: project.mediaTrim,
      format: project.format,
      verseAlignments: project.verseAlignments,
      captionSegments: project.captionSegments,
      captions: project.captions,
      positioning: project.positioning,
      captionBackground: project.captionBackground,
      typography: project.typography,
      transitionSettings: project.transitionSettings,
      playbackRate: project.playbackRate,
      showVerseNumber: project.showVerseNumber,
    });
    setDirty(false);
    resetProjectHistory();
    const keys = [
      ...new Set(
        project.captionSegments.flatMap((segment) => segment.verseKeys),
      ),
    ];
    const job = ++generation.current;
    await loadCanonical(keys, job);
    await loadTranslations(keys, job);
    return true;
  }
  async function deleteProject(project: SavedProject) {
    if (
      !repository.current ||
      !window.confirm(
        `Delete “${project.title}” from this browser? Source videos are not deleted.`,
      )
    )
      return;
    await repository.current.delete(project.id);
    for (const asset of project.projectAssets) {
      if (asset.sourceOrigin === "youtube-import" && asset.sourceSessionId) releaseYouTubeImport(asset.sourceSessionId);
    }
    setProjects(await repository.current.list());
    if (savedProject?.id === project.id) resetEditorState();
  }
  async function deleteCloud(project: SavedProject) {
    if (
      !session ||
      !window.confirm(
        `Delete “${project.title}” from your account? Local copies are not deleted.`,
      )
    )
      return;
    try {
      await deleteCloudProject(project.id);
      setCloudProjects(await listCloudProjects());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not delete the cloud project.",
      );
    }
  }
  function newProject() {
    if (
      dirty &&
      !window.confirm("Discard unsaved changes and start a new project?")
    )
      return;
    resetEditorState();
  }
  async function loadWaveform(file: File, job: number) {
    try {
      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) return;
      const context = new AudioContextConstructor();
      try {
        const audio = await context.decodeAudioData(await file.arrayBuffer());
        if (job !== waveformGeneration.current) return;
        setWaveformData({
          durationMs: Math.round(audio.duration * 1_000),
          peaks: waveformPeaksFromPcm(Array.from({ length: audio.numberOfChannels }, (_, index) => audio.getChannelData(index))),
        });
      } finally {
        await context.close();
      }
    } catch {
      // A previewable file can still have a browser decoder unavailable to Web Audio.
      if (job === waveformGeneration.current) setWaveformData(null);
    }
  }
  function selectVideo(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    if (!next) return;
    if (!mediaKindForFile(next)) {
      setErrorMessage("Choose browser-supported video or audio to start a local editing session.");
      return;
    }
    setYoutubeImportStatus("idle");
    setYoutubeImportError(null);
    const assetId = crypto.randomUUID();
    const source = mediaSourceFromFile(next, mediaKindForFile(next)!, { assetId });
    assetFiles.current.set(assetId, { file: next, source });
    setProjectAssets((current) => [...current, projectAssetFromMediaSource(source, assetId)]);
    setActiveMediaAssetId(assetId);
    loadSelectedSource(next, source);
  }
  function relinkProjectAsset(assetId: string, event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    const asset = projectAssets.find((candidate) => candidate.id === assetId);
    if (!next || !asset || !mediaKindForFile(next)) return;
    const wouldDiscardCaptions = Boolean(segments.length && activeMediaAssetId !== assetId);
    if (wouldDiscardCaptions && !window.confirm("Switching source clears the current recognition and caption timing. Continue?")) return;
    const source = mediaSourceFromFile(next, mediaKindForFile(next)!, { assetId, durationMs: asset.durationMs, width: asset.width, height: asset.height, origin: asset.sourceOrigin === "youtube-import" ? "youtube-import" : "local-file", sourceUrl: asset.sourceUrl, displayName: asset.name });
    assetFiles.current.set(assetId, { file: next, source });
    setProjectAssets((current) => current.map((candidate) => candidate.id === assetId ? { ...candidate, name: next.name, mimeType: next.type, availability: "available" } : candidate));
    setActiveMediaAssetId(assetId);
    loadSelectedSource(next, source, { preserveCaptions: !wouldDiscardCaptions });
  }
  function activateProjectAsset(assetId: string) {
    const runtime = assetFiles.current.get(assetId);
    if (!runtime) return;
    const wouldDiscardCaptions = Boolean(segments.length && activeMediaAssetId !== assetId);
    if (wouldDiscardCaptions && !window.confirm("Switching source clears the current recognition and caption timing. Continue?")) return;
    setActiveMediaAssetId(assetId);
    setRightInspectorMode(rightInspectorModeForSelection("editor-object"));
    loadSelectedSource(runtime.file, runtime.source, { preserveCaptions: !wouldDiscardCaptions });
  }
  function removeProjectAsset(assetId: string) {
    const asset = projectAssets.find((candidate) => candidate.id === assetId);
    if (!asset || !window.confirm(`Remove “${asset.name}” from this project?`)) return;
    const sessionId = assetYouTubeSessions.current.get(assetId);
    if (sessionId) releaseYouTubeImport(sessionId);
    assetYouTubeSessions.current.delete(assetId);
    assetFiles.current.delete(assetId);
    setProjectAssets((current) => current.filter((candidate) => candidate.id !== assetId));
    if (activeMediaAssetId === assetId) {
      setActiveMediaAssetId(null);
      if (videoUrl) URL.revokeObjectURL(videoUrl);
      setVideoFile(null); setVideoUrl(null); setVideoMetadata(null); setMediaSource(null); setMediaTrim(createMediaTrim(0)); setWaveformData(null); setTimelineViewport(createTimelineViewport(0));
    }
  }
  async function importYouTube() {
    if (!["idle", "failed", "ready"].includes(youtubeImportStatus)) return;
    const sessionId = crypto.randomUUID();
    const controller = new AbortController();
    youtubeImportAbort.current = controller;
    setYoutubeImportError(null);
    setYoutubeImportStatus("validating");
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!validateYouTubeImportUrl(youtubeUrl)) throw new Error("Enter a youtube.com, youtu.be, or YouTube Shorts link.");
      setYoutubeImportStatus("fetching-metadata");
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      setYoutubeImportStatus("downloading");
      const response = await fetch("/api/local-youtube-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, url: youtubeUrl, mode: youtubeMode }),
        signal: controller.signal,
      });
      const payload = await response.json() as YouTubeImportResponse & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not import this YouTube video.");
      setYoutubeImportStatus("preparing-media");
      const mediaResponse = await fetch(payload.mediaUrl, { signal: controller.signal });
      if (!mediaResponse.ok) throw new Error("The temporary imported media is no longer available. Please import it again.");
      const file = new File([await mediaResponse.blob()], payload.fileName, { type: payload.mimeType });
      const assetId = crypto.randomUUID();
      const nextSource = mediaSourceFromFile(file, payload.hasVideo ? "video" : "audio", {
        assetId,
        durationMs: payload.durationMs,
        width: payload.width,
        height: payload.height,
        origin: "youtube-import",
        sourceUrl: payload.sourceUrl,
        displayName: payload.title,
      });
      youtubeImportSession.current = sessionId;
      assetFiles.current.set(assetId, { file, source: nextSource });
      assetYouTubeSessions.current.set(assetId, sessionId);
      setProjectAssets((current) => [...current, projectAssetFromMediaSource(nextSource, assetId, new Date().toISOString(), sessionId)]);
      setActiveMediaAssetId(assetId);
      loadSelectedSource(file, nextSource);
      setYoutubeImportStatus("ready");
    } catch (error) {
      releaseYouTubeImport(sessionId);
      setYoutubeImportError(error instanceof DOMException && error.name === "AbortError" ? "YouTube import cancelled. Your current source was kept." : error instanceof Error ? error.message : "Could not import this YouTube video.");
      setYoutubeImportStatus("failed");
    } finally {
      if (youtubeImportAbort.current === controller) youtubeImportAbort.current = null;
    }
  }
  function cancelYouTubeImport() {
    youtubeImportAbort.current?.abort();
  }
  function loadedVideoMetadata(event: SyntheticEvent<HTMLMediaElement>) {
    const target = event.currentTarget;
    const visual = target as HTMLVideoElement;
    const metadata = {
      durationSeconds: target.duration,
      width: Number.isFinite(visual.videoWidth) ? visual.videoWidth : 0,
      height: Number.isFinite(visual.videoHeight) ? visual.videoHeight : 0,
    };
    setVideoMetadata(metadata);
    if (metadata.width > 0 && metadata.height > 0 && !projectFormatExplicitlyChosen) {
      const sourceAwareFormat = projectFormatForSourceDimensions(metadata.width, metadata.height);
      setProjectFormat(sourceAwareFormat);
      setPositioning((current) => clampCaptionPositioning(current, sourceAwareFormat));
    }
    const durationMs = Math.round(metadata.durationSeconds * 1_000);
    setMediaSource((current) => current ? { ...current, durationMs, ...(current.hasVideo ? { width: metadata.width, height: metadata.height } : {}) } : current);
    if (activeMediaAssetId) setProjectAssets((current) => current.map((asset) => asset.id === activeMediaAssetId ? { ...asset, durationMs, ...(mediaSource?.hasVideo ? { width: metadata.width, height: metadata.height } : {}) } : asset));
    setMediaTrim((current) => pendingOpenProject ? clampMediaTrim(current, durationMs) : createMediaTrim(durationMs));
    setTimelineViewport((current) => current.visibleEndMs > 0 ? clampTimelineViewport(current, durationMs) : createTimelineViewport(durationMs));
    if (pendingOpenProject) {
      const result = verifySourceFile(
        videoFile!,
        pendingOpenProject.sourceMedia,
        Math.round(metadata.durationSeconds * 1_000),
      );
      if (!result.matches) {
        setErrorMessage(
          `This may not be the saved source (${result.reasons.join("; ")}). Choose the original file or use it anyway.`,
        );
      } else {
        setErrorMessage(null);
        setPendingOpenProject(null);
      }
    }
  }
  async function detect(request?: Pick<AutomaticRecognitionRequest, "file" | "sourceUrl">) {
    const sourceFile = request?.file ?? videoFile;
    const sourceUrl = request?.sourceUrl ?? videoUrl;
    if (!sourceFile || !support?.supported || busyStages.includes(stage)) return;
    const job = ++generation.current;
    setErrorMessage(null);
    setProgress(null);
    setAlignments([]);
    setSegments([]);
    basmalahDiagnosticsPrelude.current = null;
    setContent({});
    setStage("preparing");
    setProgress(captionProgress.current.start(job));
    const startedAt = performance.now();
    const reportProgress = (
      phase: "preparing-media" | "analyzing-speech" | "identifying-passage" | "confirming-passage" | "aligning-words" | "building-captions" | "adding-translation" | "finalizing",
      fraction?: number,
      detail?: string,
    ) => {
      const next = captionProgress.current.report(job, phase, fraction, detail);
      if (next) setProgress(next);
    };
    const reportFastConformerProgress = (next: FastConformerProgress) => {
      if (next.phase === "downloading-model") {
        const update = captionGenerationProgressForDownload(captionProgress.current, job, next.bytesLoaded, next.bytesTotal);
        if (update) setProgress(update);
        return;
      }
      if (next.phase === "identifying-passage") {
        reportProgress("identifying-passage", next.completed / Math.max(1, next.total), `${next.completed} of ${next.total} audio windows analyzed`);
        return;
      }
      reportProgress("aligning-words", next.step === "forced-alignment" ? 0.5 : 0);
    };
    try {
      const { localWhisperTranscriber } =
        await import("@/lib/recognition/local-whisper");
      const prepared = await localWhisperTranscriber.transcribe(
        sourceFile,
        (next) => {
          if (job !== generation.current) return;
          if (next.phase === "decoding") {
            reportProgress("preparing-media");
            setStage("preparing");
          } else if (next.phase === "detecting-speech") {
            reportProgress("analyzing-speech");
            setStage("detecting-speech");
          } else if (next.phase === "loading-model") {
            setStage("loading-model");
          } else {
            setStage("transcribing");
          }
        },
        { analysisRunId: crypto.randomUUID(), sourceIdentity: `${sourceFile.name}:${sourceFile.size}:${sourceFile.lastModified}`, sourceObjectUrl: sourceUrl, deferWhisper: true },
      );
      if (job !== generation.current) return;
      setStage("matching");
      reportProgress("identifying-passage");
      const fastConformerIdentification = prepared.runFastConformerIdentification
        ? await prepared.runFastConformerIdentification(reportFastConformerProgress)
        : null;
      if (job !== generation.current) return;
      const fastConformerSpan = canonicalSpanFromFastConformerIdentification(fastConformerIdentification?.canonicalSpan ?? null);
      const fastConformerDecision = decideFastConformerPassage(fastConformerIdentification, fastConformerSpan);
      // Development comparison keeps both engines observable. Production does
      // not pay Whisper's model/inference cost after accepted FC evidence.
      const runWhisperComparison = process.env.NODE_ENV !== "production";
      const result = !fastConformerDecision.accepted || runWhisperComparison
        ? (await prepared.runWhisperFallback?.()) ?? prepared
        : prepared;
      if (job !== generation.current) return;
      const primaryTranscript = createPrimaryTranscript(result.chunks, result.timestampMode);
      const whisperAnalysis = analyzeTranscript(primaryTranscript, {
        audioAnalysis: result.audioAnalysis,
        speechRegions: result.speechRegions,
      });
      const useFastConformer = fastConformerDecision.accepted && fastConformerSpan !== null;
      const selectedCanonicalSpan = useFastConformer ? fastConformerSpan : whisperAnalysis.passage.canonicalSpan;
      const acceptedIdentity = useFastConformer || whisperAnalysis.passage.state === "confident-unique";
      if (acceptedIdentity && selectedCanonicalSpan) {
        const acceptedSurah = hafsSurahs.find((item) => item.number === Number(selectedCanonicalSpan.firstVerseKey.split(":")[0]));
        const update = captionProgress.current.confirmIdentity(job, `Detected Surah ${acceptedSurah?.name ?? selectedCanonicalSpan.firstVerseKey.split(":")[0]}`);
        if (update) setProgress(update);
      } else {
        reportProgress("confirming-passage");
      }
      const passageComparison = fastConformerIdentification
        ? comparePassageIdentification({
          engine: "whisper-quran-matcher",
          span: whisperAnalysis.passage.canonicalSpan ? {
            firstVerseKey: whisperAnalysis.passage.canonicalSpan.firstVerseKey,
            lastVerseKey: whisperAnalysis.passage.canonicalSpan.lastVerseKey,
            firstWordIndex: whisperAnalysis.passage.canonicalSpan.firstWordIndex,
            lastWordIndex: whisperAnalysis.passage.canonicalSpan.lastWordIndex,
          } : null,
          confidence: whisperAnalysis.passage.identityConfidence,
        }, fastConformerIdentification)
        : null;
      const speechStartMs = result.speechRegions[0]?.startMs ?? 0;
      const speechEndMs = result.speechRegions.at(-1)?.endMs ?? result.audioAnalysis.durationMs;
      const alignmentMatches = selectedCanonicalSpan?.coveredVerseKeys.map((verseKey) => ({ verseKey, startMs: speechStartMs, endMs: speechEndMs })) ?? [];
      reportProgress("aligning-words");
      const fastConformerAlignment = alignmentMatches.length && result.runFastConformer
        ? await result.runFastConformer(hafsVerses.filter((verse) => selectedCanonicalSpan!.coveredVerseKeys.includes(verse.verseKey)), alignmentMatches, reportFastConformerProgress)
        : null;
      const analysis = useFastConformer
        ? analyzeTranscript(primaryTranscript, { audioAnalysis: result.audioAnalysis, speechRegions: result.speechRegions, fastConformerResult: fastConformerAlignment, passageOverride: { canonicalSpan: fastConformerSpan, passageSource: "fastconformer-quran" } })
        : selectedCanonicalSpan
          ? analyzeTranscript(primaryTranscript, { audioAnalysis: result.audioAnalysis, speechRegions: result.speechRegions, fastConformerResult: fastConformerAlignment, passageOverride: { canonicalSpan: selectedCanonicalSpan, passageSource: "whisper-fallback" } })
          : whisperAnalysis;
      if (analysis.matches.length === 0) {
        alignmentDebug.current = {
          PASSAGE_IDENTIFICATION_DECISION: { selectedEngine: "manual", acceptedSpan: null, decisionReason: fastConformerDecision.reason, fastConformer: { identification: fastConformerIdentification, evidenceGate: fastConformerDecision }, whisper: { attempted: result !== prepared, state: whisperAnalysis.passage.state, span: whisperAnalysis.passage.canonicalSpan, confidence: whisperAnalysis.passage.identityConfidence }, disagreement: passageComparison },
          CROSS_SURAH_CANDIDATES_REJECTED: fastConformerIdentification?.CROSS_SURAH_CANDIDATES_REJECTED ?? 0,
          WHISPER_VS_FASTCONFORMER: passageComparison,
          passage: analysis.passage,
        };
        publishAlignmentDebug(alignmentDebug.current);
        const update = captionProgress.current.manualCorrection(job);
        if (update) setProgress(update);
        setSurah(0);
        setStartAyah(1);
        setEndAyah(1);
        setShowCorrection(true);
        setStage("idle");
        setErrorMessage("We couldn't confidently identify this recitation. Try again or choose the Quran passage manually.");
        return;
      }
      if (analysis.timingFailure) throw new Error(`Quran timing could not be completed. ${analysis.timingFailure.reason} Please retry.`);
      if (!analysis.authoritativeTimingEngine) throw new Error("Quran timing could not be completed. Please retry.");
      const next = recognitionToVerseAlignments(analysis.matches);
      const first = next[0];
      const last = next.at(-1)!;
      const verseContent = Object.fromEntries(
        getVerses(next[0].verseKey, next.at(-1)!.verseKey).map((verse) => [verse.verseKey, verse]),
      );
      // One generated display authority: pure boundaries -> CaptionSegment[].
      // VerseAlignment and forced alignment remain diagnostics only.
      const nextSegments = createCaptionSegmentsFromVerseBoundaries(
        analysis.verseBoundaries,
        verseContent,
        fastConformerAlignment?.optionalPrelude,
        analysis.authoritativeTimingEngine.wordTimings,
      );
      reportProgress("building-captions", 1);
      const displayPrelude = nextSegments.find((segment) => segment.contentKind === "basmalah-prelude") ?? null;
      basmalahDiagnosticsPrelude.current = fastConformerAlignment?.optionalPrelude ?? null;
      setAlignments(next);
      setSegments(nextSegments);
      resetProjectHistory();
      alignmentDebug.current = {
        appCommit: DEV_BUILD_VERSION,
        buildVersion: DEV_BUILD_VERSION,
        source: { durationMs: result.audioAnalysis.durationMs, sampleRate: result.audioAnalysis.sampleRate },
        speechRegions: result.speechRegions,
        transcriber: { model: "onnx-community/whisper-base_timestamped", backend: result.backend, timestampMode: result.timestampMode, runtimes: { modelLoadMs: result.modelLoadMs, transcriptionMs: result.transcriptionMs, totalMs: result.durationMs } },
        AUTHORITATIVE_TIMING_ENGINE: {
          engine: analysis.authoritativeTimingEngine.engine,
          reason: analysis.authoritativeTimingEngine.reason,
          fastConformerStatus: fastConformerAlignment?.status ?? "not-run",
          passageStartVerse: analysis.authoritativeTimingEngine.structuralValidation.expectedVerseKeys[0] ?? null,
          passageEndVerse: analysis.authoritativeTimingEngine.structuralValidation.expectedVerseKeys.at(-1) ?? null,
          verseTimings: analysis.authoritativeTimingEngine.verseTimings,
          firstStartMs: analysis.authoritativeTimingEngine.verseTimings[0]?.startMs ?? null,
          finalEndMs: analysis.authoritativeTimingEngine.verseTimings.at(-1)?.endMs ?? null,
          structuralValidation: analysis.authoritativeTimingEngine.structuralValidation,
        },
        passage: analysis.passage,
        primaryTranscript: {
          rawText: primaryTranscript.rawText,
          normalizedTokenCount: primaryTranscript.normalizedTokens.length,
          timestampMode: primaryTranscript.timestampMode,
        },
        passageIdentification: {
          passageSource: analysis.passage.passageSource,
          topCandidates: analysis.passage.candidates,
          resultState: analysis.passage.state,
          shadowComparison: analysis.passage.shadowComparison,
        },
        PASSAGE_IDENTIFICATION_DECISION: {
          selectedEngine: analysis.passage.passageSource,
          acceptedSpan: selectedCanonicalSpan,
          decisionReason: useFastConformer ? fastConformerDecision.reason : whisperAnalysis.passage.state,
          topGlobalHypotheses: fastConformerIdentification?.globalHypotheses.slice(0, 4).map((hypothesis) => ({
            surah: hypothesis.surah,
            span: hypothesis.span,
            acousticScore: hypothesis.acousticScore,
            lexicalUniqueness: hypothesis.lexicalUniqueness,
            localSharedPhraseScore: hypothesis.localSharedPhraseScore,
            continuityScore: hypothesis.continuityScore,
            voicedCoverage: hypothesis.voicedCoverage,
            finalScore: hypothesis.finalScore,
          })) ?? [],
          windowEvidence: fastConformerIdentification?.windowResults.map((window) => ({
            index: window.index,
            intervalMs: [window.startMs, window.endMs],
            voicedMs: window.voicedMs,
            state: window.state,
            greedyLexicalDecode: window.greedy.lexicalText,
            selectedCandidate: window.selectedCandidate,
            topCandidates: window.candidates.slice(0, 4).map((candidate) => ({
              span: { start: candidate.start, end: candidate.end },
              ctcScore: candidate.ctcScore,
              normalizedCtcScore: candidate.normalizedCtcScore,
              marginFromSecond: candidate.marginFromSecond,
              lexicalUniqueness: candidate.lexicalUniqueness,
              lexicalCoverage: candidate.lexicalCoverage,
              targetCoverage: candidate.targetCoverage,
            })),
          })) ?? [],
          fastConformer: { status: fastConformerIdentification?.status ?? "not-run", span: fastConformerIdentification?.canonicalSpan ?? null, evidenceGate: fastConformerDecision, confidence: fastConformerIdentification?.confidence ?? null, selectedSurah: fastConformerIdentification?.selectedSurah ?? null, optionalPrelude: fastConformerIdentification?.optionalPrelude ?? null },
          whisper: { attempted: result !== prepared, state: whisperAnalysis.passage.state, span: whisperAnalysis.passage.canonicalSpan, confidence: whisperAnalysis.passage.identityConfidence },
          disagreement: passageComparison,
        },
        PASSAGE_ENGINE_DISAGREEMENT: useFastConformer && whisperAnalysis.passage.state === "confident-unique" && passageComparison?.agreement.exactSpan === false
          ? { fastConformer: fastConformerSpan, whisper: whisperAnalysis.passage.canonicalSpan, overlap: passageComparison.agreement.overlappingAyat, decisionReason: fastConformerDecision.reason }
          : null,
        FASTCONFORMER_QURAN_IDENTIFICATION: fastConformerIdentification,
        CROSS_SURAH_CANDIDATES_REJECTED: fastConformerIdentification?.CROSS_SURAH_CANDIDATES_REJECTED ?? 0,
        WHISPER_VS_FASTCONFORMER: passageComparison,
        verseTimingTable: next.map((item) => ({
          verse: item.verseKey,
          predictedStartMs: item.startMs,
          predictedEndMs: item.endMs,
          startEvidence: item.timingEvidence.start,
          endEvidence: item.timingEvidence.end,
        })),
        AUTHORITATIVE_CAPTIONS: nextSegments.map((segment) => ({
          id: segment.id,
          contentKind: segment.contentKind,
          verseKeys: segment.verseKeys,
          arabic: segment.arabic,
          wordStart: segment.wordStart,
          wordEnd: segment.wordEnd,
          wordCount: segment.wordCount,
          showVerseNumberAtEnd: segment.showVerseNumberAtEnd,
          startMs: segment.startMs,
          endMs: segment.endMs,
          revision: `${segment.id}:${segment.startMs}-${segment.endMs}`,
        })),
        finalProjectCaptionSegments: nextSegments.map((segment) => ({
          id: segment.id,
          verseKeys: segment.verseKeys,
          wordStart: segment.wordStart,
          wordEnd: segment.wordEnd,
          startMs: segment.startMs,
          endMs: segment.endMs,
          showVerseNumberAtEnd: segment.showVerseNumberAtEnd,
        })),
        DISPLAY_PRELUDE: {
          present: Boolean(displayPrelude),
          type: displayPrelude ? "basmalah" : null,
          startMs: displayPrelude?.startMs ?? null,
          endMs: displayPrelude?.endMs ?? null,
          text: displayPrelude?.arabic ?? null,
          manuallyEdited: displayPrelude
            ? displayPrelude.startMs !== displayPrelude.timingEvidence.start.timestampMs
              || displayPrelude.endMs !== displayPrelude.timingEvidence.end.timestampMs
            : false,
        },
        FASTCONFORMER_ALIGNMENT: fastConformerAlignment && {
          model: FASTCONFORMER_MODEL,
          license: FASTCONFORMER_MODEL_LICENSE,
          modelSize: `${FASTCONFORMER_MODEL_ARTIFACT}: ${FASTCONFORMER_MODEL_BYTES} bytes`,
          runtime: FASTCONFORMER_RUNTIME,
          ...fastConformerAlignment,
          wordAlignment: fastConformerAlignment.alignment.words,
        },
      };
      publishAlignmentDebug(alignmentDebug.current);
      setSurah(first.surahNumber);
      setStartAyah(first.ayahNumber);
      setEndAyah(last.ayahNumber);
      setStage("captions");
      const keys = next.map((item) => item.verseKey);
      reportProgress("adding-translation");
      await loadCanonical(keys, job);
      await loadTranslations(keys, job);
      if (job === generation.current) {
        reportProgress("finalizing", 1);
        if (process.env.NODE_ENV !== "production") {
          console.debug("Caption generation timing", {
            totalMs: Math.round(performance.now() - startedAt),
            mediaPreparationAndVadMs: prepared.durationMs,
            identificationMs: fastConformerIdentification?.performance.totalMs ?? null,
            alignmentMs: fastConformerAlignment?.performance.alignmentMs ?? null,
            captionConstructionMs: 0,
          });
        }
        setProgress(captionProgress.current.complete(job));
        setStage("complete");
      }
    } catch (caught) {
      if (job === generation.current) {
        setProgress(captionProgress.current.fail(job));
        setStage("error");
        setErrorMessage(
          caught instanceof Error
            ? caught.message
            : "Local recognition failed. Try again.",
        );
      }
    }
  }
  useEffect(() => {
    if (!automaticRecognitionRequest || !support?.supported || busyStages.includes(stage)) return;
    if (!automaticRecognition.current.start(automaticRecognitionRequest.identity, automaticRecognitionRequest.restoredCompletedRecognition)) return;
    void detect(automaticRecognitionRequest);
  }, [automaticRecognitionRequest, stage, support?.supported]);
  useEffect(() => {
    const debug = alignmentDebug.current;
    if (!debug?.transitions?.length) return;
    const boundaries = generatedCaptionBoundaryTrace(segments);
    const boundaryByPair = new Map(boundaries.map((trace) => [`${trace.previousVerseKey}->${trace.nextVerseKey}`, trace]));
    debug.ACTUAL_PREVIEW = debug.transitions.map((transition) => {
      const boundary = boundaryByPair.get(`${transition.previousVerseKey}->${transition.nextVerseKey}`);
      const selectedTransitionMs = transition.selectedTransitionMs;
      const activeBefore = getActiveCaptionSegment(segments, selectedTransitionMs - 1);
      const activeAt = getActiveCaptionSegment(segments, selectedTransitionMs);
      return {
        previousVerseKey: transition.previousVerseKey,
        nextVerseKey: transition.nextVerseKey,
        earliestCandidateNextAyahEvidence: transition.candidateNextAyahEvidence[0] ?? null,
        chosenTransitionCandidate: selectedTransitionMs,
        selectedTransitionMs,
        selectedCaptionSegment: boundary?.captionSegment ?? null,
        // Captured after React commits the exact array passed to CaptionPreview
        // and EditorWorkspace. The selector is getActiveCaptionSegment.
        selection: {
          atSelectedTransitionMinusOneMs: activeBefore?.verseKeys ?? null,
          atSelectedTransitionMs: activeAt?.verseKeys ?? null,
        },
      };
    });
    publishAlignmentDebug(debug);
  }, [alignments, segments]);

  async function copyAlignmentDebug() {
    if (!alignmentDebug.current || typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(JSON.stringify(alignmentDebug.current, null, 2));
  }
  async function copyBasmalahDiagnostics() {
    if (!basmalahDiagnosticCaptureEnabled || typeof navigator === "undefined") return;
    const segment = segments.find((item) => item.contentKind === "basmalah-prelude");
    if (!segment) return;
    const diagnostic = createBasmalahDiagnostic({
      segment,
      optionalPrelude: basmalahDiagnosticsPrelude.current,
      wordHighlightMode: typography.wordHighlightMode,
    });
    console.debug("BASMALAH_DIAGNOSTIC", diagnostic);
    await navigator.clipboard.writeText(JSON.stringify(diagnostic, null, 2));
  }
  function clearVideo() {
    exportAbort.current?.abort();
    clearCompletedExport();
    generation.current += 1;
    captionProgress.current.reset();
    waveformGeneration.current += 1;
    setWaveformData(null);
    setTimelineViewport(createTimelineViewport(0));
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setYoutubeImportStatus("idle");
    setYoutubeImportError(null);
    setVideoFile(null);
    setVideoUrl(null);
    setVideoMetadata(null);
    setMediaSource(null);
    setActiveMediaAssetId(null);
    setMediaTrim(createMediaTrim(0));
    setAlignments([]);
    setSegments([]);
    basmalahDiagnosticsPrelude.current = null;
    setContent({});
    setProgress(null);
    setStage("idle");
    setAutomaticRecognitionRequest(null);
    automaticRecognition.current.reset();
    setShowCorrection(false);
    setErrorMessage(null);
    setCurrentTimeMs(0);
    setTimelineTooltip(null);
    setSelectedObject(null);
    setPositioning(resetCaptionPositioning(projectFormat));
    setExportState(null);
    setExportError(null);
    setExportDiagnostics(null);
    resetProjectHistory();
  }
  async function correctDetection() {
    const selected = hafsSurahs.find((item) => item.number === surah);
    if (
      !selected ||
      startAyah < 1 ||
      endAyah < startAyah ||
      endAyah > selected.verseCount
    ) {
      setErrorMessage("Enter a valid surah and ayah range.");
      return;
    }
    const job = ++generation.current;
    setProgress(captionProgress.current.start(job));
    setProgress(captionProgress.current.report(job, "building-captions"));
    const rangeStart = alignments[0]?.startMs ?? 0;
    const rangeEnd =
      alignments.at(-1)?.endMs ?? (videoMetadata?.durationSeconds ?? 1) * 1000;
    const count = endAyah - startAyah + 1;
    const next = Array.from({ length: count }, (_, index) => ({
      verseKey: `${surah}:${startAyah + index}`,
      surahNumber: surah,
      ayahNumber: startAyah + index,
      startMs: Math.round(
        rangeStart + ((rangeEnd - rangeStart) * index) / count,
      ),
      endMs: Math.round(
        rangeStart + ((rangeEnd - rangeStart) * (index + 1)) / count,
      ),
      confidence: 0,
      timingEvidence: {
        start: { timestampMs: rangeStart, source: "token-interpolated" as const },
        end: { timestampMs: rangeEnd, source: "token-interpolated" as const },
        matchedText: "",
      },
    }));
    setAlignments(next);
    setSegments(
      createCaptionSegments(
        next,
        Object.fromEntries(
          getVerses(next[0].verseKey, next.at(-1)!.verseKey).map((verse) => [
            verse.verseKey,
            verse,
          ]),
        ),
      ),
    );
    resetProjectHistory();
    setStage("captions");
    setErrorMessage(null);
    try {
      const keys = next.map((item) => item.verseKey);
      setProgress(captionProgress.current.report(job, "adding-translation"));
      await loadCanonical(keys, job);
      await loadTranslations(keys, job);
      if (job === generation.current) {
        setProgress(captionProgress.current.complete(job));
        setStage("complete");
        setShowCorrection(false);
      }
    } catch {
      if (job === generation.current) {
        setProgress(captionProgress.current.fail(job));
        setStage("error");
        setErrorMessage("Canonical captions could not be loaded locally.");
      }
    }
  }
  function updateTime(event: SyntheticEvent<HTMLMediaElement>) {
    const clock = playbackClock.current;
    if (!clock) {
      setCurrentTimeMs(event.currentTarget.currentTime * 1000);
      return;
    }
    clock.setMedia(event.currentTarget);
    clock.sync("timeupdate");
  }
  function startPlaybackClock(event: SyntheticEvent<HTMLMediaElement>) {
    const clock = playbackClock.current;
    const media = event.currentTarget;
    const trim = clampMediaTrim(mediaTrimRef.current, projectDurationMs(mediaSource));
    const playbackStartMs = playbackStartForMediaTrim(media.currentTime * 1_000, trim, projectDurationMs(mediaSource));
    if (playbackStartMs !== Math.round(media.currentTime * 1_000)) {
      media.currentTime = playbackStartMs / 1_000;
      clock?.setMedia(media);
      clock?.sync("seek");
    }
    if (!clock) return;
    clock.setMedia(media);
    clock.start();
  }
  function stopPlaybackClock(event: SyntheticEvent<HTMLMediaElement>, source: "pause" | "ended") {
    const clock = playbackClock.current;
    if (!clock) {
      setCurrentTimeMs(event.currentTarget.currentTime * 1000);
      return;
    }
    clock.setMedia(event.currentTarget);
    clock.stop(source);
  }
  function seekPlaybackClock(event: SyntheticEvent<HTMLMediaElement>) {
    const clock = playbackClock.current;
    if (!clock) {
      setCurrentTimeMs(event.currentTarget.currentTime * 1000);
      return;
    }
    clock.setMedia(event.currentTarget);
    clock.sync("seek");
  }
  const seekTo = useCallback(
    (ms: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime =
        Math.max(
          0,
          Math.min(ms, projectDurationMs(mediaSource)),
        ) / 1000;
      const clock = playbackClock.current;
      if (clock) {
        clock.setMedia(video);
        clock.sync("seek");
      } else {
        setCurrentTimeMs(video.currentTime * 1000);
      }
    },
    [mediaSource],
  );
  const playWithinTrim = useCallback(() => {
    const media = videoRef.current;
    if (!media) return;
    const trim = clampMediaTrim(mediaTrim, projectDurationMs(mediaSource));
    const playbackStartMs = playbackStartForMediaTrim(media.currentTime * 1_000, trim, projectDurationMs(mediaSource));
    if (playbackStartMs !== Math.round(media.currentTime * 1_000)) seekTo(playbackStartMs);
    void media.play();
  }, [mediaSource, mediaTrim, seekTo]);
  function resetMediaTrim() {
    const next = createMediaTrim(projectDurationMs(mediaSource));
    updateProjectHistory((current) => ({ ...current, mediaTrim: next }));
  }
  function selectSegment(segment: CaptionSegment) {
    const selection = selectTimelineCaption(segment);
    applyCaptionSelection(selection);
    setStyleScope("all");
    setSplitBoundary(
      Math.max(1, Math.ceil(segment.arabic.trim().split(/\s+/).length / 2)),
    );
  }
  function selectCaptionObject(segment: CaptionSegment, kind: CaptionObject | null) {
    const selection = kind ? selectCaptionLayer(segment, kind) : clearCaptionSelection();
    if (kind) applyCaptionSelection(selection);
    else {
      setSelectedSegmentId(selection.selectedCaptionSegmentId);
      setSelectedObject(selection.selectedCaptionLayer);
    }
    if (!kind || selectedSegmentId !== segment.id) setStyleScope("all");
    if (kind) setSplitBoundary(Math.max(1, Math.ceil(segment.arabic.trim().split(/\s+/).length / 2)));
  }
  function applyCaptionSelection(selection: CaptionSelection) {
    setSelectedSegmentId(selection.selectedCaptionSegmentId);
    setSelectedObject(selection.selectedCaptionLayer);
    setRightInspectorMode(rightInspectorModeForSelection("caption"));
  }
  const handleObjectPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, segment: CaptionSegment, kind: CaptionObject) => {
      event.stopPropagation();
      setSelectedSegmentId(segment.id);
      setSelectedObject(kind);
      setRightInspectorMode(rightInspectorModeForSelection("caption"));
      if (selectedSegmentId !== segment.id) setStyleScope("all");
      canvasInteraction.current = {
        kind,
        mode: "drag",
        pointerX: event.clientX,
        pointerY: event.clientY,
        positioning: { ...(styleScope === "segment" && selectedSegmentId ? (() => { const segment = segments.find((item) => item.id === selectedSegmentId); return segment ? resolveCaptionLayerStyle(captionStyleFromState(typography, positioning, captionBackground, transitionSettings), segment.styleOverrides, kind).positioning : positioning; })() : positioning), translationPositionLinked: false },
      };
      beginProjectHistoryTransaction();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [captionBackground, positioning, selectedSegmentId, segments, styleScope, transitionSettings, typography],
  );
  const handleResizePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>, kind: CaptionObject, edge: CaptionResizeEdge) => {
      event.stopPropagation();
      setSelectedObject(kind);
      setRightInspectorMode(rightInspectorModeForSelection("caption"));
      canvasInteraction.current = {
        kind,
        mode: "resize",
        edge,
        pointerX: event.clientX,
        pointerY: event.clientY,
        positioning: { ...(styleScope === "segment" && selectedSegmentId ? (() => { const segment = segments.find((item) => item.id === selectedSegmentId); return segment ? resolveCaptionLayerStyle(captionStyleFromState(typography, positioning, captionBackground, transitionSettings), segment.styleOverrides, kind).positioning : positioning; })() : positioning), translationPositionLinked: false },
      };
      beginProjectHistoryTransaction();
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [captionBackground, positioning, selectedSegmentId, segments, styleScope, transitionSettings, typography],
  );
  const handleObjectPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const interaction = canvasInteraction.current;
      const rect = previewRef.current?.getBoundingClientRect();
      if (!interaction || !rect) return;
      const dx = (event.clientX - interaction.pointerX) / rect.width;
      const dy = (event.clientY - interaction.pointerY) / rect.height;
      const positioningKind = interaction.kind === "arabic" ? "arabic" : "translation";
      const savePositioning = (previous: CaptionPositioning, next: CaptionPositioning) => {
        if (styleScope !== "segment" || !selectedSegmentId) {
          updateProjectHistory((current) => ({ ...current, positioning: next }), true);
          return;
        }
        const changed = Object.fromEntries((Object.keys(next) as Array<keyof CaptionPositioning>)
          .filter((key) => next[key] !== previous[key])
          .map((key) => [key, next[key]])) as Partial<CaptionPositioning>;
        if (!Object.keys(changed).length) return;
        const layer: CaptionLayer = selectedObject ?? "arabic";
        updateProjectHistory((current) => ({ ...current, segments: current.segments.map((segment) => segment.id === selectedSegmentId
          ? { ...segment, styleOverrides: patchCaptionLayerStyleOverrides(segment.styleOverrides, layer, { positioning: changed }) }
          : segment) }), true);
      };
      if (interaction.mode === "drag") {
        const start = interaction.positioning;
        savePositioning(start, updateCaptionPosition(start, positioningKind, interaction.kind === "arabic" ? start.x + dx : start.translationX + dx, interaction.kind === "arabic" ? start.y + dy : start.translationY + dy, projectFormat));
      } else {
        const startWidth = positioningKind === "arabic" ? interaction.positioning.maxWidthPercent : (interaction.positioning.translationMaxWidthPercent ?? interaction.positioning.maxWidthPercent);
        const direction = interaction.edge === "left" ? -1 : 1;
        const nextWidth = startWidth + direction * dx * 2;
        savePositioning(interaction.positioning, resizeCaptionWidth(interaction.positioning, positioningKind, nextWidth, projectFormat));
      }
    },
    [projectFormat, selectedObject, selectedSegmentId, styleScope],
  );
  const handleObjectPointerUp = useCallback(() => {
    canvasInteraction.current = null;
    commitProjectHistoryTransaction();
  }, []);
  function timelineTimeFromPointer(event: PointerEvent<HTMLElement>) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return viewportPositionToTime(timelineContentPosition(event.clientX, rect.left, rect.width), timelineViewport);
  }
  function seekTimeline(event: PointerEvent<HTMLElement>) {
    seekTo(timelineTimeFromPointer(event));
  }
  function captureTimelinePointer(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0 || timelinePointerCapture.current) return false;
    event.currentTarget.setPointerCapture(event.pointerId);
    timelinePointerCapture.current = { pointerId: event.pointerId, target: event.currentTarget };
    return true;
  }
  function endTimelineInteractions(pointerId?: number) {
    const capture = timelinePointerCapture.current;
    if (capture && pointerId !== undefined && capture.pointerId !== pointerId) return;
    const hadInteraction = Boolean(capture || playheadScrub.current || timelineInteraction.current || mediaTrimInteraction.current);
    timelinePointerCapture.current = null;
    playheadScrub.current = endTimelineScrub(playheadScrub.current, pointerId);
    draggingEdge.current = null;
    draggingMediaTrim.current = null;
    timelineInteraction.current = null;
    mediaTrimInteraction.current = null;
    if (capture?.target.hasPointerCapture(capture.pointerId)) capture.target.releasePointerCapture(capture.pointerId);
    if (!hadInteraction) return;
    setTimelineTooltip(null);
    commitProjectHistoryTransaction();
  }
  timelineCleanup.current = () => endTimelineInteractions();
  useEffect(() => {
    const onWindowBlur = () => timelineCleanup.current();
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("blur", onWindowBlur);
      timelineCleanup.current();
    };
  }, []);
  function handleTimelinePointerDown(event: PointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    seekTimeline(event);
  }
  function handlePlayheadPointerDown(event: PointerEvent<HTMLElement>) {
    event.stopPropagation();
    const session = beginTimelineScrub(event.pointerId, event.button);
    if (!session || !captureTimelinePointer(event)) return;
    playheadScrub.current = session;
    seekTimeline(event);
  }
  function formatTimelineTime(value: number) {
    const milliseconds = Math.max(0, Math.round(value));
    const minutes = Math.floor(milliseconds / 60_000);
    const seconds = Math.floor((milliseconds % 60_000) / 1_000);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds % 1_000).padStart(3, "0")}`;
  }
  function snapTimelineTime(value: number, id: string) {
    const maxMs = Math.max(1, projectDurationMs(mediaSource));
    const candidates = [currentTimeMs, ...segments.flatMap((segment) => segment.id === id ? [] : [segment.startMs, segment.endMs])];
    const nearby = candidates.find((candidate) => Math.abs(candidate - value) <= 80);
    return Math.max(0, Math.min(maxMs, Math.round(nearby ?? value)));
  }
  function handleSegmentPointerDown(event: PointerEvent<HTMLButtonElement>, segment: CaptionSegment) {
    event.stopPropagation();
    if (!captureTimelinePointer(event)) return;
    const pointerStartMs = timelineTimeFromPointer(event);
    const selection = selectTimelineCaption(segment);
    applyCaptionSelection(selection);
    setStyleScope("all");
    setSplitBoundary(Math.max(1, Math.ceil(segment.arabic.trim().split(/\s+/).length / 2)));
    timelineInteraction.current = { id: segment.id, mode: "body", pointerStartMs, initialStartMs: segment.startMs, initialEndMs: segment.endMs };
    beginProjectHistoryTransaction();
  }
  function handleEdgeDown(
    event: PointerEvent<HTMLElement>,
    edge: "start" | "end",
    segment: CaptionSegment,
  ) {
    event.stopPropagation();
    if (!captureTimelinePointer(event)) return;
    timelineInteraction.current = { id: segment.id, mode: edge, pointerStartMs: timelineTimeFromPointer(event), initialStartMs: segment.startMs, initialEndMs: segment.endMs };
    beginProjectHistoryTransaction();
    draggingEdge.current = edge;
    const selection = selectTimelineCaption(segment);
    applyCaptionSelection(selection);
    setStyleScope("all");
    setSplitBoundary(Math.max(1, Math.ceil(segment.arabic.trim().split(/\s+/).length / 2)));
    const video = videoRef.current;
    if (video && !video.paused) video.pause();
    const boundary = edge === "start" ? segment.startMs : segment.endMs;
    setTimelineTooltip({ label: formatTimelineTime(boundary), position: (boundary - timelineViewport.visibleStartMs) / Math.max(1, timelineViewport.visibleEndMs - timelineViewport.visibleStartMs) });
  }
  function handleMediaTrimPointerDown(event: PointerEvent<HTMLElement>, edge: "start" | "end") {
    event.stopPropagation();
    if (!captureTimelinePointer(event)) return;
    mediaTrimInteraction.current = { edge };
    beginProjectHistoryTransaction();
    draggingMediaTrim.current = edge;
    const media = videoRef.current;
    if (media && !media.paused) media.pause();
    const boundary = edge === "start" ? mediaTrim.startMs : mediaTrim.endMs;
    setTimelineTooltip({ label: formatTimelineTime(boundary), position: (boundary - timelineViewport.visibleStartMs) / Math.max(1, timelineViewport.visibleEndMs - timelineViewport.visibleStartMs) });
  }
  function handleEdgeMove(event: PointerEvent<HTMLElement>) {
    const capture = timelinePointerCapture.current;
    if (playheadScrub.current) {
      if (isActiveTimelineScrubMove(playheadScrub.current, event.pointerId, event.buttons)) {
        seekTimeline(event);
      } else if (playheadScrub.current.pointerId === event.pointerId) {
        endTimelineInteractions(event.pointerId);
      }
      return;
    }
    if (!capture || capture.pointerId !== event.pointerId) return;
    if ((event.buttons & 1) === 0) {
      endTimelineInteractions(event.pointerId);
      return;
    }
    const trimInteraction = mediaTrimInteraction.current;
    if (trimInteraction) {
      const nextTime = timelineTimeFromPointer(event);
      const rect = timelineRef.current?.getBoundingClientRect();
      const snapped = rect
        ? snapCaptionBoundaryToPlayhead(nextTime, event.clientX, rect.left, rect.width, currentTimeMs, timelineViewport.visibleEndMs - timelineViewport.visibleStartMs, timelineViewport.visibleStartMs)
        : { timeMs: nextTime, snapped: false };
      const nextTrim = resizeMediaTrim(mediaTrimRef.current, trimInteraction.edge, snapped.timeMs, projectDurationMs(mediaSource));
      updateProjectHistory((current) => ({ ...current, mediaTrim: nextTrim }), true);
      const boundary = trimInteraction.edge === "start" ? nextTrim.startMs : nextTrim.endMs;
      setTimelineTooltip({ label: `${formatTimelineTime(boundary)}${snapped.snapped ? " · Snap: Playhead" : ""}`, position: (boundary - timelineViewport.visibleStartMs) / Math.max(1, timelineViewport.visibleEndMs - timelineViewport.visibleStartMs) });
      return;
    }
    const interaction = timelineInteraction.current;
    if (!interaction) return;
    const nextTime = timelineTimeFromPointer(event);
    const rect = timelineRef.current?.getBoundingClientRect();
    const playheadSnap = interaction.mode === "body" || !rect
      ? { timeMs: nextTime, snapped: false }
      : snapCaptionBoundaryToPlayhead(nextTime, event.clientX, rect.left, rect.width, currentTimeMs, timelineViewport.visibleEndMs - timelineViewport.visibleStartMs, timelineViewport.visibleStartMs);
    const snapped = interaction.mode === "body" ? snapTimelineTime(nextTime, interaction.id) : playheadSnap.timeMs;
    const delta = snapped - interaction.pointerStartMs;
    const nextPatch = interaction.mode === "body"
      ? (() => {
          const duration = interaction.initialEndMs - interaction.initialStartMs;
          const startMs = Math.max(0, Math.min(Math.max(1, projectDurationMs(mediaSource)) - duration, snapTimelineTime(interaction.initialStartMs + delta, interaction.id)));
          return { startMs, endMs: startMs + duration };
        })()
      : interaction.mode === "start" ? { startMs: snapped } : { endMs: snapped };
    updateProjectHistory((current) => ({ ...current, segments: interaction.mode === "body"
      ? updateCaptionSegmentTiming(current.segments, interaction.id, nextPatch, projectDurationMs(mediaSource))
      : resizeCaptionBoundary(current.segments, interaction.id, interaction.mode, snapped, projectDurationMs(mediaSource)) }), true);
    const boundary = interaction.mode === "end" ? nextPatch.endMs ?? snapped : nextPatch.startMs ?? snapped;
    setTimelineTooltip({ label: `${formatTimelineTime(boundary)}${playheadSnap.snapped ? " · Snap: Playhead" : ""}`, position: (boundary - timelineViewport.visibleStartMs) / Math.max(1, timelineViewport.visibleEndMs - timelineViewport.visibleStartMs) });
  }
  function handleTimelinePointerEnd(event: PointerEvent<HTMLElement>) {
    endTimelineInteractions(event.pointerId);
  }
  function setTimelineZoom(zoom: number) {
    const durationMs = projectDurationMs(mediaSource);
    const playheadIsVisible = currentTimeMs >= timelineViewport.visibleStartMs && currentTimeMs <= timelineViewport.visibleEndMs;
    const anchor = playheadIsVisible ? currentTimeMs : (timelineViewport.visibleStartMs + timelineViewport.visibleEndMs) / 2;
    setTimelineViewport(zoomTimelineViewport(timelineViewport, durationMs, zoom, anchor));
  }
  function pinchTimelineZoom(clientX: number, deltaY: number): boolean {
    if (draggingEdge.current || draggingMediaTrim.current || playheadScrub.current || timelineInteraction.current) return false;
    const durationMs = projectDurationMs(mediaSource);
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!durationMs || !rect || !Number.isFinite(deltaY)) return false;
    const next = pinchTimelineViewport(timelineViewport, durationMs, timelineContentPosition(clientX, rect.left, rect.width), deltaY);
    if (Math.abs(next.zoom - timelineViewport.zoom) < 0.0001) return false;
    setTimelineViewport(next);
    return true;
  }
  function panTimelineTo(visibleStartMs: number) {
    setTimelineViewport(panTimelineViewport(timelineViewport, projectDurationMs(mediaSource), visibleStartMs));
  }
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redoProjectHistory();
        else undoProjectHistory();
        return;
      }
      if (event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redoProjectHistory();
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        const video = videoRef.current;
        if (video) {
          if (video.paused) playWithinTrim();
          else video.pause();
        }
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekTo(currentTimeMs - 500);
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        seekTo(currentTimeMs + 500);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentTimeMs, mediaSource, mediaTrim, seekTo, playWithinTrim]);

  const busy = busyStages.includes(stage);
  const selectedIndex = segments.findIndex(
    (segment) => segment.id === selectedSegmentId,
  );
  const selectedSegment = selectedIndex >= 0 ? segments[selectedIndex] : null;
  const platformCollisions = useMemo(
    () => platformCaptionCollisions(platformPreview, captionCanvasBounds),
    [captionCanvasBounds, platformPreview],
  );
  const tiktokCaption = useMemo(() => createTikTokCaption(segments, content), [content, segments]);
  const handleCaptionBoundsChange = useCallback((next: CaptionCanvasBounds[]) => {
    setCaptionCanvasBounds((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next);
  }, []);
  function moveSelectedCaptionToSafeArea(targetId = selectedSegmentId ?? getActiveCaptionSegment(segments, currentTimeMs)?.id) {
    const guide = socialPlatformGuide(platformPreview);
    const targetSegmentId = targetId;
    if (!guide || !targetSegmentId) return;
    const collisions = platformCollisions.filter((collision) => collision.segmentId === targetSegmentId);
    if (!collisions.length) return;
    const focused = collisions.find((collision) => collision.kind === selectedObject) ?? collisions[0]!;
    const linked = focused.linked;
    const unit = linked ? captionCanvasBounds.filter((bounds) => bounds.segmentId === targetSegmentId && bounds.linked) : [focused];
    if (!unit.length) return;
    const left = Math.min(...unit.map((bounds) => bounds.x));
    const top = Math.min(...unit.map((bounds) => bounds.y));
    const right = Math.max(...unit.map((bounds) => bounds.x + bounds.width));
    const bottom = Math.max(...unit.map((bounds) => bounds.y + bounds.height));
    const movement = moveRectToSafeArea({ x: left, y: top, width: right - left, height: bottom - top }, guide.safeArea);
    if (Math.abs(movement.dx) < 0.0001 && Math.abs(movement.dy) < 0.0001) return;
    const layer: CaptionLayer = linked || focused.kind === "transliteration" ? "arabic" : focused.kind;
    const positioningKind = layer === "translation" ? "translation" : "arabic";
    const globalStyle = captionStyleFromState(typography, positioning, captionBackground, transitionSettings);
    const targetSegment = segments.find((segment) => segment.id === targetSegmentId) ?? null;
    const useSegmentStyle = styleScope === "segment" && selectedSegmentId === targetSegmentId && Boolean(targetSegment);
    const localPositioning = useSegmentStyle
      ? resolveCaptionLayerStyle(globalStyle, targetSegment?.styleOverrides, layer).positioning
      : positioning;
    const nextPositioning = updateCaptionPosition(localPositioning, positioningKind,
      (positioningKind === "arabic" ? localPositioning.x : localPositioning.translationX) + movement.dx,
      (positioningKind === "arabic" ? localPositioning.y : localPositioning.translationY) + movement.dy,
      projectFormat);
    if (!useSegmentStyle) {
      updateProjectHistory((current) => ({ ...current, positioning: nextPositioning }));
      return;
    }
    const changed = Object.fromEntries((Object.keys(nextPositioning) as Array<keyof CaptionPositioning>)
      .filter((key) => nextPositioning[key] !== localPositioning[key])
      .map((key) => [key, nextPositioning[key]])) as Partial<CaptionPositioning>;
    if (!Object.keys(changed).length) return;
    updateProjectHistory((current) => ({ ...current, segments: current.segments.map((segment) => segment.id === selectedSegmentId
      ? { ...segment, styleOverrides: patchCaptionLayerStyleOverrides(segment.styleOverrides, layer, { positioning: changed }) }
      : segment) }));
  }
  const selectedFormatDefinition = projectFormatDefinition(projectFormat);
  const selectedExportFormat = exportFormatForQuality(projectFormat, exportQuality);
  const globalCaptionStyle = captionStyleFromState(typography, positioning, captionBackground, transitionSettings);
  const selectedLayer: CaptionLayer = selectedObject ?? "arabic";
  const inspectorStyle = selectedSegment
    ? resolveCaptionLayerStyle(globalCaptionStyle, selectedSegment.styleOverrides, selectedLayer)
    : globalCaptionStyle;
  function patchSelectedLayerStyle(patch: Parameters<typeof patchCaptionLayerStyleOverrides>[2]) {
    if (!selectedSegment || styleScope !== "segment") return false;
    updateProjectHistory((current) => ({ ...current, segments: current.segments.map((segment) => segment.id === selectedSegment.id
      ? { ...segment, styleOverrides: patchCaptionLayerStyleOverrides(segment.styleOverrides, selectedLayer, patch) }
      : segment) }));
    return true;
  }
  const updateTypography = <K extends keyof Typography>(
    key: K,
    value: Typography[K],
  ) => {
    if (!patchSelectedLayerStyle({ typography: { [key]: value } })) updateProjectHistory((current) => ({ ...current, typography: { ...current.typography, [key]: value } }));
  };
  const updateCaptionBackground = <K extends keyof CaptionBackground>(
    key: K,
    value: CaptionBackground[K],
  ) => {
    if (!patchSelectedLayerStyle({ captionBackground: { [key]: value } })) updateProjectHistory((current) => ({ ...current, captionBackground: { ...current.captionBackground, [key]: value } }));
  };
  function applyStyle(style: CaptionStyle) {
    const next = captionStyleToState(style);
    updateProjectHistory((current) => ({ ...current, typography: next.typography, positioning: clampCaptionPositioning(next.positioning, current.projectFormat), captionBackground: next.captionBackground, transitionSettings: next.transitionSettings }));
  }
  function saveCurrentStyle() {
    const styleLimit = getCustomStyleLimit(plan);
    if (styleLimit !== null && localStyles.length >= styleLimit) {
      setErrorMessage(`Your ${plan} plan supports up to ${styleLimit} saved custom styles.`);
      return;
    }
    setLocalStyles(
      saveLocalStyle(
        localStyleName,
        captionStyleFromState(
          typography,
          positioning,
          captionBackground,
          transitionSettings,
        ),
      ),
    );
  }
  function resetSelectedObjectStyle() {
    if (selectedSegment && styleScope === "segment") {
      updateProjectHistory((current) => ({ ...current, segments: current.segments.map((segment) => segment.id === selectedSegment.id
        ? { ...segment, styleOverrides: clearCaptionLayerStyleOverrides(segment.styleOverrides, selectedLayer) }
        : segment) }));
      return;
    }
    const defaults = resetTypographyDefaults();
    if (selectedObject === "arabic") {
      updateProjectHistory((current) => ({ ...current, typography: { ...current.typography, quranStyle: defaults.quranStyle, arabicFontFamily: defaults.arabicFontFamily, arabicFontSize: defaults.arabicFontSize, textColor: defaults.textColor, wordHighlightMode: defaults.wordHighlightMode, wordHighlightColor: defaults.wordHighlightColor, wordHighlightIntensity: defaults.wordHighlightIntensity, arabicOutlineEnabled: defaults.arabicOutlineEnabled, arabicOutlineWidth: defaults.arabicOutlineWidth, arabicOutlineColor: defaults.arabicOutlineColor, arabicShadowEnabled: defaults.arabicShadowEnabled, arabicShadowBlur: defaults.arabicShadowBlur, arabicShadowStrength: defaults.arabicShadowStrength, arabicOpacity: defaults.arabicOpacity, textAlign: defaults.textAlign, arabicLineSpacing: defaults.arabicLineSpacing } }));
    } else if (selectedObject === "translation") {
      updateProjectHistory((current) => ({ ...current, typography: { ...current.typography, translationFontFamily: defaults.translationFontFamily, translationFontSize: defaults.translationFontSize, translationTextColor: defaults.translationTextColor, translationOutlineEnabled: defaults.translationOutlineEnabled, translationOutlineWidth: defaults.translationOutlineWidth, translationOutlineColor: defaults.translationOutlineColor, translationShadowEnabled: defaults.translationShadowEnabled, translationShadowBlur: defaults.translationShadowBlur, translationShadowStrength: defaults.translationShadowStrength, translationOpacity: defaults.translationOpacity, translationTextAlign: defaults.translationTextAlign, translationSpacingBelowArabic: defaults.translationSpacingBelowArabic, translationVisible: defaults.translationVisible } }));
    }
  }
  function alignTranslationBelowArabic() {
    const next = clampCaptionPositioning({ ...inspectorStyle.positioning, translationPositionLinked: true }, projectFormat);
    if (!patchSelectedLayerStyle({ positioning: { translationPositionLinked: next.translationPositionLinked } })) updateProjectHistory((current) => ({ ...current, positioning: next }));
  }
  function changeFormat(preset: ProjectFormatPreset) {
    const definition = PROJECT_FORMATS[preset];
    const next: ProjectFormat = {
      preset: definition.preset,
      width: definition.width,
      height: definition.height,
    };
    updateProjectHistory((current) => ({ ...current, projectFormat: next, positioning: clampCaptionPositioning(current.positioning, next) }));
    setProjectFormatExplicitlyChosen(true);
  }
  function splitSelected() {
    if (!selectedSegment) return;
    updateProjectHistory((current) => {
      const index = current.segments.findIndex(
        (segment) => segment.id === selectedSegment.id,
      );
      return { ...current, segments: index < 0
        ? current.segments
        : resolveCaptionTranslationSegments([
            ...current.segments.slice(0, index),
            ...splitCaptionSegment(selectedSegment, splitBoundary),
            ...current.segments.slice(index + 1),
          ]) };
    });
    setSelectedSegmentId(null);
  }
  function mergePrevious() {
    if (selectedIndex < 1) return;
    updateProjectHistory((current) => ({ ...current, segments: resolveCaptionTranslationSegments(mergeCaptionWithPrevious(current.segments, selectedIndex)) }));
    setSelectedSegmentId(null);
  }
  function mergeNext() {
    if (selectedIndex < 0 || selectedIndex >= segments.length - 1) return;
    updateProjectHistory((current) => ({ ...current, segments: resolveCaptionTranslationSegments(mergeCaptionWithNext(current.segments, selectedIndex)) }));
    setSelectedSegmentId(null);
  }
  async function checkExportPreflight(project: Project, source: File, configuration: LocalExportConfiguration) {
    const capability = offlineWebCodecsSupport();
    let outputProfileAvailable: boolean | null = null;
    if (capability.supported) {
      try {
        const { inspectLocalExport } = await import("@/lib/export/offline-webcodecs");
        const nextOutputPlan = await inspectLocalExport(source, configuration.format, configuration.quality);
        setOutputPlan(nextOutputPlan);
        outputProfileAvailable = Boolean(nextOutputPlan.profile);
      } catch {
        outputProfileAvailable = false;
      }
    }
    const result = runExportPreflight(
      project,
      {
        sourceAvailable: true,
        sourceMedia: project.sourceMedia,
        activeMediaAssetId: project.activeMediaAssetId,
        projectAssets: project.projectAssets,
        captionBounds: captionCanvasBounds,
        platformPreview,
        exporterSupport: capability,
        outputProfileAvailable,
        playbackRateExportSupported: typeof AudioBuffer !== "undefined",
        exportConfiguration: configuration,
        exportQuality: configuration.quality,
      },
    );
    setExportPreflight(result);
    setExportError(null);
    return result;
  }
  function handleExportPreflightAction(action: ExportPreflightAction, segmentId?: string) {
    exportPreflightOverride.current.clear();
    if (action === "move-to-safe-area" && segmentId) {
      setSelectedSegmentId(segmentId);
      setSelectedObject("arabic");
      setRightInspectorMode("settings");
      moveSelectedCaptionToSafeArea(segmentId);
      return;
    }
    if (action === "review-caption" || action === "review-translation") {
      if (segmentId) {
        setSelectedSegmentId(segmentId);
        setSelectedObject(action === "review-translation" ? "translation" : "arabic");
      }
      setRightInspectorMode("subtitles");
      setExportOpen(false);
      return;
    }
    if (action === "relink-source") {
      setExportOpen(false);
      setErrorMessage("Relink the active source in Project assets before exporting.");
    }
  }
  async function exportVideo(request: AuthorizedExportRequest) {
    if (request.preflight.status === "blocked") return;
    if (exportAbort.current || !exportCoordinator.current.start())
      return;
    const capability = offlineWebCodecsSupport();
    if (!capability.supported) {
      setExportError(capability.reason);
      setExportState("error");
      setExportOpen(true);
      exportCoordinator.current.finish();
      return;
    }
    const snapshot = request.configuration;
    const validationErrors = validateLocalExportInputs(request.source, snapshot);
    if (validationErrors.length) {
      setExportError(validationErrors[0]);
      setExportState("error");
      setExportOpen(true);
      exportCoordinator.current.finish();
      return;
    }
    const controller = new AbortController();
    exportAbort.current = controller;
    setExportActive(true);
    setExportError(null);
    setExportState({ phase: "preparing", fraction: 0, elapsedSeconds: 0 });
    const projectFingerprint = JSON.stringify({
      source: { name: request.source.name, size: request.source.size, lastModified: request.source.lastModified },
      activeMediaAssetId: request.activeMediaAssetId,
      configuration: snapshot,
    });
    try {
      const { inspectLocalExport } = await import("@/lib/export/offline-webcodecs");
      const plan = await inspectLocalExport(
        request.source,
        snapshot.format,
        snapshot.quality,
      );
      setOutputPlan(plan);
      if (!plan.profile)
        throw new Error(
          plan.sourceHasAudio
            ? "This browser cannot export a video with audio. Try another browser or source."
            : "This browser cannot encode a supported local video format.",
        );
      const { offlineWebCodecsRenderer } =
        await import("@/lib/export/offline-webcodecs");
      const output = await offlineWebCodecsRenderer.render({
        source: request.source,
        ...snapshot,
        signal: controller.signal,
        onProgress: setExportState,
      });
      replaceCompletedExport({
        ...output,
        objectUrl: URL.createObjectURL(output.blob),
        width: snapshot.format.width,
        height: snapshot.format.height,
        durationMs: Math.round(output.outputDurationSeconds * 1_000),
        quality: snapshot.quality,
        watermarkRequired: snapshot.watermarkRequired,
        completedAt: new Date().toISOString(),
        projectFingerprint,
      });
      setExportDiagnostics(output.diagnostics);
      setExportState("complete");
    } catch (caught) {
      setExportError(localExportFailureMessage(caught));
      setExportState("error");
      setExportOpen(true);
    } finally {
      exportAbort.current = null;
      setExportActive(false);
      exportCoordinator.current.finish();
    }
  }
  async function startExport() {
    if (!session) {
      rememberAuthContinuation("export");
      setExportOpen(false);
      setAuthOpen(true);
      return;
    }
    if (exportStarting.current || exportAbort.current || exportActive) return;
    exportStarting.current = true;
    exportPreflightOverride.current.clear();
    setExportState({ phase: "preparing", fraction: 0, elapsedSeconds: 0 });
    try {
      const authorization = await authorizeAccountExport(session, exportQuality);
      setAccountEntitlements(authorization.entitlements);
      if (!authorization.allowed) {
        setExportError(authorization.message);
        setExportState(exportResult ? "complete" : null);
        setExportOpen(true);
        return;
      }
      const configuration = snapshotLocalExportConfiguration({
        format: projectFormat,
        segments,
        typography,
        captionBackground,
        positioning,
        transitionSettings,
        showVerseNumber,
        mediaTrim,
        playbackRate,
        quality: authorization.quality,
        watermarkRequired: authorization.watermarkRequired,
      });
      if (!videoFile) {
        setExportError("Choose a source video before exporting.");
        setExportState("error");
        setExportOpen(true);
        return;
      }
      const preflightProject = projectSnapshot(savedProject?.id ?? "export-preflight", projectName || "Untitled project", savedProject?.createdAt ?? new Date(0).toISOString());
      const preflight = await checkExportPreflight(preflightProject, videoFile, configuration);
      const request: AuthorizedExportRequest = {
        source: videoFile,
        configuration,
        preflight,
        authorization,
        activeMediaAssetId: preflightProject.activeMediaAssetId,
      };
      const status = exportPreflightOverride.current.stage(preflight.status, request);
      if (status === "ready") {
        setExportOpen(false);
        await exportVideo(request);
      } else {
        setExportState(exportResult ? "complete" : null);
        setExportOpen(true);
      }
    } catch (caught) {
      console.error("Export preflight could not be completed.", caught);
      setExportError(localExportFailureMessage(caught));
      setExportState("error");
      setExportOpen(true);
    } finally {
      exportStarting.current = false;
    }
  }
  async function exportAnyway() {
    if (exportStarting.current || exportAbort.current || exportActive) return;
    const request = exportPreflightOverride.current.take();
    if (!request) {
      setExportError("This export confirmation is no longer active. Please review export settings again.");
      setExportState("error");
      setExportOpen(true);
      return;
    }
    exportStarting.current = true;
    setExportPreflight(null);
    setExportOpen(false);
    try {
      await exportVideo(request);
    } finally {
      exportStarting.current = false;
    }
  }
  function cancelExport() {
    if (exportActive) exportAbort.current?.abort();
  }
  function openExportSettings() {
    exportPreflightOverride.current.clear();
    setExportOpen(true);
    setExportPreflight(null);
    setExportError(null);
    if (session) {
      void getAccountEntitlements(session).then((next) => {
        setAccountEntitlements(next);
        setExportQuality((current) => canExportQuality(next, current) ? current : defaultExportQualityForPlan(next.plan));
      }).catch(() => undefined);
    }
    if (exportState === "error") setExportState(exportResult ? "complete" : null);
  }
  function requestExportSettings() {
    const intent = exportAuthIntent(Boolean(session));
    if (intent.kind === "authenticate") {
      rememberAuthContinuation(intent.continuation);
      setExportOpen(false);
      setAuthOpen(true);
      return;
    }
    openExportSettings();
  }
  function downloadExport() {
    if (!exportResult) return;
    const link = document.createElement("a");
    link.href = exportResult.objectUrl;
    link.download = exportResult.fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  return (
    <main className="min-h-screen bg-[#f5f2eb] text-[#17211b]">
      <EditorWorkspace
        videoFile={videoFile}
        videoUrl={videoUrl}
        videoMetadata={videoMetadata}
        mediaSource={mediaSource}
        projectAssets={projectAssets}
        activeMediaAssetId={activeMediaAssetId}
        mediaTrim={mediaTrim}
        videoRef={videoRef}
        previewRef={previewRef}
        timelineRef={timelineRef}
        stage={stage}
        progress={progress}
        support={support}
        alignments={alignments}
        content={content}
        currentTimeMs={currentTimeMs}
        segments={segments}
        selectedSegmentId={selectedSegmentId}
        selectedSegment={selectedSegment}
        selectedIndex={selectedIndex}
        selectedObject={selectedObject}
        rightInspectorMode={rightInspectorMode}
        styleScope={styleScope}
        inspectorStyle={inspectorStyle}
        selectedHasStyleOverrides={selectedSegment ? hasCaptionLayerStyleOverrides(selectedSegment.styleOverrides, selectedLayer) : false}
        splitBoundary={splitBoundary}
        typography={typography}
        captionBackground={captionBackground}
        projectFormat={projectFormat}
        positioning={positioning}
        transitionSettings={transitionSettings}
        playbackRate={playbackRate}
        showVerseNumber={showVerseNumber}
        showSafeArea={showSafeArea}
        platformPreview={platformPreview}
        platformCollisions={platformCollisions}
        projectName={projectName}
        dirty={dirty}
        session={session}
        accountEntitlements={accountEntitlements}
        onRefreshEntitlements={async () => {
          if (!session) return;
          const entitlements = await getAccountEntitlements(session);
          setAccountEntitlements(entitlements);
          setExportQuality((current) => canExportQuality(entitlements, current) ? current : defaultExportQualityForPlan(entitlements.plan));
        }}
        canUndo={projectHistory.current.canUndo}
        canRedo={projectHistory.current.canRedo}
        busy={busy}
        localStyles={localStyles}
        localStyleName={localStyleName}
        availableBuiltInStyles={(Object.keys(BUILT_IN_STYLES) as BuiltInStyleName[]).filter((name) => isBuiltInStyleAvailable(plan, name))}
        availableQuranStyles={Object.keys(quranFontDefinitions).filter((name) => isFontAvailable(plan, name))}
        exportOpen={exportOpen}
        exportPreflight={exportPreflight}
        exportQuality={exportQuality}
        exportFormat={selectedExportFormat}
        outputPlan={outputPlan}
        exportResult={exportResult}
        exportIsStale={Boolean(exportResult && exportResult.projectFingerprint !== currentExportFingerprint)}
        exportState={exportState}
        exportError={exportError}
        exportDiagnostics={exportDiagnostics}
        tiktokCaption={tiktokCaption}
        errorMessage={errorMessage}
        onRetrySourceRestore={cloudSourceRestoreRetry ? retryCloudSourceRestore : null}
        timingWarning={timingWarning}
        timelineTooltip={timelineTooltip}
        timelineViewport={timelineViewport}
        waveformData={waveformData}
        showCorrection={showCorrection}
        surah={surah}
        startAyah={startAyah}
        endAyah={endAyah}
        youtubeImportAvailable={youtubeImportAvailable}
        youtubeUrl={youtubeUrl}
        youtubeMode={youtubeMode}
        youtubeImportStatus={youtubeImportStatus}
        youtubeImportError={youtubeImportError}
        selectedFormatDefinition={selectedFormatDefinition}
        onProjectNameChange={setProjectName}
        onVideoSelect={selectVideo}
        onRelinkAsset={relinkProjectAsset}
        onActivateAsset={activateProjectAsset}
        onRemoveAsset={removeProjectAsset}
        onYoutubeUrlChange={setYoutubeUrl}
        onYoutubeModeChange={setYoutubeMode}
        onImportYouTube={() => void importYouTube()}
        onCancelYouTubeImport={cancelYouTubeImport}
        onLoadedMetadata={loadedVideoMetadata}
        onVideoTimeUpdate={updateTime}
        onMediaPlay={startPlaybackClock}
        onMediaPause={(event) => stopPlaybackClock(event, "pause")}
        onMediaEnded={(event) => stopPlaybackClock(event, "ended")}
        onMediaSeeking={seekPlaybackClock}
        onTogglePreviewPlayback={() => {
          const media = videoRef.current;
          if (!media) return;
          if (media.paused) playWithinTrim();
          else media.pause();
        }}
        onSeekPreview={seekTo}
        onVideoError={() => setErrorMessage("This video could not be previewed in your browser.")}
        onSelectObject={selectCaptionObject}
        onObjectPointerDown={handleObjectPointerDown}
        onResizePointerDown={handleResizePointerDown}
        onObjectPointerMove={handleObjectPointerMove}
        onObjectPointerUp={handleObjectPointerUp}
        onCanvasBackgroundPointerDown={() => { setSelectedObject(null); setSelectedSegmentId(null); setStyleScope("all"); setRightInspectorMode(rightInspectorModeForSelection("editor-object")); }}
        onSetRightInspectorMode={setRightInspectorMode}
        onSelectMedia={() => setRightInspectorMode(rightInspectorModeForSelection("editor-object"))}
        onSelectSegment={selectSegment}
        onSegmentPointerDown={handleSegmentPointerDown}
        onTimelinePointerDown={handleTimelinePointerDown}
        onPlayheadPointerDown={handlePlayheadPointerDown}
        onTimelinePointerMove={handleEdgeMove}
        onTimelinePointerEnd={handleTimelinePointerEnd}
        onEdgeDown={handleEdgeDown}
        onMediaTrimPointerDown={handleMediaTrimPointerDown}
        onResetMediaTrim={resetMediaTrim}
        onTimelineZoom={setTimelineZoom}
        onTimelinePan={panTimelineTo}
        onTimelinePinchZoom={pinchTimelineZoom}
        onChangeFormat={changeFormat}
        onDetect={() => void detect()}
        onCopyAlignmentDebug={() => { void copyAlignmentDebug(); }}
        showBasmalahDiagnostics={shouldShowBasmalahDiagnostics(typeof window === "undefined" ? "" : window.location.search, segments)}
        onCopyBasmalahDiagnostics={() => { void copyBasmalahDiagnostics(); }}
        onCorrectDetection={() => void correctDetection()}
        onToggleCorrection={() => setShowCorrection((value) => !value)}
        onSurahChange={setSurah}
        onStartAyahChange={setStartAyah}
        onEndAyahChange={setEndAyah}
        onClearVideo={clearVideo}
        onSaveProject={startCloudSave}
        onUndo={undoProjectHistory}
        onRedo={redoProjectHistory}
        onHistoryTransactionStart={beginProjectHistoryTransaction}
        onHistoryTransactionCommit={commitProjectHistoryTransaction}
        onSaveToAccount={startCloudSave}
        onOpenProjects={() => setProjectsOpen(true)}
        onOpenCloudProjects={() => { window.location.assign("/projects"); }}
        onBeforeAuthenticate={checkpointProjectForAuthentication}
        onDiscard={savedProject ? () => void openProject(savedProject) : newProject}
        onNewProject={newProject}
        authOpen={authOpen}
        onOpenAuth={() => setAuthOpen(true)}
        onCloseAuth={() => setAuthOpen(false)}
        onExportOpen={requestExportSettings}
        onExport={() => void startExport()}
        onExportAnyway={() => void exportAnyway()}
        onExportPreflightAction={handleExportPreflightAction}
        onCancelExport={cancelExport}
        onDownloadExport={downloadExport}
        onSetExportQuality={(quality) => { if (!canExportQuality(accountEntitlements, quality)) return; exportPreflightOverride.current.clear(); setExportQuality(quality); setOutputPlan(null); setExportPreflight(null); }}
        onSetExportOpen={(open) => { setExportOpen(open); if (!open) { exportPreflightOverride.current.clear(); setExportPreflight(null); if (exportState === "error") { setExportError(null); setExportState(exportResult ? "complete" : null); } } }}
        onTypographyChange={updateTypography}
        onBackgroundChange={updateCaptionBackground}
        onTransitionChange={(patch) => updateProjectHistory((current) => ({ ...current, transitionSettings: { ...current.transitionSettings, ...patch } }))}
        onPlaybackRateChange={(rate) => updateProjectHistory((current) => ({ ...current, playbackRate: rate }))}
        onSetShowVerseNumber={(value) => updateProjectHistory((current) => ({ ...current, showVerseNumber: value }))}
        onSetShowSafeArea={setShowSafeArea}
        onSetPlatformPreview={setPlatformPreview}
        onMoveToSafeArea={moveSelectedCaptionToSafeArea}
        onCaptionBoundsChange={handleCaptionBoundsChange}
        onApplyStyle={applyStyle}
        onSaveCurrentStyle={saveCurrentStyle}
        onSetLocalStyleName={setLocalStyleName}
        onResetSelectedObjectStyle={resetSelectedObjectStyle}
        onSetStyleScope={setStyleScope}
        onAlignTranslation={alignTranslationBelowArabic}
        onSetSplitBoundary={setSplitBoundary}
        onSplit={splitSelected}
        onMergePrevious={mergePrevious}
        onMergeNext={mergeNext}
        onTranslationFragmentChange={(text) => selectedSegment && updateProjectHistory((current) => ({ ...current, segments: updateCaptionTranslationSegment(current.segments, selectedSegment.id, text) }))}
        onResetTranslationFragment={() => selectedSegment && updateProjectHistory((current) => ({ ...current, segments: resetCaptionTranslationSegment(current.segments, selectedSegment.id) }))}
        onResetTiming={() => selectedSegment && updateProjectHistory((current) => ({ ...current, segments: resetCaptionSegmentTiming(current.segments, selectedSegment.id, projectDurationMs(mediaSource)) }))}
        onResetAllTiming={() => updateProjectHistory((current) => ({ ...current, segments: resetAllCaptionSegmentTiming(current.segments, projectDurationMs(mediaSource)) }))}
      />
      {/* <div className="hidden" aria-hidden="true">
      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-5 py-5 sm:px-8 lg:px-12 lg:py-8">
        <header className="flex items-center justify-between border-b border-[#d8d5cc] pb-5">
          <div>
            <p className="font-serif text-lg font-semibold text-[#173c32]">
              Quran Video
            </p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#7a8179]">
              Recitation editor
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#c8d4cc] bg-[#edf4ef] px-3 py-2 text-xs font-medium text-[#2e6250]">
              {dirty ? "Unsaved changes" : "Saved"}
            </span>
            <button
              className="rounded-full border border-[#c8d4cc] px-3 py-2 text-xs font-semibold text-[#35604f]"
              type="button"
              onClick={saveProject}
            >
              Save Project
            </button>
            <button
              className="rounded-full border border-[#c8d4cc] px-3 py-2 text-xs font-semibold text-[#35604f]"
              type="button"
              onClick={() => void saveToAccount()}
            >
              Save to Account
            </button>
            <button
              className="rounded-full border border-[#c8d4cc] px-3 py-2 text-xs font-semibold text-[#35604f]"
              type="button"
              onClick={() => setProjectsOpen(true)}
            >
              Open Project
            </button>
            <button
              className="rounded-full border border-[#c8d4cc] px-3 py-2 text-xs font-semibold text-[#35604f]"
              type="button"
              onClick={() => {
                void listCloudProjects().then(setCloudProjects).catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : "Could not list cloud projects."));
                setCloudProjectsOpen(true);
              }}
            >
              Cloud Projects
            </button>
            <button
              className="rounded-full border border-[#c8d4cc] px-3 py-2 text-xs font-semibold text-[#35604f]"
              type="button"
              onClick={
                savedProject ? () => void openProject(savedProject) : newProject
              }
            >
              Discard
            </button>
            <button
              className="rounded-full border border-[#c8d4cc] px-3 py-2 text-xs font-semibold text-[#35604f]"
              type="button"
              onClick={newProject}
            >
              New Project
            </button>
          </div>
        </header>
        <div className="grid flex-1 gap-8 py-8 lg:grid-cols-[minmax(0,1fr)_330px] lg:gap-12 lg:py-12">
          <section className="flex min-w-0 flex-col justify-center">
            <div className="mb-8 max-w-2xl">
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.22em] text-[#a06b31]">
                M3C/M4 · Automatic Quran detection
              </p>
              <h1 className="max-w-xl font-serif text-4xl leading-[1.08] tracking-[-0.03em] text-[#173c32] sm:text-5xl">
                Begin with a recitation.
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-[#68716a]">
                Select a video, detect its Quran passage, and preview canonical
                captions timed to the recitation. Audio stays in this browser
                and is never uploaded.
              </p>
            </div>
            {videoUrl ? (
              <>
                <div className="flex justify-center overflow-hidden rounded-[28px] border border-[#d8d5cc] bg-[#16231e] p-2 shadow-[0_20px_60px_rgba(23,60,50,0.12)]">
                  <div
                    ref={previewRef}
                    className="project-preview-canvas relative overflow-hidden rounded-[22px] bg-[#0e1713]"
                    data-project-aspect-ratio={
                      selectedFormatDefinition.aspectRatio
                    }
                    data-project-format={projectFormat.preset}
                    style={{
                      aspectRatio: `${projectFormat.width} / ${projectFormat.height}`,
                    }}
                  >
                    <video
                      ref={videoRef}
                      className="h-full w-full object-cover"
                      controls
                      playsInline
                      preload="metadata"
                      src={videoUrl}
                      data-video-fit={DEFAULT_SOURCE_VIDEO_FIT}
                      onLoadedMetadata={loadedVideoMetadata}
                      onTimeUpdate={updateTime}
                      onSeeked={updateTime}
                      onError={() =>
                        setErrorMessage(
                          "This video could not be previewed in your browser.",
                        )
                      }
                    >
                      Your browser does not support video playback.
                    </video>
                    {showSafeArea && <SafeAreaOverlay format={projectFormat} />}
                    <CaptionPreview
                      videoRef={videoRef}
                      segments={segments}
                      content={content}
                      typography={typography}
                      captionBackground={captionBackground}
                      positioning={positioning}
                      transitionSettings={transitionSettings}
                      showVerseNumber={showVerseNumber}
                      selectedObject={selectedObject}
                      onSelectObject={setSelectedObject}
                      onObjectPointerDown={handleObjectPointerDown}
                      onResizePointerDown={handleResizePointerDown}
                      onPointerMove={handleObjectPointerMove}
                      onPointerUp={handleObjectPointerUp}
                    />
                  </div>
                </div>
                {segments.length > 0 && (
                  <div className="mt-3 rounded-2xl border border-[#d8d5cc] bg-[#fbfaf6] p-4">
                    <div className="flex items-center justify-between text-xs text-[#68716a]">
                      <span>Timeline</span>
                      <span>
                        {formatDuration(videoMetadata?.durationSeconds ?? 0)} ·{" "}
                        {formatDuration(currentTimeMs / 1000)}
                      </span>
                    </div>
                    <div
                      ref={timelineRef}
                      className="relative mt-3 h-14 cursor-pointer rounded-lg bg-[#e4e8e2]"
                      onPointerDown={seekTimeline}
                      onPointerMove={handleEdgeMove}
                    >
                      <div
                        className="absolute inset-y-0 w-0.5 bg-[#a06b31]"
                        style={{
                          left: `${(currentTimeMs / Math.max(1, (videoMetadata?.durationSeconds ?? 0) * 1000)) * 100}%`,
                        }}
                      />
                      <div className="absolute inset-1 flex gap-1">
                        {segments.map((segment) => (
                          <button
                            key={segment.id}
                            type="button"
                            aria-label={`Caption ${segment.verseKeys.join(", ")}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              selectSegment(segment);
                            }}
                            className={`relative h-12 overflow-visible rounded-md border text-left text-[10px] ${segment.id === selectedSegmentId ? "border-[#173c32] bg-[#a9c5b4]" : "border-[#a9b9ad] bg-[#cbdace]"}`}
                            style={{
                              width: `${Math.max(1, ((segment.endMs - segment.startMs) / Math.max(1, (videoMetadata?.durationSeconds ?? 0) * 1000)) * 100)}%`,
                              marginLeft: `${(segment.startMs / Math.max(1, (videoMetadata?.durationSeconds ?? 0) * 1000)) * 100}%`,
                            }}
                          >
                            <span className="block truncate px-2 py-1">
                              {segment.verseKeys[0]}
                              {segment.id.includes(".")
                                ? ` part ${segment.id.split(".").at(-1)}`
                                : ""}
                            </span>
                            {segment.id === selectedSegmentId && (
                              <>
                                <span
                                  className="absolute inset-y-0 left-0 w-2 cursor-ew-resize"
                                  onPointerDown={(event) =>
                                    handleEdgeDown(event, "start", segment)
                                  }
                                  onPointerUp={handleEdgeUp}
                                />
                                <span
                                  className="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
                                  onPointerDown={(event) =>
                                    handleEdgeDown(event, "end", segment)
                                  }
                                  onPointerUp={handleEdgeUp}
                                />
                              </>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <label className="group flex min-h-[360px] cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed border-[#b9b9aa] bg-[#eeece4] px-6 text-center hover:border-[#6b907e] hover:bg-[#e7ebe4]">
                <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#173c32] text-3xl text-[#f7d88b]">
                  ↑
                </span>
                <span className="font-serif text-2xl font-semibold text-[#173c32]">
                  Choose a video
                </span>
                <span className="mt-2 max-w-xs text-sm leading-6 text-[#737b73]">
                  MP4, WebM, or another video supported by your browser
                </span>
                <span className="mt-6 rounded-full bg-[#173c32] px-5 py-2.5 text-sm font-semibold text-white">
                  Browse files
                </span>
                <input
                  accept="video/*"
                  className="sr-only"
                  type="file"
                  onChange={selectVideo}
                />
              </label>
            )}
            {videoFile && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <button
                  className="rounded-full bg-[#173c32] px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={busy || !support?.supported}
                  type="button"
                  onClick={detect}
                >
                  {stage === "complete" ? "Detect again" : "Detect Quran"}
                </button>
                {stage === "complete" && alignments.length > 0 && (
                  <button
                    className="rounded-full border border-[#c8d4cc] px-4 py-2.5 text-sm font-semibold text-[#35604f]"
                    type="button"
                    onClick={() => setShowCorrection((value) => !value)}
                  >
                    Correct detection
                  </button>
                )}
                <button
                  className="rounded-full bg-[#a06b31] px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    !segments.length ||
                    Boolean(exportState && typeof exportState === "object")
                  }
                  type="button"
                  onClick={() => {
                    setExportOpen(true);
                    setExportError(null);
                  }}
                >
                  Export Video
                </button>
                {exportState && typeof exportState === "object" && (
                  <button
                    className="rounded-full border border-[#c8d4cc] px-4 py-2.5 text-sm font-semibold text-[#35604f]"
                    type="button"
                    onClick={cancelExport}
                  >
                    Cancel export
                  </button>
                )}
                <label className="flex items-center gap-2 text-sm text-[#35604f]">
                  <input
                    checked={typography.translationVisible}
                    type="checkbox"
                    onChange={(event) =>
                      updateTypography(
                        "translationVisible",
                        event.target.checked,
                      )
                    }
                  />{" "}
                  Show Saheeh International
                </label>
                <label className="flex items-center gap-2 text-sm text-[#35604f]">
                  <input
                    checked={showVerseNumber}
                    type="checkbox"
                    onChange={(event) =>
                      setShowVerseNumber(event.target.checked)
                    }
                  />{" "}
                  Show verse number
                </label>
                <label className="flex items-center gap-2 text-sm text-[#35604f]">
                  <input
                    checked={showSafeArea}
                    type="checkbox"
                    onChange={(event) => setShowSafeArea(event.target.checked)}
                  />{" "}
                  Show safe area
                </label>
                <button
                  className="rounded-full border border-[#c8d4cc] px-4 py-2.5 text-sm font-semibold text-[#35604f]"
                  type="button"
                  onClick={clearVideo}
                >
                  Choose a different video
                </button>
              </div>
            )}
            {videoFile && exportOpen && (
              <div
                role="dialog"
                aria-label="Export video"
                className="mt-4 rounded-2xl border border-[#c8d4cc] bg-[#fbfaf6] p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-serif text-xl font-semibold text-[#173c32]">
                      Export video
                    </h2>
                    <p className="mt-1 text-xs text-[#68716a]">
                      Your project is snapshotted when export starts. Editing
                      can continue safely.
                    </p>
                  </div>
                  <button
                    className="text-sm text-[#68716a]"
                    type="button"
                    onClick={() => setExportOpen(false)}
                    disabled={Boolean(exportAbort.current)}
                  >
                    Close
                  </button>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#68716a]">
                    Format
                    <select
                      className="mt-1 w-full rounded-lg border px-2 py-2 text-sm font-normal"
                      value={projectFormat.preset}
                      disabled={Boolean(exportAbort.current)}
                      onChange={(event) =>
                        changeFormat(event.target.value as ProjectFormatPreset)
                      }
                    >
                      {(
                        Object.keys(PROJECT_FORMATS) as ProjectFormatPreset[]
                      ).map((preset) => (
                        <option key={preset} value={preset}>
                          {PROJECT_FORMATS[preset].label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold uppercase tracking-wider text-[#68716a]">
                    Quality
                    <select
                      className="mt-1 w-full rounded-lg border px-2 py-2 text-sm font-normal"
                      value={exportQuality}
                      disabled={Boolean(exportAbort.current)}
                      onChange={(event) => {
                        setExportQuality(event.target.value as ExportQuality);
                        setOutputPlan(null);
                      }}
                    >
                      {Object.values(EXPORT_QUALITY_PRESETS).map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label} — {preset.description}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="rounded-lg bg-[#edf4ef] px-3 py-2 text-xs text-[#35604f]">
                    <span className="font-semibold">Resolution</span>
                    <p className="mt-1 text-sm">
                      {exportFormatForPlan(plan, selectedFormatDefinition).width} ×{" "}
                      {exportFormatForPlan(plan, selectedFormatDefinition).height}
                    </p>
                    <p className="mt-1">{entitlements.watermarkRequired ? "Small watermark included" : "No watermark"}</p>
                    <p className="mt-1">
                      Output:{" "}
                      {outputPlan?.profile
                        ? outputPlan.profile.container.toUpperCase()
                        : "MP4 preferred; fallback WebM"}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    className="rounded-full bg-[#a06b31] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={Boolean(exportAbort.current)}
                    type="button"
                    onClick={() => void exportVideo()}
                  >
                    Export
                  </button>
                  {exportResult && exportState === "complete" && (
                    <button
                      className="rounded-full bg-[#173c32] px-5 py-2.5 text-sm font-semibold text-white"
                      type="button"
                      onClick={downloadExport}
                    >
                      Download {exportResult.fileName}
                    </button>
                  )}
                </div>
                {exportResult && exportState === "complete" && (
                  <p className="mt-3 text-xs text-[#35604f]">
                    {exportResult.fileName} ·{" "}
                    {exportResult.mimeType.includes("mp4") ? "MP4" : "WebM"} ·{" "}
                    {formatDuration(exportResult.durationSeconds)} ·{" "}
                    {(exportResult.fileSizeBytes / 1_000_000).toFixed(1)} MB
                  </p>
                )}
              </div>
            )}
            {videoFile && (
              <div aria-live="polite" className="mt-3 text-xs text-[#68716a]">
                Local export:{" "}
                {offlineWebCodecsSupport().supported
                  ? "Offline WebCodecs is available; frames and audio are read directly from this device."
                  : offlineWebCodecsSupport().reason}
              </div>
            )}
            {exportState && (
              <div
                aria-live="polite"
                className="mt-3 rounded-2xl border border-[#c8d4cc] bg-[#edf4ef] px-4 py-3 text-sm text-[#35604f]"
              >
                <p className="font-semibold">
                  {exportState === "complete"
                    ? "Completed — your local download has started."
                    : exportState === "error"
                      ? "Export stopped"
                      : exportState.phase === "preparing"
                        ? "Preparing source"
                        : exportState.phase === "decoding"
                          ? `Decoding ${Math.round(exportState.fraction * 100)}%`
                          : exportState.phase === "rendering"
                            ? `Rendering captions ${Math.round(exportState.fraction * 100)}%`
                            : exportState.phase === "encoding"
                              ? `Encoding ${Math.round(exportState.fraction * 100)}%`
                              : exportState.phase === "muxing"
                                ? "Muxing audio and video"
                                : "Finalizing"}
                </p>
                <p className="mt-1 text-xs">
                  Progress is based on the source timeline. No source media is
                  uploaded.
                </p>
              </div>
            )}
            {exportDiagnostics && (
              <details className="mt-3 rounded-xl border border-[#c8d4cc] px-4 py-3 text-xs text-[#35604f]">
                <summary className="cursor-pointer font-semibold">
                  Export diagnostics
                </summary>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  <dt>Source</dt>
                  <dd>
                    {exportDiagnostics.sourceContainer} ·{" "}
                    {exportDiagnostics.sourceVideoCodec ?? "unknown"}
                    {exportDiagnostics.sourceAudioCodec
                      ? ` + ${exportDiagnostics.sourceAudioCodec}`
                      : ""}
                  </dd>
                  <dt>Timeline</dt>
                  <dd>
                    {exportDiagnostics.sourceDurationSeconds.toFixed(2)}s ·
                    source {exportDiagnostics.sourceFps.toFixed(2)} / target{" "}
                    {exportDiagnostics.targetFps.toFixed(2)} fps · audio{" "}
                    {String(exportDiagnostics.sourceHasAudio)}
                  </dd>
                  <dt>Output</dt>
                  <dd>
                    {exportDiagnostics.outputContainer} ·{" "}
                    {exportDiagnostics.outputVideoCodec}
                    {exportDiagnostics.outputAudioCodec
                      ? ` + ${exportDiagnostics.outputAudioCodec}`
                      : ""}
                  </dd>
                  <dt>Frames</dt>
                  <dd>
                    {exportDiagnostics.renderedFrameCount}/
                    {exportDiagnostics.expectedFrameCount}
                  </dd>
                  <dt>Verification</dt>
                  <dd>
                    {exportDiagnostics.outputDurationSeconds.toFixed(2)}s ·
                    audio {String(exportDiagnostics.outputHasAudio)}
                  </dd>
                  <dt>Performance</dt>
                  <dd>
                    {exportDiagnostics.elapsedSeconds.toFixed(2)}s ·{" "}
                    {exportDiagnostics.effectiveRenderingFps.toFixed(1)} fps
                  </dd>
                </dl>
              </details>
            )}
            {exportError && (
              <p className="mt-3 rounded-xl border border-[#e3b9a9] bg-[#fff3ed] px-4 py-3 text-sm text-[#984b32]">
                {exportError}
              </p>
            )}
            {busy && (
              <div
                aria-live="polite"
                className="mt-4 rounded-2xl border border-[#c8d4cc] bg-[#edf4ef] px-4 py-3 text-sm text-[#35604f]"
              >
                <p className="font-semibold">{recognitionStatusLabel}</p>
                <p className="mt-1 text-xs">
                  Audio is processed locally and is not uploaded.
                  {progress?.phase === "transcribing" && progress.total
                    ? ` ${progress.completed ?? 0}/${progress.total} audio chunks.`
                    : ""}
                </p>
              </div>
            )}
            {stage === "complete" && alignments.length > 0 && (
              <div className="mt-4 rounded-2xl border border-[#c8d4cc] bg-[#edf4ef] p-4 text-sm text-[#35604f]">
                <p className="font-semibold">
                  Detected: Surah {alignments[0].surahNumber} (
                  {
                    hafsSurahs.find(
                      (item) => item.number === alignments[0].surahNumber,
                    )?.transliteration
                  }
                  ) · ayat {alignments[0].ayahNumber}–
                  {alignments.at(-1)?.ayahNumber}
                </p>
                <p className="mt-1">
                  {Math.round(
                    (alignments.reduce(
                      (sum, item) => sum + item.confidence,
                      0,
                    ) /
                      alignments.length) *
                      100,
                  )}
                  % overall confidence
                </p>
                <p className="mt-2 text-xs">
                  Canonical Arabic is loaded locally from the verified Tanzil
                  Hafs corpus.
                </p>
                {timingWarning && <p className="mt-2 text-xs text-[#8d5e2a]">{timingWarning}</p>}
              </div>
            )}
            {showCorrection && (
              <div className="mt-4 rounded-2xl border border-[#d8d5cc] bg-[#fbfaf6] p-4">
                <p className="font-semibold text-[#173c32]">
                  Correct detection
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <select
                    aria-label="Surah"
                    className="rounded-xl border px-2 py-2 text-sm"
                    value={surah}
                    onChange={(event) => setSurah(Number(event.target.value))}
                  >
                    {hafsSurahs.map((item) => (
                      <option key={item.number} value={item.number}>
                        {item.number} · {item.name}
                      </option>
                    ))}
                  </select>
                  <input
                    aria-label="First ayah"
                    className="rounded-xl border px-2 py-2 text-sm"
                    min={1}
                    type="number"
                    value={startAyah}
                    onChange={(event) =>
                      setStartAyah(Number(event.target.value))
                    }
                  />
                  <input
                    aria-label="Last ayah"
                    className="rounded-xl border px-2 py-2 text-sm"
                    min={1}
                    type="number"
                    value={endAyah}
                    onChange={(event) => setEndAyah(Number(event.target.value))}
                  />
                </div>
                <button
                  className="mt-3 rounded-full bg-[#173c32] px-4 py-2 text-sm font-semibold text-white"
                  type="button"
                  onClick={correctDetection}
                >
                  Use this range
                </button>
              </div>
            )}
            {segments.length > 0 && (
              <div className="mt-4 rounded-2xl border border-[#d8d5cc] bg-[#fbfaf6] p-4">
                <p className="font-semibold text-[#173c32]">Caption segments</p>
                <div className="mt-3 space-y-2">
                  {segments.map((segment, index) => (
                    <button
                      key={segment.id}
                      className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${segment.id === selectedSegmentId ? "border-[#35604f] bg-[#edf4ef]" : "border-[#e3e0d8] bg-white"}`}
                      type="button"
                      onClick={() => selectSegment(segment)}
                    >
                      <span className="font-semibold">
                        {index + 1}. {segment.verseKeys[0]}
                        {segment.id.includes(".")
                          ? ` part ${segment.id.split(".").at(-1)}`
                          : ""}
                      </span>{" "}
                      · {segment.arabic}
                    </button>
                  ))}
                </div>
                {selectedSegment && (
                  <div className="mt-3 space-y-3 border-t border-[#e3e0d8] pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#35604f]">
                      Selected segment: {selectedSegment.verseKeys.join(", ")}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-xs">
                        Start (seconds)
                        <input
                          aria-label="Segment start time"
                          className="mt-1 w-full rounded-lg border px-2 py-1"
                          type="number"
                          min="0"
                          step="0.01"
                          value={(selectedSegment.startMs / 1000).toFixed(2)}
                          onChange={(event) =>
                            updateTiming(
                              "startMs",
                              Number(event.target.value) * 1000,
                            )
                          }
                        />
                      </label>
                      <label className="text-xs">
                        End (seconds)
                        <input
                          aria-label="Segment end time"
                          className="mt-1 w-full rounded-lg border px-2 py-1"
                          type="number"
                          min="0"
                          step="0.01"
                          value={(selectedSegment.endMs / 1000).toFixed(2)}
                          onChange={(event) =>
                            updateTiming(
                              "endMs",
                              Number(event.target.value) * 1000,
                            )
                          }
                        />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <select
                        aria-label="Split Quran word boundary"
                        className="rounded-xl border px-2 py-2 text-sm"
                        value={splitBoundary}
                        onChange={(event) =>
                          setSplitBoundary(Number(event.target.value))
                        }
                      >
                        {Array.from(
                          {
                            length: Math.max(
                              0,
                              selectedSegment.arabic.trim().split(/\s+/)
                                .length - 1,
                            ),
                          },
                          (_, index) => (
                            <option key={index + 1} value={index + 1}>
                              After word {index + 1}
                            </option>
                          ),
                        )}
                      </select>
                      <button
                        className="rounded-full bg-[#173c32] px-3 py-2 text-xs font-semibold text-white"
                        type="button"
                        onClick={splitSelected}
                      >
                        Split
                      </button>
                      <button
                        className="rounded-full border px-3 py-2 text-xs"
                        type="button"
                        onClick={mergePrevious}
                        disabled={selectedIndex < 1}
                      >
                        Merge previous
                      </button>
                      <button
                        className="rounded-full border px-3 py-2 text-xs"
                        type="button"
                        onClick={mergeNext}
                        disabled={
                          selectedIndex < 0 ||
                          selectedIndex >= segments.length - 1
                        }
                      >
                        Merge next
                      </button>
                      <button
                        className="rounded-full border px-3 py-2 text-xs"
                        type="button"
                        onClick={() =>
                          setSegments((current) =>
                            resetCaptionSegmentTiming(
                              current,
                              selectedSegment.id,
                              (videoMetadata?.durationSeconds ?? 0) * 1000,
                            ),
                          )
                        }
                      >
                        Reset timing
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {errorMessage && (
              <p className="mt-3 rounded-xl border border-[#e3b9a9] bg-[#fff3ed] px-4 py-3 text-sm text-[#984b32]">
                {errorMessage}{" "}
                {stage === "error" && (
                  <button
                    className="ml-2 font-semibold underline"
                    type="button"
                    onClick={detect}
                  >
                    Retry
                  </button>
                )}
              </p>
            )}
          </section>
          <aside className="flex flex-col justify-center gap-4 lg:pb-8">
            <div className="rounded-[24px] border border-[#d8d5cc] bg-[#fbfaf6] p-6 shadow-[0_16px_45px_rgba(23,60,50,0.06)]">
              <h2 className="font-serif text-xl font-semibold text-[#173c32]">Optional account</h2>
              <AccountPanel onSessionChange={handleSessionChange} onPlanChange={setSubscriptionPlan} />
              <p className="mt-3 text-xs leading-5 text-[#737b73]">Cloud sync saves editing settings only. Your source video and exports remain on your device.</p>
            </div>
            <div className="rounded-[24px] border border-[#d8d5cc] bg-[#fbfaf6] p-6 shadow-[0_16px_45px_rgba(23,60,50,0.06)]">
              <h2 className="font-serif text-xl font-semibold text-[#173c32]">
                Caption styling
              </h2>
              {videoFile ? (
                <div className="mt-5 space-y-4">
                  <p className="truncate text-sm font-semibold text-[#35443b]">
                    {videoFile.name}
                  </p>
                  {videoMetadata && (
                    <p className="border-y border-[#e3e0d8] py-4 text-sm text-[#68716a]">
                      {formatDuration(videoMetadata.durationSeconds)} ·{" "}
                      {videoMetadata.width} × {videoMetadata.height}
                    </p>
                  )}
                  <div className="border-b border-[#e3e0d8] pb-4">
                    <label
                      className="block text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b928b]"
                      htmlFor="project-format"
                    >
                      Project format
                    </label>
                    <select
                      id="project-format"
                      aria-label="Project format"
                      className="mt-2 w-full rounded-xl border border-[#c8d4cc] bg-white px-3 py-2 text-sm"
                      value={projectFormat.preset}
                      onChange={(event) =>
                        changeFormat(event.target.value as ProjectFormatPreset)
                      }
                    >
                      {(
                        Object.keys(PROJECT_FORMATS) as ProjectFormatPreset[]
                      ).map((preset) => (
                        <option key={preset} value={preset}>
                          {PROJECT_FORMATS[preset].label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-[#68716a]">
                      Preview canvas: {selectedFormatDefinition.width} ×{" "}
                      {selectedFormatDefinition.height}
                    </p>
                  </div>
                  <label
                    className="block text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b928b]"
                    htmlFor="caption-style"
                  >
                    Style preset
                  </label>
                  <select
                    id="caption-style"
                    aria-label="Caption style preset"
                    className="w-full rounded-xl border border-[#c8d4cc] bg-white px-3 py-2 text-sm"
                    defaultValue=""
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      if (value in BUILT_IN_STYLES)
                        applyBuiltInStyle(value as BuiltInStyleName);
                      else {
                        const saved = localStyles.find(
                          (item) => item.id === value,
                        );
                        if (saved) applyStyle(saved.style);
                      }
                      event.currentTarget.value = "";
                    }}
                  >
                    <option value="">Choose a starting style…</option>
                    {(Object.keys(BUILT_IN_STYLES) as BuiltInStyleName[]).filter((name) => isBuiltInStyleAvailable(plan, name)).map(
                      (name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ),
                    )}
                    {localStyles.length > 0 && (
                      <optgroup label="My styles">
                        {localStyles.map((style) => (
                          <option key={style.id} value={style.id}>
                            {style.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <div className="flex gap-2">
                    <input
                      aria-label="Local style name"
                      className="min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm"
                      value={localStyleName}
                      onChange={(event) =>
                        setLocalStyleName(event.target.value)
                      }
                    />
                    <button
                      className="rounded-xl border border-[#c8d4cc] px-3 py-2 text-xs font-semibold text-[#35604f]"
                      type="button"
                      onClick={saveCurrentStyle}
                    >
                      Save as My Style
                    </button>
                  </div>
                  {localStyles.length > 0 && (
                    <div className="space-y-1 text-xs text-[#68716a]">
                      {localStyles.map((style) => (
                        <div
                          className="flex items-center justify-between gap-2"
                          key={style.id}
                        >
                          <span className="truncate">{style.name}</span>
                          <span className="flex gap-2">
                            <button
                              className="underline"
                              type="button"
                              onClick={() => renameStyle(style)}
                            >
                              Rename
                            </button>
                            <button
                              className="underline"
                              type="button"
                              onClick={() => removeStyle(style)}
                            >
                              Delete
                            </button>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <label
                    className="block text-[11px] font-bold uppercase tracking-[0.16em] text-[#8b928b]"
                    htmlFor="quran-script"
                  >
                    Arabic font/style
                  </label>
                  <select
                    className="w-full rounded-xl border border-[#c8d4cc] bg-white px-3 py-2 text-sm"
                    id="quran-script"
                    value={typography.quranStyle}
                    onChange={(event) => {
                      if (isQuranScript(event.target.value) && isFontAvailable(plan, event.target.value))
                        updateTypography("quranStyle", event.target.value);
                    }}
                  >
                    {Object.entries(quranFontDefinitions).map(
                      ([value, font]) => (
                        <option key={value} value={value} disabled={!isFontAvailable(plan, value)}>
                          {font.label}
                        </option>
                      ),
                    )}
                  </select>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs">
                      Arabic size
                      <input
                        className="mt-1 w-full rounded-lg border px-2 py-1"
                        type="number"
                        min="10"
                        value={typography.arabicFontSize}
                        onChange={(event) =>
                          updateTypography(
                            "arabicFontSize",
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label className="text-xs">
                      Text color
                      <input
                        className="mt-1 h-8 w-full rounded-lg border"
                        type="color"
                        value={typography.textColor}
                        onChange={(event) =>
                          updateTypography("textColor", event.target.value)
                        }
                      />
                    </label>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      checked={typography.arabicOutlineEnabled}
                      type="checkbox"
                      onChange={(event) =>
                        updateTypography(
                          "arabicOutlineEnabled",
                          event.target.checked,
                        )
                      }
                    />{" "}
                    Arabic outline
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      checked={typography.arabicShadowEnabled}
                      type="checkbox"
                      onChange={(event) =>
                        updateTypography(
                          "arabicShadowEnabled",
                          event.target.checked,
                        )
                      }
                    />{" "}
                    Arabic shadow
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs">
                      Shadow blur
                      <input
                        className="mt-1 w-full rounded-lg border px-2 py-1"
                        type="number"
                        min="0"
                        value={typography.arabicShadowBlur}
                        onChange={(event) =>
                          updateTypography(
                            "arabicShadowBlur",
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                    <label className="text-xs">
                      Arabic opacity
                      <input
                        className="mt-1 w-full rounded-lg border px-2 py-1"
                        type="number"
                        min="0"
                        max="1"
                        step="0.05"
                        value={typography.arabicOpacity}
                        onChange={(event) =>
                          updateTypography(
                            "arabicOpacity",
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                  </div>
                  <label className="text-xs">
                    Alignment
                    <select
                      className="mt-1 w-full rounded-lg border px-2 py-1"
                      value={typography.textAlign}
                      onChange={(event) =>
                        updateTypography(
                          "textAlign",
                          event.target.value as Typography["textAlign"],
                        )
                      }
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                  <label className="text-xs">
                    Line spacing
                    <input
                      className="mt-1 w-full rounded-lg border px-2 py-1"
                      type="number"
                      min="1"
                      step="0.05"
                      value={typography.arabicLineSpacing}
                      onChange={(event) =>
                        updateTypography(
                          "arabicLineSpacing",
                          Number(event.target.value),
                        )
                      }
                    />
                  </label>
                  <div className="border-t border-[#e3e0d8] pt-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        checked={typography.translationVisible}
                        type="checkbox"
                        onChange={(event) =>
                          updateTypography(
                            "translationVisible",
                            event.target.checked,
                          )
                        }
                      />{" "}
                      Show translation
                    </label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="text-xs">
                        Translation size
                        <input
                          className="mt-1 w-full rounded-lg border px-2 py-1"
                          type="number"
                          min="8"
                          value={typography.translationFontSize}
                          onChange={(event) =>
                            updateTypography(
                              "translationFontSize",
                              Number(event.target.value),
                            )
                          }
                        />
                      </label>
                      <label className="text-xs">
                        Text color
                        <input
                          className="mt-1 h-8 w-full rounded-lg border"
                          type="color"
                          value={typography.translationTextColor}
                          onChange={(event) =>
                            updateTypography(
                              "translationTextColor",
                              event.target.value,
                            )
                          }
                        />
                      </label>
                    </div>
                    <label className="mt-2 block text-xs">
                      Translation font
                      <select
                        className="mt-1 w-full rounded-lg border px-2 py-1"
                        value={typography.translationFontFamily}
                        onChange={(event) =>
                          updateTypography(
                            "translationFontFamily",
                            event.target.value,
                          )
                        }
                      >
                        <option value="Arial, Helvetica, sans-serif">
                          Arial
                        </option>
                        <option value="Georgia, serif">Georgia</option>
                        <option value="Verdana, sans-serif">Verdana</option>
                      </select>
                    </label>
                    <label className="mt-2 block text-xs">
                      Spacing below Arabic
                      <input
                        className="mt-1 w-full rounded-lg border px-2 py-1"
                        type="number"
                        min="0"
                        value={typography.translationSpacingBelowArabic}
                        onChange={(event) =>
                          updateTypography(
                            "translationSpacingBelowArabic",
                            Number(event.target.value),
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="border-t border-[#e3e0d8] pt-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8b928b]">
                      Caption position
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="text-xs">
                        Arabic X
                        <input
                          aria-label="Arabic X position"
                          className="mt-1 w-full rounded-lg border px-2 py-1"
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={positioning.x}
                          onChange={(event) =>
                            setPositioning((current) =>
                              updateCaptionPosition(
                                current,
                                "arabic",
                                Number(event.target.value),
                                current.y,
                                projectFormat,
                              ),
                            )
                          }
                        />
                      </label>
                      <label className="text-xs">
                        Arabic Y
                        <input
                          aria-label="Arabic Y position"
                          className="mt-1 w-full rounded-lg border px-2 py-1"
                          type="number"
                          min="0"
                          max="1"
                          step="0.01"
                          value={positioning.y}
                          onChange={(event) =>
                            setPositioning((current) =>
                              updateCaptionPosition(
                                current,
                                "arabic",
                                current.x,
                                Number(event.target.value),
                                projectFormat,
                              ),
                            )
                          }
                        />
                      </label>
                    </div>
                    <label className="mt-2 block text-xs">
                      Maximum width
                      <input
                        className="mt-1 w-full rounded-lg border px-2 py-1"
                        type="number"
                        min="0.2"
                        max="1"
                        step="0.01"
                        value={positioning.maxWidthPercent}
                        onChange={(event) =>
                          setPositioning((current) =>
                            clampCaptionPositioning(
                              {
                                ...current,
                                maxWidthPercent: Number(event.target.value),
                              },
                              projectFormat,
                            ),
                          )
                        }
                      />
                    </label>
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <input
                        checked={!positioning.translationPositionLinked}
                        type="checkbox"
                        onChange={(event) =>
                          setPositioning((current) => ({
                            ...current,
                            translationPositionLinked: !event.target.checked,
                          }))
                        }
                      />{" "}
                      Unlink translation position
                    </label>
                    {!positioning.translationPositionLinked && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-xs">
                          Translation X
                          <input
                            aria-label="Translation X position"
                            className="mt-1 w-full rounded-lg border px-2 py-1"
                            type="number"
                            min="0"
                            max="1"
                            step="0.01"
                            value={positioning.translationX}
                            onChange={(event) =>
                              setPositioning((current) =>
                                updateCaptionPosition(
                                  current,
                                  "translation",
                                  Number(event.target.value),
                                  current.translationY,
                                  projectFormat,
                                ),
                              )
                            }
                          />
                        </label>
                        <label className="text-xs">
                          Translation Y
                          <input
                            aria-label="Translation Y position"
                            className="mt-1 w-full rounded-lg border px-2 py-1"
                            type="number"
                            min="0"
                            max="1"
                            step="0.01"
                            value={positioning.translationY}
                            onChange={(event) =>
                              setPositioning((current) =>
                                updateCaptionPosition(
                                  current,
                                  "translation",
                                  current.translationX,
                                  Number(event.target.value),
                                  projectFormat,
                                ),
                              )
                            }
                          />
                        </label>
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-3 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          checked={typography.translationOutlineEnabled}
                          type="checkbox"
                          onChange={(event) =>
                            updateTypography(
                              "translationOutlineEnabled",
                              event.target.checked,
                            )
                          }
                        />{" "}
                        Translation outline
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          checked={typography.translationShadowEnabled}
                          type="checkbox"
                          onChange={(event) =>
                            updateTypography(
                              "translationShadowEnabled",
                              event.target.checked,
                            )
                          }
                        />{" "}
                        Translation shadow
                      </label>
                    </div>
                    <button
                      className="mt-2 rounded-full border border-[#c8d4cc] px-3 py-2 text-xs font-semibold text-[#35604f]"
                      type="button"
                      onClick={() =>
                        setPositioning(resetCaptionPositioning(projectFormat))
                      }
                    >
                      Reset position
                    </button>
                  </div>
                  <div className="border-t border-[#e3e0d8] pt-4">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8b928b]">
                      Caption transition
                    </p>
                    <label className="mt-2 block text-xs">
                      Transition type
                      <select
                        aria-label="Transition type"
                        className="mt-1 w-full rounded-lg border px-2 py-1"
                        value={transitionSettings.type}
                        onChange={(event) =>
                          setTransitionSettings((current) => ({
                            ...current,
                            type: event.target
                              .value as TransitionSettings["type"],
                          }))
                        }
                      >
                        <option value="none">None</option>
                        <option value="fade">Fade</option>
                      </select>
                    </label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <label className="text-xs">
                        Fade in (ms)
                        <input
                          aria-label="Fade-in duration"
                          className="mt-1 w-full rounded-lg border px-2 py-1"
                          type="number"
                          min="0"
                          step="25"
                          value={transitionSettings.fadeInMs}
                          onChange={(event) =>
                            setTransitionSettings((current) => ({
                              ...current,
                              fadeInMs: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                      <label className="text-xs">
                        Fade out (ms)
                        <input
                          aria-label="Fade-out duration"
                          className="mt-1 w-full rounded-lg border px-2 py-1"
                          type="number"
                          min="0"
                          step="25"
                          value={transitionSettings.fadeOutMs}
                          onChange={(event) =>
                            setTransitionSettings((current) => ({
                              ...current,
                              fadeOutMs: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <input
                        checked={transitionSettings.blurFadeEnabled}
                        type="checkbox"
                        onChange={(event) =>
                          setTransitionSettings((current) => ({
                            ...current,
                            blurFadeEnabled: event.target.checked,
                          }))
                        }
                      />{" "}
                      Blur fade
                    </label>
                    {transitionSettings.blurFadeEnabled && (
                      <label className="mt-2 block text-xs">
                        Maximum blur (px)
                        <input
                          aria-label="Maximum blur"
                          className="mt-1 w-full rounded-lg border px-2 py-1"
                          type="number"
                          min="0"
                          step="1"
                          value={transitionSettings.blurFadeMaxPx}
                          onChange={(event) =>
                            setTransitionSettings((current) => ({
                              ...current,
                              blurFadeMaxPx: Number(event.target.value),
                            }))
                          }
                        />
                      </label>
                    )}
                    <button
                      className="mt-2 w-full rounded-full border border-[#c8d4cc] px-4 py-2 text-xs font-semibold text-[#35604f]"
                      type="button"
                      onClick={resetTransitions}
                    >
                      Reset transition settings
                    </button>
                  </div>
                  <div className="border-t border-[#e3e0d8] pt-4">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        checked={captionBackground.enabled}
                        type="checkbox"
                        onChange={(event) =>
                          updateCaptionBackground(
                            "enabled",
                            event.target.checked,
                          )
                        }
                      />{" "}
                      Caption background
                    </label>
                    {captionBackground.enabled && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="text-xs">
                          Color
                          <input
                            className="mt-1 h-8 w-full rounded-lg border"
                            type="color"
                            value={captionBackground.color}
                            onChange={(event) =>
                              updateCaptionBackground(
                                "color",
                                event.target.value,
                              )
                            }
                          />
                        </label>
                        <label className="text-xs">
                          Opacity
                          <input
                            className="mt-1 w-full rounded-lg border px-2 py-1"
                            type="number"
                            min="0"
                            max="1"
                            step="0.05"
                            value={captionBackground.opacity}
                            onChange={(event) =>
                              updateCaptionBackground(
                                "opacity",
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                        <label className="text-xs">
                          Corner radius
                          <input
                            className="mt-1 w-full rounded-lg border px-2 py-1"
                            type="number"
                            min="0"
                            value={captionBackground.cornerRadius}
                            onChange={(event) =>
                              updateCaptionBackground(
                                "cornerRadius",
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                        <label className="text-xs">
                          Horizontal padding
                          <input
                            className="mt-1 w-full rounded-lg border px-2 py-1"
                            type="number"
                            min="0"
                            value={captionBackground.horizontalPadding}
                            onChange={(event) =>
                              updateCaptionBackground(
                                "horizontalPadding",
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                        <label className="text-xs">
                          Vertical padding
                          <input
                            className="mt-1 w-full rounded-lg border px-2 py-1"
                            type="number"
                            min="0"
                            value={captionBackground.verticalPadding}
                            onChange={(event) =>
                              updateCaptionBackground(
                                "verticalPadding",
                                Number(event.target.value),
                              )
                            }
                          />
                        </label>
                      </div>
                    )}
                  </div>
                  <button
                    className="w-full rounded-full border border-[#c8d4cc] px-4 py-2.5 text-sm font-semibold text-[#35604f]"
                    type="button"
                    onClick={resetTypography}
                  >
                    Reset typography/background
                  </button>
                  <p className="text-xs leading-5 text-[#737b73]">
                    Presets are starting points. Arabic, translation, position,
                    background, and transitions remain editable.
                  </p>
                </div>
              ) : (
                <p className="mt-5 text-sm leading-6 text-[#737b73]">
                  Your source video remains a temporary local browser object.
                  Nothing is uploaded or saved.
                </p>
              )}
            </div>
            {support && !support.supported && (
              <p className="rounded-xl bg-[#fff3ed] p-3 text-xs leading-5 text-[#984b32]">
                Local recognition is unavailable: {support.reason}
              </p>
            )}
            {support?.supported && (
              <p className="text-xs leading-5 text-[#8b928b]">
                {support.reason}
              </p>
            )}
          </aside>
        </div>
      </div>
      </div> */}
      {cloudSaveOpen && (
        <div className="editor-auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !cloudSaveStatus?.startsWith("Uploading")) setCloudSaveOpen(false); }}>
          <div className="editor-auth-modal cloud-save-modal" role="dialog" aria-modal="true" aria-labelledby="save-project-title">
            <button className="editor-auth-close" type="button" aria-label="Close save project" onClick={() => setCloudSaveOpen(false)}>×</button>
            <p className="editor-auth-brand">Quran Video</p><h2 id="save-project-title">Save project</h2>
            <p id="save-project-description">Save this editable project privately to your account.</p>
            <label htmlFor="cloud-project-name">Project name</label>
            <input id="cloud-project-name" maxLength={200} value={cloudSaveName} onChange={(event) => setCloudSaveName(event.target.value)} disabled={Boolean(cloudSaveStatus?.startsWith("Uploading") || cloudSaveStatus?.startsWith("Saving"))} />
            <div className="cloud-save-passage"><span>Quran passage</span><strong>{quranProjectMetadata(projectSnapshot(cloudProjectId ?? savedProject?.id ?? "draft", cloudSaveName || projectName || "Untitled project", savedProject?.createdAt ?? new Date().toISOString())).passageLabel ?? "Passage will be saved when detected"}</strong></div>
            {cloudSaveStatus && <p className={cloudSaveStatus.startsWith("Could not") || cloudSaveStatus.startsWith("Your free") || cloudSaveStatus.startsWith("Enter") ? "editor-auth-message editor-auth-error" : "editor-auth-message"} role="status">{cloudSaveStatus}</p>}
            <div className="cloud-save-actions"><button className="editor-button editor-button-quiet" type="button" onClick={() => setCloudSaveOpen(false)}>Cancel</button><button className="editor-button editor-button-accent" type="button" disabled={Boolean(cloudSaveStatus && !cloudSaveStatus.startsWith("Could not") && !cloudSaveStatus.startsWith("Your free") && !cloudSaveStatus.startsWith("Enter"))} onClick={() => void saveToCloud(cloudSaveName)}>Save project</button></div>
          </div>
        </div>
      )}
      {projectsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-[#fbfaf6] p-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-xl font-semibold text-[#173c32]">
                Local Projects
              </h2>
              <button
                className="text-sm underline"
                type="button"
                onClick={() => setProjectsOpen(false)}
              >
                Close
              </button>
            </div>
            {projects.length === 0 ? (
              <p className="mt-5 text-sm text-[#68716a]">
                No saved projects yet.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {projects.map((project) => (
                  <div
                    className="flex items-center justify-between gap-3 rounded-xl border border-[#e3e0d8] bg-white p-3"
                    key={project.id}
                  >
                    <button
                      className="min-w-0 text-left"
                      type="button"
                      onClick={() => void openProject(project)}
                    >
                      <span className="block truncate font-semibold text-[#173c32]">
                        {project.title}
                      </span>
                      <span className="block truncate text-xs text-[#68716a]">
                        {project.sourceMedia?.fileName ?? "No source"} ·{" "}
                        {project.format.preset} ·{" "}
                        {new Date(project.updatedAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      className="shrink-0 text-xs text-[#984b32] underline"
                      type="button"
                      onClick={() => void deleteProject(project)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-5 text-xs leading-5 text-[#737b73]">
              Projects save editing settings only. Your source video and exports
              stay on your device.
            </p>
          </div>
        </div>
      )}
      {cloudProjectsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl bg-[#fbfaf6] p-5 shadow-2xl">
            <div className="flex items-center justify-between"><h2 className="font-serif text-xl font-semibold text-[#173c32]">Cloud Projects</h2><button className="text-sm underline" type="button" onClick={() => setCloudProjectsOpen(false)}>Close</button></div>
            {!session ? <p className="mt-5 text-sm text-[#68716a]">Sign in to view projects saved to your account.</p> : cloudProjects.length === 0 ? <p className="mt-5 text-sm text-[#68716a]">No cloud projects yet.</p> : <div className="mt-4 space-y-2">{cloudProjects.map((project) => <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e3e0d8] bg-white p-3" key={project.id}><button className="min-w-0 text-left" type="button" onClick={() => { setCloudProjectsOpen(false); void openProject(project); }}><span className="block truncate font-semibold text-[#68716a]">{project.title}</span><span className="block truncate text-xs text-[#68716a]">{project.sourceMedia?.fileName ?? "No source"} · {new Date(project.updatedAt).toLocaleDateString()}</span></button><button className="shrink-0 text-xs text-[#984b32] underline" type="button" onClick={() => void deleteCloud(project)}>Delete</button></div>)}</div>}
            <p className="mt-5 text-xs leading-5 text-[#737b73]">Opening a cloud project restores metadata and requires you to reselect its local source video.</p>
          </div>
        </div>
      )}
    </main>
  );
}
