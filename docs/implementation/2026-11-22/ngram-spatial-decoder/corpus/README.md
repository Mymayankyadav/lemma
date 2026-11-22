# Offline corpus declaration and integrity audit

This is CPU-only preparation for N219. It does not download a corpus, train a
model, change the runtime, or qualify the worker for rollout. The checked-in
three-record example is hand-written **synthetic regression data**. Its split
names exercise the file contract; they are not representative held-out tests.

Run the example from the repository root:

```sh
node scripts/writing-decoder/audit-corpus.mjs docs/implementation/2026-11-22/ngram-spatial-decoder/corpus/synthetic-manifest.json
npm test -- tests/unit/tutor/writing-decoder-corpus.test.ts
```

The command reads the selected local bundle and writes an aggregate JSON report
to standard output. It does not rewrite the input, persist private text, send
requests, or print text snippets, document IDs, source URLs or owner identifiers.
Failures contain a fixed error code and, where applicable, a zero-based numeric
record, source or day index. Do not commit private source bundles or private audit
reports. Keep owner exports on the owner's computer, as chapters 02 and 03 require.

## Version 1 contract

`synthetic-manifest.json` is the complete runnable example. A manifest fixes:

- `version: 1`, `protocol: "n219-corpus-audit-v1"`, `normalization: "nfc-v1"`,
  `auditTokenizer: "unicode-word-v1"`, and `ownerSplit: "utc-days-floor-60-80-v1"`.
- `records`: the relative path, exact byte count and SHA-256 of a UTF-8 JSONL file.
- `sources`: unique IDs, `kind` (`public`, `owner` or `synthetic`), a frozen
  revision/dump identifier, explicit licence, attribution and obligations.
  Public sources also need an HTTPS source URL.
- Each source's `licenseEvidence` pins a local evidence/notice file by relative
  path, exact bytes and SHA-256. `review` records `status: "reviewed"`,
  `reviewedBy`, an exact UTC timestamp, `scope: "offline-preparation"` and notes.
  Unknown, missing or pending licences/reviews fail. Review declarations are
  required even for owner data; they do not authorize cloud processing.
- A manifest containing owner data, each owner source and each owner record must
  carry the same explicit pseudonymous `ownerScope`. Multi-owner bundles fail.

Every JSONL record has `id`, `sourceId`, `documentId`, `groupId`, `split`
(`train`, `validation`, `test`), `role`, `purpose` (`target` or `context`),
`provenance`, `text` and `textSha256`. The text hash covers its exact UTF-8 bytes.
Text must already be NFC; the auditor does not rewrite it or apply NFKC, which
would erase distinctions such as ℝ versus R. Original TeX is not transformed.

| Source / role | Required declarations | Target eligibility in this file contract |
| --- | --- | --- |
| Owner / learner | Matching `ownerScope`; `timestamp` such as `2026-11-01T12:00:00.000Z` | Only `typed`, `manual-accept`, `manual-fix`, or `transcribed` provenance |
| Owner / tutor | Matching scope and timestamp; explicit `tutorRole` of `prompt`, `given`, or `suggested-wording` | Context only; proof, solution, hint, missing and unknown roles fail |
| Public / public | `provenance: "published"` | May be a declared target; public text cannot decide personalized model quality |
| Synthetic / synthetic | `provenance: "generated"`; `generator.version` and nonnegative integer `generator.seed` | May exercise training/test mechanics; never qualifying human or safety evidence |

Learner text with `automatic`, `paste`, `restore`, `mixed` or `unknown` provenance
is accepted only as context. Split mixed documents into independently attributed
spans if they need target labels, retaining the original `documentId` and grouping.
An explicit manual acceptance differs from an automatic change surviving until
send. Acceptance does not itself certify a correction policy or mathematical
safety. Tutor metadata is an untrusted declaration; content still needs the
separate semantic boundary checks before any model or runtime uses it.

## Leakage checks

Every original document ID and grouping ID must occur in one split only. Public
`groupId` should identify the reviewed site/duplicate cluster, including mirrors
that belong together; owner groups should preserve conversations/documents. These
are globally scoped IDs, not keys that restart for each source. The auditor checks
the declared grouping, not whether its author actually grouped sites correctly.

All owner records on a UTC calendar day belong to one split. Sort the distinct
days; the first `floor(0.6 * days)` are training, the next days up to
`floor(0.8 * days)` are validation, and the remainder are test. This convention is
frozen in the protocol rather than inferred from file order. Very small bundles
may have an empty partition; passing this check does not mean enough data exists.

Duplicate target text is rejected across all sources, including within a split.
Exact text and case-insensitive 13-word overlaps are rejected between **every pair
of splits**, including validation versus test and including all context records.
Repeated context within one split is allowed and earns no target count. This
prevents training context from carrying the held-out answers even when it is not
labelled as a target.

For overlap auditing, a word is a Unicode letter/number run with optional internal
straight/curly apostrophes, then lowercased. Punctuation and TeX delimiters separate
runs; ℝ remains distinct from R. Hashed 13-word windows are compared exactly.
This tokenizer is for this audit only, not a claim to the future n-gram or Scribe
tokenizer. The report records the input manifest and corpus hashes.

## Bounds and interpretation

Version 1 limits a local pilot to 32 sources, 20,000 records, 16 MiB of JSONL,
128 KiB per line, 32,768 characters per text and 500,000 audit words. The manifest
is capped at 64 KiB and each evidence file at 128 KiB. Paths must remain inside
the selected bundle, including after resolving symbolic links. These are
preparation bounds, not phone performance results or a billion-token pipeline.

**A pass verifies declarations and integrity. It grants no licence, does not
authenticate provenance, does not detect falsely labelled learner/tutor content,
does not approve fitting, and does not certify semantic safety or model quality.**
The pinned JSONL is the imported snapshot; no upstream bytes are fetched or
independently authenticated. A reviewer must verify the source revision,
underlying rights, attribution/redistribution obligations and intended use before
importing it. Different source licence versions require separate registry entries.

Not yet implemented: MinHash near-duplicate auditing, later-topic holdouts,
Math.SE post-date splitting, math-span/macro validation, source quality sampling,
real learner evaluation, fitting or calibrated autocorrection. The report names
the major remaining checks. Synthetic fixtures cannot close those gates.

## Source review qualifications

The supplied chapters are preserved unmodified in `../source-plan/`. Their source
tables need verification against the actual imported revision:

- [FineMath's dataset card](https://huggingface.co/datasets/HuggingFaceTB/finemath/blob/main/README.md)
  names ODC-By 1.0 and Common Crawl's terms. [OpenWebMath's card](https://huggingface.co/datasets/open-web-math/open-web-math/blob/main/README.md)
  also states that its dataset licence does not alter the underlying page licences.
  A dataset-level label alone therefore does not settle every page's rights.
- [Stack Exchange's licensing help](https://stackoverflow.com/help/licensing)
  assigns CC BY-SA 2.5 to contributions before 2011-04-08, 3.0 until 2018-05-02,
  and 4.0 thereafter, per revision. Do not label an entire historical Math.SE
  import as 4.0 merely because the plan's table abbreviates it that way.
- Keep Proof-Pile subset rights separate; do not import an arXiv source-text
  subset under the licence of a different subset or of arXiv metadata.

No public or private corpus is added by this example. Current AOSP/SCOWL/mathlib
unigram source hashes remain covered by `build-lexicon.mjs --check`; this auditor
does not replace or alter that first-stage asset.
