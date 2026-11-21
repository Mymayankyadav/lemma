# Adaptive writing-aid experiment

The selected local scorer is the sparse contextual reward ranker. On this synthetic workload it reached the intended word in the first slot slightly more often than the same implementation using only its decayed per-word weights. The paired difference after the simulated preference shift was **+0.69 percentage points in Balanced** (95% bootstrap interval 0.00 to +1.53) and **+1.67 points in Faster typing** (+0.63 to +2.78). These intervals describe this generator and its simulated users; they do not establish a benefit for people, other writing tasks, or a phone. The difference in modeled typing speed between these two scorers was approximately 0.02 WPM.

The exact default scorer and the frequency-only variant are invoked through the production TypeScript API. Both store the same bounded weights. The contextual scorer also reads kind, length/typed-prefix shape, previous authored word, and previous-word × candidate weights. Scores and updates are decayed and bounded; it does not generate a candidate or override an eligibility check. It is a small online reward ranker, not a trained language model or an unbiased contextual-bandit estimate. New evaluation phrases have different preceding words from early phrases, so this experiment does not establish that the contextual-pair feature caused the gain: shared shape or word features can explain it.

## Results after the simulated shift

Each cell pools three fixed seeds, twelve independent synthetic profiles per seed, and 40 later opportunities per profile. The table includes opportunities where the intended word never appeared in the allowed pool.

| Mode and scorer | Intended word first | In first three | Typed keystrokes / word | 30-WPM model | Refreshes / 1,440 opportunities |
| --- | ---: | ---: | ---: | ---: | ---: |
| Balanced, static | 36.74% | 50.56% | 5.77 | 30.29 WPM | 255 |
| Balanced, frequency/recency | 46.94% | 50.56% | 5.77 | 30.29 WPM | 255 |
| Balanced, contextual, selected | 47.64% | 50.56% | 5.77 | 30.29 WPM | 255 |
| Balanced, rank-4 adapter | 47.15% | 50.56% | 5.77 | 30.29 WPM | 255 |
| Faster, static | 23.54% | 41.81% | 5.78 | 30.22 WPM | 298 |
| Faster, frequency/recency | 43.82% | 46.67% | 5.78 | 30.25 WPM | 273 |
| Faster, contextual, selected | 45.49% | 48.13% | 5.78 | 30.27 WPM | 264 |
| Faster, rank-4 adapter | 43.75% | 46.60% | 5.78 | 30.25 WPM | 275 |
| Strict, all scorers | 11.67% | 11.67% | 5.87 | 30.09 WPM | 0 |

The WPM calculation is a sensitivity model: each typed character costs 400 ms, each tap 300 ms, and each observed list 80 ms. It includes one selected opportunity per synthetic draft and does not measure a human or device. Keystrokes include spaces and punctuation; the denominator counts words. It does not claim that people will type faster. [Summary and paired intervals](summary.json) · [All per-seed metrics](results.json) · [Seed 2](results-seed2.json) · [Seed 3](results-seed3.json)

Before the shift, Faster top-slot rates were 22.78%, 50.21%, 51.32%, and 50.49% in the same order. For an early improvement measure fixed before comparing results, the first two consecutive blocks of ten opportunities per profile had to exceed static top-slot accuracy by at least five percentage points in each block. The contextual scorer first met this rule after **20 opportunities per profile** in all three seeds, having processed an average **57.3, 58.0, and 58.8 feedback signals per profile** by then. Frequency and the adapter met it after 20 in each seed as well. After the shift, both contextual and frequency met that same comparison to static by the second block in all seeds. These are event counts, not a measured adaptation time in hours, and the post-shift measure is not proof that all prior preferences were forgotten.

For a separate sparse-feedback sensitivity, the simulator retained all explicit accept, refresh, alternate, undo, and partial-edit signals, but randomly withheld 80% of passive personal-use, continued-match, divergence, and retention signals. This deliberately thins the feedback and does not describe a runtime setting. Post-shift Faster top-slot rates were **40.97% frequency, 43.33% contextual, and 41.04% adapter**; contextual minus frequency was +2.36 points (paired 95% interval +0.97 to +3.75). Balanced was 46.25%, 47.43%, and 46.25%, respectively; the paired difference was +1.18 points (+0.35 to +2.22). [Sparse summary](summary-sparse.json) · [seed 1](results-sparse.json) · [seed 2](results-sparse-seed2.json) · [seed 3](results-sparse-seed3.json)

## Availability, diversity, and proof safety

In the held-out Faster phase, only 728 of 1,440 intended words were in the permitted candidate pool at the selected opportunity. The selected scorer placed the intended word in the first three in about 95.1% of those cases, but could not recover the other 712 through ranking. In Balanced every intended word that entered this fixed pool fit in the first three. Strict yielded at most one eligible suggestion in this dataset, so no ranker could improve ordering. Off yielded no candidates in all 522 fixture cases.

The production selection rule prefers different morphological families when the pool permits it, then fills any remaining slots from the eligible pool. After the shift, the selected scorer displayed a mean of **1.42 candidates in Balanced** and **1.83 in Faster** per opportunity; this includes empty lists. The mean pairwise normalized string edit distance among displayed pairs was **0.266** and **0.414**, respectively. This is a spelling-distance measure, not a measure of semantic variety or usefulness. Ineligible or unrelated words are not added just to fill three slots.

The safety-only portion has 22 synthetic proof drafts, 13 deliberately invalid. Each profile sees all 22 after its ranking tasks, without using the truth label as feedback. Applying the intended completion must reconstruct the intended draft verbatim, including an incorrect claim. For the selected scorer across the three seeds, all 468 invalid-proof instances remained verbatim in Strict and Faster; 466 of 468 did in Balanced. The other instances resulted from the modeled wrong tap that was neither undone nor edited; they are counted rather than silently repaired. There were three wrong accepted candidates on the six explicitly logic-focused drafts in Balanced (one retained) and one in Faster (none retained). These counts use the assumed error rates below and measure deviation from the authored target, not logical truth. Eligibility rules reduce the set of offers but do not verify mathematical claims.

The stored [four-surface smoke checks](surfaces.json) exercise independent candidate identity and signed updates for words, ghost text, corrections, and replacements; they also check that an accepted completion is not vocabulary evidence and that generated continuation text is not learner-authored context. This is an API smoke check, not a behavioral ranking experiment for those surfaces.

A separate [actual-engine vocabulary check](vocabulary.json) uses a synthetic coined word and a virtual clock. Acceptance alone and one directly typed use did not admit the word; two direct uses did. The word remained eligible after one simulated year and decayed out after three. Five direct uses of `commutative` did not admit that proof property from the weak prefix `commuta`. This tests the specific local policy and decay path, not how people acquire vocabulary.

## Experiment design

- [Dataset](dataset.json): 500 templated learner drafts, each pairing the typed prefix with a complete intended draft, plus the 22 proof-safety drafts. Topics 0–9 are early tasks; topics 10–19 are held out. The earlier and later full drafts, IDs, preceding phrases, and exact `(previous, prefix, candidate)` feature rows are disjoint. Topics occur after the target word, so this is still a narrow templated test. Candidate pools and learner anchors come from the actual `predictWritingAidPool` and `writingAidFeatures` code in local Chromium, with the model omitted. This captures the stricter proof-term gate; it does not measure candidates newly enabled by a learned vocabulary.
- **Opportunity selection uses the known target:** for each draft the fixture scans typed prefixes and chooses the first at which the intended word is eligible, or the last nonempty list if the target never becomes eligible. This is an optimistic, target-informed sampling rule for an experiment, not what the application knows while someone types. Earlier lists are not replayed for feedback or inspection cost. Rates here do not estimate the accuracy, speed, or burden of a real typing session.
- Each synthetic profile receives 80 earlier opportunities, 40 held-out opportunities under its first task mixture, then 40 different held-out opportunities under a shifted mixture. The preferred scenario mix is sampled independently for each profile and changes at the midpoint. There is no shared pretrained user model. The comparison predicts each opportunity before processing its feedback, uses the same seeded action draws across scorers, and never trains on a replay of the evaluated task. No unshown candidate receives invented acceptance or rejection. When the simulated person manually finishes the tracked target word, that observed typing supplies a personal-use signal even if the word was not offered. An accepted generated completion never becomes vocabulary evidence. Other words in the draft are not replayed as individual typing events.
- A target visible in a list is accepted with probability 45%. A miss produces a refresh with probability 35%; every actually shown candidate receives the refresh signal. On each acceptance, every other visible choice receives alternate feedback. Three percent of eligible accepts with alternatives are simulated wrong taps. Of those, 85% are undone, 10% edited, and 5% retained. Manual completion gives continued-match or divergent feedback to each still-visible exposure; an acceptance clears exposure, so it never also produces a continued-match signal. These are assumptions, not observed acceptance or error rates.
- Opportunities are at least two seconds apart, with enough time to type the preceding tracked word at the modeled 30 WPM, and eight per daily session. Refresh and acceptance feedback are available immediately; undo/partial edit after 1 s; typed-word signals at completion after 400 ms per remaining character plus the separator; retained acceptance after 3 s. A correct accepted word is assumed still present when that timer fires. Feedback is queued until due, so it cannot influence an earlier score. These delays are sensitivity inputs.
- Paired uncertainty resamples seed clusters and then profiles inside each seed, with 10,000 bootstrap draws. Profile differences vary: after the shift, contextual minus frequency in Faster ranged from −2.5 to +12.5 percentage points per synthetic profile. Three seeds and repeated templates limit generalization.

The ten signals, with the scorer's signed reward before its 0.35 update multiplier, are: refresh −0.7; accept +1; **kept accepted suggestion** +0.35; undo −1.5; partial edit −0.6; continued match +0.16; divergence −0.08; choosing an alternate −0.2 for each bypassed visible suggestion; dismiss/keep the learner's typed text −0.45; and observed personal use +0.14. Weak signals are not equivalent to proof correctness. The word-only replay has no explicit edit/ghost dismissal, though that signal is checked in the separate four-surface smoke. The model caps sparse weights at 512 entries and vocabulary at 128 entries; rank weights have a 30-day half-life, vocabulary 180 days.

## Runtime and model provenance

On this development host, warm Chromium measured the real word-only pool plus selection, using an empty contextual model: Balanced and Faster median **0.1 ms**, p95 **0.2 ms** over 1,566 calls each; Strict median **0.2 ms**, p95 **0.4 ms** over 201 calls. This excludes rendering, nonempty personal models, installed Android WebView, and input latency. [Measurements](engine-timing.json) The contextual model serialized to a mean **20,307 bytes** after a complete Faster replay; this includes its bounded vocabulary and auxiliary weights. The frequency-only comparison stores the same model structure.

The comparison adapter was actually trained locally on CPU using PyTorch, from zero candidate weights and deterministic small random context factors. It is a rank-4 context-by-candidate **ranking adapter**, updated in batches of eight observed signed rewards; it is not a causal language model or a downloaded LoRA. Its raw factor tensors use **2,272 bytes** in this fixture, excluding the vocabulary/index, Python/PyTorch runtime, and serialization overhead. The weights for all simulated profiles and modes are saved in [seed 1](low-rank-weights.pt), [seed 2](low-rank-weights-seed2.pt), and [seed 3](low-rank-weights-seed3.pt); SHA-256 values and the CPU/PyTorch version are in the result files. No pretrained weights or external data were downloaded. The proof drafts come from the repository's existing synthetic replay, and the engine uses the bundled dictionary and mathlib-derived ranks with their existing [dictionary license](../../../../src/features/tutor/writingAid/vendor/wordlist-LICENSE.txt) and [rank provenance](../../../../src/features/tutor/writingAid/vendor/math-ranks-LICENSE.txt). The generated profiles and weights contain no user data.

## Reproduce

Use Node dependencies already in the project, Chromium at `/usr/bin/chromium` or `CHROMIUM_PATH`, and Python with CPU PyTorch 2.7.1. No network data is fetched; Vite binds a local loopback port for the actual engine imports.

```sh
node scripts/adaptive-writing-dataset.mjs
node scripts/adaptive-writing-engine-pool.mjs
ADAPTIVE_WRITING_SEED=681914 python scripts/adaptive-writing-experiment.py
ADAPTIVE_WRITING_SEED=681915 ADAPTIVE_WRITING_SUFFIX=-seed2 python scripts/adaptive-writing-experiment.py
ADAPTIVE_WRITING_SEED=681916 ADAPTIVE_WRITING_SUFFIX=-seed3 python scripts/adaptive-writing-experiment.py
python scripts/adaptive-writing-summary.py
ADAPTIVE_WRITING_SEED=681914 ADAPTIVE_WRITING_PASSIVE_KEEP=.2 ADAPTIVE_WRITING_SUFFIX=-sparse python scripts/adaptive-writing-experiment.py
ADAPTIVE_WRITING_SEED=681915 ADAPTIVE_WRITING_PASSIVE_KEEP=.2 ADAPTIVE_WRITING_SUFFIX=-sparse-seed2 python scripts/adaptive-writing-experiment.py
ADAPTIVE_WRITING_SEED=681916 ADAPTIVE_WRITING_PASSIVE_KEEP=.2 ADAPTIVE_WRITING_SUFFIX=-sparse-seed3 python scripts/adaptive-writing-experiment.py
ADAPTIVE_WRITING_SUMMARY_SUFFIX=-sparse python scripts/adaptive-writing-summary.py
node --import tsx scripts/adaptive-writing-surfaces.ts
node scripts/adaptive-writing-engine-timing.mjs
node scripts/adaptive-writing-vocabulary.mjs
```

The first command writes a provisional fixture. The second replaces its pools with production engine results and records hashes of the relevant sources and assets. The experiment refuses a provisional fixture or one whose recorded sources changed. Timing, process scheduling and PyTorch serialization metadata can vary across hosts; the seeded behavioral outcomes and per-user pairs are the reproducible comparison.
