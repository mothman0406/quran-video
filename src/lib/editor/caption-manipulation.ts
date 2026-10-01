import { clampCaptionPositioning, updateCaptionPosition, type CaptionPositioning } from "./captions.ts";
import type { ProjectFormat } from "../schemas/project.ts";

/** The existing Quick Create range is the safe range used for direct editing. */
export const CAPTION_MANIPULATION_WIDTH_MIN = 0.7;
export const CAPTION_MANIPULATION_WIDTH_MAX = 0.96;

export type CaptionResizeEdge = "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

function widthForPointer(startWidth: number, edge: CaptionResizeEdge, deltaX: number): number {
  const fromLeft = edge === "left" || edge === "top-left" || edge === "bottom-left";
  const fromRight = edge === "right" || edge === "top-right" || edge === "bottom-right";
  if (!fromLeft && !fromRight) return startWidth;
  const requested = startWidth + (fromLeft ? -deltaX * 2 : deltaX * 2);
  return Math.min(CAPTION_MANIPULATION_WIDTH_MAX, Math.max(CAPTION_MANIPULATION_WIDTH_MIN, requested));
}

/**
 * Converts a pointer delta expressed in the logical stage's normalized
 * coordinates into the one saved caption presentation state. Width resize is
 * center-anchored: the opposite visual edge moves symmetrically, so corners
 * never scale fonts or change content-driven height. Top and bottom handles
 * are vertical-anchor gestures only.
 */
export function captionPositioningFromPointer(options: {
  positioning: CaptionPositioning;
  mode: "drag" | "resize";
  edge?: CaptionResizeEdge;
  deltaX: number;
  deltaY: number;
  format: ProjectFormat;
  kind: "arabic" | "translation";
}): CaptionPositioning {
  const { positioning, mode, edge, deltaX, deltaY, format, kind } = options;
  if (mode === "drag") {
    return updateCaptionPosition(
      positioning,
      kind,
      (kind === "arabic" ? positioning.x : positioning.translationX) + deltaX,
      (kind === "arabic" ? positioning.y : positioning.translationY) + deltaY,
      format,
    );
  }
  if (!edge) return clampCaptionPositioning(positioning, format);
  if (edge === "top" || edge === "bottom") {
    return updateCaptionPosition(
      positioning,
      kind,
      kind === "arabic" ? positioning.x : positioning.translationX,
      (kind === "arabic" ? positioning.y : positioning.translationY) + deltaY,
      format,
    );
  }
  const startWidth = kind === "arabic"
    ? positioning.maxWidthPercent
    : positioning.translationMaxWidthPercent ?? positioning.maxWidthPercent;
  const width = widthForPointer(startWidth, edge, deltaX);
  const next = kind === "arabic"
    ? {
        ...positioning,
        maxWidthPercent: width,
        // A linked Arabic/translation caption has one visible width authority.
        ...(positioning.translationPositionLinked ? { translationMaxWidthPercent: width } : {}),
      }
    : { ...positioning, translationMaxWidthPercent: width };
  return clampCaptionPositioning(next, format);
}
