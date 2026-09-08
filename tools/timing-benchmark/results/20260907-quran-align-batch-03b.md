# Real Quran word-timing benchmark

Dataset: release-2016-11-24 — Collin Fair / quran-align, CC BY 4.0. The timing is externally machine-generated reference data, not human ground truth.

Usable ayah recordings: 5; usable word references: 21; exclusions: 0.

# Quran word-timing benchmark

Engine: `fastconformer-current`

Fixtures: 5

Structural validity: PASS; canonical words expected/timed/missing: 21/21/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=21, coverage=100%, median AE=88 ms, mean AE=194.81 ms, p90=572 ms, p95=588 ms, max=777 ms, bias=57.95 ms; within 50/100/150/200/300/500 ms = 23.81% / 61.9% / 66.67% / 66.67% / 71.43% / 85.71%
- Word ends: n=21, coverage=100%, median AE=461 ms, mean AE=585.1 ms, p90=1164 ms, p95=1204 ms, max=1413 ms, bias=-583 ms; within 50/100/150/200/300/500 ms = 4.76% / 4.76% / 4.76% / 14.29% / 38.1% / 52.38%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 75:13 | 2 | ٱلْإِنسَـٰنُ | 3640 | 2227 | -1413 | 0 |
| word-end | 75:14 | 2 | ٱلْإِنسَـٰنُ | 2640 | 1436 | -1204 | 0 |
| word-end | 75:15 | 2 | أَلْقَىٰ | 3150 | 1986 | -1164 | 0 |
| word-end | 75:14 | 4 | نَفْسِهِۦ | 5110 | 4069 | -1041 | 0 |
| word-end | 75:13 | 6 | وَأَخَّرَ | 9360 | 8431 | -929 | 0 |
| word-end | 75:12 | 4 | ٱلْمُسْتَقَرُّ | 6030 | 5170 | -860 | 0 |
| word-start | 75:15 | 3 | مَعَاذِيرَهُۥ | 3160 | 2383 | -777 | 0.0003 |
| word-end | 75:13 | 3 | يَوْمَئِذٍۭ | 5690 | 4931 | -759 | 0.0009 |
| word-end | 75:13 | 4 | بِمَا | 6530 | 5806 | -724 | 0 |
| word-end | 75:14 | 3 | عَلَىٰ | 3660 | 2952 | -708 | 0 |
| word-start | 75:15 | 2 | أَلْقَىٰ | 1080 | 1668 | 588 | 0 |
| word-start | 75:14 | 5 | بَصِيرَةٌ | 5120 | 4548 | -572 | 0 |
| word-end | 75:11 | 2 | لَا | 1990 | 1424 | -566 | 0 |
| word-end | 75:11 | 3 | وَزَرَ | 3150 | 2689 | -461 | 0.0001 |
| word-end | 75:12 | 3 | يَوْمَئِذٍ | 3950 | 3500 | -450 | 0.0011 |
| word-start | 75:14 | 2 | ٱلْإِنسَـٰنُ | 470 | 878 | 408 | 0 |
| word-start | 75:12 | 4 | ٱلْمُسْتَقَرُّ | 3960 | 4295 | 335 | 0 |
| word-start | 75:13 | 2 | ٱلْإِنسَـٰنُ | 1420 | 1750 | 330 | 0 |
| word-end | 75:12 | 1 | إِلَىٰ | 1020 | 716 | -304 | 0 |
| word-end | 75:14 | 1 | بَلِ | 460 | 160 | -300 | 0 |


# Quran word-timing benchmark

Engine: `fastconformer-blank-to-lexical-transition`

Fixtures: 5

Structural validity: PASS; canonical words expected/timed/missing: 21/21/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=21, coverage=100%, median AE=88 ms, mean AE=194.81 ms, p90=572 ms, p95=588 ms, max=777 ms, bias=57.95 ms; within 50/100/150/200/300/500 ms = 23.81% / 61.9% / 66.67% / 66.67% / 71.43% / 85.71%
- Word ends: n=21, coverage=100%, median AE=461 ms, mean AE=585.1 ms, p90=1164 ms, p95=1204 ms, max=1413 ms, bias=-583 ms; within 50/100/150/200/300/500 ms = 4.76% / 4.76% / 4.76% / 14.29% / 38.1% / 52.38%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 75:13 | 2 | ٱلْإِنسَـٰنُ | 3640 | 2227 | -1413 | 0 |
| word-end | 75:14 | 2 | ٱلْإِنسَـٰنُ | 2640 | 1436 | -1204 | 0 |
| word-end | 75:15 | 2 | أَلْقَىٰ | 3150 | 1986 | -1164 | 0 |
| word-end | 75:14 | 4 | نَفْسِهِۦ | 5110 | 4069 | -1041 | 0 |
| word-end | 75:13 | 6 | وَأَخَّرَ | 9360 | 8431 | -929 | 0 |
| word-end | 75:12 | 4 | ٱلْمُسْتَقَرُّ | 6030 | 5170 | -860 | 0 |
| word-start | 75:15 | 3 | مَعَاذِيرَهُۥ | 3160 | 2383 | -777 | 0.0003 |
| word-end | 75:13 | 3 | يَوْمَئِذٍۭ | 5690 | 4931 | -759 | 0.0009 |
| word-end | 75:13 | 4 | بِمَا | 6530 | 5806 | -724 | 0 |
| word-end | 75:14 | 3 | عَلَىٰ | 3660 | 2952 | -708 | 0 |
| word-start | 75:15 | 2 | أَلْقَىٰ | 1080 | 1668 | 588 | 0 |
| word-start | 75:14 | 5 | بَصِيرَةٌ | 5120 | 4548 | -572 | 0 |
| word-end | 75:11 | 2 | لَا | 1990 | 1424 | -566 | 0 |
| word-end | 75:11 | 3 | وَزَرَ | 3150 | 2689 | -461 | 0.0001 |
| word-end | 75:12 | 3 | يَوْمَئِذٍ | 3950 | 3500 | -450 | 0.0011 |
| word-start | 75:14 | 2 | ٱلْإِنسَـٰنُ | 470 | 878 | 408 | 0 |
| word-start | 75:12 | 4 | ٱلْمُسْتَقَرُّ | 3960 | 4295 | 335 | 0 |
| word-start | 75:13 | 2 | ٱلْإِنسَـٰنُ | 1420 | 1750 | 330 | 0 |
| word-end | 75:12 | 1 | إِلَىٰ | 1020 | 716 | -304 | 0 |
| word-end | 75:14 | 1 | بَلِ | 460 | 160 | -300 | 0 |


# Quran word-timing benchmark

Engine: `fastconformer-local-rms-rise-80ms`

Fixtures: 5

Structural validity: PASS; canonical words expected/timed/missing: 21/21/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=21, coverage=100%, median AE=121 ms, mean AE=211.57 ms, p90=512 ms, p95=628 ms, max=817 ms, bias=84.62 ms; within 50/100/150/200/300/500 ms = 28.57% / 42.86% / 61.9% / 66.67% / 71.43% / 85.71%
- Word ends: n=21, coverage=100%, median AE=461 ms, mean AE=585.1 ms, p90=1164 ms, p95=1204 ms, max=1413 ms, bias=-583 ms; within 50/100/150/200/300/500 ms = 4.76% / 4.76% / 4.76% / 14.29% / 38.1% / 52.38%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 75:13 | 2 | ٱلْإِنسَـٰنُ | 3640 | 2227 | -1413 | 0 |
| word-end | 75:14 | 2 | ٱلْإِنسَـٰنُ | 2640 | 1436 | -1204 | 0 |
| word-end | 75:15 | 2 | أَلْقَىٰ | 3150 | 1986 | -1164 | 0 |
| word-end | 75:14 | 4 | نَفْسِهِۦ | 5110 | 4069 | -1041 | 0 |
| word-end | 75:13 | 6 | وَأَخَّرَ | 9360 | 8431 | -929 | 0 |
| word-end | 75:12 | 4 | ٱلْمُسْتَقَرُّ | 6030 | 5170 | -860 | 0 |
| word-start | 75:15 | 3 | مَعَاذِيرَهُۥ | 3160 | 2343 | -817 | 0.0003 |
| word-end | 75:13 | 3 | يَوْمَئِذٍۭ | 5690 | 4931 | -759 | 0.0009 |
| word-end | 75:13 | 4 | بِمَا | 6530 | 5806 | -724 | 0 |
| word-end | 75:14 | 3 | عَلَىٰ | 3660 | 2952 | -708 | 0 |
| word-start | 75:15 | 2 | أَلْقَىٰ | 1080 | 1708 | 628 | 0 |
| word-end | 75:11 | 2 | لَا | 1990 | 1424 | -566 | 0 |
| word-start | 75:14 | 5 | بَصِيرَةٌ | 5120 | 4608 | -512 | 0 |
| word-end | 75:11 | 3 | وَزَرَ | 3150 | 2689 | -461 | 0.0001 |
| word-end | 75:12 | 3 | يَوْمَئِذٍ | 3950 | 3500 | -450 | 0.0011 |
| word-start | 75:12 | 4 | ٱلْمُسْتَقَرُّ | 3960 | 4365 | 405 | 0 |
| word-start | 75:13 | 2 | ٱلْإِنسَـٰنُ | 1420 | 1800 | 380 | 0 |
| word-start | 75:14 | 2 | ٱلْإِنسَـٰنُ | 470 | 848 | 378 | 0 |
| word-end | 75:12 | 1 | إِلَىٰ | 1020 | 716 | -304 | 0 |
| word-end | 75:14 | 1 | بَلِ | 460 | 160 | -300 | 0 |


## Promotion decision

- fastconformer-blank-to-lexical-transition: do not promote; did not meet material, structurally safe word-start promotion threshold; median word-start change=0 ms; p90 change=0 ms.
- fastconformer-local-rms-rise-80ms: do not promote; did not meet material, structurally safe word-start promotion threshold; median word-start change=-33 ms; p90 change=-60 ms.

## Historical reviewed fixtures

6:74-77, 69:19-32, 93:1-5, and 3:33-35 remain preserved as supplied historical/review evidence. Their original continuous recordings are not in this workspace, so they were not falsely rerun against unrelated EveryAyah ayah clips.
