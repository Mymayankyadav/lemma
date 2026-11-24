You are continuing the Lemma Type-Ahead work (repo `Mymayankyadav/lemma`, branch `ccr-220fd71d-iaf0fy`; read AGENTS.md, CURRENT.md, NEXT.md
and docs/current/N232.md to N235.md first). N232-N235 are already written on that branch, untested. You are in a session with a GPU route:
the Kaggle MCP connector (check its tools with ToolSearch first; it must show as connected). Do N236 and N237. Limit GPU use: at most
~1 GPU-hour in total, one training run if it passes the gate.

N236 (GPU): scripts/typeahead/train/ has prepare.py (CPU, already run once), train.py, export_onnx.py, kaggle_train.py and kernel-metadata.json
(see its README.md for the gate). The training scripts have never been run. 1) Download proofpile_dev.jsonl.gz is done by kaggle_train.py
itself; set the kernel id in kernel-metadata.json to the Kaggle user, push it with a T4 and internet on, start it, poll, fetch the output
(neural-v1/model.onnx, manifest.json, metrics.json). Fix script errors that appear (versions of torch/onnx) with minimal edits, not a redesign.
2) If the gate passes, put the files in public/models/typeahead/neural-v1/ (model <= 20 MB), add ATTRIBUTION notes like the n-gram's, and
integrate: a loader like decoder/kn.ts (size + SHA-256 check, cache by hash) using the onnxruntime-web the repo already ships, run in a
Web Worker; score the n-gram's top ~50 candidates at each word start with the last 48 tokens (tokenisation = decoder/kn.ts contextIds/tokenOf,
prefixed by <s>) and mix: ln P = (1-w) ln P_ngram + w ln P_neural (start w = 0.5, tune on the replay). Behind flag typeaheadV2 only.
3) Grey text (flag proofAssistGhost, default off): show a continuation only when its calibrated probability p-hat >= theta(|c|) =
(t_read(|c|)+t_miss)/((|c|-1) t_k + t_miss) with t_k=0.33 s, t_read=0.25+0.03|c|, t_miss=0.30 s; p-hat from Platt scaling of the mixed
log-probability (fit on held-out text); never show a withheld term (writingAid/answerAids.ts isWithheld); p90 latency 60 ms or hide it.
Keep the learner-choice rule (engine.ts learnerChoiceAllows) applying to every word of a continuation.

N237 (CPU, no GPU): an on-device ranker and personal model in src/features/tutor/writingAid/. Score s(c)=w.phi(c), phi = [ln P_ngram,
ln P_neural, ln P_cache, bank bonus, touch likelihood, fraction typed, length, source, past acceptance of that source]; learn w with the
pairwise loss log(1+exp(-(s(c+)-s(c-)))) from taps (the tapped suggestion against those shown beside it), L2 0.01, starting at weights
equal to log-linear interpolation; Platt calibration p-hat=sigmoid(a s+b) from accepted/ignored impressions; slot hysteresis (a shown
slot changes only if the new score exceeds the old by delta=0.5 nats); a personal n-gram of the learner's own answers mixed
P = alpha P_personal + (1-alpha) P_global, alpha starts 0.4; everything local (extend learning.ts / personalization.ts storage, no text
leaves the device, bounded size); a weekly offline report of taps saved, acceptance and undo rates.

Rules: follow AGENTS.md (name `chat-<n>#<tag>`, one run-log plan comment, docs/current/N236.md and N237.md notes, migrations additive; no
secrets in code; the Kaggle token stays in the connector/environment). Be honest about what was measured vs not. Report GPU minutes used.
