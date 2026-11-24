# Typeahead model attribution

`ngram-v1/ngram.bin` and `latex-v1/ngram.bin` are Kneser-Ney trigram language models built by `scripts/typeahead/build-ngram.py`
and `scripts/typeahead/build-latex.py` (shared code: `scripts/typeahead/kn_build.py`).

| Source | Use | Licence as listed |
| --- | --- | --- |
| [hoskinson-center/proof-pile](https://huggingface.co/datasets/hoskinson-center/proof-pile), file `dev/proofpile_dev.jsonl.gz` (SHA-256 in each `manifest.json`) | Only its Math StackExchange documents were counted | Dataset card: Apache-2.0. The underlying Math StackExchange posts are CC BY-SA 4.0 (attribution: the posts' authors, via Stack Exchange Inc.). |

The files hold probabilities of word and token sequences, not the text. Share-alike duties for models derived from CC BY-SA text
are an open question: see "Licence" in `docs/current/N233.md`; the Owner decides before these assets reach production by default.
