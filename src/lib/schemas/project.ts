import { z } from "zod";

const PositiveNumber = z.number().finite().nonnegative();
const PositiveInteger = z.number().int().positive();

export const SourceVideoSchema = z.strictObject({
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  durationSeconds: PositiveNumber.optional(),
  width: PositiveInteger.optional(),
  height: PositiveInteger.optional(),
});

export const ProjectFormatSchema = z.strictObject({
  preset: z.enum(["vertical", "square", "landscape"]),
  width: PositiveInteger,
  height: PositiveInteger,
});

export const VerseKeySchema = z.strictObject({
  surahNumber: z.number().int().min(1).max(114),
  ayahNumber: PositiveInteger,
});

export const VerseAlignmentSchema = VerseKeySchema.extend({
  startSeconds: PositiveNumber,
  endSeconds: PositiveNumber,
  confidence: z.number().finite().min(0).max(1).optional(),
  timingEvidence: z.strictObject({
    start: z.strictObject({ timestampMs: PositiveNumber, source: z.enum(["direct-asr-word", "chunk-text-alignment", "interpolation"]) }),
    end: z.strictObject({ timestampMs: PositiveNumber, source: z.enum(["direct-asr-word", "chunk-text-alignment", "interpolation"]) }),
    matchedText: z.string(),
  }).optional(),
});

export const CaptionSegmentSchema = z.strictObject({
  id: z.string().min(1),
  verseKeys: z.array(VerseKeySchema).min(1),
  startSeconds: PositiveNumber,
  endSeconds: PositiveNumber,
  arabic: z.string().min(1),
  translation: z.string().nullable(),
  transliteration: z.string().nullable(),
  timingEvidence: z.strictObject({
    start: z.strictObject({ timestampMs: PositiveNumber, source: z.enum(["direct-asr-word", "chunk-text-alignment", "interpolation", "derived"]) }),
    end: z.strictObject({ timestampMs: PositiveNumber, source: z.enum(["direct-asr-word", "chunk-text-alignment", "interpolation", "derived"]) }),
    derived: z.boolean(),
  }).optional(),
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
  maxWidthPercent: z.number().finite().positive().max(1),
  translationGapPx: z.number().int().nonnegative(),
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
  translationOpacity: z.number().finite().min(0).max(1),
  translationSpacingBelowArabic: z.number().finite().nonnegative(),
  transliterationVisible: z.boolean(),
});

export const TransitionSettingsSchema = z.strictObject({
  type: z.enum(["none", "fade"]),
  fadeInMs: z.number().int().nonnegative(),
  fadeOutMs: z.number().int().nonnegative(),
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
  typography: TypographySchema,
  transitionSettings: TransitionSettingsSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

/** Durable project data excludes the browser-local source video. */
export const SavedProjectSchema = ProjectSchema.omit({ sourceVideo: true });

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectInput = z.input<typeof ProjectSchema>;
export type SavedProject = z.infer<typeof SavedProjectSchema>;
export type SavedProjectInput = z.input<typeof SavedProjectSchema>;
