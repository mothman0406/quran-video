import { z } from "zod";

const PositiveNumber = z.number().finite().nonnegative();
const PositiveInteger = z.number().int().positive();

export const SourceVideoSchema = z.strictObject({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  fileSize: PositiveNumber.optional(),
  durationSeconds: PositiveNumber.optional(),
  width: PositiveInteger.optional(),
  height: PositiveInteger.optional(),
  fingerprint: z.string().min(1).optional(),
});

export const ProjectFormatSchema = z.strictObject({
  preset: z.enum(["vertical", "square", "landscape"]),
  width: PositiveInteger,
  height: PositiveInteger,
});

export type ProjectFormatPreset = z.infer<typeof ProjectFormatSchema>["preset"];

export const VerseKeySchema = z.strictObject({
  surahNumber: z.number().int().min(1).max(114),
  ayahNumber: PositiveInteger,
});

export const VerseAlignmentSchema = VerseKeySchema.extend({
  verseKey: z.string().regex(/^\d{1,3}:\d{1,3}$/),
  startMs: PositiveNumber,
  endMs: PositiveNumber,
  confidence: z.number().finite().min(0).max(1),
  timingEvidence: z.strictObject({
    start: z.strictObject({ timestampMs: PositiveNumber, source: z.enum(["fastconformer", "word-audio-refined", "word-timestamp", "merged-token-word1", "bounded-recovery", "token-interpolated", "chunk-interpolated", "low-confidence-fallback", "direct-asr-word", "chunk-text-alignment", "interpolation", "interpolated", "low-confidence", "micro-asr", "pcm-refined", "chunk-coarse", "unknown"]) }),
    end: z.strictObject({ timestampMs: PositiveNumber, source: z.enum(["fastconformer", "word-audio-refined", "word-timestamp", "merged-token-word1", "bounded-recovery", "token-interpolated", "chunk-interpolated", "low-confidence-fallback", "direct-asr-word", "chunk-text-alignment", "interpolation", "interpolated", "low-confidence", "micro-asr", "pcm-refined", "chunk-coarse", "unknown"]) }),
    matchedText: z.string(),
  }).optional(),
});

export const CaptionSegmentSchema = z.strictObject({
  id: z.string().min(1),
  /** Defaults preserve saved ayah captions created before prelude support. */
  contentKind: z.enum(["ayah", "basmalah-prelude"]).default("ayah"),
  verseKeys: z.array(z.string().regex(/^\d{1,3}:\d{1,3}$/)),
  startMs: PositiveNumber,
  endMs: PositiveNumber,
  arabic: z.string().min(1),
  translation: z.string().nullable(),
  transliteration: z.string().nullable(),
  wordStart: z.number().int().nonnegative(),
  wordEnd: z.number().int().positive(),
  wordCount: z.number().int().positive(),
  timingEvidence: z.strictObject({
    start: z.strictObject({ timestampMs: PositiveNumber, source: z.enum(["fastconformer", "word-audio-refined", "word-timestamp", "merged-token-word1", "bounded-recovery", "token-interpolated", "chunk-interpolated", "low-confidence-fallback", "direct-asr-word", "chunk-text-alignment", "interpolation", "interpolated", "low-confidence", "micro-asr", "pcm-refined", "chunk-coarse", "unknown", "forced-alignment", "derived"]) }),
    end: z.strictObject({ timestampMs: PositiveNumber, source: z.enum(["fastconformer", "word-audio-refined", "word-timestamp", "merged-token-word1", "bounded-recovery", "token-interpolated", "chunk-interpolated", "low-confidence-fallback", "direct-asr-word", "chunk-text-alignment", "interpolation", "interpolated", "low-confidence", "micro-asr", "pcm-refined", "chunk-coarse", "unknown", "forced-alignment", "derived"]) }),
    derived: z.boolean(),
  }).optional(),
}).superRefine((segment, context) => {
  if (segment.contentKind === "ayah" && segment.verseKeys.length === 0) {
    context.addIssue({ code: "custom", path: ["verseKeys"], message: "Ayah captions require at least one canonical verse key." });
  }
  if (segment.contentKind === "basmalah-prelude" && segment.verseKeys.length > 0) {
    context.addIssue({ code: "custom", path: ["verseKeys"], message: "Basmalah preludes must not claim canonical verse ownership." });
  }
});

export const CaptionVisibilitySchema = z.strictObject({
  arabic: z.boolean(),
  translation: z.boolean(),
  transliteration: z.boolean(),
  translationEdition: z.string().min(1),
});

export const CaptionPositioningSchema = z.strictObject({
  anchor: z.enum(["top", "center", "bottom"]),
  x: z.number().finite().min(0).max(1),
  y: z.number().finite().min(0).max(1),
  translationX: z.number().finite().min(0).max(1),
  translationY: z.number().finite().min(0).max(1),
  translationPositionLinked: z.boolean(),
  maxWidthPercent: z.number().finite().positive().max(1),
  /** Added for independently editable translation boxes; absent in legacy projects. */
  translationMaxWidthPercent: z.number().finite().positive().max(1).optional(),
  translationGapPx: z.number().int().nonnegative(),
});

export const CaptionBackgroundSchema = z.strictObject({
  enabled: z.boolean(),
  color: z.string().min(1),
  opacity: z.number().finite().min(0).max(1),
  cornerRadius: z.number().finite().nonnegative(),
  horizontalPadding: z.number().finite().nonnegative(),
  verticalPadding: z.number().finite().nonnegative(),
});

export const TypographySchema = z.strictObject({
  quranStyle: z.enum(["madinah-qcf", "uthmani", "indopak", "kfgqpc"]),
  arabicFontFamily: z.string().min(1),
  translationFontFamily: z.string().min(1),
  transliterationFontFamily: z.string().min(1),
  arabicFontSize: z.number().finite().positive(),
  translationFontSize: z.number().finite().positive(),
  transliterationFontSize: z.number().finite().positive(),
  textColor: z.string().min(1),
  arabicOutlineEnabled: z.boolean(),
  arabicOutlineWidth: z.number().finite().nonnegative(),
  arabicOutlineColor: z.string().min(1),
  arabicShadowEnabled: z.boolean(),
  arabicShadowBlur: z.number().finite().nonnegative(),
  arabicShadowStrength: z.number().finite().min(0).max(1),
  arabicOpacity: z.number().finite().min(0).max(1),
  textAlign: z.enum(["left", "center", "right"]),
  arabicLineSpacing: z.number().finite().positive(),
  translationVisible: z.boolean(),
  translationTextColor: z.string().min(1),
  translationOutlineEnabled: z.boolean(),
  translationOutlineWidth: z.number().finite().nonnegative(),
  translationOutlineColor: z.string().min(1),
  translationShadowEnabled: z.boolean(),
  translationShadowBlur: z.number().finite().nonnegative(),
  translationShadowStrength: z.number().finite().min(0).max(1),
  translationOpacity: z.number().finite().min(0).max(1),
  translationSpacingBelowArabic: z.number().finite().nonnegative(),
  translationTextAlign: z.enum(["left", "center", "right"]),
  transliterationVisible: z.boolean(),
});

export const TransitionSettingsSchema = z.strictObject({
  type: z.enum(["none", "fade"]),
  fadeInMs: z.number().int().nonnegative(),
  fadeOutMs: z.number().int().nonnegative(),
  blurFadeEnabled: z.boolean().default(false),
  blurFadeMaxPx: z.number().finite().nonnegative().default(12),
});

/** Styling-only state used by built-in and browser-local caption styles. */
export const CaptionStyleSchema = z.strictObject({
  typography: TypographySchema,
  positioning: CaptionPositioningSchema,
  captionBackground: CaptionBackgroundSchema,
  transitionSettings: TransitionSettingsSchema,
});

export const ProjectSchema = z.strictObject({
  version: z.literal(2),
  id: z.string().min(1),
  title: z.string().min(1),
  sourceVideo: SourceVideoSchema.nullable(),
  format: ProjectFormatSchema,
  verseAlignments: z.array(VerseAlignmentSchema),
  captionSegments: z.array(CaptionSegmentSchema),
  captions: CaptionVisibilitySchema,
  positioning: CaptionPositioningSchema,
  captionBackground: CaptionBackgroundSchema,
  typography: TypographySchema,
  transitionSettings: TransitionSettingsSchema,
  showVerseNumber: z.boolean().default(false),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

/** Durable project data includes source metadata only; the browser-local File is never part of this schema. */
export const SavedProjectSchema = ProjectSchema;

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectFormat = z.infer<typeof ProjectFormatSchema>;
export type ProjectInput = z.input<typeof ProjectSchema>;
export type SavedProject = z.infer<typeof SavedProjectSchema>;
export type SavedProjectInput = z.input<typeof SavedProjectSchema>;
