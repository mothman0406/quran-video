# FastConformer Quran identification — production primary

FastConformer is the browser-local production passage identifier. Its
Quran-wide output passes one deterministic evidence gate before being adapted
to `FinalCanonicalSpan`; it still never supplies caption timing.

## Architecture

Current production authority is:

```text
audio -> FastConformer Quran-wide identifier -> evidence gate -> FinalCanonicalSpan -> FastConformer forced alignment -> CaptionSegments
```

Whisper is retained as the fallback when the FastConformer gate rejects or
cannot structurally validate a passage. Development builds may also run it as
an explicit comparison after FastConformer succeeds:

```text
audio -> FastConformer CTC -> Quran-wide retrieval -> CTC reranking -> continuity solver -> accepted span
```

The two FastConformer jobs are separate. The existing known-passage runner
continues to create exact canonical word timing only after the selected engine
supplies the canonical range. The identifier has no Whisper input and cannot
emit timing or captions.
Their inference output could be shared in a later refactor only when the audio
window is identical; this milestone keeps the established alignment path intact
and prioritizes regression safety over reuse.

## Quran-wide representation and retrieval

The cached static index contains every spoken lexical Quran word in order,
with its surah, ayah, canonical lexical word index, global Quran word index,
untouched canonical Arabic, Tilawa `text_clean`-compatible lexical text, and
published CTC token IDs. Optional Tilawa basmalah token sequences are stored as
an acoustic alternative before a verse's first canonical word; they are never
attached to canonical ayah text.

Global positions remain lookup keys only. Candidate n-grams and expansion are
surah-aware: n-grams never straddle a surah boundary, and a retrieved anchor
is clamped to the lexical bounds of the surah that supplied it. The optional
basmalah is removed from coarse location evidence, because it is shared
context rather than useful location evidence; after lexical evidence locates a
surah start, CTC compares canonical-only against optional-basmalah-plus-
canonical targets. The selected prelude is diagnostic metadata and does not
alter the candidate's canonical start word.

Each voiced 12-second window (6-second hop, at least 1.2 seconds VAD speech)
is greedily CTC-decoded by argmax, repeated-token collapse, and blank removal.
The decoded lexical words feed a deterministic inverted 1–3-gram index. Rare
and longer anchors carry more weight. Anchors generate nearby contiguous
word-level ranges at several plausible lengths, so a candidate can start/end
mid-ayah and cross ayah boundaries. Retrieval is recall-first: up to 48 coarse
candidates, then 24 acoustic reranks.

## Acoustic score, continuity, and confidence

Reranking uses log-space CTC forward probability, summing all valid CTC paths
for each canonical candidate token sequence. The score is normalized as
`log P(target | frames) / frameCount`, which compares different target lengths
without favoring a range just because it covered more frames. If an optional
basmalah sequence exists, canonical-only and optional-prelude-plus-canonical
targets are both scored and the better acoustic explanation is retained.

A deterministic Viterbi solver combines each window's CTC score with Quran
order continuity. It rewards same/adjacent ayah progression and plausible
forward movement, penalizes backward and unrelated-surah jumps, and retains
the previous hypothesis across a null/uncertain window. A null state means one
noisy window cannot veto a coherent passage.

When at least two strong windows agree on a surah, the solver keeps only that
surah's candidate states (plus its explicit null state). Final span
construction then takes the earliest/latest selected words inside that solved
surah, preventing a noisy boundary window from widening a single-surah path.

`confidence.composite` is explicitly heuristic, not calibrated probability.
The debug record exposes its components: normalized CTC score, best-vs-second
margin, agreeing-window count, continuity score, and voiced-audio proportion
explained.

## Debug and performance

Development debug (`Copy Alignment Debug` or `window.__QURAN_ALIGNMENT_DEBUG__`)
includes `PASSAGE_IDENTIFICATION_DECISION`, the evidence gate, selected engine,
and `WHISPER_VS_FASTCONFORMER` when comparison ran. A reliable but conflicting
Whisper result is recorded as a development disagreement; it cannot override
an accepted FastConformer passage. Verbose candidates remain outside production UI.

The result records model inference time, retrieval time, reranking time,
number reranked, and total elapsed time. The Quran index is built once per
loaded pinned model assets and reused across windows/runs in the browser.
`FASTCONFORMER_QURAN_IDENTIFICATION` includes `selectedSurah`,
`canonicalSpan`, `optionalPrelude`, per-window selected candidates,
`surahConsensus`, score/confidence components, and
`CROSS_SURAH_CANDIDATES_REJECTED`.
