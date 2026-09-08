# Real Quran word-timing benchmark

Dataset: release-2016-11-24 — Collin Fair / quran-align, CC BY 4.0. The timing is externally machine-generated reference data, not human ground truth.

Usable ayah recordings: 10; usable word references: 41; exclusions: 0.

# Quran word-timing benchmark

Engine: `fastconformer-current`

Fixtures: 10

Structural validity: PASS; canonical words expected/timed/missing: 41/41/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=41, coverage=100%, median AE=99 ms, mean AE=163.98 ms, p90=399 ms, p95=412 ms, max=560 ms, bias=138.17 ms; within 50/100/150/200/300/500 ms = 26.83% / 53.66% / 63.41% / 65.85% / 75.61% / 97.56%
- Word ends: n=41, coverage=100%, median AE=499 ms, mean AE=710.66 ms, p90=1434 ms, p95=1621 ms, max=3856 ms, bias=-522.56 ms; within 50/100/150/200/300/500 ms = 0% / 2.44% / 7.32% / 14.63% / 34.15% / 51.22%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 75:4 | 6 | بَنَانَهُۥ | 8500 | 12356 | 3856 | 0 |
| word-end | 75:3 | 3 | أَلَّن | 5510 | 3587 | -1923 | 0 |
| word-end | 75:4 | 3 | عَلَىٰٓ | 4730 | 3109 | -1621 | 0 |
| word-end | 75:2 | 1 | وَلَآ | 2080 | 479 | -1601 | 0 |
| word-end | 75:10 | 2 | ٱلْإِنسَـٰنُ | 3910 | 2476 | -1434 | 0.0001 |
| word-end | 75:1 | 1 | لَآ | 1750 | 320 | -1430 | 0 |
| word-end | 75:6 | 4 | ٱلْقِيَـٰمَةِ | 5880 | 4464 | -1416 | 0 |
| word-end | 75:5 | 3 | ٱلْإِنسَـٰنُ | 4230 | 2877 | -1353 | 0 |
| word-end | 75:3 | 2 | ٱلْإِنسَـٰنُ | 3910 | 2631 | -1279 | 0 |
| word-end | 75:6 | 3 | يَوْمُ | 3960 | 3188 | -772 | 0 |
| word-end | 75:2 | 2 | أُقْسِمُ | 3220 | 2473 | -747 | 0 |
| word-end | 75:9 | 3 | وَٱلْقَمَرُ | 4220 | 3486 | -734 | 0.0001 |
| word-end | 75:1 | 2 | أُقْسِمُ | 2890 | 2159 | -731 | 0 |
| word-end | 75:10 | 5 | ٱلْمَفَرُّ | 8150 | 7428 | -722 | 0 |
| word-end | 75:8 | 2 | ٱلْقَمَرُ | 2820 | 2140 | -680 | 0 |
| word-end | 75:7 | 3 | ٱلْبَصَرُ | 3760 | 3094 | -666 | 0 |
| word-end | 75:4 | 5 | نُّسَوِّىَ | 7030 | 6377 | -653 | 0.04 |
| word-end | 75:3 | 4 | نَّجْمَعَ | 6550 | 5899 | -651 | 0.0001 |
| word-end | 75:10 | 1 | يَقُولُ | 1490 | 879 | -611 | 0 |
| word-start | 75:4 | 5 | نُّسَوِّىَ | 5020 | 5580 | 560 | 0.04 |


# Quran word-timing benchmark

Engine: `fastconformer-blank-to-lexical-transition`

Fixtures: 10

Structural validity: PASS; canonical words expected/timed/missing: 41/41/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=41, coverage=100%, median AE=99 ms, mean AE=163.98 ms, p90=399 ms, p95=412 ms, max=560 ms, bias=138.17 ms; within 50/100/150/200/300/500 ms = 26.83% / 53.66% / 63.41% / 65.85% / 75.61% / 97.56%
- Word ends: n=41, coverage=100%, median AE=499 ms, mean AE=710.66 ms, p90=1434 ms, p95=1621 ms, max=3856 ms, bias=-522.56 ms; within 50/100/150/200/300/500 ms = 0% / 2.44% / 7.32% / 14.63% / 34.15% / 51.22%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 75:4 | 6 | بَنَانَهُۥ | 8500 | 12356 | 3856 | 0 |
| word-end | 75:3 | 3 | أَلَّن | 5510 | 3587 | -1923 | 0 |
| word-end | 75:4 | 3 | عَلَىٰٓ | 4730 | 3109 | -1621 | 0 |
| word-end | 75:2 | 1 | وَلَآ | 2080 | 479 | -1601 | 0 |
| word-end | 75:10 | 2 | ٱلْإِنسَـٰنُ | 3910 | 2476 | -1434 | 0.0001 |
| word-end | 75:1 | 1 | لَآ | 1750 | 320 | -1430 | 0 |
| word-end | 75:6 | 4 | ٱلْقِيَـٰمَةِ | 5880 | 4464 | -1416 | 0 |
| word-end | 75:5 | 3 | ٱلْإِنسَـٰنُ | 4230 | 2877 | -1353 | 0 |
| word-end | 75:3 | 2 | ٱلْإِنسَـٰنُ | 3910 | 2631 | -1279 | 0 |
| word-end | 75:6 | 3 | يَوْمُ | 3960 | 3188 | -772 | 0 |
| word-end | 75:2 | 2 | أُقْسِمُ | 3220 | 2473 | -747 | 0 |
| word-end | 75:9 | 3 | وَٱلْقَمَرُ | 4220 | 3486 | -734 | 0.0001 |
| word-end | 75:1 | 2 | أُقْسِمُ | 2890 | 2159 | -731 | 0 |
| word-end | 75:10 | 5 | ٱلْمَفَرُّ | 8150 | 7428 | -722 | 0 |
| word-end | 75:8 | 2 | ٱلْقَمَرُ | 2820 | 2140 | -680 | 0 |
| word-end | 75:7 | 3 | ٱلْبَصَرُ | 3760 | 3094 | -666 | 0 |
| word-end | 75:4 | 5 | نُّسَوِّىَ | 7030 | 6377 | -653 | 0.04 |
| word-end | 75:3 | 4 | نَّجْمَعَ | 6550 | 5899 | -651 | 0.0001 |
| word-end | 75:10 | 1 | يَقُولُ | 1490 | 879 | -611 | 0 |
| word-start | 75:4 | 5 | نُّسَوِّىَ | 5020 | 5580 | 560 | 0.04 |


# Quran word-timing benchmark

Engine: `fastconformer-local-rms-rise-80ms`

Fixtures: 10

Structural validity: PASS; canonical words expected/timed/missing: 41/41/0; duplicates: 0; out of order: 0; timestamp failures: 0; coverage: 100%

- Word starts: n=41, coverage=100%, median AE=125 ms, mean AE=183 ms, p90=412 ms, p95=438 ms, max=580 ms, bias=150.61 ms; within 50/100/150/200/300/500 ms = 14.63% / 39.02% / 58.54% / 63.41% / 78.05% / 97.56%
- Word ends: n=41, coverage=100%, median AE=499 ms, mean AE=710.66 ms, p90=1434 ms, p95=1621 ms, max=3856 ms, bias=-522.56 ms; within 50/100/150/200/300/500 ms = 0% / 2.44% / 7.32% / 14.63% / 34.15% / 51.22%
- Ayah-boundary starts (not word labels): no matching reference boundaries

## Worst boundaries

| Kind | Verse | Word | Arabic | Reference ms | Predicted ms | Signed error ms | Confidence |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| word-end | 75:4 | 6 | بَنَانَهُۥ | 8500 | 12356 | 3856 | 0 |
| word-end | 75:3 | 3 | أَلَّن | 5510 | 3587 | -1923 | 0 |
| word-end | 75:4 | 3 | عَلَىٰٓ | 4730 | 3109 | -1621 | 0 |
| word-end | 75:2 | 1 | وَلَآ | 2080 | 479 | -1601 | 0 |
| word-end | 75:10 | 2 | ٱلْإِنسَـٰنُ | 3910 | 2476 | -1434 | 0.0001 |
| word-end | 75:1 | 1 | لَآ | 1750 | 320 | -1430 | 0 |
| word-end | 75:6 | 4 | ٱلْقِيَـٰمَةِ | 5880 | 4464 | -1416 | 0 |
| word-end | 75:5 | 3 | ٱلْإِنسَـٰنُ | 4230 | 2877 | -1353 | 0 |
| word-end | 75:3 | 2 | ٱلْإِنسَـٰنُ | 3910 | 2631 | -1279 | 0 |
| word-end | 75:6 | 3 | يَوْمُ | 3960 | 3188 | -772 | 0 |
| word-end | 75:2 | 2 | أُقْسِمُ | 3220 | 2473 | -747 | 0 |
| word-end | 75:9 | 3 | وَٱلْقَمَرُ | 4220 | 3486 | -734 | 0.0001 |
| word-end | 75:1 | 2 | أُقْسِمُ | 2890 | 2159 | -731 | 0 |
| word-end | 75:10 | 5 | ٱلْمَفَرُّ | 8150 | 7428 | -722 | 0 |
| word-end | 75:8 | 2 | ٱلْقَمَرُ | 2820 | 2140 | -680 | 0 |
| word-end | 75:7 | 3 | ٱلْبَصَرُ | 3760 | 3094 | -666 | 0 |
| word-end | 75:4 | 5 | نُّسَوِّىَ | 7030 | 6377 | -653 | 0.04 |
| word-end | 75:3 | 4 | نَّجْمَعَ | 6550 | 5899 | -651 | 0.0001 |
| word-end | 75:10 | 1 | يَقُولُ | 1490 | 879 | -611 | 0 |
| word-start | 75:4 | 5 | نُّسَوِّىَ | 5020 | 5600 | 580 | 0.04 |


## Promotion decision

- fastconformer-blank-to-lexical-transition: do not promote; did not meet material, structurally safe word-start promotion threshold; median word-start change=0 ms; p90 change=0 ms.
- fastconformer-local-rms-rise-80ms: do not promote; did not meet material, structurally safe word-start promotion threshold; median word-start change=-26 ms; p90 change=13 ms.

## Historical reviewed fixtures

6:74-77, 69:19-32, 93:1-5, and 3:33-35 remain preserved as supplied historical/review evidence. Their original continuous recordings are not in this workspace, so they were not falsely rerun against unrelated EveryAyah ayah clips.
