# Writing decoder unigram asset v2 (N221)

The complete word list for the keyboard's n-gram and touch decoder. It extends N219's `unigram-v1` (kept unchanged
beside it) with every word of the same pinned AOSP LatinIME en_US dictionary that v1's rules accept; v1 added only
8,192 of them, so words such as "restate" were missing.

| Source | Licence | Use |
| --- | --- | --- |
| `unigram-v1/lexicon.json` (N219) | See `unigram-v1/ATTRIBUTION.md`: AOSP LatinIME (Apache-2.0), SCOWL notices, mathlib4 (Apache-2.0) | Every entry, its frequency and its logic tag |
| AOSP LatinIME `dictionaries/en_US_wordlist.combined.gz`, revision 127336e9, version 54 | Apache-2.0 (`AOSP-NOTICE.txt`) | The remaining words and their frequency field `f` |

Changes made by Lemma: lowercase ASCII words of 2–32 letters only; AOSP entries with frequency 0 or an abbreviation,
non-word or offensive flag are excluded, as are the Lean command fragments v1 excludes. Frequencies are
max(v1 frequency, AOSP f). Rebuild or verify with `node scripts/writing-decoder/build-lexicon-v2.mjs [--check]`.
