# Checkpoint writing aid engine

The checkpoint composer packages the compact runtime from the delivered *Lemma local proof keyboard* research bundle. It uses the follow-up sorted-prefix lookup and loads the packaged assets when suggestions are enabled. Suggestion work coalesces at the next animation frame. [Runtime adapter](../../../../src/features/tutor/writingAid/engine.ts) · [Research files](../../../../src/features/tutor/writingAid/vendor/)

The lexical lane shows at most three one-word choices. At a word boundary it offers only neutral function words, and it abstains at unresolved proof boundaries. The spelling lane offers fixed full-token corrections. Blue replacements render typed notation as a glyph. Faded completions add at most two tokens from the vetted wording, literal scaffold or spelling lane. Strict allows exact notation, attested spelling and strongly typed word endings. [Policy](../../../../src/features/tutor/writingAid/policy.ts)

Each proposal captures the exact draft, cursor, account/checkpoint scope and revisions. A candidate tap is one undoable editor change. After one accepted word, the original typed anchor allows at most one neutral word tap. Accepted text contributes no additional typed evidence. Cursor moves, imports and other edit sources retire the anchor. The writing aid receives no tutor messages, question text, saved context or model-generated answer. [Editor integration](../../../../src/features/tutor/TutorComposer.tsx)

Demo profiles default to Balanced. Live owners can select a mode and each surface independently in Tutor settings or in chat. Faster typing is experimental and shows a warning before selection. Only the mode and surface switches are stored by the writing aid. Account deletion clears that owner's live preferences. [Storage boundary](../../../../src/data/tutor/local-storage.ts) · [Preferences](../../../../src/features/tutor/writingAid/preferences.ts)

## Assets

| Runtime asset | Source |
| --- | --- |
| `wordlist.txt` | 41,557 SCOWL-derived spellings. The adapter also recognizes Lemma's existing `preimage` and `preimages` spellings. SHA-256 `67689f3f4ea057f0b57a07b1e3d54fc28257c47691eb8acfab681b7e38b37755`. |
| `compact-ranks.json` | 1,500 unigrams and 750 bigrams from English comments from mathlib4 revision `c44e0c8ee63ca166450922a373c7409c5d26b00b`. 32,660 bytes. SHA-256 `8e22aa214182878e8182dc0d6231801cb83b7a60555a7739e02f3128fc48de81`. |
| `legacy/runtime-phrases.json`, `legacy/runtime-veto.json` | The study's vetted phrases and fixed sparse veto. The veto can reject a candidate after the rule checks. |

The SCOWL notices and Apache-2.0 license accompany the original assets. [SCOWL notices](../../../../src/features/tutor/writingAid/vendor/wordlist-LICENSE.txt) · [mathlib4 license](../../../../src/features/tutor/writingAid/vendor/math-ranks-LICENSE.txt) · [Pinned upstream revision](https://github.com/leanprover-community/mathlib4/tree/c44e0c8ee63ca166450922a373c7409c5d26b00b)

The research preview simulated 13.8% entry-time savings in Balanced and 30.8% in Fast on 16 passages. An earlier Fast audit found possible new mathematical ideas in 9 of 73 offers. The compact Balanced audit observed none in its sample of 73. The app applies additional cursor, provenance and output restrictions. These study figures characterize the research prototype. Physical Android performance and ordinary learner typing speeds require device and human measurements.
