import type { ProjectFormat, ProjectFormatPreset } from "../schemas/project.ts";

export type ProjectFormatDefinition = ProjectFormat & {
  label: string;
  aspectRatio: number;
};

export const PROJECT_FORMATS: Record<ProjectFormatPreset, ProjectFormatDefinition> = {
  vertical: { preset: "vertical", width: 1080, height: 1920, label: "9:16 vertical", aspectRatio: 9 / 16 },
  landscape: { preset: "landscape", width: 1920, height: 1080, label: "16:9 landscape", aspectRatio: 16 / 9 },
  square: { preset: "square", width: 1080, height: 1080, label: "1:1 square", aspectRatio: 1 },
};

export const DEFAULT_PROJECT_FORMAT: ProjectFormat = { preset: "vertical", width: 1080, height: 1920 };

export const SAFE_AREA_OVERLAY_METADATA = { editorOnly: true, exportable: false } as const;
export const DEFAULT_SOURCE_VIDEO_FIT = "cover" as const;

export function projectFormatDefinition(format: ProjectFormat): ProjectFormatDefinition {
  return PROJECT_FORMATS[format.preset];
}

export type SafeAreaGuide =
  | {
      id: string;
      label: string;
      kind: "region";
      left: number;
      top: number;
      right: number;
      bottom: number;
      tone: "safe" | "avoid";
    }
  | { id: string; label: string; kind: "center-line"; axis: "horizontal" | "vertical" };

/** Editor-only guides. They are intentionally not part of ProjectSchema or render data. */
export const SAFE_AREA_GUIDES: Record<ProjectFormatPreset, readonly SafeAreaGuide[]> = {
  vertical: [
    { id: "title-action", label: "title / action safe", kind: "region", left: 0.08, top: 0.08, right: 0.08, bottom: 0.08, tone: "safe" },
    { id: "social-ui", label: "social UI avoidance", kind: "region", left: 0, top: 0.82, right: 0, bottom: 0, tone: "avoid" },
    { id: "center-vertical", label: "center", kind: "center-line", axis: "vertical" },
    { id: "center-horizontal", label: "center", kind: "center-line", axis: "horizontal" },
  ],
  landscape: [
    { id: "title-action", label: "title / action safe", kind: "region", left: 0.08, top: 0.08, right: 0.08, bottom: 0.08, tone: "safe" },
    { id: "center-vertical", label: "center", kind: "center-line", axis: "vertical" },
    { id: "center-horizontal", label: "center", kind: "center-line", axis: "horizontal" },
  ],
  square: [
    { id: "title-action", label: "title / action safe", kind: "region", left: 0.08, top: 0.08, right: 0.08, bottom: 0.08, tone: "safe" },
    { id: "center-vertical", label: "center", kind: "center-line", axis: "vertical" },
    { id: "center-horizontal", label: "center", kind: "center-line", axis: "horizontal" },
  ],
};

export function safeAreaGuidesForFormat(format: ProjectFormat): readonly SafeAreaGuide[] {
  return SAFE_AREA_GUIDES[format.preset];
}
