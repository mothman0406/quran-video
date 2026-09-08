# Real Quran word-timing benchmark

Dataset: release-2016-11-24 — Collin Fair / quran-align, CC BY 4.0. The timing is externally machine-generated reference data, not human ground truth.

Usable ayah recordings: 15; usable word references: 53; exclusions: 0.

# Quran word-timing benchmark

Engine: `fastconformer-current`

Fixtures: 15

Structural validity: PASS; canonical words expected/timed/missing: 53/53/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=53, coverage=100%, median AE=88 ms, mean AE=99.89 ms, p90=210 ms, p95=227 ms, max=368 ms, bias=89.09 ms; within 50/100/150/200/300/500 ms = 37.74% / 58.49% / 79.25% / 88.68% / 98.11% / 100%
- Word ends: n=53, coverage=100%, median AE=281 ms, mean AE=363.08 ms, p90=664 ms, p95=912 ms, max=2153 ms, bias=-341 ms; within 50/100/150/200/300/500 ms = 9.43% / 18.87% / 32.08% / 39.62% / 50.94% / 75.47%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 94:3 | 1 | ٱلَّذِىٓ | 2630 | 477 | -2153 | 0.0212 |
| word-end | 93:6 | 3 | يَتِيمًا | 3360 | 2308 | -1052 | 0 |
| word-end | 93:11 | 1 | وَأَمَّا | 1710 | 798 | -912 | 0 |
| word-end | 93:9 | 1 | فَأَمَّا | 1580 | 716 | -864 | 0 |
| word-end | 93:7 | 2 | ضَآلًّا | 5520 | 4751 | -769 | 0.8877 |
| word-end | 93:7 | 3 | فَهَدَىٰ | 6840 | 6176 | -664 | 0 |
| word-end | 93:6 | 4 | فَـَٔاوَىٰ | 4800 | 4138 | -662 | 0 |
| word-end | 93:8 | 2 | عَآئِلًا | 4140 | 3502 | -638 | 0 |
| word-end | 93:8 | 3 | فَأَغْنَىٰ | 5600 | 5014 | -586 | 0 |
| word-end | 93:2 | 1 | وَٱلَّيْلِ | 1040 | 469 | -571 | 0 |
| word-end | 93:10 | 1 | وَأَمَّا | 1280 | 715 | -565 | 0 |
| word-end | 93:9 | 3 | فَلَا | 3390 | 2866 | -524 | 0 |
| word-end | 93:4 | 2 | خَيْرٌ | 2430 | 1917 | -513 | 0 |
| word-end | 93:5 | 4 | فَتَرْضَىٰٓ | 4590 | 4098 | -492 | 0.0302 |
| word-end | 93:10 | 3 | فَلَا | 4780 | 4290 | -490 | 0.0003 |
| word-end | 94:4 | 3 | ذِكْرَكَ | 2700 | 2221 | -479 | 0.0006 |
| word-end | 93:3 | 4 | وَمَا | 3050 | 2614 | -436 | 0 |
| word-end | 93:6 | 1 | أَلَمْ | 590 | 159 | -431 | 0 |
| word-end | 93:10 | 4 | تَنْهَرْ | 5720 | 5322 | -398 | 0 |
| word-end | 93:3 | 5 | قَلَىٰ | 3870 | 3486 | -384 | 0 |


# Quran word-timing benchmark

Engine: `fastconformer-blank-to-lexical-transition`

Fixtures: 15

Structural validity: PASS; canonical words expected/timed/missing: 53/53/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=53, coverage=100%, median AE=88 ms, mean AE=99.89 ms, p90=210 ms, p95=227 ms, max=368 ms, bias=89.09 ms; within 50/100/150/200/300/500 ms = 37.74% / 58.49% / 79.25% / 88.68% / 98.11% / 100%
- Word ends: n=53, coverage=100%, median AE=281 ms, mean AE=363.08 ms, p90=664 ms, p95=912 ms, max=2153 ms, bias=-341 ms; within 50/100/150/200/300/500 ms = 9.43% / 18.87% / 32.08% / 39.62% / 50.94% / 75.47%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 94:3 | 1 | ٱلَّذِىٓ | 2630 | 477 | -2153 | 0.0212 |
| word-end | 93:6 | 3 | يَتِيمًا | 3360 | 2308 | -1052 | 0 |
| word-end | 93:11 | 1 | وَأَمَّا | 1710 | 798 | -912 | 0 |
| word-end | 93:9 | 1 | فَأَمَّا | 1580 | 716 | -864 | 0 |
| word-end | 93:7 | 2 | ضَآلًّا | 5520 | 4751 | -769 | 0.8877 |
| word-end | 93:7 | 3 | فَهَدَىٰ | 6840 | 6176 | -664 | 0 |
| word-end | 93:6 | 4 | فَـَٔاوَىٰ | 4800 | 4138 | -662 | 0 |
| word-end | 93:8 | 2 | عَآئِلًا | 4140 | 3502 | -638 | 0 |
| word-end | 93:8 | 3 | فَأَغْنَىٰ | 5600 | 5014 | -586 | 0 |
| word-end | 93:2 | 1 | وَٱلَّيْلِ | 1040 | 469 | -571 | 0 |
| word-end | 93:10 | 1 | وَأَمَّا | 1280 | 715 | -565 | 0 |
| word-end | 93:9 | 3 | فَلَا | 3390 | 2866 | -524 | 0 |
| word-end | 93:4 | 2 | خَيْرٌ | 2430 | 1917 | -513 | 0 |
| word-end | 93:5 | 4 | فَتَرْضَىٰٓ | 4590 | 4098 | -492 | 0.0302 |
| word-end | 93:10 | 3 | فَلَا | 4780 | 4290 | -490 | 0.0003 |
| word-end | 94:4 | 3 | ذِكْرَكَ | 2700 | 2221 | -479 | 0.0006 |
| word-end | 93:3 | 4 | وَمَا | 3050 | 2614 | -436 | 0 |
| word-end | 93:6 | 1 | أَلَمْ | 590 | 159 | -431 | 0 |
| word-end | 93:10 | 4 | تَنْهَرْ | 5720 | 5322 | -398 | 0 |
| word-end | 93:3 | 5 | قَلَىٰ | 3870 | 3486 | -384 | 0 |


# Quran word-timing benchmark

Engine: `fastconformer-local-rms-rise-80ms`

Fixtures: 15

Structural validity: PASS; canonical words expected/timed/missing: 53/53/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=53, coverage=100%, median AE=74 ms, mean AE=96.09 ms, p90=197 ms, p95=279 ms, max=438 ms, bias=79.49 ms; within 50/100/150/200/300/500 ms = 32.08% / 58.49% / 84.91% / 90.57% / 96.23% / 100%
- Word ends: n=53, coverage=100%, median AE=281 ms, mean AE=363.08 ms, p90=664 ms, p95=912 ms, max=2153 ms, bias=-341 ms; within 50/100/150/200/300/500 ms = 9.43% / 18.87% / 32.08% / 39.62% / 50.94% / 75.47%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 94:3 | 1 | ٱلَّذِىٓ | 2630 | 477 | -2153 | 0.0212 |
| word-end | 93:6 | 3 | يَتِيمًا | 3360 | 2308 | -1052 | 0 |
| word-end | 93:11 | 1 | وَأَمَّا | 1710 | 798 | -912 | 0 |
| word-end | 93:9 | 1 | فَأَمَّا | 1580 | 716 | -864 | 0 |
| word-end | 93:7 | 2 | ضَآلًّا | 5520 | 4751 | -769 | 0.8877 |
| word-end | 93:7 | 3 | فَهَدَىٰ | 6840 | 6176 | -664 | 0 |
| word-end | 93:6 | 4 | فَـَٔاوَىٰ | 4800 | 4138 | -662 | 0 |
| word-end | 93:8 | 2 | عَآئِلًا | 4140 | 3502 | -638 | 0 |
| word-end | 93:8 | 3 | فَأَغْنَىٰ | 5600 | 5014 | -586 | 0 |
| word-end | 93:2 | 1 | وَٱلَّيْلِ | 1040 | 469 | -571 | 0 |
| word-end | 93:10 | 1 | وَأَمَّا | 1280 | 715 | -565 | 0 |
| word-end | 93:9 | 3 | فَلَا | 3390 | 2866 | -524 | 0 |
| word-end | 93:4 | 2 | خَيْرٌ | 2430 | 1917 | -513 | 0 |
| word-end | 93:5 | 4 | فَتَرْضَىٰٓ | 4590 | 4098 | -492 | 0.0302 |
| word-end | 93:10 | 3 | فَلَا | 4780 | 4290 | -490 | 0.0003 |
| word-end | 94:4 | 3 | ذِكْرَكَ | 2700 | 2221 | -479 | 0.0006 |
| word-start | 94:3 | 1 | ٱلَّذِىٓ | 30 | 468 | 438 | 0.0212 |
| word-end | 93:3 | 4 | وَمَا | 3050 | 2614 | -436 | 0 |
| word-end | 93:6 | 1 | أَلَمْ | 590 | 159 | -431 | 0 |
| word-end | 93:10 | 4 | تَنْهَرْ | 5720 | 5322 | -398 | 0 |


## Promotion decision

- fastconformer-blank-to-lexical-transition: do not promote; did not meet material, structurally safe word-start promotion threshold; median word-start change=0 ms; p90 change=0 ms.
- fastconformer-local-rms-rise-80ms: do not promote; did not meet material, structurally safe word-start promotion threshold; median word-start change=14 ms; p90 change=-13 ms.

## Historical reviewed fixtures

6:74-77, 69:19-32, 93:1-5, and 3:33-35 remain preserved as supplied historical/review evidence. Their original continuous recordings are not in this workspace, so they were not falsely rerun against unrelated EveryAyah ayah clips.
