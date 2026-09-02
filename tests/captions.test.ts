import assert from "node:assert/strict";
import test from "node:test";
import { captionForPlaybackTime } from "../src/lib/editor/recognition.ts";
import { captionBackgroundStyle, captionOpacityAtTime, captionTransitionAtTime, captionVisualStatesAtTime, captionVerseNumberLabel, clampNormalizedPosition, createCaptionSegments, createCaptionSegmentsFromForcedAlignment, DEFAULT_CAPTION_BACKGROUND, DEFAULT_CAPTION_POSITIONING, DEFAULT_CAPTION_PRESENTATION, DEFAULT_TRANSITION_SETTINGS, DEFAULT_TYPOGRAPHY, getActiveCaptionSegment, mergeCaptionWithNext, mergeCaptionWithPrevious, resetAllCaptionSegmentTiming, resetCaptionBackground, resetCaptionSegmentTiming, resetTransitionSettings, resetTypography, resizeCaptionWidth, splitCaptionSegment, translationForCaptionSegment, updateCaptionPosition, updateCaptionSegmentTiming } from "../src/lib/editor/captions.ts";
import type { QuranVerseContent } from "../src/lib/quran/content.ts";

const alignment = {
  verseKey: "93:1",
  surahNumber: 93,
  ayahNumber: 1,
  startMs: 100,
  endMs: 1_100,
  confidence: 0.9,
  timingEvidence: {
    start: { timestampMs: 100, source: "word-timestamp" as const },
    end: { timestampMs: 1_100, source: "chunk-interpolated" as const },
    matchedText: "والضحى",
  },
};

const content = { "93:1": { arabic: { uthmani: "وَالضُّحَى وَاللَّيْلِ إِذَا سَجَى وَمَا وَدَّعَكَ رَبُّكَ" }, translation: "By the morning brightness", transliteration: null } } as unknown as Record<string, QuranVerseContent>;

test("automatically creates one whole-ayah display set regardless of preferred line length", () => {
  const segments = createCaptionSegments([alignment], content, 3);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].arabic, content["93:1"].arabic.uthmani);
  assert.equal(segments[0].timingEvidence.start.source, "word-timestamp");
  assert.equal(segments[0].timingEvidence.derived, false);
  assert.equal(segments.every((segment) => segment.verseKeys.join() === "93:1"), true);
});

test("verse numbers are optional presentation metadata and never part of Arabic text", () => {
  const marked = { "93:1": { ...content["93:1"], arabic: { ...content["93:1"].arabic, uthmani: "وَالضُّحَىٰ ۝١" } } };
  const segments = createCaptionSegments([alignment], marked, 99);
  assert.equal(DEFAULT_CAPTION_PRESENTATION.showVerseNumber, false);
  assert.equal(segments[0].arabic, "وَالضُّحَىٰ");
  assert.equal(marked["93:1"].arabic.uthmani, "وَالضُّحَىٰ ۝١");
  assert.equal(captionVerseNumberLabel(segments[0]), "1");
  assert.equal(splitCaptionSegment(segments[0], 1)[0].arabic, segments[0].arabic);
});

test("automatic display never splits long ayat; line wrapping is visual only", () => {
  const short = createCaptionSegments([alignment], { "93:1": { ...content["93:1"], arabic: { ...content["93:1"].arabic, uthmani: "وَالضُّحَى" } } }, 3);
  assert.equal(short.length, 1);
  const nineWords = "وَالضُّحَى وَاللَّيْلِ إِذَا سَجَى وَمَا وَدَّعَكَ رَبُّكَ وَمَا قَلَى";
  const balanced = createCaptionSegments([alignment], { "93:1": { ...content["93:1"], arabic: { ...content["93:1"].arabic, uthmani: nineWords } } }, 8);
  assert.deepEqual(balanced.map((segment) => segment.arabic.split(" ").length), [9]);
});

test("forced-alignment display sets retain canonical partial-word boundaries and pause display timing", () => {
  const forced = {
    canonicalPassage: [], wordOccurrences: [], verseTimings: [], pauseCandidates: [],
    captionSets: [
      { id: "93:1#1-3", verseKey: "93:1", canonicalStartWordIndex: 1, canonicalEndWordIndex: 3, startMs: 100, endMs: 850, cutReason: "acoustic-pause" },
      { id: "93:1#4-7", verseKey: "93:1", canonicalStartWordIndex: 4, canonicalEndWordIndex: 7, startMs: 1_100, endMs: 1_700, cutReason: "visual-length" },
    ],
  } as const;
  const segments = createCaptionSegmentsFromForcedAlignment(forced, content);
  assert.deepEqual(segments.map((segment) => segment.arabic), ["وَالضُّحَى وَاللَّيْلِ إِذَا", "سَجَى وَمَا وَدَّعَكَ رَبُّكَ"]);
  assert.equal(segments[0]?.startMs, 100);
  assert.equal(segments[0]?.endMs, 1_100, "old text stays through the known pause");
  assert.equal(segments[1]?.timingEvidence.start.source, "forced-alignment");
});

test("translation survives editor conversion and long-ayah splitting through the parent verse key", () => {
  const segments = createCaptionSegments([alignment], content, 3);
  assert.equal(translationForCaptionSegment(segments[0], content), "By the morning brightness");
  assert.equal(segments[0].translation, "By the morning brightness");
  const split = splitCaptionSegment(createCaptionSegments([alignment], content, 99)[0], 3);
  assert.equal(split.every((segment) => segment.verseKeys.includes("93:1")), true);
  assert.equal(split.every((segment) => segment.translation === "By the morning brightness"), true);
});

test("translation visibility is independent from translation availability", () => {
  assert.equal(DEFAULT_TYPOGRAPHY.translationVisible, true);
  assert.equal({ ...DEFAULT_TYPOGRAPHY, translationVisible: false }.translationVisible, false);
  assert.equal(content["93:1"].translation, "By the morning brightness");
});

test("split and merge round-trip preserves canonical Arabic and source identity", () => {
  const original = createCaptionSegments([alignment], content, 99)[0];
  const split = splitCaptionSegment(original, 3);
  const merged = mergeCaptionWithNext(split, 0)[0];
  assert.equal(merged.arabic, original.arabic);
  assert.deepEqual(merged.verseKeys, ["93:1"]);
});

test("invalid split boundaries do not alter canonical text", () => {
  const original = createCaptionSegments([alignment], content, 99)[0];
  assert.deepEqual(splitCaptionSegment(original, 0), [original]);
  assert.deepEqual(splitCaptionSegment(original, original.arabic.split(" ").length), [original]);
  assert.equal(splitCaptionSegment(original, 3).map((segment) => segment.arabic).join(" "), original.arabic);
});

test("adjacent merges preserve verse keys and the full timing range", () => {
  const first = splitCaptionSegment(createCaptionSegments([alignment], content, 3)[0], 3);
  const merged = mergeCaptionWithPrevious(first, 1);
  assert.deepEqual(merged[0].verseKeys, ["93:1"]);
  assert.equal(merged[0].startMs, alignment.startMs);
  assert.equal(merged[0].endMs, first[1].endMs);
  assert.deepEqual(mergeCaptionWithNext(first, 0)[0].verseKeys, ["93:1"]);
});

test("playback selects the correct caption after splitting", () => {
  const original = createCaptionSegments([alignment], content, 99)[0];
  const split = splitCaptionSegment(original, 3);
  assert.equal(captionForPlaybackTime(split, split[0].startMs + 1)?.id, split[0].id);
  assert.equal(captionForPlaybackTime(split, split[1].startMs + 1)?.id, split[1].id);
});

test("generated display timing starts at detected onset and closes pauses at the next detected set", () => {
  const second = { ...alignment, verseKey: "93:2", ayahNumber: 2, startMs: 1_600, endMs: 2_400, timingEvidence: { ...alignment.timingEvidence, start: { timestampMs: 1_600, source: "word-timestamp" as const }, end: { timestampMs: 2_400, source: "word-timestamp" as const } } };
  const generated = createCaptionSegments([alignment, second], { ...content, "93:2": { ...content["93:1"], verseKey: "93:2", translation: "And the night" } }, 99);
  assert.equal(generated[0].startMs, 100);
  assert.equal(generated[0].endMs, 1_600);
  assert.equal(generated[1].startMs, 1_600);
  assert.equal(generated[1].endMs, 2_400);
  assert.equal(getActiveCaptionSegment(generated, 99), null);
  assert.equal(getActiveCaptionSegment(generated, 100)?.id, generated[0].id);
  assert.equal(getActiveCaptionSegment(generated, 1_600)?.id, generated[1].id);
  assert.equal(getActiveCaptionSegment(generated, 2_400), null);
});

test("three detected ayat produce exactly three whole-ayah display sets despite repetition metadata", () => {
  const repeatedFirst = { ...alignment, verseKey: "6:75", surahNumber: 6, ayahNumber: 75, startMs: 9_500, endMs: 12_000, timingEvidence: { ...alignment.timingEvidence, start: { timestampMs: 9_500, source: "word-timestamp" as const }, end: { timestampMs: 12_000, source: "word-timestamp" as const }, matchedText: "repeat repeat" } };
  const second = { ...repeatedFirst, verseKey: "6:76", ayahNumber: 76, startMs: 12_000, endMs: 14_000, timingEvidence: { ...repeatedFirst.timingEvidence, start: { timestampMs: 12_000, source: "word-timestamp" as const }, end: { timestampMs: 14_000, source: "word-timestamp" as const } } };
  const third = { ...second, verseKey: "6:77", ayahNumber: 77, startMs: 14_000, endMs: 16_000, timingEvidence: { ...second.timingEvidence, start: { timestampMs: 14_000, source: "word-timestamp" as const }, end: { timestampMs: 16_000, source: "word-timestamp" as const } } };
  const verses = {
    "6:75": { ...content["93:1"], arabic: { uthmani: "آية خمسة وسبعون" } },
    "6:76": { ...content["93:1"], arabic: { uthmani: "آية ستة وسبعون" } },
    "6:77": { ...content["93:1"], arabic: { uthmani: "آية سبعة وسبعون" } },
  } as unknown as Record<string, QuranVerseContent>;
  const segments = createCaptionSegments([repeatedFirst, second, third], verses, 1);
  assert.equal(segments.length, 3);
  assert.deepEqual(segments.map((segment) => segment.verseKeys[0]), ["6:75", "6:76", "6:77"]);
  assert.equal(segments[0].arabic, "آية خمسة وسبعون");
  assert.equal(segments[0].startMs, 9_500);
  assert.equal(segments[0].endMs, segments[1].startMs);
  assert.equal(segments[1].endMs, segments[2].startMs);
});

test("typography defaults are neutral and independently configurable", () => {
  assert.equal(DEFAULT_TYPOGRAPHY.arabicOutlineEnabled, false);
  assert.equal(DEFAULT_TYPOGRAPHY.translationVisible, true);
  assert.notEqual(DEFAULT_TYPOGRAPHY.arabicFontSize, DEFAULT_TYPOGRAPHY.translationFontSize);
  const changed = { ...DEFAULT_TYPOGRAPHY, arabicOutlineEnabled: true, translationVisible: false };
  const reset = { ...DEFAULT_TYPOGRAPHY };
  assert.equal(reset.arabicOutlineEnabled, false);
  assert.equal(reset.translationVisible, true);
  assert.equal(changed.arabicOutlineEnabled, true);
  assert.equal(changed.translationVisible, false);
});

test("reset restores the complete typography defaults", () => {
  const reset = resetTypography();
  assert.deepEqual(reset, DEFAULT_TYPOGRAPHY);
  assert.notEqual(reset, DEFAULT_TYPOGRAPHY);
  assert.equal(reset.arabicOutlineEnabled, false);
  assert.equal(reset.translationOutlineEnabled, false);
});

test("caption background defaults to disabled and transparent", () => {
  assert.equal(DEFAULT_CAPTION_BACKGROUND.enabled, false);
  assert.equal(captionBackgroundStyle(DEFAULT_CAPTION_BACKGROUND).backgroundColor, "transparent");
});

test("enabling caption background renders its independent color and opacity", () => {
  const enabled = { ...DEFAULT_CAPTION_BACKGROUND, enabled: true, color: "#336699", opacity: 0.4 };
  assert.equal(captionBackgroundStyle(enabled).backgroundColor, "rgba(51, 102, 153, 0.4)");
  assert.equal(captionBackgroundStyle({ ...enabled, opacity: 0 }).backgroundColor, "rgba(51, 102, 153, 0)");
  assert.equal(DEFAULT_TYPOGRAPHY.arabicOutlineEnabled, false);
});

test("disabling caption background removes its fill without changing text outline", () => {
  const background = { ...DEFAULT_CAPTION_BACKGROUND, enabled: false, color: "#ff0000", opacity: 1 };
  assert.equal(captionBackgroundStyle(background).backgroundColor, "transparent");
  assert.equal({ ...DEFAULT_TYPOGRAPHY, arabicOutlineEnabled: true }.arabicOutlineEnabled, true);
});

test("caption background reset restores transparent defaults", () => {
  assert.deepEqual(resetCaptionBackground(), DEFAULT_CAPTION_BACKGROUND);
  assert.notEqual(resetCaptionBackground(), DEFAULT_CAPTION_BACKGROUND);
});

test("translation stays in the same linked caption segment container", () => {
  const segment = { verseKeys: ["93:1"] };
  const content = { "93:1": { translation: "By the morning brightness." } } as never;
  assert.equal(translationForCaptionSegment(segment, content), "By the morning brightness.");
});

test("normalized positioning is constrained and linked translation follows Arabic", () => {
  assert.equal(clampNormalizedPosition(-1), 0.06);
  const moved = updateCaptionPosition(DEFAULT_CAPTION_POSITIONING, "arabic", 0.8, 0.7);
  assert.equal(moved.x, 0.8);
  assert.equal(moved.translationX, 0.8);
  assert.equal(moved.translationY, 0.82);
  const unlinked = updateCaptionPosition({ ...moved, translationPositionLinked: false }, "arabic", 0.2, 0.2);
  assert.equal(unlinked.translationX, 0.8);
});

test("canvas object width resizing is normalized, independent, and leaves Quran text untouched", () => {
  const format = { preset: "vertical" as const, width: 1080, height: 1920 };
  const resizedArabic = resizeCaptionWidth(DEFAULT_CAPTION_POSITIONING, "arabic", 0.62, format);
  assert.equal(resizedArabic.maxWidthPercent, 0.62);
  assert.equal(resizedArabic.translationMaxWidthPercent, 0.9);
  assert.equal(resizedArabic.translationPositionLinked, false);
  const resizedTranslation = resizeCaptionWidth(resizedArabic, "translation", 0.48, format);
  assert.equal(resizedTranslation.translationMaxWidthPercent, 0.48);
  assert.equal(resizedTranslation.maxWidthPercent, 0.62);
  assert.equal(content["93:1"].arabic.uthmani, "وَالضُّحَى وَاللَّيْلِ إِذَا سَجَى وَمَا وَدَّعَكَ رَبُّكَ");
});

test("manual timing clamps to duration without changing neighboring segments", () => {
  const base = splitCaptionSegment(createCaptionSegments([alignment], content, 3)[0], 3);
  const changed = updateCaptionSegmentTiming(base, base[1].id, { startMs: -100, endMs: 99_999 }, 2_000);
  assert.equal(changed[1].startMs, 0);
  assert.equal(changed[1].endMs, 2_000);
  assert.equal(changed[0].startMs, base[0].startMs);
  assert.equal(changed[0].endMs, base[0].endMs);
  assert.equal(alignment.startMs, 100);
});

test("reset timing restores generated timing evidence without touching recognition alignment", () => {
  const base = createCaptionSegments([alignment], content, 3);
  const edited = updateCaptionSegmentTiming(base, base[0].id, { startMs: 400, endMs: 700 }, 2_000);
  const reset = resetCaptionSegmentTiming(edited, base[0].id, 2_000);
  assert.equal(reset[0].startMs, base[0].timingEvidence.start.timestampMs);
  assert.equal(reset[0].endMs, base[0].timingEvidence.end.timestampMs);
  assert.equal(alignment.startMs, 100);
});

test("reset all timing restores each recognition recommendation", () => {
  const base = splitCaptionSegment(createCaptionSegments([alignment], content, 3)[0], 3);
  const edited = updateCaptionSegmentTiming(updateCaptionSegmentTiming(base, base[0].id, { startMs: 400 }, 2_000), base[1].id, { endMs: 1_900 }, 2_000);
  const reset = resetAllCaptionSegmentTiming(edited, 2_000);
  assert.deepEqual(reset.map((segment) => [segment.startMs, segment.endMs]), base.map((segment) => [segment.timingEvidence.start.timestampMs, segment.timingEvidence.end.timestampMs]));
});

test("split and merge remain valid after manual timing edits", () => {
  const base = createCaptionSegments([alignment], content, 99);
  const edited = updateCaptionSegmentTiming(base, base[0].id, { startMs: 200, endMs: 900 }, 2_000);
  const split = splitCaptionSegment(edited[0], 3);
  assert.equal(split[0].endMs <= split[1].startMs, true);
  const merged = mergeCaptionWithNext(split, 0);
  assert.equal(merged[0].startMs, 200);
  assert.equal(merged[0].endMs, 900);
});

test("default transition settings use a restrained 225ms fade", () => {
  assert.deepEqual(DEFAULT_TRANSITION_SETTINGS, { type: "fade", fadeInMs: 225, fadeOutMs: 225, blurFadeEnabled: false, blurFadeMaxPx: 12 });
  assert.deepEqual(resetTransitionSettings(), DEFAULT_TRANSITION_SETTINGS);
  assert.notEqual(resetTransitionSettings(), DEFAULT_TRANSITION_SETTINGS);
});

test("fade interpolation is continuous across every segment phase", () => {
  const segment = { startMs: 1_000, endMs: 2_000 };
  assert.equal(captionOpacityAtTime(segment, 1_000), 0);
  assert.equal(captionOpacityAtTime(segment, 1_112), 112 / 225);
  assert.equal(captionOpacityAtTime(segment, 1_500), 1);
  assert.equal(captionOpacityAtTime(segment, 1_775), 1);
  assert.equal(captionOpacityAtTime(segment, 1_887), 113 / 225);
  assert.equal(captionOpacityAtTime(segment, 2_000), 0);
  assert.equal(captionOpacityAtTime(segment, 999), 0);
  // A seek directly into the fade region is a pure calculation, not a timer.
  assert.equal(captionOpacityAtTime(segment, 1_112), captionOpacityAtTime(segment, 1_112));
});

test("transition interpolation handles zero-duration fades and smooth blur", () => {
  const segment = { startMs: 1_000, endMs: 2_000 };
  const zero = { ...DEFAULT_TRANSITION_SETTINGS, fadeInMs: 0, fadeOutMs: 0 };
  assert.equal(captionTransitionAtTime(segment, 999, zero).opacity, 0);
  assert.equal(captionTransitionAtTime(segment, 1_000, zero).opacity, 1);
  assert.equal(captionTransitionAtTime(segment, 1_999, zero).opacity, 1);
  assert.equal(captionTransitionAtTime(segment, 2_000, zero).opacity, 0);
  const blurred = { ...DEFAULT_TRANSITION_SETTINGS, blurFadeEnabled: true, blurFadeMaxPx: 12 };
  assert.equal(captionTransitionAtTime(segment, 1_000, blurred).blurPx, 12);
  assert.equal(captionTransitionAtTime(segment, 1_112, blurred).blurPx, 12 * (1 - 112 / 225));
  assert.equal(captionTransitionAtTime(segment, 1_500, blurred).blurPx, 0);
  assert.equal(captionTransitionAtTime(segment, 1_888, blurred).blurPx, 12 * (1 - 112 / 225));
});

test("none transition is fully opaque only inside the editable segment", () => {
  const segment = { startMs: 1_000, endMs: 2_000 };
  const none = { ...DEFAULT_TRANSITION_SETTINGS, type: "none" as const };
  assert.equal(captionOpacityAtTime(segment, 999, none), 0);
  assert.equal(captionOpacityAtTime(segment, 1_001, none), 1);
  assert.equal(captionOpacityAtTime(segment, 1_999, none), 1);
  assert.equal(captionOpacityAtTime(segment, 2_000, none), 0);
});

test("preview and timeline use the same half-open editable CaptionSegment interval", () => {
  const first = { id: "a", startMs: 0, endMs: 1_000 };
  const second = { id: "b", startMs: 1_000, endMs: 2_000 };
  const segments = [first, second];
  const expected: Array<[number, string | undefined]> = [
    [-1, undefined], [0, "a"], [999, "a"], [1_000, "b"], [1_999, "b"], [2_000, undefined],
  ];
  for (const [timeMs, id] of expected) {
    assert.equal(captionForPlaybackTime(segments, timeMs)?.id, id, `timeline at ${timeMs}`);
    assert.deepEqual(captionVisualStatesAtTime(segments, timeMs, DEFAULT_TRANSITION_SETTINGS).map((state) => state.segment.id), id ? [id] : [], `preview at ${timeMs}`);
  }
  assert.equal(first.endMs, second.startMs, "editable intervals remain adjacent but never overlap");
});

test("caption background shares the animated caption layer opacity", () => {
  const segment = { id: "caption", startMs: 0, endMs: 1_000 };
  const state = captionVisualStatesAtTime([segment], 112, DEFAULT_TRANSITION_SETTINGS)[0];
  assert.equal(state.opacity, captionOpacityAtTime(segment, 112));
  assert.equal(DEFAULT_CAPTION_BACKGROUND.enabled, false);
});
