import assert from "node:assert/strict";
import test from "node:test";
import { captionForPlaybackTime } from "../src/lib/editor/recognition.ts";
import { CANONICAL_BASMALAH_ARABIC, arabicCaptionDisplay, arabicIndicNumber, captionBackgroundStyle, captionOpacityAtTime, captionSegmentLabel, captionTransitionAtTime, captionVisualStatesAtTime, captionVerseNumberLabel, clampNormalizedPosition, composeArabicCaptionText, createCaptionSegments, createCaptionSegmentsFromVerseBoundaries, DEFAULT_CAPTION_BACKGROUND, DEFAULT_CAPTION_POSITIONING, DEFAULT_CAPTION_PRESENTATION, DEFAULT_TRANSITION_SETTINGS, DEFAULT_TYPOGRAPHY, getActiveCaptionSegment, mergeCaptionWithNext, mergeCaptionWithPrevious, resetAllCaptionSegmentTiming, resetCaptionBackground, resetCaptionSegmentTiming, resetTransitionSettings, resetTypography, resizeCaptionWidth, splitCaptionSegment, translationForCaptionSegment, updateCaptionPosition, updateCaptionSegmentTiming } from "../src/lib/editor/captions.ts";
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

test("inline ayah ornaments use Arabic-Indic digits without mutating Quran text", () => {
  const [segment] = createCaptionSegments([alignment], content);
  assert.equal(arabicIndicNumber(1), "١");
  assert.equal(arabicIndicNumber(10), "١٠");
  assert.equal(arabicIndicNumber(286), "٢٨٦");
  assert.equal(arabicCaptionDisplay(segment!, false).verseNumber, null);
  assert.equal(arabicCaptionDisplay(segment!, true).verseNumber, "١");
  assert.equal(composeArabicCaptionText(segment!, true), `${segment!.arabic}\u00a0١`);
  assert.equal(segment!.arabic, content["93:1"].arabic.uthmani);
});

test("a terminal source ornament is replaced by the font's single numbered ornament for preview and export", () => {
  const [source] = createCaptionSegments([alignment], content);
  const marked = { ...source!, verseKeys: ["2:4"], arabic: "ٱلْبَيَانَ \u06DD٣" };
  const preview = arabicCaptionDisplay(marked, true);
  const exportText = composeArabicCaptionText(marked, true);

  assert.equal(preview.text, "ٱلْبَيَانَ\u00a0٤");
  assert.equal(exportText, preview.text, "preview and export use the same composed Arabic text");
  assert.equal([...preview.text].filter((character) => character === "۝").length, 0);
  assert.equal(preview.verseNumber, "٤");

  const off = arabicCaptionDisplay(marked, false);
  assert.equal(off.text, marked.arabic, "the off state preserves the prior display text");
  assert.equal(off.verseNumber, null);
});

test("only a final ayah piece receives the inline ornament, never a basmalah prelude", () => {
  const [segment] = createCaptionSegments([alignment], content);
  const split = splitCaptionSegment(segment!, 3);
  assert.equal(arabicCaptionDisplay(split[0]!, true).verseNumber, null);
  assert.equal(arabicCaptionDisplay(split[1]!, true).verseNumber, "١");
  const prelude = { ...segment!, contentKind: "basmalah-prelude" as const, verseKeys: [], showVerseNumberAtEnd: false, arabic: CANONICAL_BASMALAH_ARABIC };
  assert.equal(arabicCaptionDisplay(prelude, true).verseNumber, null);
  assert.equal(composeArabicCaptionText(prelude, true), CANONICAL_BASMALAH_ARABIC);
});

test("automatic display never splits long ayat; line wrapping is visual only", () => {
  const short = createCaptionSegments([alignment], { "93:1": { ...content["93:1"], arabic: { ...content["93:1"].arabic, uthmani: "وَالضُّحَى" } } }, 3);
  assert.equal(short.length, 1);
  const nineWords = "وَالضُّحَى وَاللَّيْلِ إِذَا سَجَى وَمَا وَدَّعَكَ رَبُّكَ وَمَا قَلَى";
  const balanced = createCaptionSegments([alignment], { "93:1": { ...content["93:1"], arabic: { ...content["93:1"].arabic, uthmani: nineWords } } }, 8);
  assert.deepEqual(balanced.map((segment) => segment.arabic.split(" ").length), [9]);
});

test("automatic display uses one complete canonical ayah regardless of diagnostic split metadata", () => {
  const segments = createCaptionSegments([{ ...alignment, startMs: 100, endMs: 1_700, timingEvidence: { ...alignment.timingEvidence, start: { timestampMs: 100, source: "word-timestamp" as const }, end: { timestampMs: 1_700, source: "word-timestamp" as const } } }], content);
  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.arabic, content["93:1"].arabic.uthmani);
  assert.equal(segments[0]?.startMs, 100);
  assert.equal(segments[0]?.endMs, 1_700, "the verse remains active through all planned ranges");
  assert.equal(segments[0]?.timingEvidence.start.source, "word-timestamp");
});

test("first caption is inactive during leading silence and activates exactly at detected onset", () => {
  const detectedStartMs = 9_500;
  const detected = { ...alignment, startMs: detectedStartMs, endMs: 12_000, timingEvidence: {
    ...alignment.timingEvidence,
    start: { timestampMs: detectedStartMs, source: "word-timestamp" as const },
    end: { timestampMs: 12_000, source: "word-timestamp" as const },
  } };
  const segments = createCaptionSegments([detected], content);
  assert.equal(segments[0]?.startMs, detectedStartMs);
  assert.equal(getActiveCaptionSegment(segments, detectedStartMs - 1), null);
  assert.equal(captionVisualStatesAtTime(segments, detectedStartMs - 1).length, 0);
  assert.equal(getActiveCaptionSegment(segments, detectedStartMs)?.id, segments[0]?.id);
  assert.equal(captionVisualStatesAtTime(segments, detectedStartMs)[0]?.segment.id, segments[0]?.id);
});

test("automatic editor integration retains the selected 6:76 -> 6:77 boundary through active-caption selection", () => {
  const boundaryMs = 44_832;
  const boundaries = [
    { verseKey: "6:76", startMs: 32_000, endMs: boundaryMs, evidence: { source: "word-timestamp" as const, selectedWord: null, candidates: [] } },
    { verseKey: "6:77", startMs: boundaryMs, endMs: 66_000, evidence: { source: "word-timestamp" as const, selectedWord: null, candidates: [] } },
  ];
  const verses = {
    "6:76": { ...content["93:1"], verseKey: "6:76" },
    "6:77": { ...content["93:1"], verseKey: "6:77" },
  } as unknown as Record<string, QuranVerseContent>;

  // This is the production path: resolver -> CaptionSegments -> shared selector.
  const editorSegments = createCaptionSegmentsFromVerseBoundaries(boundaries, verses);
  assert.deepEqual(editorSegments.map((segment) => [segment.verseKeys[0], segment.startMs, segment.endMs]), [["6:76", 32_000, boundaryMs], ["6:77", boundaryMs, 66_000]]);
  assert.equal(getActiveCaptionSegment(editorSegments, boundaryMs - 1)?.verseKeys[0], "6:76");
  assert.equal(getActiveCaptionSegment(editorSegments, boundaryMs)?.verseKeys[0], "6:77");
});

test("a selected acoustic basmalah becomes the first shared display segment without moving ayah one", () => {
  const boundaries = [
    { verseKey: "93:1", startMs: 1_700, endMs: 2_800, evidence: { source: "fastconformer" as const, selectedWord: null, candidates: [] } },
    { verseKey: "93:2", startMs: 2_800, endMs: 3_700, evidence: { source: "fastconformer" as const, selectedWord: null, candidates: [] } },
  ];
  const verses = {
    "93:1": content["93:1"],
    "93:2": { ...content["93:1"], verseKey: "93:2", arabic: { uthmani: "وَاللَّيْلِ إِذَا سَجَى" } },
  } as unknown as Record<string, QuranVerseContent>;
  const segments = createCaptionSegmentsFromVerseBoundaries(boundaries, verses, {
    available: true, selected: "present", startMs: 1_000, endMs: 1_600,
  });

  assert.deepEqual(segments.map((segment) => segment.contentKind), ["basmalah-prelude", "ayah", "ayah"]);
  assert.deepEqual(segments[0]?.verseKeys, []);
  assert.equal(segments[0]?.arabic, CANONICAL_BASMALAH_ARABIC);
  assert.deepEqual([segments[0]?.startMs, segments[0]?.endMs], [1_000, 1_600]);
  assert.deepEqual([segments[1]?.startMs, segments[1]?.endMs], [1_700, 2_800], "first ayah timing remains FastConformer timing");
  assert.equal(captionSegmentLabel(segments[0]!), "Basmalah", "the timeline uses a non-ayah label");
  assert.equal(getActiveCaptionSegment(segments, 1_000)?.contentKind, "basmalah-prelude");
  assert.equal(captionVisualStatesAtTime(segments, 1_200)[0]?.segment.id, segments[0]?.id, "preview uses the same prelude segment");
  assert.equal(getActiveCaptionSegment(segments, 1_600), null, "the acoustic pause remains caption-free");
  assert.equal(getActiveCaptionSegment(segments, 1_700)?.verseKeys[0], "93:1");

  const edited = updateCaptionSegmentTiming(segments, segments[0]!.id, { startMs: 1_050, endMs: 1_550 }, 4_000);
  assert.deepEqual([edited[0]?.startMs, edited[0]?.endMs], [1_050, 1_550]);
  assert.deepEqual([edited[1]?.startMs, edited[1]?.endMs], [1_700, 2_800], "manual prelude edits do not alter ayah one");
  assert.deepEqual(resetCaptionSegmentTiming(edited, edited[0]!.id, 4_000).slice(0, 2).map((segment) => [segment.startMs, segment.endMs]), [[1_000, 1_600], [1_700, 2_800]]);
});

test("an absent or canonical basmalah creates no optional display placeholder", () => {
  const boundary = [{ verseKey: "93:1", startMs: 1_700, endMs: 2_800, evidence: { source: "fastconformer" as const, selectedWord: null, candidates: [] } }];
  const absent = createCaptionSegmentsFromVerseBoundaries(boundary, content, {
    available: true, selected: "absent", startMs: null, endMs: null,
  });
  assert.deepEqual(absent.map((segment) => segment.contentKind), ["ayah"]);
  assert.equal(absent[0]?.startMs, 1_700);

  const canonicalBasmalah = {
    "1:1": { ...content["93:1"], verseKey: "1:1", arabic: { uthmani: "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ" } },
  } as unknown as Record<string, QuranVerseContent>;
  const nonDuplicated = createCaptionSegmentsFromVerseBoundaries(
    [{ ...boundary[0], verseKey: "1:1" }],
    canonicalBasmalah,
    { available: true, selected: "present", startMs: 1_000, endMs: 1_600 },
  );
  assert.deepEqual(nonDuplicated.map((segment) => [segment.contentKind, segment.verseKeys]), [["ayah", ["1:1"]]]);
});

test("ASR alignment gaps never remove canonical words from an ayah caption", () => {
  const [segment] = createCaptionSegments([alignment], content);
  const canonicalWords = content["93:1"].arabic.uthmani.split(/\s+/);
  assert.equal(segment?.arabic, canonicalWords.join(" "));
  assert.equal(segment?.arabic.split(/\s+/)[0], canonicalWords[0]);
  assert.equal(segment?.arabic.split(/\s+/).at(-1), canonicalWords.at(-1));
  assert.equal(segment?.wordCount, canonicalWords.length);
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

test("recognized onset survives automatic caption generation and direct seeking", () => {
  const alignments = [
    { ...alignment, verseKey: "6:74", surahNumber: 6, ayahNumber: 74, startMs: 9_500, endMs: 21_000, timingEvidence: { ...alignment.timingEvidence, start: { timestampMs: 9_500, source: "word-timestamp" as const }, end: { timestampMs: 21_000, source: "word-timestamp" as const } } },
    { ...alignment, verseKey: "6:75", surahNumber: 6, ayahNumber: 75, startMs: 21_000, endMs: 32_000, timingEvidence: { ...alignment.timingEvidence, start: { timestampMs: 21_000, source: "word-timestamp" as const }, end: { timestampMs: 32_000, source: "word-timestamp" as const } } },
    { ...alignment, verseKey: "6:76", surahNumber: 6, ayahNumber: 76, startMs: 32_000, endMs: 60_000, timingEvidence: { ...alignment.timingEvidence, start: { timestampMs: 32_000, source: "word-timestamp" as const }, end: { timestampMs: 60_000, source: "word-timestamp" as const } } },
  ];
  const verses = Object.fromEntries(alignments.map((item) => [item.verseKey, { ...content["93:1"], verseKey: item.verseKey }])) as Record<string, QuranVerseContent>;
  const segments = createCaptionSegments(alignments, verses);
  assert.deepEqual(segments.map((segment) => [segment.verseKeys[0], segment.startMs, segment.endMs]), [["6:74", 9_500, 21_000], ["6:75", 21_000, 32_000], ["6:76", 32_000, 60_000]]);
  assert.equal(getActiveCaptionSegment(segments, 0), null);
  assert.equal(getActiveCaptionSegment(segments, 5_000), null);
  assert.equal(getActiveCaptionSegment(segments, 9_499), null);
  assert.equal(getActiveCaptionSegment(segments, 9_500)?.verseKeys[0], "6:74");
  let seekTimeMs = 0;
  assert.equal(getActiveCaptionSegment(segments, seekTimeMs), null);
  seekTimeMs = 9_500;
  assert.equal(getActiveCaptionSegment(segments, seekTimeMs)?.verseKeys[0], "6:74");
});

test("every generated caption segment is active at its own midpoint", () => {
  const second = { ...alignment, verseKey: "93:2", ayahNumber: 2, startMs: 1_100, endMs: 2_100, timingEvidence: { ...alignment.timingEvidence, start: { timestampMs: 1_100, source: "word-timestamp" as const }, end: { timestampMs: 2_100, source: "word-timestamp" as const } } };
  const third = { ...second, verseKey: "93:3", ayahNumber: 3, startMs: 2_100, endMs: 3_100, timingEvidence: { ...second.timingEvidence, start: { timestampMs: 2_100, source: "word-timestamp" as const }, end: { timestampMs: 3_100, source: "word-timestamp" as const } } };
  const verses = {
    ...content,
    "93:2": { ...content["93:1"], verseKey: "93:2", arabic: { uthmani: "وَاللَّيْلِ إِذَا سَجَى" } },
    "93:3": { ...content["93:1"], verseKey: "93:3", arabic: { uthmani: "مَا وَدَّعَكَ رَبُّكَ" } },
  } as unknown as Record<string, QuranVerseContent>;
  const segments = createCaptionSegments([alignment, second, third], verses);
  for (const segment of segments) {
    const midpoint = (segment.startMs + segment.endMs) / 2;
    assert.equal(getActiveCaptionSegment(segments, midpoint)?.id, segment.id);
    assert.equal(segment.wordCount, segment.wordEnd - segment.wordStart);
  }
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
