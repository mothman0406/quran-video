# Offline Tanzil Hafs corpus

`hafs-corpus.json` contains all 6,236 ayat of Tanzil Uthmani Quran text,
mapped to verse keys for canonical display and recognition. The verbatim source
copy is retained in `tanzil-uthmani.txt`.

Source: Tanzil Project, Uthmani text, version 1.1 (traceable copy from the
[Tanzil-derived corpus source](https://github.com/dotquran/corpus/blob/master/src/resources/uthmani.txt)).
Tanzil’s required notice and terms are preserved in the source file: Creative
Commons Attribution 3.0, verbatim distribution only, and no changes to the
text. See [Tanzil’s text license](https://tanzil.net/docs/Text_License).

`src/lib/quran/local.ts` provides synchronous local content. Recognition
normalization operates only on internal derived strings and never mutates the
canonical corpus. Saheeh International and transliteration remain optional
Quran Foundation enrichment and are not invented when unavailable.
