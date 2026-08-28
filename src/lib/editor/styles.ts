import { z } from "zod";
import { CaptionStyleSchema } from "../schemas/project.ts";
import {
  DEFAULT_CAPTION_BACKGROUND,
  DEFAULT_CAPTION_POSITIONING,
  DEFAULT_TRANSITION_SETTINGS,
  DEFAULT_TYPOGRAPHY,
  type CaptionBackground,
  type CaptionPositioning,
  type TransitionSettings,
  type Typography,
} from "./captions.ts";

export type CaptionStyle = z.infer<typeof CaptionStyleSchema>;
export type BuiltInStyleName = "Minimal" | "Classic Mushaf" | "Cinematic" | "Social";

export type LocalCaptionStyle = {
  id: string;
  name: string;
  createdAt: string;
  style: CaptionStyle;
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;

const LOCAL_STYLES_KEY = "quran-video:caption-styles:v1";

function style(
  typography: Partial<Typography> = {},
  positioning: Partial<CaptionPositioning> = {},
  captionBackground: Partial<CaptionBackground> = {},
  transitionSettings: Partial<TransitionSettings> = {},
): CaptionStyle {
  return {
    typography: { ...DEFAULT_TYPOGRAPHY, ...typography },
    positioning: { ...DEFAULT_CAPTION_POSITIONING, ...positioning },
    captionBackground: { ...DEFAULT_CAPTION_BACKGROUND, ...captionBackground },
    transitionSettings: { ...DEFAULT_TRANSITION_SETTINGS, ...transitionSettings },
  };
}

export const BUILT_IN_STYLES: Record<BuiltInStyleName, CaptionStyle> = {
  Minimal: style({
    arabicFontSize: 36,
    translationFontSize: 14,
    arabicShadowBlur: 5,
    arabicShadowStrength: 0.45,
    translationShadowBlur: 4,
    translationShadowStrength: 0.4,
    translationOpacity: 0.76,
  }, { y: 0.72, translationY: 0.84 }, {}, { type: "fade", fadeInMs: 200, fadeOutMs: 200 }),
  "Classic Mushaf": style({
    quranStyle: "uthmani",
    arabicFontSize: 40,
    translationFontSize: 15,
    arabicShadowEnabled: true,
    arabicShadowBlur: 6,
    arabicShadowStrength: 0.55,
    arabicOutlineEnabled: true,
    arabicOutlineWidth: 0.5,
    arabicOutlineColor: "#14201a",
    translationOpacity: 0.8,
    textAlign: "center",
    translationTextAlign: "center",
  }, { anchor: "center", x: 0.5, y: 0.5, translationX: 0.5, translationY: 0.66 }, {}, { type: "fade", fadeInMs: 225, fadeOutMs: 225 }),
  Cinematic: style({
    arabicFontSize: 46,
    translationFontSize: 17,
    textColor: "#fffdf5",
    translationTextColor: "#f5efe0",
    arabicShadowBlur: 12,
    arabicShadowStrength: 0.8,
    translationShadowBlur: 8,
    translationShadowStrength: 0.7,
    translationOpacity: 0.9,
    arabicLineSpacing: 1.4,
  }, { y: 0.68, translationY: 0.82 }, { enabled: true, color: "#10221d", opacity: 0.56, cornerRadius: 18, horizontalPadding: 24, verticalPadding: 18 }, { type: "fade", fadeInMs: 350, fadeOutMs: 350 }),
  Social: style({
    arabicFontSize: 44,
    translationFontSize: 18,
    textColor: "#ffffff",
    translationTextColor: "#ffffff",
    arabicOutlineEnabled: true,
    arabicOutlineWidth: 1,
    arabicOutlineColor: "#101713",
    arabicShadowBlur: 8,
    arabicShadowStrength: 0.85,
    translationOutlineEnabled: true,
    translationOutlineWidth: 0.5,
    translationOutlineColor: "#101713",
    translationShadowBlur: 6,
    translationShadowStrength: 0.75,
    translationOpacity: 0.95,
  }, { anchor: "bottom", y: 0.64, translationY: 0.8, maxWidthPercent: 0.92 }, { enabled: true, color: "#08100c", opacity: 0.68, cornerRadius: 14, horizontalPadding: 18, verticalPadding: 14 }, { type: "fade", fadeInMs: 180, fadeOutMs: 180 }),
};

export const DEFAULT_CAPTION_STYLE: CaptionStyle = style();

function cloneStyle(value: CaptionStyle): CaptionStyle {
  return CaptionStyleSchema.parse(JSON.parse(JSON.stringify(value)));
}

export function captionStyleFromState(
  typography: Typography,
  positioning: CaptionPositioning,
  captionBackground: CaptionBackground,
  transitionSettings: TransitionSettings,
): CaptionStyle {
  return cloneStyle({ typography, positioning, captionBackground, transitionSettings });
}

export function captionStyleToState(value: CaptionStyle): CaptionStyle {
  return cloneStyle(value);
}

function storageOrNull(storage?: StorageLike): StorageLike | null {
  if (storage) return storage;
  return typeof window === "undefined" ? null : window.localStorage;
}

function parseLocalStyles(value: string | null): LocalCaptionStyle[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item: unknown) => {
      if (!item || typeof item !== "object") return [];
      const candidate = item as Record<string, unknown>;
      if (typeof candidate.id !== "string" || typeof candidate.name !== "string" || typeof candidate.createdAt !== "string") return [];
      try {
        return [{ id: candidate.id, name: candidate.name, createdAt: candidate.createdAt, style: CaptionStyleSchema.parse(candidate.style) }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

function writeLocalStyles(styles: readonly LocalCaptionStyle[], storage?: StorageLike): LocalCaptionStyle[] {
  const next = styles.map((item) => ({ ...item, style: cloneStyle(item.style) }));
  storageOrNull(storage)?.setItem(LOCAL_STYLES_KEY, JSON.stringify(next));
  return next;
}

export function loadLocalStyles(storage?: StorageLike): LocalCaptionStyle[] {
  return parseLocalStyles(storageOrNull(storage)?.getItem(LOCAL_STYLES_KEY) ?? null);
}

export function saveLocalStyle(name: string, value: CaptionStyle, storage?: StorageLike): LocalCaptionStyle[] {
  const trimmedName = name.trim() || "My Style";
  const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `style-${Date.now()}`;
  const saved: LocalCaptionStyle = { id, name: trimmedName, createdAt: new Date().toISOString(), style: cloneStyle(value) };
  return writeLocalStyles([...loadLocalStyles(storage), saved], storage);
}

export function renameLocalStyle(id: string, name: string, storage?: StorageLike): LocalCaptionStyle[] {
  const trimmedName = name.trim();
  if (!trimmedName) return loadLocalStyles(storage);
  return writeLocalStyles(loadLocalStyles(storage).map((item) => item.id === id ? { ...item, name: trimmedName } : item), storage);
}

export function deleteLocalStyle(id: string, storage?: StorageLike): LocalCaptionStyle[] {
  return writeLocalStyles(loadLocalStyles(storage).filter((item) => item.id !== id), storage);
}
