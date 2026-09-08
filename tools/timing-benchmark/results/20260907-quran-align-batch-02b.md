# Real Quran word-timing benchmark

Dataset: release-2016-11-24 — Collin Fair / quran-align, CC BY 4.0. The timing is externally machine-generated reference data, not human ground truth.

Usable ayah recordings: 5; usable word references: 39; exclusions: 0.

# Quran word-timing benchmark

Engine: `fastconformer-current`

Fixtures: 5

Structural validity: PASS; canonical words expected/timed/missing: 39/39/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=39, coverage=100%, median AE=76 ms, mean AE=81 ms, p90=145 ms, p95=259 ms, max=382 ms, bias=62.74 ms; within 50/100/150/200/300/500 ms = 38.46% / 76.92% / 92.31% / 94.87% / 97.44% / 100%
- Word ends: n=39, coverage=100%, median AE=208 ms, mean AE=269.08 ms, p90=654 ms, p95=804 ms, max=1030 ms, bias=-264.77 ms; within 50/100/150/200/300/500 ms = 15.38% / 30.77% / 41.03% / 46.15% / 74.36% / 82.05%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 3:35 | 16 | أَنتَ | 15150 | 14120 | -1030 | 0 |
| word-end | 3:35 | 14 | مِنِّىٓ | 12690 | 11886 | -804 | 0.0077 |
| word-end | 3:35 | 12 | مُحَرَّرًا | 9400 | 8695 | -705 | 0 |
| word-end | 69:19 | 1 | فَأَمَّا | 1290 | 636 | -654 | 0 |
| word-end | 3:35 | 4 | عِمْرَٰنَ | 3140 | 2553 | -587 | 0 |
| word-end | 69:22 | 2 | جَنَّةٍ | 1980 | 1433 | -547 | 0.0001 |
| word-end | 69:19 | 6 | فَيَقُولُ | 8310 | 7794 | -516 | 0 |
| word-end | 69:21 | 1 | فَهُوَ | 640 | 159 | -481 | 0 |
| word-end | 3:35 | 5 | رَبِّ | 3730 | 3271 | -459 | 0 |
| word-end | 3:35 | 13 | فَتَقَبَّلْ | 10720 | 10290 | -430 | 0 |
| word-start | 3:35 | 15 | إِنَّكَ | 12700 | 13082 | 382 | 0 |
| word-end | 3:35 | 8 | لَكَ | 6110 | 5823 | -287 | 0 |
| word-end | 69:20 | 4 | مُلَـٰقٍ | 4490 | 4207 | -283 | 0 |
| word-end | 69:21 | 3 | عِيشَةٍ | 2190 | 1909 | -281 | 0 |
| word-end | 3:35 | 10 | فِى | 6900 | 6621 | -279 | 0 |
| word-end | 69:19 | 2 | مَنْ | 1630 | 1352 | -278 | 0 |
| word-end | 69:19 | 3 | أُوتِىَ | 2420 | 2147 | -273 | 0 |
| word-start | 69:19 | 6 | فَيَقُولُ | 4990 | 5249 | 259 | 0 |
| word-end | 3:35 | 11 | بَطْنِى | 7750 | 7499 | -251 | 0.0012 |
| word-end | 69:19 | 4 | كِتَـٰبَهُۥ | 3670 | 3420 | -250 | 0 |


# Quran word-timing benchmark

Engine: `fastconformer-blank-to-lexical-transition`

Fixtures: 5

Structural validity: PASS; canonical words expected/timed/missing: 39/39/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=39, coverage=100%, median AE=76 ms, mean AE=81 ms, p90=145 ms, p95=259 ms, max=382 ms, bias=62.74 ms; within 50/100/150/200/300/500 ms = 38.46% / 76.92% / 92.31% / 94.87% / 97.44% / 100%
- Word ends: n=39, coverage=100%, median AE=208 ms, mean AE=269.08 ms, p90=654 ms, p95=804 ms, max=1030 ms, bias=-264.77 ms; within 50/100/150/200/300/500 ms = 15.38% / 30.77% / 41.03% / 46.15% / 74.36% / 82.05%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 3:35 | 16 | أَنتَ | 15150 | 14120 | -1030 | 0 |
| word-end | 3:35 | 14 | مِنِّىٓ | 12690 | 11886 | -804 | 0.0077 |
| word-end | 3:35 | 12 | مُحَرَّرًا | 9400 | 8695 | -705 | 0 |
| word-end | 69:19 | 1 | فَأَمَّا | 1290 | 636 | -654 | 0 |
| word-end | 3:35 | 4 | عِمْرَٰنَ | 3140 | 2553 | -587 | 0 |
| word-end | 69:22 | 2 | جَنَّةٍ | 1980 | 1433 | -547 | 0.0001 |
| word-end | 69:19 | 6 | فَيَقُولُ | 8310 | 7794 | -516 | 0 |
| word-end | 69:21 | 1 | فَهُوَ | 640 | 159 | -481 | 0 |
| word-end | 3:35 | 5 | رَبِّ | 3730 | 3271 | -459 | 0 |
| word-end | 3:35 | 13 | فَتَقَبَّلْ | 10720 | 10290 | -430 | 0 |
| word-start | 3:35 | 15 | إِنَّكَ | 12700 | 13082 | 382 | 0 |
| word-end | 3:35 | 8 | لَكَ | 6110 | 5823 | -287 | 0 |
| word-end | 69:20 | 4 | مُلَـٰقٍ | 4490 | 4207 | -283 | 0 |
| word-end | 69:21 | 3 | عِيشَةٍ | 2190 | 1909 | -281 | 0 |
| word-end | 3:35 | 10 | فِى | 6900 | 6621 | -279 | 0 |
| word-end | 69:19 | 2 | مَنْ | 1630 | 1352 | -278 | 0 |
| word-end | 69:19 | 3 | أُوتِىَ | 2420 | 2147 | -273 | 0 |
| word-start | 69:19 | 6 | فَيَقُولُ | 4990 | 5249 | 259 | 0 |
| word-end | 3:35 | 11 | بَطْنِى | 7750 | 7499 | -251 | 0.0012 |
| word-end | 69:19 | 4 | كِتَـٰبَهُۥ | 3670 | 3420 | -250 | 0 |


# Quran word-timing benchmark

Engine: `fastconformer-local-rms-rise-80ms`

Fixtures: 5

Structural validity: PASS; canonical words expected/timed/missing: 39/39/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=39, coverage=100%, median AE=76 ms, mean AE=88.79 ms, p90=156 ms, p95=259 ms, max=432 ms, bias=65.31 ms; within 50/100/150/200/300/500 ms = 30.77% / 74.36% / 89.74% / 94.87% / 97.44% / 100%
- Word ends: n=39, coverage=100%, median AE=208 ms, mean AE=269.08 ms, p90=654 ms, p95=804 ms, max=1030 ms, bias=-264.77 ms; within 50/100/150/200/300/500 ms = 15.38% / 30.77% / 41.03% / 46.15% / 74.36% / 82.05%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 3:35 | 16 | أَنتَ | 15150 | 14120 | -1030 | 0 |
| word-end | 3:35 | 14 | مِنِّىٓ | 12690 | 11886 | -804 | 0.0077 |
| word-end | 3:35 | 12 | مُحَرَّرًا | 9400 | 8695 | -705 | 0 |
| word-end | 69:19 | 1 | فَأَمَّا | 1290 | 636 | -654 | 0 |
| word-end | 3:35 | 4 | عِمْرَٰنَ | 3140 | 2553 | -587 | 0 |
| word-end | 69:22 | 2 | جَنَّةٍ | 1980 | 1433 | -547 | 0.0001 |
| word-end | 69:19 | 6 | فَيَقُولُ | 8310 | 7794 | -516 | 0 |
| word-end | 69:21 | 1 | فَهُوَ | 640 | 159 | -481 | 0 |
| word-end | 3:35 | 5 | رَبِّ | 3730 | 3271 | -459 | 0 |
| word-start | 3:35 | 15 | إِنَّكَ | 12700 | 13132 | 432 | 0 |
| word-end | 3:35 | 13 | فَتَقَبَّلْ | 10720 | 10290 | -430 | 0 |
| word-end | 3:35 | 8 | لَكَ | 6110 | 5823 | -287 | 0 |
| word-end | 69:20 | 4 | مُلَـٰقٍ | 4490 | 4207 | -283 | 0 |
| word-end | 69:21 | 3 | عِيشَةٍ | 2190 | 1909 | -281 | 0 |
| word-end | 3:35 | 10 | فِى | 6900 | 6621 | -279 | 0 |
| word-end | 69:19 | 2 | مَنْ | 1630 | 1352 | -278 | 0 |
| word-end | 69:19 | 3 | أُوتِىَ | 2420 | 2147 | -273 | 0 |
| word-start | 69:19 | 6 | فَيَقُولُ | 4990 | 5249 | 259 | 0 |
| word-end | 3:35 | 11 | بَطْنِى | 7750 | 7499 | -251 | 0.0012 |
| word-end | 69:19 | 4 | كِتَـٰبَهُۥ | 3670 | 3420 | -250 | 0 |


## Promotion decision

- fastconformer-blank-to-lexical-transition: do not promote; did not meet material, structurally safe word-start promotion threshold; median word-start change=0 ms; p90 change=0 ms.
- fastconformer-local-rms-rise-80ms: do not promote; did not meet material, structurally safe word-start promotion threshold; median word-start change=0 ms; p90 change=11 ms.

## Historical reviewed fixtures

6:74-77, 69:19-32, 93:1-5, and 3:33-35 remain preserved as supplied historical/review evidence. Their original continuous recordings are not in this workspace, so they were not falsely rerun against unrelated EveryAyah ayah clips.
