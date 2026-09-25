import {
  DEFAULT_CAPTION_BACKGROUND,
  DEFAULT_CAPTION_EFFECTS,
  DEFAULT_TRANSITION_SETTINGS,
  DEFAULT_TYPOGRAPHY,
  clampCaptionPositioning,
  resetCaptionPositioning,
  type CaptionBackground,
  type CaptionEffects,
  type CaptionPositioning,
  type TransitionSettings,
  type Typography,
} from "./captions.ts";
import { DEFAULT_PROJECT_FORMAT } from "./formats.ts";
import type { ProjectFormat } from "../schemas/project.ts";

export const PRE_GENERATION_PRESENTATION_SECTIONS = ["layout", "quran", "translation", "effects", "toggles"] as const;
export type PreGenerationPresentationSection = (typeof PRE_GENERATION_PRESENTATION_SECTIONS)[number];
export const DEFAULT_PRE_GENERATION_PRESENTATION_SECTION: PreGenerationPresentationSection = "layout";

export type CaptionPresentationSettings = {
  projectFormat: ProjectFormat;
  positioning: CaptionPositioning;
  typography: Typography;
  captionBackground: CaptionBackground;
  transitionSettings: TransitionSettings;
  captionEffects: CaptionEffects;
  showVerseNumber: boolean;
};

export function defaultCaptionPresentationSettings(format: ProjectFormat = DEFAULT_PROJECT_FORMAT): CaptionPresentationSettings {
  return {
    projectFormat: { ...format },
    positioning: resetCaptionPositioning(format),
    typography: { ...DEFAULT_TYPOGRAPHY },
    captionBackground: { ...DEFAULT_CAPTION_BACKGROUND },
    transitionSettings: { ...DEFAULT_TRANSITION_SETTINGS },
    captionEffects: { ...DEFAULT_CAPTION_EFFECTS },
    // Quick Create historically starts without inline ayah markers. The
    // editor's independent new-project default remains unchanged.
    showVerseNumber: false,
  };
}

export function presentationForFormat(current: CaptionPresentationSettings, format: ProjectFormat): CaptionPresentationSettings {
  return {
    ...current,
    projectFormat: { ...format },
    positioning: clampCaptionPositioning(current.positioning, format),
  };
}

export function videoDimOpacity(effects: CaptionEffects): number {
  return Math.min(1, Math.max(0, effects.videoDimLevel / 100));
}

/** Full ayah display is canonical production behavior, not a recognition-affecting option. */
export const FULL_AYAH_DISPLAY_INHERENT = true;
