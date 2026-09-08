# Segment-aware Quran translation display

`CaptionSegment.translation` remains the immutable full parent-ayah source.
`translationSegment` is optional presentation metadata, carrying only the
display fragment, its owned Arabic word range, derivation source, and review
status. Arabic, canonical ayah identity, FastConformer timing, display timing,
and canonical word ranges are not changed by this feature.

At runtime, contiguous display pieces with one ayah owner are resolved as a
group. A reviewed Saheeh International phrase-boundary table maps Arabic word
ends to ordered English source markers. The resolver extracts only contiguous
substrings of the already selected translation, so it never substitutes
word-by-word wording or uses character, word-count, or elapsed-time ratios.
Unsplit ayat display the exact source unchanged. The current reviewed entries
are 18:57, 2:255, and 2:282; unmatched source versions and unreviewed ayat
repeat the intact parent translation and are marked `needs-review`.

Manual edits change `translationSegment` only and are marked `manual`.
Reset removes that presentation metadata and reruns the deterministic resolver.
An edit is retained only when its Arabic-owned `[wordStart, wordEnd)` range is
unchanged; after a split or merge changes ownership it is recomputed or safely
falls back for review. Preview and canvas export both call
`translationDisplayText`, so a fragment shares exactly its owning segment's
existing `[startMs, endMs)` interval.

## External alignment-data review

| Dataset/service | License / terms found | Coverage / compatibility | Decision |
| --- | --- | --- | --- |
| Tanzil Quran text | CC BY 3.0; verbatim text only | Complete Arabic corpus | Already used for canonical Arabic; not translation alignment. |
| Tanzil translations | Translation download terms say non-commercial and require translator/publisher permission for other use | Includes Saheeh International, but wording/licensing is not a commercial alignment grant | Not incorporated. |
| Quran Foundation content and word-by-word translations | Content API terms require approved access/attribution; commercial redistribution can require a signed license | Word-level resources exist, but may use another English edition and are not a bundled Saheeh alignment license | Not incorporated. |
| Quranic Arabic Corpus | GPL-labelled morphology/word-by-word resource, but its FAQ limits the downloadable research data to non-commercial use and its word-by-word English is a different compiled translation | Quran-wide Arabic morphology; not Saheeh-compatible fragment text | Not incorporated. |

The reviewed boundary table therefore contains no external translation text and
requires no runtime request, model, or paid API. It is local, deterministic,
and has a $0 per-video cost. Source translation attribution and licensing stay
with the existing selected-provider flow.

Sources consulted: [Tanzil text license](https://tanzil.net/docs/Text_License),
[Tanzil translations terms](https://tanzil.net/trans/), and [Quran Foundation
FAQ](https://api-docs.quran.com/docs/tutorials/faq/), plus the [Quranic Arabic
Corpus download](https://corpus.quran.com/download/default.jsp) and
[FAQ](https://corpus.quran.com/faq.jsp).
