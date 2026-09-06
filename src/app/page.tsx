"use client";

/* The cancellation controller is intentionally an imperative job handle; UI rendering uses exportActive state. */
import {
  ChangeEvent,
  PointerEvent,
  SyntheticEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { analyzeTranscript, createPrimaryTranscript, hafsSurahs, hafsVerses } from "@/lib/recognition/core";
import { FASTCONFORMER_MODEL, FASTCONFORMER_MODEL_ARTIFACT, FASTCONFORMER_MODEL_BYTES, FASTCONFORMER_MODEL_LICENSE, FASTCONFORMER_RUNTIME } from "@/lib/recognition/local-fastconformer";
import type { TranscriptionProgress } from "@/lib/recognition/transcriber";
import {
  recognitionToVerseAlignments,
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
  resetAllCaptionSegmentTiming,
  resetCaptionSegmentTiming,
  resetTypography as resetTypographyDefaults,
  resizeCaptionWidth,
  splitCaptionSegment,
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
  projectFormatDefinition,
} from "@/lib/editor/formats";
import type { ProjectFormat, ProjectFormatPreset } from "@/lib/schemas/project";
import type { SavedProject } from "@/lib/schemas/project";
import {
  createProjectRepository,
  sourceFingerprint,
  verifySourceFile,
  type ProjectRepository,
} from "@/lib/project-storage";
import {
  BUILT_IN_STYLES,
  captionStyleFromState,
  captionStyleToState,
  loadLocalStyles,
  saveLocalStyle,
  type BuiltInStyleName,
  type CaptionStyle,
  type LocalCaptionStyle,
} from "@/lib/editor/styles";
import { quranFontDefinitions } from "@/lib/quran/content";
import { getVerses } from "@/lib/quran/local";
import type { QuranContentResponse } from "@/lib/quran/content";
import type { QuranTranslation } from "@/lib/quran/translations";
import { localTranscriptionSupport } from "@/lib/recognition/local-whisper";
import { type CaptionObject, type CaptionResizeEdge } from "@/components/caption-preview";
import EditorWorkspace from "@/components/editor-workspace";
import { snapshotLocalExportConfiguration } from "@/lib/export/config";
import {
  inspectLocalExport,
  offlineWebCodecsSupport,
} from "@/lib/export/offline-webcodecs";
import {
  DEFAULT_EXPORT_QUALITY,
  type ExportQuality,
} from "@/lib/export/quality";
import { ExportCoordinator } from "@/lib/export/lifecycle";
import { validateLocalExportInputs } from "@/lib/export/validation";
import type {
  ExportPhase,
  LocalExportDiagnostics,
  LocalExportResult,
} from "@/lib/export/types";
import type { OutputProfile } from "@/lib/export/output";
import {
  deleteCloudProject,
  getCloudProject,
  getSupabaseClient,
  hasProjectConflict,
  listCloudProjects,
  saveCloudProject,
} from "@/lib/cloud-sync";
import type { Session } from "@supabase/supabase-js";
import { recordAuthenticatedUsage } from "@/lib/usage/client";
import { getCloudProjectLimit, getCustomStyleLimit, getPlanEntitlements, isBuiltInStyleAvailable, isFontAvailable, resolveClientPlan } from "@/lib/entitlements";
import { DEV_BUILD_VERSION } from "@/lib/build-info";

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
const busyStages: Stage[] = [
  "preparing",
  "detecting-speech",
  "loading-model",
  "transcribing",
  "matching",
  "captions",
];

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
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoMetadata, setVideoMetadata] = useState<VideoMetadata | null>(
    null,
  );
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
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
  const [timelineTooltip, setTimelineTooltip] = useState<string | null>(null);
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(
    null,
  );
  const [selectedObject, setSelectedObject] = useState<CaptionObject | null>(null);
  const [splitBoundary, setSplitBoundary] = useState(1);
  const [typography, setTypography] = useState<Typography>(DEFAULT_TYPOGRAPHY);
  const [captionBackground, setCaptionBackground] = useState<CaptionBackground>(
    DEFAULT_CAPTION_BACKGROUND,
  );
  const [projectFormat, setProjectFormat] = useState<ProjectFormat>(
    DEFAULT_PROJECT_FORMAT,
  );
  const [positioning, setPositioning] = useState<CaptionPositioning>(
    resetCaptionPositioning(DEFAULT_PROJECT_FORMAT),
  );
  const [transitionSettings, setTransitionSettings] =
    useState<TransitionSettings>(DEFAULT_TRANSITION_SETTINGS);
  const [showVerseNumber, setShowVerseNumber] = useState(
    DEFAULT_CAPTION_PRESENTATION.showVerseNumber,
  );
  const [localStyles, setLocalStyles] = useState<LocalCaptionStyle[]>([]);
  const [localStyleName, setLocalStyleName] = useState("My Style");
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [exportState, setExportState] = useState<ExportState>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportDiagnostics, setExportDiagnostics] =
    useState<LocalExportDiagnostics | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportQuality, setExportQuality] = useState<ExportQuality>(
    DEFAULT_EXPORT_QUALITY,
  );
  const [outputPlan, setOutputPlan] = useState<{
    sourceHasAudio: boolean;
    profile: OutputProfile | null;
  } | null>(null);
  const [exportResult, setExportResult] = useState<LocalExportResult | null>(
    null,
  );
  const [exportActive, setExportActive] = useState(false);
  const [surah, setSurah] = useState(93);
  const [startAyah, setStartAyah] = useState(1);
  const [endAyah, setEndAyah] = useState(5);
  const [projectName, setProjectName] = useState("Untitled project");
  const [savedProject, setSavedProject] = useState<SavedProject | null>(null);
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [cloudProjects, setCloudProjects] = useState<SavedProject[]>([]);
  const [cloudProjectsOpen, setCloudProjectsOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState<"Free" | "Creator" | "Pro">("Free");
  const [pendingOpenProject, setPendingOpenProject] =
    useState<SavedProject | null>(null);
  const [dirty, setDirty] = useState(false);
  const plan = resolveClientPlan(Boolean(session), subscriptionPlan);
  const entitlements = getPlanEntitlements(plan);
  const repository = useRef<ProjectRepository | null>(null);
  const savedSignature = useRef<string | null>(null);
  const cloudBaselineUpdatedAt = useRef<string | null>(null);
  const generation = useRef(0);
  const alignmentDebug = useRef<AlignmentDebug | null>(null);
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
  const timelineInteraction = useRef<{
    id: string;
    mode: "start" | "end" | "body";
    pointerStartMs: number;
    initialStartMs: number;
    initialEndMs: number;
  } | null>(null);
  const exportAbort = useRef<AbortController | null>(null);
  const exportCoordinator = useRef(new ExportCoordinator());

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
          .then(setProjects)
          .catch((error: unknown) =>
            setErrorMessage(
              error instanceof Error
                ? error.message
                : "Local project storage is unavailable.",
            ),
          );
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
      setSubscriptionPlan("Free");
      return;
    }
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
  useEffect(
    () => () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    },
    [videoUrl],
  );
  useEffect(() => () => exportAbort.current?.abort(), []);
  useEffect(() => {
    const font = quranFontDefinitions[typography.quranStyle];
    const style = document.createElement("style");
    style.textContent = `@font-face { font-family: "${font.family}"; src: url("${font.source}") format("woff2"); font-display: swap; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [typography.quranStyle]);
  const editorSignature = JSON.stringify({
    projectName,
    sourceVideo: videoFile
      ? {
          fileName: videoFile.name,
          fileSize: videoFile.size,
          mimeType: videoFile.type,
          durationSeconds: videoMetadata?.durationSeconds,
        }
      : (savedProject?.sourceVideo ?? null),
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
    showVerseNumber,
  });
  useEffect(() => {
    setDirty(
      savedSignature.current === null
        ? Boolean(videoFile || alignments.length || segments.length)
        : editorSignature !== savedSignature.current,
    );
  }, [editorSignature, videoFile, alignments.length, segments.length]);
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
        current.map((segment) => {
          const translation =
            segment.verseKeys
              .map((key) => payload.translations?.[key]?.text ?? null)
              .find(Boolean) ?? null;
          return translation ? { ...segment, translation } : segment;
        }),
      );
    } catch {
      /* Arabic remains available when translation enrichment fails. */
    }
  }
  function sourceMetadata(file: File, metadata = videoMetadata) {
    return {
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type || "video/*",
      durationSeconds: metadata?.durationSeconds,
      width: metadata?.width,
      height: metadata?.height,
      fingerprint: sourceFingerprint(file),
    };
  }
  function resetEditorState() {
    exportAbort.current?.abort();
    generation.current += 1;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setVideoMetadata(null);
    setAlignments([]);
    setSegments([]);
    setContent({});
    setCurrentTimeMs(0);
    setTimelineTooltip(null);
    setSelectedSegmentId(null);
    setSelectedObject(null);
    setStage("idle");
    setProgress(null);
    setErrorMessage(null);
    setTimingWarning(null);
    setPositioning(resetCaptionPositioning(projectFormat));
    setExportState(null);
    setExportError(null);
    setExportDiagnostics(null);
    setSavedProject(null);
    setPendingOpenProject(null);
    setProjectName("Untitled project");
    savedSignature.current = null;
    cloudBaselineUpdatedAt.current = null;
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
      sourceVideo: videoFile
        ? sourceMetadata(videoFile)
        : (savedProject?.sourceVideo ?? null),
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
      savedSignature.current = JSON.stringify({
        projectName: title,
        sourceVideo: project.sourceVideo,
        format: project.format,
        verseAlignments: project.verseAlignments,
        captionSegments: project.captionSegments,
        captions: project.captions,
        positioning: project.positioning,
        captionBackground: project.captionBackground,
        typography: project.typography,
        transitionSettings: project.transitionSettings,
        showVerseNumber: project.showVerseNumber,
      });
      setDirty(false);
      setProjects(await repository.current.list());
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save the project locally.",
      );
    }
  }
  async function saveToAccount() {
    if (!session || !getSupabaseClient()) {
      setErrorMessage("Sign in to save project metadata to your account.");
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
    const local = projectSnapshot(
      savedProject?.id ?? crypto.randomUUID(),
      title,
      savedProject?.createdAt ?? now,
    );
    try {
      const remote = await getCloudProject(local.id);
      const currentCloudProjects = await listCloudProjects();
      setCloudProjects(currentCloudProjects);
      if (!remote && currentCloudProjects.length >= getCloudProjectLimit(plan)) {
        setErrorMessage(`Your ${plan} plan supports up to ${getCloudProjectLimit(plan)} cloud projects.`);
        return;
      }
      const hasRemoteChange = Boolean(
        remote &&
          ((cloudBaselineUpdatedAt.current &&
            remote.updatedAt !== cloudBaselineUpdatedAt.current) ||
            (!cloudBaselineUpdatedAt.current &&
              hasProjectConflict(savedProject, remote))),
      );
      if (hasRemoteChange) {
        if (
          !window.confirm(
            "The cloud version changed since this project was opened. Choose OK to replace it with this local version, or Cancel to open the cloud version.",
          )
        ) {
          if (remote) await openProject(remote, true);
          return;
        }
      }
      const saved = await saveCloudProject(local);
      void recordAuthenticatedUsage("cloud_project_saved", `${saved.id}:${saved.updatedAt}`).catch(() => undefined);
      cloudBaselineUpdatedAt.current = saved.updatedAt;
      setSavedProject(saved);
      setProjectName(saved.title);
      setCloudProjects(await listCloudProjects());
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Could not save the project to your account.",
      );
    }
  }
  async function openProject(project: SavedProject, fromCloud = cloudProjectsOpen) {
    if (
      dirty &&
      !window.confirm("Discard unsaved changes and open this project?")
    )
      return;
    setProjectsOpen(false);
    clearVideo();
    setSavedProject(project);
    setPendingOpenProject(project);
    setProjectName(project.title);
    setProjectFormat(project.format);
    setAlignments(project.verseAlignments as VerseAlignment[]);
    setSegments(project.captionSegments as CaptionSegment[]);
    setPositioning(project.positioning);
    setCaptionBackground(project.captionBackground);
    setTypography(project.typography);
    setTransitionSettings(project.transitionSettings);
    setShowVerseNumber(project.showVerseNumber);
    setSelectedSegmentId(null);
    setSelectedObject(null);
    setContent({});
    cloudBaselineUpdatedAt.current = fromCloud ? project.updatedAt : null;
    savedSignature.current = JSON.stringify({
      projectName: project.title,
      sourceVideo: project.sourceVideo,
      format: project.format,
      verseAlignments: project.verseAlignments,
      captionSegments: project.captionSegments,
      captions: project.captions,
      positioning: project.positioning,
      captionBackground: project.captionBackground,
      typography: project.typography,
      transitionSettings: project.transitionSettings,
      showVerseNumber: project.showVerseNumber,
    });
    setDirty(false);
    const keys = [
      ...new Set(
        project.captionSegments.flatMap((segment) => segment.verseKeys),
      ),
    ];
    const job = ++generation.current;
    await loadCanonical(keys, job);
    await loadTranslations(keys, job);
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
  function selectVideo(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0];
    if (!next) return;
    if (!next.type.startsWith("video/")) {
      setErrorMessage("Choose a video file to start a local editing session.");
      return;
    }
    exportAbort.current?.abort();
    generation.current += 1;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const opening = pendingOpenProject;
    setVideoFile(next);
    setVideoUrl(URL.createObjectURL(next));
    setVideoMetadata(null);
    setErrorMessage(
      opening
        ? `Reselect source video: ${opening.sourceVideo?.fileName ?? next.name}`
        : null,
    );
    setStage("idle");
    setProgress(null);
    if (!opening) {
      setAlignments([]);
      setSegments([]);
      setContent({});
      setCurrentTimeMs(0);
      setPositioning(resetCaptionPositioning(projectFormat));
      setExportState(null);
      setExportError(null);
      setExportDiagnostics(null);
    }
  }
  function loadedVideoMetadata(event: SyntheticEvent<HTMLVideoElement>) {
    const metadata = {
      durationSeconds: event.currentTarget.duration,
      width: event.currentTarget.videoWidth,
      height: event.currentTarget.videoHeight,
    };
    setVideoMetadata(metadata);
    if (pendingOpenProject) {
      const result = verifySourceFile(
        videoFile!,
        pendingOpenProject.sourceVideo,
        metadata.durationSeconds,
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
  async function detect() {
    if (!videoFile || !support?.supported || busyStages.includes(stage)) return;
    const job = ++generation.current;
    setErrorMessage(null);
    setProgress(null);
    setAlignments([]);
    setSegments([]);
    setContent({});
    setStage("preparing");
    try {
      const { localWhisperTranscriber } =
        await import("@/lib/recognition/local-whisper");
      const result = await localWhisperTranscriber.transcribe(
        videoFile,
        (next) => {
          if (job !== generation.current) return;
          setProgress(next);
          setStage(next.phase === "decoding" ? "preparing" : next.phase);
        },
      );
      if (job !== generation.current) return;
      setStage("matching");
      const primaryTranscript = createPrimaryTranscript(result.chunks, result.timestampMode);
      let analysis = analyzeTranscript(primaryTranscript, {
        audioAnalysis: result.audioAnalysis,
        speechRegions: result.speechRegions,
      });
      const fastConformerAlignment = analysis.matches.length && result.runFastConformer
        ? await result.runFastConformer(hafsVerses.filter((verse) => new Set(analysis.matches.map((match) => match.verseKey)).has(verse.verseKey)), analysis.matches)
        : null;
      if (fastConformerAlignment) {
        analysis = analyzeTranscript(primaryTranscript, {
          audioAnalysis: result.audioAnalysis,
          speechRegions: result.speechRegions,
          fastConformerResult: fastConformerAlignment,
        });
      }
      if (analysis.matches.length === 0)
        throw new Error(
          "No confident Quran passage was detected. You can try again or correct it manually.",
        );
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
      );
      const displayPrelude = nextSegments.find((segment) => segment.contentKind === "basmalah-prelude") ?? null;
      setAlignments(next);
      setSegments(nextSegments);
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
          startMs: segment.startMs,
          endMs: segment.endMs,
          revision: `${segment.id}:${segment.startMs}-${segment.endMs}`,
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
      await loadCanonical(keys, job);
      await loadTranslations(keys, job);
      if (job === generation.current) setStage("complete");
    } catch (caught) {
      if (job === generation.current) {
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
  function clearVideo() {
    exportAbort.current?.abort();
    generation.current += 1;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoFile(null);
    setVideoUrl(null);
    setVideoMetadata(null);
    setAlignments([]);
    setSegments([]);
    setContent({});
    setProgress(null);
    setStage("idle");
    setErrorMessage(null);
    setCurrentTimeMs(0);
    setTimelineTooltip(null);
    setSelectedObject(null);
    setPositioning(resetCaptionPositioning(projectFormat));
    setExportState(null);
    setExportError(null);
    setExportDiagnostics(null);
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
    setStage("captions");
    setErrorMessage(null);
    try {
      const keys = next.map((item) => item.verseKey);
      await loadCanonical(keys, job);
      await loadTranslations(keys, job);
      if (job === generation.current) {
        setStage("complete");
        setShowCorrection(false);
      }
    } catch {
      if (job === generation.current) {
        setStage("error");
        setErrorMessage("Canonical captions could not be loaded locally.");
      }
    }
  }
  function updateTime(event: SyntheticEvent<HTMLVideoElement>) {
    setCurrentTimeMs(event.currentTarget.currentTime * 1000);
  }
  const seekTo = useCallback(
    (ms: number) => {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime =
        Math.max(
          0,
          Math.min(ms, (videoMetadata?.durationSeconds ?? 0) * 1000),
        ) / 1000;
      setCurrentTimeMs(video.currentTime * 1000);
    },
    [videoMetadata],
  );
  function selectSegment(segment: CaptionSegment) {
    setSelectedSegmentId(segment.id);
    setSelectedObject(null);
    setSplitBoundary(
      Math.max(1, Math.ceil(segment.arabic.trim().split(/\s+/).length / 2)),
    );
    seekTo(Math.min(segment.startMs + 250, Math.max(segment.startMs, segment.endMs - 1)));
  }
  const handleObjectPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>, kind: CaptionObject) => {
      event.stopPropagation();
      setSelectedObject(kind);
      canvasInteraction.current = {
        kind,
        mode: "drag",
        pointerX: event.clientX,
        pointerY: event.clientY,
        positioning: { ...positioning, translationPositionLinked: false },
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [positioning],
  );
  const handleResizePointerDown = useCallback(
    (event: PointerEvent<HTMLButtonElement>, kind: CaptionObject, edge: CaptionResizeEdge) => {
      event.stopPropagation();
      setSelectedObject(kind);
      canvasInteraction.current = {
        kind,
        mode: "resize",
        edge,
        pointerX: event.clientX,
        pointerY: event.clientY,
        positioning: { ...positioning, translationPositionLinked: false },
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [positioning],
  );
  const handleObjectPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const interaction = canvasInteraction.current;
      const rect = previewRef.current?.getBoundingClientRect();
      if (!interaction || !rect) return;
      const dx = (event.clientX - interaction.pointerX) / rect.width;
      const dy = (event.clientY - interaction.pointerY) / rect.height;
      if (interaction.mode === "drag") {
        const start = interaction.positioning;
        setPositioning(updateCaptionPosition(start, interaction.kind, interaction.kind === "arabic" ? start.x + dx : start.translationX + dx, interaction.kind === "arabic" ? start.y + dy : start.translationY + dy, projectFormat));
      } else {
        const startWidth = interaction.kind === "arabic" ? interaction.positioning.maxWidthPercent : (interaction.positioning.translationMaxWidthPercent ?? interaction.positioning.maxWidthPercent);
        const direction = interaction.edge === "left" ? -1 : 1;
        const nextWidth = startWidth + direction * dx * 2;
        setPositioning(resizeCaptionWidth(interaction.positioning, interaction.kind, nextWidth, projectFormat));
      }
    },
    [projectFormat],
  );
  const handleObjectPointerUp = useCallback(() => {
    canvasInteraction.current = null;
  }, []);
  function timelineTimeFromPointer(event: PointerEvent<HTMLElement>) {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    return (
      Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)) *
      (videoMetadata?.durationSeconds ?? 0) *
      1000
    );
  }
  function seekTimeline(event: PointerEvent<HTMLElement>) {
    seekTo(timelineTimeFromPointer(event));
  }
  function formatTimelineTime(value: number) {
    const milliseconds = Math.max(0, Math.round(value));
    const minutes = Math.floor(milliseconds / 60_000);
    const seconds = Math.floor((milliseconds % 60_000) / 1_000);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds % 1_000).padStart(3, "0")}`;
  }
  function snapTimelineTime(value: number, id: string) {
    const maxMs = Math.max(1, (videoMetadata?.durationSeconds ?? 0) * 1_000);
    const candidates = [currentTimeMs, ...segments.flatMap((segment) => segment.id === id ? [] : [segment.startMs, segment.endMs])];
    const nearby = candidates.find((candidate) => Math.abs(candidate - value) <= 80);
    return Math.max(0, Math.min(maxMs, Math.round(nearby ?? value)));
  }
  function handleSegmentPointerDown(event: PointerEvent<HTMLButtonElement>, segment: CaptionSegment) {
    event.stopPropagation();
    const pointerStartMs = timelineTimeFromPointer(event);
    setSelectedSegmentId(segment.id);
    setSelectedObject(null);
    setSplitBoundary(Math.max(1, Math.ceil(segment.arabic.trim().split(/\s+/).length / 2)));
    timelineInteraction.current = { id: segment.id, mode: "body", pointerStartMs, initialStartMs: segment.startMs, initialEndMs: segment.endMs };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function handleEdgeDown(
    event: PointerEvent<HTMLElement>,
    edge: "start" | "end",
    segment: CaptionSegment,
  ) {
    event.stopPropagation();
    selectSegment(segment);
    timelineInteraction.current = { id: segment.id, mode: edge, pointerStartMs: timelineTimeFromPointer(event), initialStartMs: segment.startMs, initialEndMs: segment.endMs };
    draggingEdge.current = edge;
    setTimelineTooltip(formatTimelineTime(edge === "start" ? segment.startMs : segment.endMs));
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function handleEdgeMove(event: PointerEvent<HTMLElement>) {
    const interaction = timelineInteraction.current;
    if (!interaction) return;
    const nextTime = timelineTimeFromPointer(event);
    const snapped = snapTimelineTime(nextTime, interaction.id);
    const delta = snapped - interaction.pointerStartMs;
    const nextPatch = interaction.mode === "body"
      ? (() => {
          const duration = interaction.initialEndMs - interaction.initialStartMs;
          const startMs = Math.max(0, Math.min(Math.max(1, (videoMetadata?.durationSeconds ?? 0) * 1_000) - duration, snapTimelineTime(interaction.initialStartMs + delta, interaction.id)));
          return { startMs, endMs: startMs + duration };
        })()
      : interaction.mode === "start" ? { startMs: snapped } : { endMs: snapped };
    setSegments((current) =>
      updateCaptionSegmentTiming(
        current,
        interaction.id,
        nextPatch,
        (videoMetadata?.durationSeconds ?? 0) * 1000,
      ),
    );
    setTimelineTooltip(formatTimelineTime(interaction.mode === "end" ? nextPatch.endMs ?? snapped : nextPatch.startMs ?? snapped));
  }
  function handleEdgeUp() {
    draggingEdge.current = null;
    timelineInteraction.current = null;
    setTimelineTooltip(null);
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
      if (event.code === "Space") {
        event.preventDefault();
        const video = videoRef.current;
        if (video) void (video.paused ? video.play() : video.pause());
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
  }, [currentTimeMs, seekTo]);

  const busy = busyStages.includes(stage);
  const selectedIndex = segments.findIndex(
    (segment) => segment.id === selectedSegmentId,
  );
  const selectedSegment = selectedIndex >= 0 ? segments[selectedIndex] : null;
  const selectedFormatDefinition = projectFormatDefinition(projectFormat);
  const updateTypography = <K extends keyof Typography>(
    key: K,
    value: Typography[K],
  ) => setTypography((current) => ({ ...current, [key]: value }));
  const updateCaptionBackground = <K extends keyof CaptionBackground>(
    key: K,
    value: CaptionBackground[K],
  ) => setCaptionBackground((current) => ({ ...current, [key]: value }));
  function applyStyle(style: CaptionStyle) {
    const next = captionStyleToState(style);
    setTypography(next.typography);
    setPositioning(clampCaptionPositioning(next.positioning, projectFormat));
    setCaptionBackground(next.captionBackground);
    setTransitionSettings(next.transitionSettings);
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
    const defaults = resetTypographyDefaults();
    if (selectedObject === "arabic") {
      setTypography((current) => ({ ...current, quranStyle: defaults.quranStyle, arabicFontFamily: defaults.arabicFontFamily, arabicFontSize: defaults.arabicFontSize, textColor: defaults.textColor, arabicOutlineEnabled: defaults.arabicOutlineEnabled, arabicOutlineWidth: defaults.arabicOutlineWidth, arabicOutlineColor: defaults.arabicOutlineColor, arabicShadowEnabled: defaults.arabicShadowEnabled, arabicShadowBlur: defaults.arabicShadowBlur, arabicShadowStrength: defaults.arabicShadowStrength, arabicOpacity: defaults.arabicOpacity, textAlign: defaults.textAlign, arabicLineSpacing: defaults.arabicLineSpacing }));
    } else if (selectedObject === "translation") {
      setTypography((current) => ({ ...current, translationFontFamily: defaults.translationFontFamily, translationFontSize: defaults.translationFontSize, translationTextColor: defaults.translationTextColor, translationOutlineEnabled: defaults.translationOutlineEnabled, translationOutlineWidth: defaults.translationOutlineWidth, translationOutlineColor: defaults.translationOutlineColor, translationShadowEnabled: defaults.translationShadowEnabled, translationShadowBlur: defaults.translationShadowBlur, translationShadowStrength: defaults.translationShadowStrength, translationOpacity: defaults.translationOpacity, translationTextAlign: defaults.translationTextAlign, translationSpacingBelowArabic: defaults.translationSpacingBelowArabic, translationVisible: defaults.translationVisible }));
    }
  }
  function alignTranslationBelowArabic() {
    setPositioning((current) => clampCaptionPositioning({ ...current, translationPositionLinked: true }, projectFormat));
  }
  function changeFormat(preset: ProjectFormatPreset) {
    const definition = PROJECT_FORMATS[preset];
    const next: ProjectFormat = {
      preset: definition.preset,
      width: definition.width,
      height: definition.height,
    };
    setProjectFormat(next);
    setPositioning((current) => clampCaptionPositioning(current, next));
  }
  function splitSelected() {
    if (!selectedSegment) return;
    setSegments((current) => {
      const index = current.findIndex(
        (segment) => segment.id === selectedSegment.id,
      );
      return index < 0
        ? current
        : [
            ...current.slice(0, index),
            ...splitCaptionSegment(selectedSegment, splitBoundary),
            ...current.slice(index + 1),
          ];
    });
    setSelectedSegmentId(null);
  }
  function mergePrevious() {
    if (selectedIndex < 1) return;
    setSegments((current) => mergeCaptionWithPrevious(current, selectedIndex));
    setSelectedSegmentId(null);
  }
  function mergeNext() {
    if (selectedIndex < 0 || selectedIndex >= segments.length - 1) return;
    setSegments((current) => mergeCaptionWithNext(current, selectedIndex));
    setSelectedSegmentId(null);
  }
  async function exportVideo() {
    if (!videoFile || exportAbort.current || !exportCoordinator.current.start())
      return;
    const capability = offlineWebCodecsSupport();
    if (!capability.supported) {
      setExportError(capability.reason);
      exportCoordinator.current.finish();
      return;
    }
    const snapshot = snapshotLocalExportConfiguration({
      format: projectFormat,
      segments,
      typography,
      captionBackground,
      positioning,
      transitionSettings,
      showVerseNumber,
      plan,
    });
    const validationErrors = validateLocalExportInputs(videoFile, snapshot);
    if (validationErrors.length) {
      setExportError(validationErrors[0]);
      exportCoordinator.current.finish();
      return;
    }
    const controller = new AbortController();
    exportAbort.current = controller;
    setExportActive(true);
    setExportError(null);
    setExportResult(null);
    setExportState({ phase: "preparing", fraction: 0, elapsedSeconds: 0 });
    try {
      const plan = await inspectLocalExport(
        videoFile,
        snapshot.format,
        exportQuality,
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
        source: videoFile,
        ...snapshot,
        quality: exportQuality,
        signal: controller.signal,
        onProgress: setExportState,
      });
      void recordAuthenticatedUsage("export_completed", crypto.randomUUID()).catch(() => undefined);
      setExportResult(output);
      setExportDiagnostics(output.diagnostics);
      setExportState("complete");
    } catch (caught) {
      if ((caught as DOMException)?.name === "AbortError")
        setExportError(
          "Export cancelled. Your source video and editor state were kept.",
        );
      else
        setExportError(
          caught instanceof Error
            ? caught.message
            : "Local export failed. Your project was kept.",
        );
      setExportState("error");
    } finally {
      exportAbort.current = null;
      setExportActive(false);
      exportCoordinator.current.finish();
    }
  }
  function cancelExport() {
    if (exportActive) exportAbort.current?.abort();
  }
  function downloadExport() {
    if (!exportResult) return;
    const url = URL.createObjectURL(exportResult.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportResult.fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  return (
    <main className="min-h-screen bg-[#f5f2eb] text-[#17211b]">
      <EditorWorkspace
        videoFile={videoFile}
        videoUrl={videoUrl}
        videoMetadata={videoMetadata}
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
        splitBoundary={splitBoundary}
        typography={typography}
        captionBackground={captionBackground}
        projectFormat={projectFormat}
        positioning={positioning}
        transitionSettings={transitionSettings}
        showVerseNumber={showVerseNumber}
        showSafeArea={showSafeArea}
        projectName={projectName}
        dirty={dirty}
        busy={busy}
        localStyles={localStyles}
        localStyleName={localStyleName}
        availableBuiltInStyles={(Object.keys(BUILT_IN_STYLES) as BuiltInStyleName[]).filter((name) => isBuiltInStyleAvailable(plan, name))}
        availableQuranStyles={Object.keys(quranFontDefinitions).filter((name) => isFontAvailable(plan, name))}
        exportOpen={exportOpen}
        exportQuality={exportQuality}
        outputPlan={outputPlan}
        exportResult={exportResult}
        exportState={exportState}
        exportError={exportError}
        exportDiagnostics={exportDiagnostics}
        errorMessage={errorMessage}
        timingWarning={timingWarning}
        timelineTooltip={timelineTooltip}
        showCorrection={showCorrection}
        surah={surah}
        startAyah={startAyah}
        endAyah={endAyah}
        entitlements={entitlements}
        selectedFormatDefinition={selectedFormatDefinition}
        onProjectNameChange={setProjectName}
        onVideoSelect={selectVideo}
        onLoadedMetadata={loadedVideoMetadata}
        onVideoTimeUpdate={updateTime}
        onVideoError={() => setErrorMessage("This video could not be previewed in your browser.")}
        onSelectObject={setSelectedObject}
        onObjectPointerDown={handleObjectPointerDown}
        onResizePointerDown={handleResizePointerDown}
        onObjectPointerMove={handleObjectPointerMove}
        onObjectPointerUp={handleObjectPointerUp}
        onCanvasBackgroundPointerDown={() => setSelectedObject(null)}
        onSelectSegment={selectSegment}
        onSegmentPointerDown={handleSegmentPointerDown}
        onTimelinePointerDown={seekTimeline}
        onTimelinePointerMove={handleEdgeMove}
        onEdgeDown={handleEdgeDown}
        onEdgeUp={handleEdgeUp}
        onChangeFormat={changeFormat}
        onDetect={() => void detect()}
        onCopyAlignmentDebug={() => { void copyAlignmentDebug(); }}
        onCorrectDetection={() => void correctDetection()}
        onToggleCorrection={() => setShowCorrection((value) => !value)}
        onClearVideo={clearVideo}
        onSaveProject={() => void saveProject()}
        onSaveToAccount={() => void saveToAccount()}
        onOpenProjects={() => setProjectsOpen(true)}
        onOpenCloudProjects={() => { void listCloudProjects().then(setCloudProjects).catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : "Could not list cloud projects.")); setCloudProjectsOpen(true); }}
        onSessionChange={handleSessionChange}
        onPlanChange={setSubscriptionPlan}
        onDiscard={savedProject ? () => void openProject(savedProject) : newProject}
        onNewProject={newProject}
        onExportOpen={() => { setExportOpen(true); setExportError(null); }}
        onExport={() => void exportVideo()}
        onCancelExport={cancelExport}
        onDownloadExport={downloadExport}
        onSetExportQuality={(quality) => { setExportQuality(quality); setOutputPlan(null); }}
        onSetExportOpen={setExportOpen}
        onTypographyChange={updateTypography}
        onBackgroundChange={updateCaptionBackground}
        onTransitionChange={(patch) => setTransitionSettings((current) => ({ ...current, ...patch }))}
        onSetShowVerseNumber={setShowVerseNumber}
        onSetShowSafeArea={setShowSafeArea}
        onApplyStyle={applyStyle}
        onSaveCurrentStyle={saveCurrentStyle}
        onSetLocalStyleName={setLocalStyleName}
        onResetSelectedObjectStyle={resetSelectedObjectStyle}
        onAlignTranslation={alignTranslationBelowArabic}
        onSetSplitBoundary={setSplitBoundary}
        onSplit={splitSelected}
        onMergePrevious={mergePrevious}
        onMergeNext={mergeNext}
        onResetTiming={() => selectedSegment && setSegments((current) => resetCaptionSegmentTiming(current, selectedSegment.id, (videoMetadata?.durationSeconds ?? 0) * 1000))}
        onResetAllTiming={() => setSegments((current) => resetAllCaptionSegmentTiming(current, (videoMetadata?.durationSeconds ?? 0) * 1000))}
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
                <p className="font-semibold">{stageLabel(stage)}</p>
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
                        {project.sourceVideo?.fileName ?? "No source"} ·{" "}
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
            {!session ? <p className="mt-5 text-sm text-[#68716a]">Sign in to view projects saved to your account.</p> : cloudProjects.length === 0 ? <p className="mt-5 text-sm text-[#68716a]">No cloud projects yet.</p> : <div className="mt-4 space-y-2">{cloudProjects.map((project) => <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e3e0d8] bg-white p-3" key={project.id}><button className="min-w-0 text-left" type="button" onClick={() => { setCloudProjectsOpen(false); void openProject(project); }}><span className="block truncate font-semibold text-[#173c32]">{project.title}</span><span className="block truncate text-xs text-[#68716a]">{project.sourceVideo?.fileName ?? "No source"} · {new Date(project.updatedAt).toLocaleDateString()}</span></button><button className="shrink-0 text-xs text-[#984b32] underline" type="button" onClick={() => void deleteCloud(project)}>Delete</button></div>)}</div>}
            <p className="mt-5 text-xs leading-5 text-[#737b73]">Opening a cloud project restores metadata and requires you to reselect its local source video.</p>
          </div>
        </div>
      )}
    </main>
  );
}
