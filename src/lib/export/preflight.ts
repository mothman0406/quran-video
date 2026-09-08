import { arabicCaptionDisplay, CANONICAL_BASMALAH_ARABIC, cleanQuranArabicForDisplay } from "../editor/captions.ts";
import { isPlaybackRate } from "../editor/playback-rate.ts";
import { projectDurationMs, type MediaSource } from "../editor/media.ts";
import { getVerse } from "../quran/local.ts";
import { quranDisplayText } from "../quran/content.ts";
import type { Project, ProjectAsset } from "../schemas/project.ts";
import { platformCaptionCollisions, rectanglesIntersect, type CaptionCanvasBounds, type SocialPlatformId } from "../editor/social-platform-guides.ts";

export type ExportPreflightSeverity = "pass" | "warning" | "blocking";
export type ExportPreflightStatus = "ready" | "warnings" | "blocked";
export type ExportPreflightCategory = "quran" | "timing" | "translation" | "media" | "visual" | "runtime";
export type ExportPreflightAction = "review-caption" | "review-translation" | "relink-source" | "move-to-safe-area";

export type ExportPreflightCheck = {
  id: string;
  category: ExportPreflightCategory;
  severity: ExportPreflightSeverity;
  title: string;
  message: string;
  affectedSegmentId?: string;
  action?: ExportPreflightAction;
};

export type ExportPreflightResult = {
  status: ExportPreflightStatus;
  checks: ExportPreflightCheck[];
};

/** Runtime facts are collected by the browser host; this module never probes or mutates browser state. */
export type ExportPreflightRuntimeContext = {
  sourceAvailable: boolean;
  sourceMedia?: MediaSource | null;
  activeMediaAssetId?: string | null;
  projectAssets?: readonly ProjectAsset[];
  captionBounds?: readonly CaptionCanvasBounds[];
  platformPreview?: SocialPlatformId;
  exporterSupport?: { supported: boolean; reason: string };
  outputProfileAvailable?: boolean | null;
  playbackRateExportSupported?: boolean;
};

const LARGE_GAP_MS = 3_000;
const LARGE_OVERLAP_MS = 1_000;
type ProjectCaptionSegment = Project["captionSegments"][number];

function check(
  checks: ExportPreflightCheck[],
  input: Omit<ExportPreflightCheck, "severity"> & { severity?: ExportPreflightSeverity },
) {
  checks.push({ severity: "pass", ...input });
}

function words(value: string): string[] {
  return value.trim().split(/\s+/u).filter(Boolean);
}

function normalizedArabic(value: string): string {
  return cleanQuranArabicForDisplay(value)
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim();
}

function validColor(value: string): boolean {
  return /^#[\da-f]{3}(?:[\da-f]{3})?$/iu.test(value);
}

function visibleBounds(bounds: CaptionCanvasBounds): boolean {
  return bounds.width > 0 && bounds.height > 0 && bounds.x < 1 && bounds.y < 1 && bounds.x + bounds.width > 0 && bounds.y + bounds.height > 0;
}

function segmentStyle(project: Project, segment: ProjectCaptionSegment) {
  return {
    ...project.typography,
    ...segment.styleOverrides?.arabic?.typography,
  };
}

function addBlock(checks: ExportPreflightCheck[], id: string, category: ExportPreflightCategory, title: string, message: string, segment?: Pick<ProjectCaptionSegment, "id">, action?: ExportPreflightAction) {
  check(checks, { id, category, severity: "blocking", title, message, ...(segment ? { affectedSegmentId: segment.id } : {}), ...(action ? { action } : {}) });
}

function validateQuranSegment(project: Project, segment: ProjectCaptionSegment, checks: ExportPreflightCheck[]) {
  if (segment.contentKind === "basmalah-prelude") {
    if (segment.verseKeys.length || segment.showVerseNumberAtEnd) addBlock(checks, "basmalah-ownership", "quran", "Basmalah prelude is structurally invalid", "A basmalah prelude cannot own an ayah or carry a verse ornament.", segment, "review-caption");
    if (normalizedArabic(segment.arabic) !== normalizedArabic(CANONICAL_BASMALAH_ARABIC)) addBlock(checks, "basmalah-text", "quran", "Basmalah prelude text is inconsistent", "The prelude no longer resolves to the canonical basmalah text.", segment, "review-caption");
    return;
  }

  if (!segment.verseKeys.length) {
    addBlock(checks, "missing-verse-owner", "quran", "Quran caption has no canonical verse", "This Quran caption cannot be resolved to a canonical ayah.", segment, "review-caption");
    return;
  }
  const verses = segment.verseKeys.map((key) => getVerse(key));
  if (verses.some((verse) => !verse)) {
    addBlock(checks, "invalid-verse-key", "quran", "Quran verse reference is invalid", "A caption references an ayah that is not in the canonical corpus.", segment, "review-caption");
    return;
  }

  const sourceWords = verses.flatMap((verse) => words(quranDisplayText(verse!)));
  const singleVerse = verses.length === 1;
  const rangeIsValid = Number.isInteger(segment.wordStart)
    && Number.isInteger(segment.wordEnd)
    && segment.wordStart >= 0
    && segment.wordEnd > segment.wordStart
    && (singleVerse ? segment.wordEnd <= sourceWords.length : segment.wordCount > 0)
    && segment.wordCount === segment.wordEnd - segment.wordStart;
  if (!rangeIsValid) {
    addBlock(checks, "invalid-word-ownership", "quran", "Quran word ownership is invalid", "This caption has an invalid or reversed canonical word range.", segment, "review-caption");
    return;
  }

  // A manually merged multi-ayah display group intentionally owns the full rendered sequence.
  const expectedWords = singleVerse ? sourceWords.slice(segment.wordStart, segment.wordEnd) : sourceWords;
  if (normalizedArabic(arabicCaptionDisplay(segment, false).canonicalText) !== normalizedArabic(expectedWords.join(" "))) {
    addBlock(checks, "canonical-text-mismatch", "quran", "Quran caption text is inconsistent", "The rendered caption text no longer matches its canonical Quran ownership.", segment, "review-caption");
  }

  const timings = segment.wordTimings ?? [];
  let previousCanonicalIndex = 0;
  let previousEnd = -Infinity;
  for (const timing of timings) {
    const valid = Number.isInteger(timing.canonicalWordIndex)
      && timing.canonicalWordIndex > previousCanonicalIndex
      && Number.isInteger(timing.sourceWordStart)
      && Number.isInteger(timing.sourceWordEnd)
      && timing.sourceWordStart >= 0
      && timing.sourceWordStart < timing.sourceWordEnd
      && timing.sourceWordEnd <= words(segment.arabic).length
      && Number.isFinite(timing.startMs)
      && Number.isFinite(timing.endMs)
      && timing.startMs < timing.endMs
      && timing.startMs >= previousEnd;
    if (!valid) {
      addBlock(checks, "invalid-word-timing", "timing", "Quran word timing is invalid", "Canonical word timings must be finite and ordered before export.", segment, "review-caption");
      break;
    }
    previousCanonicalIndex = timing.canonicalWordIndex;
    previousEnd = timing.endMs;
  }

  const style = segmentStyle(project, segment);
  if (style.wordHighlightMode !== "off" && (!timings.length || timings.length !== segment.wordCount)) {
    check(checks, { id: "word-highlight-unavailable", category: "timing", severity: "warning", title: "Word highlighting is unavailable for one caption", message: "The video can still export with normal Quran text.", affectedSegmentId: segment.id, action: "review-caption" });
  }
}

function validateOwnershipSequences(segments: readonly ProjectCaptionSegment[], checks: ExportPreflightCheck[]) {
  const ayahSegments = segments.filter((segment) => segment.contentKind === "ayah" && segment.verseKeys.length === 1);
  const byVerse = new Map<string, ProjectCaptionSegment[]>();
  for (const segment of ayahSegments) {
    const key = segment.verseKeys[0]!;
    byVerse.set(key, [...(byVerse.get(key) ?? []), segment]);
  }
  for (const [verseKey, group] of byVerse) {
    const verse = getVerse(verseKey);
    if (!verse) continue;
    const sorted = [...group].sort((left, right) => left.wordStart - right.wordStart || left.wordEnd - right.wordEnd);
    let lastEnd = 0;
    for (const segment of sorted) {
      if (segment.wordStart < lastEnd) {
        addBlock(checks, "duplicate-word-ownership", "quran", "Quran word ownership is duplicated", `Caption pieces for ${verseKey} overlap the same canonical words.`, segment, "review-caption");
        break;
      }
      lastEnd = Math.max(lastEnd, segment.wordEnd);
    }
    const automaticallyGenerated = sorted.every((segment) => !segment.timingEvidence?.derived);
    const canonicalCount = words(quranDisplayText(verse)).length;
    if (automaticallyGenerated && (sorted[0]?.wordStart !== 0 || lastEnd !== canonicalCount)) {
      addBlock(checks, "missing-word-ownership", "quran", "Quran word ownership is incomplete", `An automatically generated ${verseKey} sequence no longer covers its canonical words.`, sorted[0], "review-caption");
    }
    const ornamented = group.filter((segment) => segment.showVerseNumberAtEnd !== false);
    if (ornamented.length > 1 || (ornamented.length === 1 && ornamented[0] !== group.at(-1))) {
      addBlock(checks, "verse-ornament-invariant", "quran", "Verse ornament placement is invalid", "Only the final display piece may carry this ayah's generated ornament.", ornamented[0] ?? group[0], "review-caption");
    }
  }
}

/** Deterministic, local-only validation of the project snapshot and host-provided runtime facts. */
export function runExportPreflight(project: Project, runtime: ExportPreflightRuntimeContext): ExportPreflightResult {
  const checks: ExportPreflightCheck[] = [];
  const source = runtime.sourceMedia ?? project.sourceMedia;
  const durationMs = projectDurationMs(source);
  const quranSegments = project.captionSegments.filter((segment) => segment.contentKind === "ayah");

  if (quranSegments.length && !project.verseAlignments.length) {
    addBlock(checks, "passage-unresolved", "quran", "Quran passage not resolved", "Review the canonical Quran passage before exporting.", undefined, "review-caption");
  }
  for (const segment of project.captionSegments) {
    if (!Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs) || segment.startMs >= segment.endMs || segment.startMs < 0 || (durationMs > 0 && segment.endMs > durationMs)) {
      addBlock(checks, "invalid-caption-timing", "timing", "Caption timing is invalid", "Caption intervals must be finite, ordered, and inside the source media.", segment, "review-caption");
    }
    validateQuranSegment(project, segment, checks);
  }
  validateOwnershipSequences(project.captionSegments, checks);

  const preludes = project.captionSegments.filter((segment) => segment.contentKind === "basmalah-prelude");
  if (preludes.length > 1 || (preludes.length && quranSegments.some((segment) => normalizedArabic(segment.arabic) === normalizedArabic(CANONICAL_BASMALAH_ARABIC)))) {
    addBlock(checks, "duplicate-basmalah", "quran", "Basmalah is duplicated", "The optional prelude duplicates canonical ayah text.", preludes[0], "review-caption");
  }

  const orderedQuran = [...quranSegments].sort((left, right) => left.startMs - right.startMs);
  for (let index = 1; index < orderedQuran.length; index += 1) {
    const previous = orderedQuran[index - 1]!;
    const current = orderedQuran[index]!;
    const delta = current.startMs - previous.endMs;
    if (delta < -LARGE_OVERLAP_MS) check(checks, { id: "large-caption-overlap", category: "timing", severity: "warning", title: "Quran captions overlap substantially", message: "The overlap may make both captions difficult to read.", affectedSegmentId: current.id, action: "review-caption" });
    if (delta > LARGE_GAP_MS) check(checks, { id: "large-caption-gap", category: "timing", severity: "warning", title: "Quran captions have a large gap", message: "Check whether this gap is intentional.", affectedSegmentId: current.id, action: "review-caption" });
  }

  if (durationMs <= 0 || !Number.isFinite(project.mediaTrim.startMs) || !Number.isFinite(project.mediaTrim.endMs) || project.mediaTrim.startMs < 0 || project.mediaTrim.endMs <= project.mediaTrim.startMs || (durationMs > 0 && project.mediaTrim.endMs > durationMs)) {
    addBlock(checks, "invalid-media-trim", "media", "Media trim is invalid", "The export trim must be inside a source with a positive duration.");
  }
  if (!isPlaybackRate(project.playbackRate)) addBlock(checks, "invalid-playback-rate", "timing", "Playback speed is invalid", "Choose a supported playback speed before export.");

  if (project.typography.translationVisible) {
    const translationSegments = project.captionSegments.filter((segment) => segment.contentKind === "ayah");
    if (translationSegments.some((segment) => !segment.translation)) check(checks, { id: "translation-source-missing", category: "translation", severity: "warning", title: "Translation is unavailable for one caption", message: "The video can still export with Arabic text.", action: "review-translation" });
    for (const segment of translationSegments) {
      if (segment.translationSegment?.reviewStatus === "needs-review") check(checks, { id: "translation-needs-review", category: "translation", severity: "warning", title: "Translation segment may need review", message: "This visible translation fragment uses a fallback source range.", affectedSegmentId: segment.id, action: "review-translation" });
    }
  }

  if (!runtime.sourceAvailable) addBlock(checks, "source-unavailable", "media", "Source video needs to be relinked", "The active source file is unavailable in this browser.", undefined, "relink-source");
  const activeAsset = (runtime.projectAssets ?? project.projectAssets).find((asset) => asset.id === (runtime.activeMediaAssetId ?? project.activeMediaAssetId));
  if (activeAsset?.availability === "needs-relink") addBlock(checks, "active-asset-needs-relink", "media", "Active source needs to be relinked", "Relink the active source media before export.", undefined, "relink-source");
  if (source?.hasVideo && (!source.width || !source.height || source.width <= 0 || source.height <= 0)) addBlock(checks, "invalid-video-metadata", "media", "Video metadata is invalid", "The active video needs valid dimensions before it can render.");

  const visibleQuran = quranSegments.some((segment) => segment.endMs > project.mediaTrim.startMs && segment.startMs < project.mediaTrim.endMs);
  if (quranSegments.length && !visibleQuran) check(checks, { id: "trim-excludes-quran", category: "timing", severity: "warning", title: "Your current trim excludes all Quran captions", message: "No Quran captions will be visible in the exported range.", action: "review-caption" });

  const bounds = runtime.captionBounds ?? [];
  for (const bound of bounds) {
    if (!visibleBounds(bound)) check(checks, { id: "caption-outside-canvas", category: "visual", severity: "warning", title: "Caption is outside the canvas", message: "This caption is completely invisible in the export.", affectedSegmentId: bound.segmentId, action: "review-caption" });
    else if (bound.x < 0 || bound.y < 0 || bound.x + bound.width > 1 || bound.y + bound.height > 1) check(checks, { id: "caption-clipped-by-canvas", category: "visual", severity: "warning", title: "Caption is partially outside the canvas", message: "Part of this caption may be clipped in the export.", affectedSegmentId: bound.segmentId, action: "review-caption" });
  }
  for (const arabic of bounds.filter((bound) => bound.kind === "arabic")) {
    const translation = bounds.find((bound) => bound.segmentId === arabic.segmentId && bound.kind === "translation");
    if (translation && rectanglesIntersect(arabic, translation)) check(checks, { id: "caption-layer-overlap", category: "visual", severity: "warning", title: "Arabic and translation overlap", message: "The manual layout may make one caption layer hard to read.", affectedSegmentId: arabic.segmentId, action: "review-caption" });
  }
  if (runtime.platformPreview && runtime.platformPreview !== "none") {
    for (const collision of platformCaptionCollisions(runtime.platformPreview, bounds)) check(checks, { id: "social-safe-zone-collision", category: "visual", severity: "warning", title: "Caption may be covered by platform controls", message: `This ${collision.kind} caption may be covered by ${collision.obstructionLabel}.`, affectedSegmentId: collision.segmentId, action: "move-to-safe-area" });
  }
  if (!validColor(project.typography.wordHighlightColor)) check(checks, { id: "invalid-highlight-color", category: "visual", severity: "warning", title: "Highlight color is invalid", message: "Word highlighting may not render as expected.", action: "review-caption" });

  if (runtime.exporterSupport && !runtime.exporterSupport.supported) addBlock(checks, "exporter-unsupported", "runtime", "Local export is unavailable", runtime.exporterSupport.reason);
  if (runtime.outputProfileAvailable === false) addBlock(checks, "output-profile-unavailable", "runtime", "This browser cannot encode the selected export", "Try another browser or a different source format.");
  if (project.playbackRate !== 1 && runtime.playbackRateExportSupported === false) addBlock(checks, "playback-rate-export-unsupported", "runtime", "Playback-speed export is unavailable", "This browser cannot prepare the selected playback-speed export.");

  const hasBlocking = checks.some((item) => item.severity === "blocking");
  const hasWarnings = checks.some((item) => item.severity === "warning");
  return { status: hasBlocking ? "blocked" : hasWarnings ? "warnings" : "ready", checks };
}
