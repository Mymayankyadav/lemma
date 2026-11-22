# Detypify model and ONNX Runtime

`model.onnx` and `infer.json` are unmodified files from the author’s MIT-licensed `detypify-service@0.3.0` npm package. The author’s package explicitly includes the weights and inference metadata for integration. The manifest records registry integrity and individual SHA-256 hashes. [Asset manifest](manifest.json)

The ONNX graph uses opset 20 and stores the weights inline. Its float32 input `x` takes `[1,1,224,224]`. Its terminal Gemm returns 411 unnormalized float32 logits in `infer.json` order. The beta maps exact, audited catalogue characters and Typst names and keeps unmapped outputs in the ranking evidence.

The published service drew 8 px strokes. Lemma follows the later pinned upstream source with 9 px padding, 9 px round strokes, whole-drawing centering and a half-pixel translation. The MIT copyright notice covers the adapted rasterizer. [Pinned rasterizer](https://github.com/QuarticCat/detypify/blob/983a887e553b42725d2555695b7bbfac982117dc/frontend/service/src/index.ts)

The production build copies the verified SIMD WASM binary from the pinned `onnxruntime-web@1.27.0` dependency. It runs with one thread in Lemma’s own worker. The worker embeds the corresponding JavaScript runtime. Microsoft’s MIT license and bundled third-party notices are from the same-version official ONNX Runtime release. [ONNX Runtime Web package](https://www.npmjs.com/package/onnxruntime-web/v/1.27.0) · [ONNX Runtime 1.27.0 release files](https://pypi.org/project/onnxruntime/1.27.0/)

## Runtime validation

The model, metadata and WASM total **18,439,009 bytes**. The web build adds a **91,451-byte** worker, for **18,530,460 bytes** across the four runtime files, or **7,756,895 bytes** with each file compressed using gzip level 9. The web app includes the worker in its shell cache and downloads the three data assets when Draw opens. The Android web bundle packages the same data under `dist-android/lemma/models/tutor-symbols/`.

The checks below ran on desktop Linux with headless Chromium 156 and the locally served production build. Initialization measures worker creation to ready, including asset retrieval and verification, WASM initialization and ONNX session setup. Inference measures snapshot dispatch to worker response, including rasterization. Warm timings exclude the first inference.

| Build and conditions | Initialization | First inference | Warm p50 | Warm p95 | Warm runs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Web, fresh cache, localhost | 1,114.3 ms | 133.1 ms | 16.6 ms | 35.4 ms | 34 |
| Web, offline reload, verified cache | 715.6 ms | 130.2 ms | 25.6 ms | 32.5 ms | 9 |
| Android-mode bundle served locally, external requests blocked, no service worker | 1,116.8 ms | 183.9 ms | 30.1 ms | 55.1 ms | 9 |

Separate localhost GETs took 75.6 ms for the model, 2.6 ms for the class metadata and 109.7 ms for WASM. The online worker made three model asset requests. The reloaded offline worker made zero and returned identical logits. The Android-mode browser run used the local bundle and created no model cache.

The two canvas paths matched the pinned upstream preprocessing across all 50,176 pixels of each of seven drawn fixtures, including a tiny stroke and a drawing whose additional stroke expanded its bounds. Empty ink and a lone dot abstained. For five synthetic completed glyphs, the real worker returned the intended top class for `∀`, `∈`, `∉`, `≤` and `∞`. It exposed all 411 raw logits, including 136 classes mapped to the Lemma catalogue.

The production browser suite exercises Settings opt-in, explicit candidate insertion, offline restart, a missing model, and valid-looking metadata with an altered checksum. Representative writer accuracy, peak memory, phone event-to-paint latency and installed Android WebView initialization await device measurements. This asset set ships with explicit candidate selection. [Browser regression suite](../../../../tests/e2e/v7-tutor-ink-model.spec.ts)
