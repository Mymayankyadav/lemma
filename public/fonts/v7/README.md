# Lemma v7 fonts

Official Google Fonts WOFF2 subsets, downloaded 10 November 2026 from
`fonts.gstatic.com` using the Google Fonts CSS2 API. Each family is licensed
under the accompanying SIL Open Font License 1.1 text.

- Newsreader: normal variable weights 400–500; italic400; Latin.
- Instrument Sans: normal variable weights400–600; Latin.
- STIX Two Text: regular and italic400; Latin and Greek. A narrowly subsetted STIX Two Math companion (same licensed STIX project)
  covers ∫ ∂ ∑ ∎ ℓ ∞ ∀ ∃ ∈ ⊂ ℝ →.
- IBM Plex Mono: regular400; Latin.

The API returns identical variable binaries for the individual Newsreader and
Instrument Sans weights; those binaries are deduplicated and declared with
weight ranges in fonts.css. Family names are prefixed with `Lemma v7` to avoid
changing legacy Google Fonts rendering. Only Newsreader normal500 and
Instrument Sans normal400 are preloaded. The remaining faces load on use.
The v7 directory is excluded from global service worker precache, so a v6 visit
does not download v7 fonts. Fonts load through app-local URLs on v7.
