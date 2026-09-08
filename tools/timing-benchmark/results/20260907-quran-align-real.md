# Real Quran word-timing benchmark

Merged fixed fixture count: 45.

# Quran word-timing benchmark

Engine: `fastconformer-current`

Fixtures: 45

Structural validity: PASS; canonical words expected/timed/missing: 242/242/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=242, coverage=100%, median AE=79 ms, mean AE=118.2 ms, p90=275 ms, p95=382 ms, max=777 ms, bias=79.45 ms; within 50/100/150/200/300/500 ms = 34.3% / 62.81% / 77.69% / 83.88% / 90.91% / 97.11%
- Word ends: n=242, coverage=100%, median AE=300 ms, mean AE=433.08 ms, p90=860 ms, p95=1204 ms, max=3856 ms, bias=-386.56 ms; within 50/100/150/200/300/500 ms = 6.61% / 15.7% / 23.14% / 30.99% / 50.41% / 69.42%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 75:4 | 6 | بَنَانَهُۥ | 8500 | 12356 | 3856 | 0 |
| word-end | 94:3 | 1 | ٱلَّذِىٓ | 2630 | 477 | -2153 | 0.0212 |
| word-end | 75:3 | 3 | أَلَّن | 5510 | 3587 | -1923 | 0 |
| word-end | 75:4 | 3 | عَلَىٰٓ | 4730 | 3109 | -1621 | 0 |
| word-end | 75:2 | 1 | وَلَآ | 2080 | 479 | -1601 | 0 |
| word-end | 75:10 | 2 | ٱلْإِنسَـٰنُ | 3910 | 2476 | -1434 | 0.0001 |
| word-end | 75:1 | 1 | لَآ | 1750 | 320 | -1430 | 0 |
| word-end | 75:6 | 4 | ٱلْقِيَـٰمَةِ | 5880 | 4464 | -1416 | 0 |
| word-end | 75:13 | 2 | ٱلْإِنسَـٰنُ | 3640 | 2227 | -1413 | 0 |
| word-end | 6:77 | 18 | ٱلضَّآلِّينَ | 19850 | 18466 | -1384 | 0.9926 |
| word-end | 75:5 | 3 | ٱلْإِنسَـٰنُ | 4230 | 2877 | -1353 | 0 |
| word-end | 75:3 | 2 | ٱلْإِنسَـٰنُ | 3910 | 2631 | -1279 | 0 |
| word-end | 75:14 | 2 | ٱلْإِنسَـٰنُ | 2640 | 1436 | -1204 | 0 |
| word-end | 75:15 | 2 | أَلْقَىٰ | 3150 | 1986 | -1164 | 0 |
| word-end | 6:74 | 13 | ضَلَـٰلٍ | 18020 | 16929 | -1091 | 0.031 |
| word-end | 3:34 | 1 | ذُرِّيَّةًۢ | 1860 | 794 | -1066 | 0 |
| word-end | 6:76 | 10 | فَلَمَّآ | 10810 | 9757 | -1053 | 0 |
| word-end | 93:6 | 3 | يَتِيمًا | 3360 | 2308 | -1052 | 0 |
| word-end | 75:14 | 4 | نَفْسِهِۦ | 5110 | 4069 | -1041 | 0 |
| word-end | 3:35 | 16 | أَنتَ | 15150 | 14120 | -1030 | 0 |


## Per-reciter word timing

- Alafasy_128kbps: starts median/p90/bias=85/210/90.33 ms; ends median/p90/bias=281/698/-330.84 ms; start coverage=100%.
- Hani_Rifai_192kbps: starts median/p90/bias=76/188/55.7 ms; ends median/p90/bias=278/783/-333.75 ms; start coverage=100%.
- Husary_Muallim_128kbps: starts median/p90/bias=89/408/111 ms; ends median/p90/bias=461/1416/-543.03 ms; start coverage=100%.

# Quran word-timing benchmark

Engine: `fastconformer-blank-to-lexical-transition`

Fixtures: 45

Structural validity: PASS; canonical words expected/timed/missing: 242/242/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=242, coverage=100%, median AE=79 ms, mean AE=118.2 ms, p90=275 ms, p95=382 ms, max=777 ms, bias=79.45 ms; within 50/100/150/200/300/500 ms = 34.3% / 62.81% / 77.69% / 83.88% / 90.91% / 97.11%
- Word ends: n=242, coverage=100%, median AE=300 ms, mean AE=433.08 ms, p90=860 ms, p95=1204 ms, max=3856 ms, bias=-386.56 ms; within 50/100/150/200/300/500 ms = 6.61% / 15.7% / 23.14% / 30.99% / 50.41% / 69.42%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 75:4 | 6 | بَنَانَهُۥ | 8500 | 12356 | 3856 | 0 |
| word-end | 94:3 | 1 | ٱلَّذِىٓ | 2630 | 477 | -2153 | 0.0212 |
| word-end | 75:3 | 3 | أَلَّن | 5510 | 3587 | -1923 | 0 |
| word-end | 75:4 | 3 | عَلَىٰٓ | 4730 | 3109 | -1621 | 0 |
| word-end | 75:2 | 1 | وَلَآ | 2080 | 479 | -1601 | 0 |
| word-end | 75:10 | 2 | ٱلْإِنسَـٰنُ | 3910 | 2476 | -1434 | 0.0001 |
| word-end | 75:1 | 1 | لَآ | 1750 | 320 | -1430 | 0 |
| word-end | 75:6 | 4 | ٱلْقِيَـٰمَةِ | 5880 | 4464 | -1416 | 0 |
| word-end | 75:13 | 2 | ٱلْإِنسَـٰنُ | 3640 | 2227 | -1413 | 0 |
| word-end | 6:77 | 18 | ٱلضَّآلِّينَ | 19850 | 18466 | -1384 | 0.9926 |
| word-end | 75:5 | 3 | ٱلْإِنسَـٰنُ | 4230 | 2877 | -1353 | 0 |
| word-end | 75:3 | 2 | ٱلْإِنسَـٰنُ | 3910 | 2631 | -1279 | 0 |
| word-end | 75:14 | 2 | ٱلْإِنسَـٰنُ | 2640 | 1436 | -1204 | 0 |
| word-end | 75:15 | 2 | أَلْقَىٰ | 3150 | 1986 | -1164 | 0 |
| word-end | 6:74 | 13 | ضَلَـٰلٍ | 18020 | 16929 | -1091 | 0.031 |
| word-end | 3:34 | 1 | ذُرِّيَّةًۢ | 1860 | 794 | -1066 | 0 |
| word-end | 6:76 | 10 | فَلَمَّآ | 10810 | 9757 | -1053 | 0 |
| word-end | 93:6 | 3 | يَتِيمًا | 3360 | 2308 | -1052 | 0 |
| word-end | 75:14 | 4 | نَفْسِهِۦ | 5110 | 4069 | -1041 | 0 |
| word-end | 3:35 | 16 | أَنتَ | 15150 | 14120 | -1030 | 0 |


## Per-reciter word timing

- Alafasy_128kbps: starts median/p90/bias=85/210/90.33 ms; ends median/p90/bias=281/698/-330.84 ms; start coverage=100%.
- Hani_Rifai_192kbps: starts median/p90/bias=76/188/55.7 ms; ends median/p90/bias=278/783/-333.75 ms; start coverage=100%.
- Husary_Muallim_128kbps: starts median/p90/bias=89/408/111 ms; ends median/p90/bias=461/1416/-543.03 ms; start coverage=100%.

# Quran word-timing benchmark

Engine: `fastconformer-local-rms-rise-80ms`

Fixtures: 45

Structural validity: PASS; canonical words expected/timed/missing: 242/242/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=242, coverage=100%, median AE=89 ms, mean AE=128.85 ms, p90=299 ms, p95=412 ms, max=817 ms, bias=85.33 ms; within 50/100/150/200/300/500 ms = 25.21% / 55.37% / 77.69% / 83.06% / 90.08% / 97.93%
- Word ends: n=242, coverage=100%, median AE=300 ms, mean AE=433.08 ms, p90=860 ms, p95=1204 ms, max=3856 ms, bias=-386.56 ms; within 50/100/150/200/300/500 ms = 6.61% / 15.7% / 23.14% / 30.99% / 50.41% / 69.42%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 75:4 | 6 | بَنَانَهُۥ | 8500 | 12356 | 3856 | 0 |
| word-end | 94:3 | 1 | ٱلَّذِىٓ | 2630 | 477 | -2153 | 0.0212 |
| word-end | 75:3 | 3 | أَلَّن | 5510 | 3587 | -1923 | 0 |
| word-end | 75:4 | 3 | عَلَىٰٓ | 4730 | 3109 | -1621 | 0 |
| word-end | 75:2 | 1 | وَلَآ | 2080 | 479 | -1601 | 0 |
| word-end | 75:10 | 2 | ٱلْإِنسَـٰنُ | 3910 | 2476 | -1434 | 0.0001 |
| word-end | 75:1 | 1 | لَآ | 1750 | 320 | -1430 | 0 |
| word-end | 75:6 | 4 | ٱلْقِيَـٰمَةِ | 5880 | 4464 | -1416 | 0 |
| word-end | 75:13 | 2 | ٱلْإِنسَـٰنُ | 3640 | 2227 | -1413 | 0 |
| word-end | 6:77 | 18 | ٱلضَّآلِّينَ | 19850 | 18466 | -1384 | 0.9926 |
| word-end | 75:5 | 3 | ٱلْإِنسَـٰنُ | 4230 | 2877 | -1353 | 0 |
| word-end | 75:3 | 2 | ٱلْإِنسَـٰنُ | 3910 | 2631 | -1279 | 0 |
| word-end | 75:14 | 2 | ٱلْإِنسَـٰنُ | 2640 | 1436 | -1204 | 0 |
| word-end | 75:15 | 2 | أَلْقَىٰ | 3150 | 1986 | -1164 | 0 |
| word-end | 6:74 | 13 | ضَلَـٰلٍ | 18020 | 16929 | -1091 | 0.031 |
| word-end | 3:34 | 1 | ذُرِّيَّةًۢ | 1860 | 794 | -1066 | 0 |
| word-end | 6:76 | 10 | فَلَمَّآ | 10810 | 9757 | -1053 | 0 |
| word-end | 93:6 | 3 | يَتِيمًا | 3360 | 2308 | -1052 | 0 |
| word-end | 75:14 | 4 | نَفْسِهِۦ | 5110 | 4069 | -1041 | 0 |
| word-end | 3:35 | 16 | أَنتَ | 15150 | 14120 | -1030 | 0 |


## Per-reciter word timing

- Alafasy_128kbps: starts median/p90/bias=74/197/83.78 ms; ends median/p90/bias=281/698/-330.84 ms; start coverage=100%.
- Hani_Rifai_192kbps: starts median/p90/bias=87/230/62.69 ms; ends median/p90/bias=278/783/-333.75 ms; start coverage=100%.
- Husary_Muallim_128kbps: starts median/p90/bias=121/414/128.26 ms; ends median/p90/bias=461/1416/-543.03 ms; start coverage=100%.

## Promotion decision

- fastconformer-blank-to-lexical-transition: do not promote; median word-start improvement is not material (minimum 25 ms).
- fastconformer-local-rms-rise-80ms: do not promote; median word-start improvement is not material (minimum 25 ms); p90 word-start error regressed by more than 10 ms; word-start median regressed materially for Husary_Muallim_128kbps.

## Source exclusion

- Abdurrahmaan_As-Sudais_192kbps: quran-align release-2016-11-24 asset is an alignment crash log, not JSON; no fixtures were guessed or repaired.

## Runtime

- baseline: mean total=1955 ms; inference=837 ms; alignment=20 ms; model/supporting assets=103726596 bytes.
- raw: mean total=1955 ms; inference=837 ms; alignment=20 ms; model/supporting assets=103726596 bytes.
- refined: mean total=1955 ms; inference=837 ms; alignment=20 ms; model/supporting assets=103726596 bytes.

## Historical reviewed fixtures

6:74-77, 69:19-32, 93:1-5, and 3:33-35 remain preserved as supplied historical/review evidence. Their original continuous recordings are not in this workspace, so they were not falsely rerun against unrelated EveryAyah ayah clips.
