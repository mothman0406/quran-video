import type { CaptionSegment } from "./captions.ts";
import type { CaptionLayer } from "./styles.ts";

/** Session-only right-sidebar view; it deliberately never becomes project content. */
export type RightInspectorMode = "settings" | "subtitles";

/**
 * The one context-to-inspector rule used by editor selection entry points.
 * Playback, viewport, and panel-layout events intentionally never call this.
 */
export function rightInspectorModeForSelection(context: "caption" | "editor-object"): RightInspectorMode {
  return context === "caption" ? "subtitles" : "settings";
}

export type CaptionSelection = {
  selectedCaptionSegmentId: string | null;
  selectedCaptionLayer: CaptionLayer | null;
};

/** Timeline blocks always open the complete Arabic caption inspector. */
export function selectTimelineCaption(segment: Pick<CaptionSegment, "id">): CaptionSelection {
  return { selectedCaptionSegmentId: segment.id, selectedCaptionLayer: "arabic" };
}

/** Canvas text owns one concrete display segment, including split/prelude pieces. */
export function selectCaptionLayer(segment: Pick<CaptionSegment, "id">, layer: CaptionLayer): CaptionSelection {
  return { selectedCaptionSegmentId: segment.id, selectedCaptionLayer: layer };
}

export function clearCaptionSelection(): CaptionSelection {
  return { selectedCaptionSegmentId: null, selectedCaptionLayer: null };
}

/** The empty inspector is valid only when no real caption segment is selected. */
export function hasSelectedCaptionInspector(selection: CaptionSelection, segments: readonly Pick<CaptionSegment, "id">[]): boolean {
  return selection.selectedCaptionSegmentId !== null
    && selection.selectedCaptionLayer !== null
    && segments.some((segment) => segment.id === selection.selectedCaptionSegmentId);
}
