# Writing decoder unigram asset v1

This is a development completion lexicon for Lemma N219. It is **not** a trained
4-gram model, calibrated correction probability, or qualified phone release.
The manifest records the precise source hashes, output hash, transformations,
entry count and offline build/check commands.

## Sources and notices

| Source | Version and licence | Use |
| --- | --- | --- |
| AOSP LatinIME `dictionaries/en_US_wordlist.combined.gz` | [Revision `127336e9f29d69607eab55982324b210279ae8c5`](https://android.googlesource.com/platform/packages/inputmethods/LatinIME/+/127336e9f29d69607eab55982324b210279ae8c5/dictionaries/en_US_wordlist.combined.gz), dictionary version 54, header date `1414726260`; Apache-2.0 | Mobile English unigram frequency field `f`; up to 8,192 additional words beyond the existing lexicon. |
| SCOWL-derived Lemma word list | Existing pinned `wordlist.txt` from Lemma main `d1b3135f`; original authors and redistribution terms in `SCOWL-NOTICE.txt` | General spelling vocabulary. |
| mathlib4 comment ranks | [mathlib4 revision `c44e0c8ee63ca166450922a373c7409c5d26b00b`](https://github.com/leanprover-community/mathlib4/tree/c44e0c8ee63ca166450922a373c7409c5d26b00b), Apache-2.0 | Existing compact unigrams, filtered against the vocabulary and length/common-word rules. The generated lexicon uses no bigrams; runtime ranking separately reuses the existing baseline's compact context table. |
| Existing Lemma curated terms and lexical policy | `word-assets.json` and the immutable `scripts/writing-decoder/sources/baseline-words.mjs.txt` snapshot, pinned by SHA-256 in the source lock | Preserve curated math terms and all original `logic` risk tags. The snapshot retains the original `words.mjs` bytes while runtime ranking evolves independently. |

The AOSP dictionary has no separate licence statement in its header. The pinned
[package declaration](https://android.googlesource.com/platform/packages/inputmethods/LatinIME/+/127336e9f29d69607eab55982324b210279ae8c5/Android.bp)
declares Apache-2.0 for the package and its subpackages and names `NOTICE` as its
licence text. The exact declaration and unmodified compressed dictionary are
retained under `scripts/writing-decoder/sources`. `AOSP-NOTICE.txt` retains the
copyright notice and licence; `mathlib4-LICENSE.txt` and `SCOWL-NOTICE.txt` accompany
this generated asset.

## Changes made by Lemma

The generated asset selects lowercase ASCII words of 2–32 letters. It does not
case-fold proper names, import shortcut rules or enable automatic correction.
AOSP zero-frequency, abbreviation, nonword and offensive-flagged entries are
excluded. Listed Lean command fragments are excluded even when the source word
list contains an abbreviation with the same spelling. Raw mathlib count keys
never create new vocabulary entries.

The rank is `max(1, AOSP f, round(24 * log1p(filtered mathlib count)))`. Math counts
apply only to known words with at least six letters or existing curated common
terms. This heuristic has not been fitted or calibrated on user data. It does
not claim that the three input count/rank scales are interchangeable probabilities.
The main application still applies its existing learner-choice policy.

The build is offline and deterministic. Run
`node scripts/writing-decoder/build-lexicon.mjs --check` from the repository root
to verify every locked source and reproduce the checked-in output bytes.
