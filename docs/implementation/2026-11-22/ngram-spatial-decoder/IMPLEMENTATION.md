# CPU-only decoder implementation

Agent: chat-628431#n8gm · Item: N219

The Owner supplied [section 16](PLAN.md) and authorized implementation inside a PR, with no merge. This draft starts from main `d1b3135f99ae54d52b312f4b728c4460abdabc06`, which already contains PR #1738. The existing writing-aid strip, typed-evidence guards and Undo are the integration path. PR #1743 (replay measurement) and #1744 (tutor trial) remain separate.

## First milestone

Build a reproducible, hash-pinned unigram lexicon from licensed sources, search it in a lazily loaded worker, and pass prefix candidates through the existing writing-aid policy. Add a default-off flag, stale-response and failure handling, and executable tests/replay. Keep the existing runtime as the fallback. New automatic correction, n-gram training, spatial fitting and tutor-pack integration remain later stages.

## Inputs to request after implementation

The companion specifications referenced by section 16, especially logging, training/certification, evaluation, learner-choice safety, Scribe architecture and tutor signals; an optional recent Lemma export and eventual consented typing logs for chronological evaluation and fitting; a physical-phone trial after a concrete build is available. Public corpus acquisition and license research are implementation work, not prerequisites to ask the Owner to do.

## Release hold

Keep this PR draft. Do not post the repository's Ready comment, enable automatic merge, merge, or deploy.
