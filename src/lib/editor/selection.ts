import type { CaptionSegment } from "./captions.ts";
import type { CaptionLayer } from "./styles.ts";

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
