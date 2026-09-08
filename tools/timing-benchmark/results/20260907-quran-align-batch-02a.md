# Real Quran word-timing benchmark

Dataset: release-2016-11-24 — Collin Fair / quran-align, CC BY 4.0. The timing is externally machine-generated reference data, not human ground truth.

Usable ayah recordings: 10; usable word references: 88; exclusions: 0.

# Quran word-timing benchmark

Engine: `fastconformer-current`

Fixtures: 10

Structural validity: PASS; canonical words expected/timed/missing: 88/88/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=88, coverage=100%, median AE=75 ms, mean AE=106.1 ms, p90=229 ms, p95=278 ms, max=693 ms, bias=58.83 ms; within 50/100/150/200/300/500 ms = 36.36% / 63.64% / 79.55% / 88.64% / 95.45% / 96.59%
- Word ends: n=88, coverage=100%, median AE=299 ms, mean AE=382.33 ms, p90=800 ms, p95=984 ms, max=1384 ms, bias=-357.74 ms; within 50/100/150/200/300/500 ms = 4.55% / 15.91% / 21.59% / 30.68% / 50% / 72.73%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 6:77 | 18 | ٱلضَّآلِّينَ | 19850 | 18466 | -1384 | 0.9926 |
| word-end | 6:74 | 13 | ضَلَـٰلٍ | 18020 | 16929 | -1091 | 0.031 |
| word-end | 3:34 | 1 | ذُرِّيَّةًۢ | 1860 | 794 | -1066 | 0 |
| word-end | 6:76 | 10 | فَلَمَّآ | 10810 | 9757 | -1053 | 0 |
| word-end | 6:74 | 14 | مُّبِينٍ | 19510 | 18526 | -984 | 0.9997 |
| word-end | 6:77 | 8 | فَلَمَّآ | 8530 | 7674 | -856 | 0 |
| word-end | 6:76 | 1 | فَلَمَّا | 1620 | 800 | -820 | 0 |
| word-end | 6:77 | 1 | فَلَمَّا | 1690 | 879 | -811 | 0 |
| word-end | 6:77 | 15 | لَأَكُونَنَّ | 14550 | 13750 | -800 | 0 |
| word-end | 94:5 | 1 | فَإِنَّ | 1580 | 790 | -790 | 0.0004 |
| word-end | 3:34 | 7 | عَلِيمٌ | 7850 | 7067 | -783 | 0 |
| word-end | 6:76 | 6 | كَوْكَبًا | 6460 | 5678 | -782 | 0 |
| word-end | 3:34 | 4 | بَعْضٍ | 4460 | 3732 | -728 | 0 |
| word-end | 3:33 | 1 | إِنَّ | 1350 | 638 | -712 | 0 |
| word-end | 3:34 | 5 | وَٱللَّهُ | 5390 | 4685 | -705 | 0 |
| word-end | 94:6 | 1 | إِنَّ | 1330 | 632 | -698 | 0 |
| word-start | 3:33 | 6 | وَءَالَ | 4570 | 5263 | 693 | 0 |
| word-end | 6:77 | 6 | هَـٰذَا | 5800 | 5116 | -684 | 0 |
| word-end | 3:34 | 3 | مِنۢ | 3750 | 3097 | -653 | 0 |
| word-end | 6:76 | 3 | عَلَيْهِ | 3530 | 2879 | -651 | 0 |


# Quran word-timing benchmark

Engine: `fastconformer-blank-to-lexical-transition`

Fixtures: 10

Structural validity: PASS; canonical words expected/timed/missing: 88/88/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=88, coverage=100%, median AE=75 ms, mean AE=106.1 ms, p90=229 ms, p95=278 ms, max=693 ms, bias=58.83 ms; within 50/100/150/200/300/500 ms = 36.36% / 63.64% / 79.55% / 88.64% / 95.45% / 96.59%
- Word ends: n=88, coverage=100%, median AE=299 ms, mean AE=382.33 ms, p90=800 ms, p95=984 ms, max=1384 ms, bias=-357.74 ms; within 50/100/150/200/300/500 ms = 4.55% / 15.91% / 21.59% / 30.68% / 50% / 72.73%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 6:77 | 18 | ٱلضَّآلِّينَ | 19850 | 18466 | -1384 | 0.9926 |
| word-end | 6:74 | 13 | ضَلَـٰلٍ | 18020 | 16929 | -1091 | 0.031 |
| word-end | 3:34 | 1 | ذُرِّيَّةًۢ | 1860 | 794 | -1066 | 0 |
| word-end | 6:76 | 10 | فَلَمَّآ | 10810 | 9757 | -1053 | 0 |
| word-end | 6:74 | 14 | مُّبِينٍ | 19510 | 18526 | -984 | 0.9997 |
| word-end | 6:77 | 8 | فَلَمَّآ | 8530 | 7674 | -856 | 0 |
| word-end | 6:76 | 1 | فَلَمَّا | 1620 | 800 | -820 | 0 |
| word-end | 6:77 | 1 | فَلَمَّا | 1690 | 879 | -811 | 0 |
| word-end | 6:77 | 15 | لَأَكُونَنَّ | 14550 | 13750 | -800 | 0 |
| word-end | 94:5 | 1 | فَإِنَّ | 1580 | 790 | -790 | 0.0004 |
| word-end | 3:34 | 7 | عَلِيمٌ | 7850 | 7067 | -783 | 0 |
| word-end | 6:76 | 6 | كَوْكَبًا | 6460 | 5678 | -782 | 0 |
| word-end | 3:34 | 4 | بَعْضٍ | 4460 | 3732 | -728 | 0 |
| word-end | 3:33 | 1 | إِنَّ | 1350 | 638 | -712 | 0 |
| word-end | 3:34 | 5 | وَٱللَّهُ | 5390 | 4685 | -705 | 0 |
| word-end | 94:6 | 1 | إِنَّ | 1330 | 632 | -698 | 0 |
| word-start | 3:33 | 6 | وَءَالَ | 4570 | 5263 | 693 | 0 |
| word-end | 6:77 | 6 | هَـٰذَا | 5800 | 5116 | -684 | 0 |
| word-end | 3:34 | 3 | مِنۢ | 3750 | 3097 | -653 | 0 |
| word-end | 6:76 | 3 | عَلَيْهِ | 3530 | 2879 | -651 | 0 |


# Quran word-timing benchmark

Engine: `fastconformer-local-rms-rise-80ms`

Fixtures: 10

Structural validity: PASS; canonical words expected/timed/missing: 88/88/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=88, coverage=100%, median AE=88 ms, mean AE=121.35 ms, p90=242 ms, p95=338 ms, max=743 ms, bias=67.47 ms; within 50/100/150/200/300/500 ms = 22.73% / 55.68% / 80.68% / 86.36% / 93.18% / 98.86%
- Word ends: n=88, coverage=100%, median AE=299 ms, mean AE=382.33 ms, p90=800 ms, p95=984 ms, max=1384 ms, bias=-357.74 ms; within 50/100/150/200/300/500 ms = 4.55% / 15.91% / 21.59% / 30.68% / 50% / 72.73%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 6:77 | 18 | ٱلضَّآلِّينَ | 19850 | 18466 | -1384 | 0.9926 |
| word-end | 6:74 | 13 | ضَلَـٰلٍ | 18020 | 16929 | -1091 | 0.031 |
| word-end | 3:34 | 1 | ذُرِّيَّةًۢ | 1860 | 794 | -1066 | 0 |
| word-end | 6:76 | 10 | فَلَمَّآ | 10810 | 9757 | -1053 | 0 |
| word-end | 6:74 | 14 | مُّبِينٍ | 19510 | 18526 | -984 | 0.9997 |
| word-end | 6:77 | 8 | فَلَمَّآ | 8530 | 7674 | -856 | 0 |
| word-end | 6:76 | 1 | فَلَمَّا | 1620 | 800 | -820 | 0 |
| word-end | 6:77 | 1 | فَلَمَّا | 1690 | 879 | -811 | 0 |
| word-end | 6:77 | 15 | لَأَكُونَنَّ | 14550 | 13750 | -800 | 0 |
| word-end | 94:5 | 1 | فَإِنَّ | 1580 | 790 | -790 | 0.0004 |
| word-end | 3:34 | 7 | عَلِيمٌ | 7850 | 7067 | -783 | 0 |
| word-end | 6:76 | 6 | كَوْكَبًا | 6460 | 5678 | -782 | 0 |
| word-start | 3:33 | 6 | وَءَالَ | 4570 | 5313 | 743 | 0 |
| word-end | 3:34 | 4 | بَعْضٍ | 4460 | 3732 | -728 | 0 |
| word-end | 3:33 | 1 | إِنَّ | 1350 | 638 | -712 | 0 |
| word-end | 3:34 | 5 | وَٱللَّهُ | 5390 | 4685 | -705 | 0 |
| word-end | 94:6 | 1 | إِنَّ | 1330 | 632 | -698 | 0 |
| word-end | 6:77 | 6 | هَـٰذَا | 5800 | 5116 | -684 | 0 |
| word-end | 3:34 | 3 | مِنۢ | 3750 | 3097 | -653 | 0 |
| word-end | 6:76 | 3 | عَلَيْهِ | 3530 | 2879 | -651 | 0 |


## Promotion decision

- fastconformer-blank-to-lexical-transition: do not promote; did not meet material, structurally safe word-start promotion threshold; median word-start change=0 ms; p90 change=0 ms.
- fastconformer-local-rms-rise-80ms: do not promote; did not meet material, structurally safe word-start promotion threshold; median word-start change=-13 ms; p90 change=13 ms.

## Historical reviewed fixtures

6:74-77, 69:19-32, 93:1-5, and 3:33-35 remain preserved as supplied historical/review evidence. Their original continuous recordings are not in this workspace, so they were not falsely rerun against unrelated EveryAyah ayah clips.
