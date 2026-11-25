# Typeahead model attribution

`ngram-v1/ngram.bin` and `latex-v1/ngram.bin` are Kneser-Ney trigram language models built by `scripts/typeahead/build-ngram.py`
and `scripts/typeahead/build-latex.py` (shared code: `scripts/typeahead/kn_build.py`).

| Source | Use | Licence as listed |
| --- | --- | --- |
| [hoskinson-center/proof-pile](https://huggingface.co/datasets/hoskinson-center/proof-pile), file `dev/proofpile_dev.jsonl.gz` (SHA-256 in each `manifest.json`) | Only its Math StackExchange documents were counted | Dataset card: Apache-2.0. The underlying Math StackExchange posts are CC BY-SA 4.0 (attribution: the posts' authors, via Stack Exchange Inc.). |

The files hold probabilities of word and token sequences, not the text. Share-alike duties for models derived from CC BY-SA text
are an open question: see "Licence" in `docs/current/N233.md`; the Owner decides before these assets reach production by default.

## Expanded count models

The expanded general pack uses the audited 500,002,914-word training corpus. The topology and linear algebra
packs use filtered subsets of 12,317,545 and 57,617,433 training tokens respectively. The LaTeX four-gram uses
50,000,004 formula tokens extracted with the same split and source manifest. The model files contain
sparse conditional probability tables and an ordered token vocabulary. The application loads these four sets
only through its model manifests, and the release flags remain off by default.

| Pinned source | Use | Applicable source terms |
| --- | --- | --- |
| [HuggingFaceTB/finemath](https://huggingface.co/datasets/HuggingFaceTB/finemath/tree/e92b25a616738fe95dc186b64dfb19f9c8525594) | Mathematical explanations from the audited crawl pages | Dataset card lists ODC-By. Underlying Common Crawl source terms also apply. |
| [EleutherAI/proof-pile-2](https://huggingface.co/datasets/EleutherAI/proof-pile-2/tree/901a9273a770e9d4138c5ddd91802f9c5c6cdc4b) | The audited arXiv portion | Individual arXiv author licences apply. Refer to each document and the dataset card. |
| [hoskinson-center/proof-pile](https://huggingface.co/datasets/hoskinson-center/proof-pile/tree/490b980249446f2f3bd2df3a8cf085d0f2de240a) | Audited Math StackExchange questions and replies | Underlying Math StackExchange posts are CC BY-SA. Attribution belongs to the post authors via Stack Exchange Inc. |

The [corpus and split audit](../../../docs/implementation/typeahead-evidence/audited-corpus-and-schedules.json)
pins the original source manifest and the canonical publisher-group audit. The
[reproduction guide](../../../scripts/typeahead/expanded/README.md) describes the matched-order development
selection and the full-pool packing commands. The existing Owner decision for licensing before default
production remains in effect.
