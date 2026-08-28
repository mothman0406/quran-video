import assert from "node:assert/strict";
import test from "node:test";
import { captionForPlaybackTime } from "../src/lib/editor/recognition.ts";
import { captionBackgroundStyle, createCaptionSegments, DEFAULT_CAPTION_BACKGROUND, DEFAULT_TYPOGRAPHY, mergeCaptionWithNext, mergeCaptionWithPrevious, resetCaptionBackground, resetTypography, splitCaptionSegment, translationForCaptionSegment } from "../src/lib/editor/captions.ts";
import type { QuranVerseContent } from "../src/lib/quran/content.ts";

const alignment = {
  verseKey: "93:1",
  surahNumber: 93,
  ayahNumber: 1,
  startMs: 100,
  endMs: 1_100,
  confidence: 0.9,
  timingEvidence: {
    start: { timestampMs: 100, source: "direct-asr-word" as const },
    end: { timestampMs: 1_100, source: "chunk-text-alignment" as const },
    matchedText: "والضحى",
  },
};

const content = { "93:1": { arabic: { uthmani: "وَالضُّحَى وَاللَّيْلِ إِذَا سَجَى وَمَا وَدَّعَكَ رَبُّكَ" }, translation: "By the morning brightness", transliteration: null } } as unknown as Record<string, QuranVerseContent>;

test("splits long ayat only at Quran word boundaries with monotonic derived timing", () => {
  const segments = createCaptionSegments([alignment], content, 3);
  assert.equal(segments.length, 3);
  assert.equal(segments.map((segment) => segment.arabic).join(" "), content["93:1"].arabic.uthmani);
  assert.equal(segments[0].timingEvidence.start.source, "direct-asr-word");
  assert.equal(segments[1].timingEvidence.start.source, "derived");
  assert.equal(segments[0].endMs <= segments[1].startMs, true);
  assert.equal(segments[1].endMs <= segments[2].startMs, true);
  assert.equal(segments.every((segment) => segment.verseKeys.join() === "93:1"), true);
});

test("short ayat stay intact and automatic chunks avoid a tiny tail", () => {
  const short = createCaptionSegments([alignment], { "93:1": { ...content["93:1"], arabic: { ...content["93:1"].arabic, uthmani: "وَالضُّحَى" } } }, 3);
  assert.equal(short.length, 1);
  const nineWords = "وَالضُّحَى وَاللَّيْلِ إِذَا سَجَى وَمَا وَدَّعَكَ رَبُّكَ وَمَا قَلَى";
  const balanced = createCaptionSegments([alignment], { "93:1": { ...content["93:1"], arabic: { ...content["93:1"].arabic, uthmani: nineWords } } }, 8);
  assert.deepEqual(balanced.map((segment) => segment.arabic.split(" ").length), [5, 4]);
});

test("translation survives editor conversion and long-ayah splitting through the parent verse key", () => {
  const segments = createCaptionSegments([alignment], content, 3);
  assert.equal(translationForCaptionSegment(segments[1], content), "By the morning brightness");
  assert.equal(segments[1].translation, null);
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
  const first = createCaptionSegments([alignment], content, 3);
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
