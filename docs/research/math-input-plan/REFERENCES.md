# References

## Typing, suggestions and their effects

- Arnold, Chauncey & Gajos (2020). Predictive text encourages predictable writing. IUI '20. https://iis.seas.harvard.edu/papers/arnold20predictive.pdf
- Quinn & Zhai (2016). A cost–benefit study of text entry suggestion interaction. CHI '16. https://doi.org/10.1145/2858036.2858305
- Palin, Feit, Kim, Kristensson & Oulasvirta (2019). How do people type on mobile devices? Observations from a study with 37,000 volunteers. MobileHCI '19. https://userinterfaces.aalto.fi/typing37k
- Fowler et al. (2015). Effects of language modeling and its personalization on touchscreen typing performance. CHI '15.
- Trnka & McCoy (2008). Evaluating word prediction: framing keystroke savings. ACL-08: HLT.
- Soukoreff & MacKenzie (2003). Metrics for text entry research: an evaluation of MSD and KSPC, and a new unified error metric. CHI '03.
- Vertanen & Kristensson (2014). Complementing text entry evaluations with a composition task. ACM TOCHI 21(2).

## Keyboard decoding and correction

- Kernighan, Church & Gale (1990). A spelling correction program based on a noisy channel model. COLING.
- Brill & Moore (2000). An improved error model for noisy channel spelling correction. ACL.
- Goodman, Venolia, Steury & Parker (2002). Language modeling for soft keyboards. AAAI.
- Bi & Zhai (2013). Bayesian Touch: a statistical criterion of target selection with finger touch. UIST.
- Ouyang et al. (2017). Mobile keyboard input decoding with finite-state transducers. https://arxiv.org/abs/1704.03987
- Hard et al. (2018). Federated learning for mobile keyboard prediction. https://arxiv.org/abs/1811.03604
- Google Research. Spatial model personalization in Gboard. https://research.google/pubs/spatial-model-personalization-in-gboard/
- Cook (2023). Reverse engineering of Apple's iOS 17 predictive text model; reported by Willison (2024). https://www.simonwillison.net/2024/Jun/3/transformer-powered-predictive-text
- Garbe. SymSpell (symmetric delete spelling correction). https://github.com/wolfgarbe/SymSpell
- Hagiwara & Mita (2020). GitHub Typo Corpus. LREC. https://arxiv.org/abs/1911.12893

## Language modelling

- Chen & Goodman (1999). An empirical study of smoothing techniques for language modeling.
- Heafield (2011). KenLM: faster and smaller language model queries. https://kheafield.com/code/kenlm/
- Stolcke (1998). Entropy-based pruning of backoff language models.
- Kuhn & De Mori (1990). A cache-based natural language model for speech recognition. IEEE TPAMI.
- Khandelwal et al. (2020). Generalization through memorization: nearest neighbor language models. https://arxiv.org/abs/1911.00172
- Kudo & Richardson (2018). SentencePiece. https://arxiv.org/abs/1808.06226
- Bavarian et al. (2022). Efficient training of language models to fill in the middle. https://arxiv.org/abs/2207.14255
- Hoffmann et al. (2022). Training compute-optimal large language models. https://arxiv.org/abs/2203.15556
- Gururangan et al. (2020). Don't stop pretraining. https://arxiv.org/abs/2004.10964
- Hu et al. (2021). LoRA. https://arxiv.org/abs/2106.09685
- Dettmers et al. (2023). QLoRA. https://arxiv.org/abs/2305.14314
- Hinton, Vinyals & Dean (2015). Distilling the knowledge in a neural network. https://arxiv.org/abs/1503.02531
- Kim & Rush (2016). Sequence-level knowledge distillation. https://arxiv.org/abs/1606.07947
- Gu et al. (2024). MiniLLM: knowledge distillation of large language models. https://arxiv.org/abs/2306.08543
- Willard & Louf (2023). Efficient guided generation for large language models. https://arxiv.org/abs/2307.09702
- Xu et al. (2026). Are you going to finish that? A practical study of the partial token problem. https://arxiv.org/abs/2601.23223
- Athiwaratkun et al. (2024). Token alignment via character matching for subword completion. Findings of ACL. https://aclanthology.org/2024.findings-acl.929.pdf
- Vieira et al. (2024). From language models over tokens to language models over characters. https://arxiv.org/abs/2412.03719

## Small models

- Allal et al. (2025). SmolLM2: when smol goes big. https://arxiv.org/abs/2502.02737
- Google (2025). Introducing Gemma 3 270M. https://developers.googleblog.com/en/introducing-gemma-3-270m/ · Gemma terms: https://ai.google.dev/gemma/terms
- Liquid AI (2025). LFM2 technical report. https://arxiv.org/abs/2511.23404 · LFM licence: https://www.liquid.ai/lfm-license
- Qwen Team (2025). Qwen3 technical report. https://arxiv.org/abs/2505.09388
- Meta AI (2025). MobileLLM-R1: exploring the limits of sub-billion language model reasoners. https://arxiv.org/abs/2509.24945 · Licence on the model card: https://huggingface.co/facebook/MobileLLM-R1-360M
- Liu et al. (2024). MobileLLM: optimizing sub-billion parameter language models for on-device use cases. https://arxiv.org/abs/2402.14905
- Google. LiteRT-LM overview and benchmarks. https://developers.google.com/edge/litert-lm/overview

## Ranking, calibration, risk control and feedback

- Burges (2010). From RankNet to LambdaRank to LambdaMART: an overview. Microsoft Research MSR-TR-2010-82.
- Ke et al. (2017). LightGBM. NeurIPS. https://github.com/microsoft/LightGBM
- Guo et al. (2017). On calibration of modern neural networks. https://arxiv.org/abs/1706.04599
- Angelopoulos et al. (2021). Learn then Test: calibrating predictive algorithms to achieve risk control. https://arxiv.org/abs/2110.01052
- Angelopoulos et al. (2022). Conformal risk control. https://arxiv.org/abs/2208.02814
- Joachims, Swaminathan & Schnabel (2017). Unbiased learning-to-rank with biased feedback. https://arxiv.org/abs/1608.04468
- Agarwal et al. (2019). Estimating position bias without intrusive interventions. https://arxiv.org/abs/1812.05161
- Klasnja et al. (2015). Microrandomized trials: an experimental design for developing just-in-time adaptive interventions. Health Psychology.
- Kravitz & Duan, eds. (2014). Design and implementation of N-of-1 trials: a user's guide. AHRQ.
- Connor (1987). Sample size for testing differences in proportions for the paired-sample design. Biometrics.
- Zheng et al. (2023). Judging LLM-as-a-judge. https://arxiv.org/abs/2306.05685

## Learning science

- Slamecka & Graf (1978). The generation effect: delineation of a phenomenon. JEP: Human Learning and Memory.
- Bjork (1994). Memory and metamemory considerations in the training of human beings.

## Data

- FineMath dataset card. https://huggingface.co/datasets/HuggingFaceTB/finemath
- Paster et al. (2023). OpenWebMath. https://arxiv.org/abs/2310.06786
- Azerbayev et al. (2023). Llemma and Proof-Pile-2. https://arxiv.org/abs/2310.10631
- Welleck et al. (2021). NaturalProofs. https://arxiv.org/abs/2104.01112
- Gervais et al. (2024). MathWriting: a dataset for handwritten mathematical expression recognition. https://arxiv.org/abs/2404.10690
- HWRT dataset. https://zenodo.org/records/50022 · HASYv2. https://zenodo.org/records/259444
- Gebru et al. (2018). Datasheets for datasets. https://arxiv.org/abs/1803.09010
- Mitchell et al. (2019). Model cards for model reporting. https://arxiv.org/abs/1810.03993

## Handwriting

- Carbune et al. (2020). Fast multi-language LSTM-based online handwriting recognition. https://arxiv.org/abs/1902.10525
- Snell, Swersky & Zemel (2017). Prototypical networks for few-shot learning. https://arxiv.org/abs/1703.05175
- Hendrycks, Mazeika & Dietterich (2019). Deep anomaly detection with outlier exposure. https://arxiv.org/abs/1812.04606
- Liu et al. (2020). Energy-based out-of-distribution detection. https://arxiv.org/abs/2010.03759
- Simard, Steinkraus & Platt (2003). Best practices for convolutional neural networks applied to visual document analysis. ICDAR.

## Hardware and platform

- Qualcomm. Snapdragon 4 Gen 4 product brief. https://www.qualcomm.com/content/dam/qcomm-martech/dm-assets/documents/Snapdragon-4-Gen-4-Product-Brief.pdf
- Chrome. WebGPU on Android, Chrome 121. https://developer.chrome.com/blog/new-in-webgpu-121

## PR #1738 sources (head `05f297d3`)

- Tutor writing-aid report: https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/writing-aid-tutor/README.md
- Adaptive report: https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/writing-aid-adaptive/README.md
- Fixed-row simulation: https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/writing-aid/SIMULATION.md
- Mobile math input specification: https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/mobile-math-input.md
- Ink simulations: https://github.com/Mymayankyadav/lemma/blob/05f297d32d62ab78ffad2869eaaf4a2af24b99ea/docs/implementation/2026-11-21/ink-simulation/README.md
