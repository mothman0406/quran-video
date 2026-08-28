import assert from "node:assert/strict";
import test from "node:test";
import { captionForPlaybackTime } from "../src/lib/editor/recognition.ts";
import { createCaptionSegments, DEFAULT_TYPOGRAPHY, mergeCaptionWithNext, splitCaptionSegment, translationForCaptionSegment } from "../src/lib/editor/captions.ts";
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
