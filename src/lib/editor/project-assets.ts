import type { MediaSource } from "./media.ts";
import type { ProjectAsset } from "@/lib/schemas/project";

export function projectAssetFromMediaSource(source: MediaSource, id: string, createdAt = new Date().toISOString(), sourceSessionId?: string): ProjectAsset {
  return {
    id,
    type: source.kind,
    name: source.displayName || source.fileName,
    sourceOrigin: source.origin === "youtube-import" ? "youtube-import" : "local-file",
    createdAt,
    ...(source.durationMs === undefined ? {} : { durationMs: source.durationMs }),
    ...(source.width === undefined ? {} : { width: source.width }),
    ...(source.height === undefined ? {} : { height: source.height }),
    ...(source.mimeType === undefined ? {} : { mimeType: source.mimeType }),
    ...(source.sourceUrl === undefined ? {} : { sourceUrl: source.sourceUrl }),
    availability: "available",
    ...(sourceSessionId === undefined ? {} : { sourceSessionId }),
  };
}

/** Logical project text sources stay grouped; no CaptionSegment becomes an asset. */
export function projectTextAssets(segmentCount: number, translationVisible: boolean, transliterationVisible: boolean): ProjectAsset[] {
  const common = { sourceOrigin: "project-text" as const, createdAt: new Date(0).toISOString(), availability: "available" as const, segmentCount };
  return [
    { ...common, id: "project-text:quran-captions", type: "text", name: "Quran Captions" },
    ...(translationVisible ? [{ ...common, id: "project-text:translation", type: "text" as const, name: "Translation" }] : []),
    ...(transliterationVisible ? [{ ...common, id: "project-text:transliteration", type: "text" as const, name: "Transliteration" }] : []),
  ];
}
