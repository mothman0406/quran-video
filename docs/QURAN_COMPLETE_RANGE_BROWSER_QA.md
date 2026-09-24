# Quran complete-range production browser QA

## 1. Verdict

**BROWSER QA PASSED**

**QURAN RECOGNITION MILESTONE COMPLETE: YES**

The actual `/create` production flow identified both tested recordings at their
exact independently known ranges, expanded every canonical ayah once in order,
loaded the editor, and kept playback synchronized after seeking. One narrow
editor navigation bug was found and fixed without changing recognition logic,
constants, fixtures, models, or architecture.

No additional recognition architecture or testing milestone is recommended
without a new concrete real-world failure.

## 2. Starting repository

- Starting revision: `5d0e2eae11990a216271ef7d234d8e037e32d5bc`
- Branch: `qa/quran-complete-range-browser`
- Worktree: clean
- Required implementation ancestry: `6f4585f` is the direct parent of the
  starting merge commit.
- Frozen implementation and final-validation records were present and reviewed.

## 3. Browser and app environment

- App: normal `npm run dev` command on `http://localhost:3000`
- Browser: isolated Google Chrome `152.0.7977.85`, headless on macOS
- Route: real `/create` route with the production-safe `?debugMedia=1`
  diagnostics gate; no regression-only page and no injected recognition result
- Service workers: bypassed for the isolated QA session
- A day-old `npm run start` process from this repository was stopped before QA
  so the normal development app could own port 3000.

## 4. Baseline

The literal requested `npm test -- --run` command expanded to Node's
`--test --run` without the required pattern and exited before tests. The
repository-equivalent `npm test` passed **553/553**. `npx tsc --noEmit` passed.
No calibration suite was run as part of the startup baseline.

## 5. Primary production smoke test

- Recording: existing ignored local fixture
  `tmp/canonical-validation/positive-b.mp3`
- Independent truth: Maher Al-Muaiqly, `101:1-11`
- Production result: exact `101:1-11`
- Media preparation: passed through the real file input and native/direct local
  route from the immutable original source; no source upload
- Media preparation time: **339 ms**
- Recognition start to ready range/captions: **58,983 ms**
- Range ready to editor ready: **619 ms**
- Obvious stall: none

The retained production diagnostics show five VAD-qualified identification
windows, one `vad-window-summary`, one final identity decision, and one
successful final forced alignment. The provisional core recovered the missing
start and the production authority returned `101:1-11`.

## 6. Canonical completeness and timing

The persisted project and editor both contained exactly 11 ayah caption
segments, once each and in this order:

`101:1, 101:2, 101:3, 101:4, 101:5, 101:6, 101:7, 101:8, 101:9, 101:10, 101:11`

The ordered intervals were contiguous and non-overlapping from the detected
352 ms onset through 33,312 ms. The source ended at 33,384 ms. No ASR weakness
removed an interior ayah, and no unrecited `101:12` appeared.

Actual player-control playback observations:

- At 0-286 ms, before Quran onset, no caption was active.
- Ayah 1 became active after the detected 352 ms onset.
- Playback across `101:1 -> 101:2`, `101:5 -> 101:6`, and
  `101:10 -> 101:11` advanced forward exactly once at each boundary.
- Direct seeking to the first, interior, and final segment midpoints selected
  the expected caption without a backward jump.
- Ayah 11 remained active at 33,306 ms and cleared only at the 33,384 ms media
  end. No later ayah appeared.

## 7. Editor and manual-edit result

The generated project survived client navigation into `/editor`, rendered an
audio source, waveform, normal text/layout controls, and 11 caption blocks.
The persisted `CaptionSegment[]` was ordered and structurally valid.

A temporary drag changed the first segment out time from 1.309 s to 1.605 s.
The value remained 1.605 s after an unrelated wait/rerender and returned to
1.309 s with Undo. The temporary edit was not saved or committed.

## 8. Browser integration bug and fix

The first editor run exposed a production integration bug: the persisted
project correctly stored media trim `0-33,384 ms`, but the live editor opened
with `0-250 ms`. Playback therefore reset to zero and stopped at 250 ms.

Classification: **A — browser/app integration bug**.

Root cause: `openProject()` queued `pendingOpenProject`, then the same stale
React render immediately called `loadSelectedSource()`. That call still saw a
null pending project and replaced the saved trim with the initial zero-duration
state. Metadata clamping converted it to the 250 ms minimum.

The fix passes the already-known opening project explicitly through the routed
runtime handoff. The post-fix browser rerun loaded the full-width
`0-33,384 ms` media interval, and normal playback passed. Recognition modules
and frozen constants were untouched.

## 9. Console, model, search, and privacy observations

- Fatal console errors: none
- Uncaught exceptions/unhandled rejections: none
- Worker crashes, OOMs, or model initialization failures: none
- Nonfatal warnings: the existing ONNX unknown-CPU-vendor and execution-
  provider node-assignment warnings, plus content-length fallback warnings
  from the development-only Whisper comparison
- Global Quran search count: **1** for the primary request
- FastConformer session initialization count: **1** for the primary request;
  the same worker/session was reused by identification, complete-range work,
  bounded edge work, and alignment
- Duplicate whole-Quran search: not observed
- Server inference: **NO**
- Source media upload: **NO**
- Non-local write requests: none
- The development build separately initialized its expected Whisper
  encoder/decoder comparison once; it did not veto or replace the accepted
  FastConformer result.

## 10. Optional second production smoke test

- Recording: existing ignored local fixture
  `tmp/complete-range-final/case-2.mp3`
- Independent truth: Muhammad Jibreel, `86:1-12`; `86:13` absent
- Production result: exact `86:1-12`
- Canonical captions: **12/12**, once each and in order
- Media preparation time: **677 ms**
- Recognition time: **83,764 ms**
- Editor-ready time: **611 ms**
- Global Quran search count: **1**
- Fatal exceptions: none
- Result: **PASS**

An initial attempt in the already-used headless profile lost its DevTools page
target before producing any recognition decision or result. It was classified
as environment/tooling and retried once with the unchanged clip in a fresh
isolated profile. The retry completed exactly. No recognition code or setting
was changed in response.

## 11. Post-fix verification

- Focused Quick Create/editor flow test: **8/8 passed**
- Full test suite: **553/553 passed**
- Strict TypeScript: passed
- Quiet lint: passed
- Production build: passed with only the existing ONNX/Transformers webpack
  warnings
- `git diff --check`: passed
- Frozen complete-range evaluator: **FINAL FROZEN VALIDATION PASSED**
- Production/offline shared-decision parity: **7/7 passed**
- Frozen acceptance remains H `91:1-15`, K `92:1-14`, Positive B
  `101:1-11`, Negative A rejected, Case 1 `81:8-22`, Case 2 `86:1-12`,
  Cases 3 and 4 rejected, historical genuine **20/20** exact, and historical
  adversarial **23/23** rejected.

## 12. Remaining limitation

This QA used Chrome headless rather than a headed browser with audible speaker
output. Timing was verified from the real media clock, player controls,
caption activation state, canonical segment data, waveform/editor state, and
boundary playback samples; subjective audio/video lip-sync was not evaluated.

