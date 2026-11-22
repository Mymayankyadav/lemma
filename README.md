This Lemma Android preview adds offline gray-text suggestions for short proof phrases and LaTeX commands in the Tutor composer. Install **Lemma Proof Assist** alongside Lemma, open a checkpoint’s Tutor, and type `We need to` or `Let $A \sub`. Tap the suggestion or swipe right to accept it. You write and verify the mathematical steps.

- **lemma-proof-assist.zip** contains the 73.8 MB 4-bit GGUF, the CPU-trained LoRA adapter, training and export scripts, checksums, and the Lemma integration patch.
- **Lemma-Proof-Assist.apk** is a signed preview for 64-bit Android (`arm64-v8a` and `x86_64`). It opens the example workspace.

The packaged editor and Android native scorer passed separate checks. The software emulator’s package service kept restarting during installation, so a full Android app run and phone latency remain unverified.
