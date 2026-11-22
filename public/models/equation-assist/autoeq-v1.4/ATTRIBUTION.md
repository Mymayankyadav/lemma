# autoeq v1.4

The INT8 encoder, decoder, and vocabulary are from mie00/autoeq at revision
ca8fdda9fe8311b0b9b4cd2e7a591f2b66a292f5. Lemma also bundles the unmodified
beam-search decoder from that revision. The model and decoder use Apache-2.0.

Lemma provides its own worker, asset verification, and candidate selection. The
worker uses the same ONNX Runtime WASM asset as Lemma's symbol recognizer.

[Upstream source](https://github.com/mie00/autoeq/tree/ca8fdda9fe8311b0b9b4cd2e7a591f2b66a292f5)
