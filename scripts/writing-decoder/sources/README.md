# Pinned source inputs

`aosp-en_US-v54.combined.gz` is the unmodified 883,015-byte AOSP LatinIME English
dictionary at revision `127336e9f29d69607eab55982324b210279ae8c5`, blob
`8aed9c5e0b94d0f3e9654f66104d7af1e84c454f`. SHA-256:
`0f78dd455b532be169a23f233227b811fabced4b5bd7fc9c40cc05839793bcbd`.

Source: <https://android.googlesource.com/platform/packages/inputmethods/LatinIME/+/127336e9f29d69607eab55982324b210279ae8c5/dictionaries/en_US_wordlist.combined.gz>.
The `?format=TEXT` representation is base64; decode it once to recover the
original gzip bytes. The dictionary header identifies version 54, date
`1414726260`. This is a pinned older dictionary, not a claim to Gboard's current
models or a new corpus-trained language model.

The pinned `Android.bp` declares Apache-2.0 for the package and its subpackages;
`AOSP-Android.bp.txt` and `AOSP-NOTICE.txt` retain those original files. The
dictionary has no separate licence text in its own header. See the generated
runtime asset's `ATTRIBUTION.md` for transformations and other sources.

`source-lock.json` hashes these files plus the existing SCOWL, curated terms,
mathlib rank asset, associated notices and lexical-risk policy. The offline
builder rejects a changed source hash. This source gzip is build-time data;
the runtime only requests the generated lexicon JSON.
