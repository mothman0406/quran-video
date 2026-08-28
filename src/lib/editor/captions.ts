import type { QuranVerseContent } from "../quran/content.ts";
import type { VerseAlignment } from "./recognition.ts";
import type { z } from "zod";
import type { TypographySchema } from "../schemas/project.ts";

export type Typography = z.infer<typeof TypographySchema>;

export const DEFAULT_TYPOGRAPHY: Typography = {
  quranStyle: "uthmani",
  arabicFontFamily: "UthmanicHafs",
  translationFontFamily: "Arial, Helvetica, sans-serif",
  transliterationFontFamily: "Arial, Helvetica, sans-serif",
  arabicFontSize: 38,
  translationFontSize: 15,
  transliterationFontSize: 14,
  textColor: "#ffffff",
  arabicOutlineEnabled: false,
  arabicOutlineWidth: 1,
  arabicOutlineColor: "#000000",
  arabicShadowEnabled: true,
  arabicShadowBlur: 8,
  arabicOpacity: 1,
  textAlign: "center",
  arabicLineSpacing: 1.35,
  translationVisible: true,
  translationTextColor: "#f2f2f2",
  translationOutlineEnabled: false,
  translationOutlineWidth: 1,
  translationOutlineColor: "#000000",
  translationShadowEnabled: true,
  translationShadowBlur: 5,
  translationOpacity: 0.82,
  translationSpacingBelowArabic: 8,
  transliterationVisible: false,
};

export type CaptionTimingSource = "direct-asr-word" | "chunk-text-alignment" | "interpolation" | "derived";

export type CaptionSegment = {
  id: string;
  verseKeys: string[];
  startMs: number;
  endMs: number;
  arabic: string;
  translation: string | null;
  transliteration: string | null;
  wordStart: number;
  wordEnd: number;
  wordCount: number;
  timingEvidence: {
    start: { timestampMs: number; source: CaptionTimingSource };
    end: { timestampMs: number; source: CaptionTimingSource };
    derived: boolean;
  };
};

export const DEFAULT_MAX_WORDS_PER_SEGMENT = 8;

function words(value: string): string[] {
  return value.trim().split(/\s+/).filter(Boolean);
}

function unique(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) === index);
}

function segmentTiming(alignment: VerseAlignment, startWord: number, endWord: number, totalWords: number) {
  const duration = Math.max(0, alignment.endMs - alignment.startMs);
  const startMs = Math.round(alignment.startMs + duration * startWord / totalWords);
  const endMs = endWord === totalWords ? alignment.endMs : Math.round(alignment.startMs + duration * endWord / totalWords);
  return {
    startMs,
    endMs: Math.max(startMs, endMs),
    timingEvidence: {
      start: { timestampMs: startMs, source: startWord === 0 ? alignment.timingEvidence.start.source : "derived" as const },
      end: { timestampMs: endMs, source: endWord === totalWords ? alignment.timingEvidence.end.source : "derived" as const },
      derived: startWord > 0 || endWord < totalWords,
    },
  };
}

export function createCaptionSegments(
  alignments: readonly VerseAlignment[],
  content: Readonly<Record<string, QuranVerseContent | undefined>>,
  maxWordsPerSegment = DEFAULT_MAX_WORDS_PER_SEGMENT,
): CaptionSegment[] {
  if (!Number.isInteger(maxWordsPerSegment) || maxWordsPerSegment < 1) throw new Error("maxWordsPerSegment must be a positive integer");
  return alignments.flatMap((alignment) => {
    const verse = content[alignment.verseKey];
    const arabic = verse?.arabic.uthmani ?? "";
    const verseWords = words(arabic);
    if (!verseWords.length) return [];
    const chunks: CaptionSegment[] = [];
    for (let start = 0, index = 0; start < verseWords.length; start += maxWordsPerSegment, index += 1) {
      const end = Math.min(verseWords.length, start + maxWordsPerSegment);
      const timing = segmentTiming(alignment, start, end, verseWords.length);
      chunks.push({
        id: `${alignment.verseKey}#${index + 1}`,
        verseKeys: [alignment.verseKey],
        ...timing,
        arabic: verseWords.slice(start, end).join(" "),
        translation: verseWords.length <= maxWordsPerSegment ? verse?.translation ?? null : null,
        transliteration: verseWords.length <= maxWordsPerSegment ? verse?.transliteration ?? null : null,
        wordStart: start,
        wordEnd: end,
        wordCount: verseWords.length,
      });
    }
    return chunks;
  });
}

export function splitCaptionSegment(segment: CaptionSegment, boundary: number): CaptionSegment[] {
  const verseWords = words(segment.arabic);
  if (!Number.isInteger(boundary) || boundary <= 0 || boundary >= verseWords.length) return [segment];
  const duration = segment.endMs - segment.startMs;
  const splitMs = Math.round(segment.startMs + duration * boundary / verseWords.length);
  const make = (start: number, end: number, suffix: string, startMs: number, endMs: number): CaptionSegment => ({
    ...segment,
    id: `${segment.id}.${suffix}`,
    startMs,
    endMs,
    arabic: verseWords.slice(start, end).join(" "),
    translation: null,
    transliteration: null,
    wordStart: segment.wordStart + start,
    wordEnd: segment.wordStart + end,
    timingEvidence: {
      start: { timestampMs: startMs, source: start === 0 ? segment.timingEvidence.start.source : "derived" },
      end: { timestampMs: endMs, source: end === verseWords.length ? segment.timingEvidence.end.source : "derived" },
      derived: true,
    },
  });
  return [make(0, boundary, "a", segment.startMs, splitMs), make(boundary, verseWords.length, "b", splitMs, segment.endMs)];
}

function mergeSegments(left: CaptionSegment, right: CaptionSegment): CaptionSegment {
  return {
    ...left,
    id: `${left.id}+${right.id}`,
    verseKeys: unique([...left.verseKeys, ...right.verseKeys]),
    endMs: Math.max(left.endMs, right.endMs),
    arabic: `${left.arabic} ${right.arabic}`.trim(),
    translation: null,
    transliteration: null,
    wordEnd: right.wordEnd,
    wordCount: left.wordCount + right.wordCount,
    timingEvidence: {
      start: left.timingEvidence.start,
      end: right.timingEvidence.end,
      derived: left.timingEvidence.derived || right.timingEvidence.derived,
    },
  };
}

export function mergeCaptionWithPrevious(segments: readonly CaptionSegment[], index: number): CaptionSegment[] {
  if (index <= 0 || index >= segments.length) return [...segments];
  return [...segments.slice(0, index - 1), mergeSegments(segments[index - 1], segments[index]), ...segments.slice(index + 1)];
}

export function mergeCaptionWithNext(segments: readonly CaptionSegment[], index: number): CaptionSegment[] {
  if (index < 0 || index >= segments.length - 1) return [...segments];
  return [...segments.slice(0, index), mergeSegments(segments[index], segments[index + 1]), ...segments.slice(index + 2)];
}
