# Quran outer timing refinement

## Scope and invariant

This milestone refines only the temporal envelope of a Quran range after that
range has been accepted. Canonical reconstruction, whole-recording integrity,
bounded adjacent-ayah verification, and inclusive canonical expansion remain
the identity authorities. The refiner receives canonical words and tokens but
no Surah/ayah mutation API, and its result explicitly records
`acceptedCanonicalIdentityUnchanged: true`.

The FastConformer model, CTC and passage thresholds, VAD configuration,
12-second identification windows, 6-second hop, continuation and anchor rules,
reconstruction and integrity rules, long-ayah feasibility logic, edge rules,
Quran normalization/text, Whisper authority, media preparation, final
forced-alignment constants, presentation, and manual editing are unchanged.

## Why correct identity still produced truncated captions

Case B is exactly `2:258-259`. Production media inspection reports a
115.843-second source and canonical 16 kHz mono PCM of the same duration. The
untouched locator selected 5.184-109.016 seconds in the retained real-logit
baseline; the previous production project saved its first caption at 5.344
seconds and its final caption at 108.240 seconds.

Both boundary ayat are long. Their combined source target has 248 CTC labels,
while a 12-second localization interval has 150 frames. The existing
frame-feasibility fix correctly chose contiguous 75-label prefix/suffix
representations. That made a CTC path possible, but it did not make the
maximum-likelihood localization cut the perceptual acoustic edge. The local
target can still select an interior emission anchor, and final alignment was
then unable to see audio outside that anchor.

The evidence is direct:

- Over the available accepted-range interval, 2:258 begins at 1.344 seconds;
  its first CTC word starts at 1.424 seconds. Under the old 5.184-second cut,
  the first five words were forced into 5.344-6.064 seconds.
- At the end, accepted final words continue through 114.240 seconds. Under the
  old cutoff, the last six words were forced into approximately
  108.216-109.016 seconds, which created the visible rush.
- Interior word emissions that were already inside both intervals retained
  their acoustic locations. The fault was the final alignment interval, not a
  need to redistribute passage time.

## Post-identity architecture

The production path is now:

```text
accepted canonical range
  -> safe localized interval
  -> bounded outer timing refinement
  -> unchanged final forced alignment
  -> CaptionSegments
```

The stage reuses the accepted target, canonical PCM, VAD regions,
whole-recording logits, and loaded FastConformer session. It introduces no
second inference, model initialization, or whole-Quran search.

For each edge, the search is limited to the same continuous VAD region and at
most the existing six-second boundary neighborhood. VAD defines only the
search bound. Expansion requires a complete CTC path through a contiguous
accepted prefix or suffix and a strict normalized canonical likelihood win
over the blank-only hypothesis. The interval can expand or stay unchanged; it
cannot contract proven coverage.

## Start refinement

The expanded accepted-range path identifies only canonical words of the
accepted first ayah that occur before the localized start. Those contiguous
prefix tokens are proved again in the bounded outer interval. Case B used
eight prefix tokens; their normalized score was -1.242543 versus -1.452405 for
blank in the final production run.

The first token begins at 1.424 seconds. The preceding 80 ms is one
blank-dominant frame inside the same proven speech region, with no unrelated
nonblank emission. It is therefore accepted as the leading acoustic
realization of the proved canonical prefix, moving the interval and first
CaptionSegment to 1.344 seconds. The first word timing remains 1.424 seconds;
internal words are not stretched.

## End refinement and held phonetics

The end proof uses only contiguous suffix tokens owned by the accepted final
ayah. In the final production run, its seven-token suffix scored -2.122789 per
frame versus -2.269167 for blank. The accepted final token owns the prolonged
phonetic realization through 114.240 seconds, so the refined interval and
final CaptionSegment end there.

VAD or remaining media duration cannot extend the result. In the independent
real-logit probe, the final token ended at 114.494 seconds while VAD continued
to 114.816 seconds; a later non-boundary emission prevented blank/repeat
continuation, correctly stopping before the VAD edge. This distinguishes madd
or a held final syllable from generic voiced activity.

## CTC blank and repeat semantics

Blank/repeat continuation is considered only after the accepted canonical
prefix/suffix has a complete local path and strictly beats blank. Every frame
between the aligned boundary token and the continuous speech-region edge must
be either blank or a token owned by the same first/final canonical word. Any
other emission stops continuation at the aligned token boundary.

Case B's leading realization contains one supported blank frame and no repeat
frame. Its production final token itself carries the held ending to 114.240
seconds, with no post-token continuation. Case A needs no continuation because
its existing boundaries already equal the evidence limits.

## Safety boundaries

- Silence or generic VAD-positive audio cannot expand a boundary without the
  accepted canonical target proof.
- Background speech, music/noise, and unrelated Quran cannot satisfy the
  complete accepted prefix/suffix path plus strict blank comparison; unrelated
  greedy emissions also block blank/repeat continuation.
- Previous/next ayah identity remains owned by the unchanged adjacent-edge
  verifier. The timing refiner has no range mutation surface and accepts only
  tokens belonging to the already accepted boundary ayah.
- Reset/repeated/out-of-order passages remain rejected by the unchanged
  integrity stage before refinement can run.
- The final forced aligner and word-end policy are unchanged. It is rerun on
  the refined interval, so internal words remain acoustic rather than being
  proportionally stretched.
- Manual CaptionSegment timing edits remain authoritative; refinement runs
  only while generating a new automatic alignment.

## Real fixture results

### Case A

- Accepted range before/after: `20:100-103`
- Start before/after: 0.384 / 0.384 seconds
- End before/after: 32.928 / 32.928 seconds
- Refiner result: both edges `already-at-evidence-limit`
- Watch: no caption at 0.383; first caption full opacity/no blur at 0.384;
  final caption full opacity/no blur at 32.927; inactive immediately after the
  half-open 32.928 boundary

The former 4.104/26.968 truncation did not return.

### Case B

- Accepted range before/after: `2:258-259`
- Verified audible Quran onset: 1.344 seconds
- Old localized start: 5.184 seconds
- New refined start: 1.344 seconds
- First saved CaptionSegment: 1.344 seconds
- First canonical word: 1.424-1.664 seconds
- Verified final Quran completion: 114.240 seconds in the production PCM
- Old localized end: 109.016 seconds
- New refined end: 114.240 seconds
- Final saved CaptionSegment: 114.240 seconds
- Final seven words: 107.764-108.723, 108.803-109.683,
  109.842-110.482, 110.722-111.282, 111.362-112.081,
  112.161-113.360, and 113.600-114.240 seconds

Watch shows no caption at 1.343, a full-opacity/no-blur first caption at 1.344,
the first word active at 1.424, natural one-by-one progress through the final
words, the final caption active at 114.239, and no caption at 114.241.

## Frozen validation and protected constants

Identity results are unchanged:

- H: `91:1-15`
- K: `92:1-14`
- Positive B: `101:1-11`
- Negative A: rejected with both integrity vetoes
- Historical genuine: 20/20 exact
- Historical adversarial: 23/23 rejected
- Final validation: 2/2 genuine exact and 2/2 adversarial rejected

The protected-constant test remains byte-for-byte unchanged and passes. No
recognition threshold, VAD setting, window/hop value, reconstruction,
integrity, long-ayah feasibility, edge, forced-alignment, presentation, or
manual-timing constant changed.
