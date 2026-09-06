# Quran recognition and forced alignment

## Architecture decision

Recognition is a browser-local, accuracy-first hybrid pipeline:

1. Decode the selected media once to mono PCM and build a 10 ms RMS envelope.
2. Run FastConformer Quran-wide CTC retrieval/reranking over VAD-qualified windows, solve a surah-aware continuity path, and pass it through the centralized production evidence gate.
3. Adapt an accepted FastConformer word-level range to `FinalCanonicalSpan`. Canonical display ranges remain full ayat; identifier word boundaries remain evidence only.
4. Only when FastConformer is insufficient, ambiguous, or structurally invalid, run lazy-loaded local Whisper Base Timestamped and retain its whole-recording matcher as the fallback passage engine.
5. Run the existing canonical-first FastConformer forced alignment. It remains the sole automatic timing authority regardless of passage source.
7. If word timestamps are unavailable, or an ayah has no direct anchor, trim the timing search to detected speech regions and run bounded overlapping local micro-ASR windows against the already-known passage. Micro-ASR is timing-only evidence and cannot replace the primary passage. The first verified Quran-containing window anchors onset; a missing interior ayah is explicitly searched between neighbouring evidence before interpolation is allowed.
8. Refine verified onset, offset, and ayah transitions from the local PCM envelope. Derive one complete-ayah caption display set per ayah, without mutating the canonical recognition result.

The canonical Hafs corpus is the displayed text authority. FastConformer identification decides what passage was recited; FastConformer forced alignment decides when its canonical words occur. Whisper is fallback passage evidence only.

## Alternatives considered

- Better use of Whisper word timestamps alone: rejected because timestamps cannot represent repeated canonical words and are not a forced-alignment model.
- Existing ASR-to-ayah interpolation: retained only as a compatibility fallback for persisted `VerseAlignment`; it collapses too much timing detail for caption generation.
- A second browser-local Arabic CTC/forced-alignment model: rejected for now. No tested, compact Arabic Quran CTC model is available in the current local runtime; adding an unvalidated large model would increase first-run download and memory without demonstrated accuracy improvement.

Whisper Base Timestamped remains lazy loaded, local, and approximately 145 MB q4 on first download. The recovery pass reuses that in-memory model and decoded PCM: it reads up to sixteen 8-second windows with a 2-second overlap, bounded to active speech instead of rerunning the entire recording. This can roughly double difficult fallback runs, by design, with no additional model download or network use.

## Output layers

- `CanonicalPassageWord`: fixed Quran identity and canonical position.
- `CanonicalWordAlignment`: one record for every selected canonical word. `directMatch`, `recoveredMatch`, and timing evidence distinguish word timestamps, micro-ASR, PCM refinement, interpolation, coarse chunks, and unknown timing.
- `WordOccurrence`: ASR observations, including meaningful repeated local words and explicitly labelled coarse chunks; it never determines which Arabic words are displayed.
- `ForcedVerseTiming`: timing for every intersected ayah, direct/recovered word coverage, recovery status, and conservative partial-start/end metadata.
- `PauseCandidate`: low-energy interval associated with a canonical boundary, never global silence segmentation.
- `CaptionSetPlan`: currently exactly one full canonical ayah per automatic display set. Pause and splitting evidence remain available internally for a later reactivation.

Manual timeline edits remain authoritative for presentation and never rewrite canonical recognition.

## Debugging

Every recognition run stores a JSON-safe report at `window.__QURAN_ALIGNMENT_DEBUG__` in development. The normal editor exposes **Copy Alignment Debug** after recognition; the development `/recognition` route includes the same data in its debug export. Reports explicitly include the primary raw text/token count/timestamp mode, top five passage candidates, mapping coverage and uniqueness, `passageSource: "primary-transcript"`, the stable pre-f0840e7 shadow comparison, word-timestamp availability, micro-ASR text/windows, direct/recovered coverage by ayah, verse-start evidence, the first-onset trace, canonical word alignments, direct observations, and display sets—never media bytes.

## Current limitations

This is text-constrained forced alignment rather than phoneme/CTC alignment. Micro-ASR supplies stronger verse-level localization when word timestamps fail, but it is still not a phonetic boundary model; interpolated canonical-word timing is deliberately marked as such. Acoustic refinement uses RMS energy (not phonetic boundaries), so it can refine verified onset/offset and pauses without claiming sub-phoneme precision. Manual timeline adjustment remains appropriate for noisy recitation.
