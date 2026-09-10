/**
 * Editor-only, approximate social safe-zone geometry. Platform interfaces
 * change regularly, so these normalized canvas coordinates intentionally do
 * not attempt to reproduce any platform's UI pixel-for-pixel.
 */
export type SocialPlatformId = "none" | "tiktok" | "instagram-reels";

export type NormalizedRect = { x: number; y: number; width: number; height: number };

export type SocialPlatformGuide = {
  id: Exclude<SocialPlatformId, "none">;
  name: string;
  recommendedAspectRatio: number;
  obstructionZones: readonly (NormalizedRect & { id: string; label: string })[];
  safeArea: NormalizedRect;
};

export type CaptionCanvasBounds = NormalizedRect & {
  segmentId: string;
  kind: "arabic" | "translation" | "transliteration";
  linked: boolean;
};

export type PlatformCollision = CaptionCanvasBounds & { obstructionId: string; obstructionLabel: string };

export const DEFAULT_SOCIAL_PLATFORM_PREVIEW: SocialPlatformId = "none";

const vertical = 9 / 16;

export const SOCIAL_PLATFORM_GUIDES: Record<Exclude<SocialPlatformId, "none">, SocialPlatformGuide> = {
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    recommendedAspectRatio: vertical,
    safeArea: { x: 0.07, y: 0.1, width: 0.74, height: 0.56 },
    obstructionZones: [
      { id: "top-controls", label: "top controls", x: 0.07, y: 0.015, width: 0.72, height: 0.075 },
      { id: "actions", label: "controls", x: 0.79, y: 0.29, width: 0.19, height: 0.42 },
      { id: "caption-audio", label: "caption area", x: 0.035, y: 0.68, width: 0.72, height: 0.18 },
      { id: "bottom-navigation", label: "bottom navigation", x: 0, y: 0.88, width: 1, height: 0.12 },
    ],
  },
  "instagram-reels": {
    id: "instagram-reels",
    name: "Instagram Reels",
    recommendedAspectRatio: vertical,
    safeArea: { x: 0.07, y: 0.1, width: 0.74, height: 0.55 },
    obstructionZones: [
      { id: "top-controls", label: "upper controls", x: 0.06, y: 0.015, width: 0.86, height: 0.075 },
      { id: "actions", label: "Reels controls", x: 0.79, y: 0.34, width: 0.19, height: 0.38 },
      { id: "profile-caption", label: "caption area", x: 0.04, y: 0.69, width: 0.72, height: 0.17 },
      { id: "bottom-controls", label: "bottom controls", x: 0, y: 0.88, width: 1, height: 0.12 },
    ],
  },
};

export function socialPlatformGuide(platform: SocialPlatformId): SocialPlatformGuide | null {
  return platform === "none" ? null : SOCIAL_PLATFORM_GUIDES[platform];
}

export function rectanglesIntersect(left: NormalizedRect, right: NormalizedRect): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y;
}

/** Converts normalized project-canvas geometry to a rendered canvas rectangle. */
export function scaleNormalizedRect(rect: NormalizedRect, canvasWidth: number, canvasHeight: number): NormalizedRect {
  return { x: rect.x * canvasWidth, y: rect.y * canvasHeight, width: rect.width * canvasWidth, height: rect.height * canvasHeight };
}

/** Uses measured canvas bounds, never caption anchors, to find occlusions. */
export function platformCaptionCollisions(platform: SocialPlatformId, bounds: readonly CaptionCanvasBounds[]): PlatformCollision[] {
  const guide = socialPlatformGuide(platform);
  if (!guide) return [];
  return bounds.flatMap((caption) => guide.obstructionZones
    .filter((zone) => rectanglesIntersect(caption, zone))
    .map((zone) => ({ ...caption, obstructionId: zone.id, obstructionLabel: zone.label })));
}

/** Returns the smallest translation that keeps a measured rectangle in the safe area and canvas. */
export function moveRectToSafeArea(bounds: NormalizedRect, safeArea: NormalizedRect): { dx: number; dy: number } {
  const width = Math.min(1, Math.max(0, bounds.width));
  const height = Math.min(1, Math.max(0, bounds.height));
  const left = Math.max(safeArea.x, Math.min(bounds.x, safeArea.x + Math.max(0, safeArea.width - width)));
  const top = Math.max(safeArea.y, Math.min(bounds.y, safeArea.y + Math.max(0, safeArea.height - height)));
  return { dx: Math.max(-bounds.x, Math.min(1 - width - bounds.x, left - bounds.x)), dy: Math.max(-bounds.y, Math.min(1 - height - bounds.y, top - bounds.y)) };
}

export function isVerticalGuideContext(width: number, height: number): boolean {
  return height > 0 && Math.abs(width / height - vertical) < 0.02;
}
