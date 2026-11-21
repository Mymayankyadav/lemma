#!/usr/bin/env python3
"""Report the preregistered validation choice and its already-frozen test."""
import json
from pathlib import Path
import random
import statistics

OUT=Path(__file__).resolve().parents[1]/'docs/implementation/2026-11-21/writing-aid-tutor'
v=json.loads((OUT/'validation.json').read_text()); e=json.loads((OUT/'evaluation.json').read_text())
manifest=json.loads((OUT/'manifest.json').read_text()); models=json.loads((OUT/'models.json').read_text())
personal=json.loads((OUT/'personal-results.json').read_text()); cost=json.loads((OUT/'personal-cost.json').read_text())
auto=json.loads((OUT/'autocorrect.json').read_text()); safety=json.loads((OUT/'adversarial-safety.json').read_text())
large=json.loads((OUT/'large-model-probe.json').read_text())
regression=json.loads((OUT/'regression.json').read_text());fresh=json.loads((OUT/'fresh-connectors.json').read_text())
surfaceDetail=json.loads((OUT/'surface-detail.json').read_text());learning=json.loads((OUT/'learning-curve.json').read_text())
assert v['winner']==e['winner'] and v['datasetSha256']==e['datasetSha256']
winner=e['winner']


def wpm(rows,attention=.04):
 chars=sum(r['targetChars'] for r in rows)
 secs=sum(r['manualChars']*.4+r['backspaces']*.4+r['taps']*.3+r['extraRecoverySeconds']+r['glances']*attention for r in rows)
 return chars/5/(secs/60) if secs else 0


def paired(a,b,regime='all'):
 left=e['test'][a]['records'];right=e['test'][b]['records']
 users=sorted({r['user'] for r in left});assert users==sorted({r['user'] for r in right})
 def group(rows,u):return [r for r in rows if r['user']==u and (regime=='all' or r['regime']==regime)]
 la={u:group(left,u) for u in users};lb={u:group(right,u) for u in users}
 rng=random.Random(72591);samples=[]
 for _ in range(5000):
  selected=[rng.choice(users) for _ in users]
  samples.append(wpm([r for u in selected for r in la[u]])-wpm([r for u in selected for r in lb[u]]))
 samples.sort()
 return {'difference':wpm(left if regime=='all' else [r for r in left if r['regime']==regime])-
                       wpm(right if regime=='all' else [r for r in right if r['regime']==regime]),
         'ci95':[samples[124],samples[4874]],'pairedUsers':len(users)}


summary={'winner':winner,'selection':v['selection'],'paired':{b:paired(winner,b) for b in ('off','contextual','tutor-all')},
 'regimePaired':{stage:paired(winner,'off',stage) for stage in ('cold','regular','shifted')},
 'models':{row['id']:{'validation':v['validation'][row['id']]['byRegime']['all'],
                      'test':e['test'][row['id']]['byRegime']['all'],
                      'meanBytes':e['test'][row['id']]['meanBytes'],'latency':e['test'][row['id']]['latency']}
           for row in manifest['candidates']},
 'datasetSha256':v['datasetSha256'],'engineSources':v['engineSources'],'manifestSha256':v['manifestSha256'],
 'modelsSha256':v['modelsSha256'],'evaluatorSha256':v['evaluatorSha256']}
(OUT/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')

def f(n,d=2):return f'{n:.{d}f}'
lines=['# Tutor-context writing-aid experiment','',
 'The validation-selected configuration is **tutor-wording**: the existing contextual reward ranker with tutor wording enabled and tutor term/symbol options disabled. The selection was frozen before the main held-out trajectory replay. In validation it scored 30.139 modeled WPM at 40 ms attention per new list; all-on scored 30.133, inside the preregistered 0.10-WPM tie band. The selector chose the smaller observed state. The difference is tiny and does not establish that disabling term or symbol support helps people.',
 '', 'The 24-candidate table ran every ranker on the same engine revision. Enabling tutor wording produced the same recorded test trajectories as disabling it in that engine. A separate replay of the actual previous app revision found a Balanced tie on these tasks and a drop on the longer proof passages. [Frozen-version comparison](VERSION-COMPARISON.md)',
 '',f"On 144 synthetic held-out tasks from 12 new profiles, the selected configuration scored {f(e['test'][winner]['byRegime']['all']['wpm40'])} modeled WPM versus {f(e['test']['off']['byRegime']['all']['wpm40'])} for matched manual spelling recovery. The paired user bootstrap difference was {f(summary['paired']['off']['difference'])} WPM (95% interval {f(summary['paired']['off']['ci95'][0])} to {f(summary['paired']['off']['ci95'][1])}). At 0/40/100 ms per new list, selected-model estimates were {f(e['test'][winner]['byRegime']['all']['wpm0'])}/{f(e['test'][winner]['byRegime']['all']['wpm40'])}/{f(e['test'][winner]['byRegime']['all']['wpm100'])} WPM. These values are simulated sensitivity estimates, not observed human or device speed.",
 '', '## All 24 candidates','',
 'The first six are controls or earlier online rankers, the next twelve are source/option or ranking variants, and the final six are independently trained CPU scorers. They are not 24 foundation models. The table reports every candidate on the held-out set without reselecting.', '',
 '| Candidate | Validation WPM | Test WPM | Test flagged unsafe | Test intent-matching drafts | Estimated state bytes | Host p95 ms |',
 '| --- | ---: | ---: | ---: | ---: | ---: | ---: |']
for entry in manifest['candidates']:
 name=entry['id'];a=v['validation'][name];b=e['test'][name];p95=b['latency']['p95']
 lines.append(f"| {name} | {f(a['byRegime']['all']['wpm40'])} | {f(b['byRegime']['all']['wpm40'])} | {b['byRegime']['all']['unsafeExposed']} | {b['byRegime']['all']['correctDrafts']}/144 | {round(b['meanBytes'])} | {f(p95) if p95 is not None else '—'} |")
lines += ['', 'The source-pool and selection timing is from warm Chromium on this host, excludes rendering and Android latency, and uses a development-machine clock with coarse resolution. State bytes are the serialized JavaScript state plus portable scorer weights, not peak process memory. The no-aid control does not allocate this model in the product. The low-rank scorers are small ranking models trained on fixed features, not LoRA on a foundation model.', '',
 '## Chronological replay and its limits','',
 'The fixture has 144 train, 144 calibration, 144 validation, and 144 test tasks. The partitions have different synthetic users, proof-family IDs and template wording. The calendar labels are **not strictly disjoint**: adjacent ranges overlap by two days (train 0–11, calibration 10–21, validation 20–31, test 30–41). Users and model state are separate across partitions, but this is not a calendar-held-out result. Tutor prompt/given material, suggested wording, hints, proof/solution text, variable inventories, absent metadata, incorrect labels, and malformed payloads are separate inputs. The tutor payload is normalized by the actual runtime. Candidate generation receives the current cursor, learner anchor, and bounded tutor context at every typed character; it never receives the intended future text. Accepted completions preserve the continuation anchor and are not counted as newly typed evidence.', '',
 'The simulated learner recognizes which displayed choice fits their intended continuation, accepts it with a 45% per-opportunity probability, may request alternatives on a miss, and has a 3% wrong-tap draw when alternatives exist. Most wrong taps are undone. This is a strong oracle-like user assumption; matching events are reported separately from actual accepts. A refresh and every acceptance update the local reward model; other visible choices receive alternate feedback. Direct typing can produce the runtime’s delayed match/divergence and personal-use signals. Declined edits stay excluded for their occurrence. Source and selection gates, not the truth labels, decide what can be shown.', '',
 'The base model is 400 ms per directly typed character and 300 ms per tap. Spelling cases have the same mistyped input and manual repair in the no-aid control. Notation cases use a best-case direct-symbol manual baseline with one keyboard-switch tap; a failed alias conversion pays backspaces and symbol entry. Symbol lookup time is not modeled. Ignored lists are counted separately from displayed-list attention. Invalid proof claims remain the learner’s intended text; truth is an audit label, not a training reward.', '',
 '| Stage | Selected WPM at 40 ms | Manual control WPM | Paired difference (95% user bootstrap) |', '| --- | ---: | ---: | ---: |']
for stage in ('cold','regular','shifted'):
 p=summary['regimePaired'][stage];a=e['test'][winner]['byRegime'][stage]['wpm40'];b=e['test']['off']['byRegime'][stage]['wpm40']
 lines.append(f"| {stage} | {f(a)} | {f(b)} | {f(p['difference'])} ({f(p['ci95'][0])} to {f(p['ci95'][1])}) |")
lines += ['', 'Stages contain different task types, so their WPM values are not a causal learning curve. The paired comparison within a stage uses the same tasks. Twelve profiles and repeated synthetic templates make the intervals illustrative rather than population estimates.', '',
 f"A separate matched validation diagnostic compared retained per-user reward state with a fresh state at each task, using the same tasks and deterministic behavior. Both produced {f(learning['retained']['byRegime']['all']['wpm40'])} WPM at 40 ms attention, with identical recorded behavior. This fixture therefore showed **no incremental benefit from persistence**; the earlier target-informed opportunity experiment is not directly comparable. [Matched learning diagnostic](learning-curve.json)", '',
 'A separate validation-only, all-manual provenance diagnostic found 105 source-backed visible ghost events across 5 of 144 tasks for wording-only; all 105 followed the same authored suggested-wording pattern and matched its simulated intent. All-on had those 105 ghost events plus five source-backed word events. These are repeated prefix opportunities, not 105 independent people or observed accepts. The sealed test trace did not record tutor provenance for each acceptance, so it cannot establish how often a tutor-sourced suggestion was actually accepted. [Provenance diagnostic](provenance.json)', '',
 '## Four surfaces and safety', '',
 'The following is a post-fix regression on previously exposed test cases, not an additional held-out trial.', '',
 '| Surface | Displayed | Accepts | Manual characters before accepts | Typed word-like units before accepts | Net added characters | Acceptance taps | Refreshes | Ignored surface lists | Recovery seconds |',
 '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
surfaces=surfaceDetail['test'][winner]['surfaces']
for name in ('word','ghost','correction','replace'):
 s=surfaces[name];lines.append(f"| {name} | {s['exposed']} | {s['accepted']} | {s['manualCharsBefore']} | {s['manualUnitsBefore']} | {s['remainingChars']} | {s['taps']} | {s['refreshes']} | {s['ignoredLists']} | {f(s['recoverySeconds'],1)} |")
allr=e['test'][winner]['byRegime']['all'];false=[r for r in e['test'][winner]['records'] if r['truth'] is False]
lines += ['', f"The selected test replay had {allr['refreshes']} refreshes, {allr['shownLists']} shown lists, {allr['ignoredLists']} ignored lists, and {f(allr['recoverySeconds'])} modeled recovery seconds overall. A simultaneous refresh or ignored list can count for more than one visible surface, so the surface totals need not equal these global counts. Net added characters can be zero for a shortening replacement; word-like units are whitespace units, not LLM tokens. The whole eligible pool contained a target-matching offer at {allr['oraclePoolMatchingEvents']} observed steps; {allr['visibleMatchingEvents']} visible steps matched. Those counts are not acceptance rates. [Surface-detail regression](surface-detail.json)",
 '',f"All {len(false)} deliberately incorrect proof drafts matched their intended text in this run. There were {allr['badAccepts']} wrong accepts, {allr['retained']} retained wrong accepts, {allr['unsafeExposed']} flagged source/logic/variable exposures, and {allr['logicAccepted']} wrong accepted logic candidates. The audit covers annotated sources, X/Y/Z and a bounded set of branch/method patterns; it is not a proof verifier and zero observed failures is not a safety guarantee.",
 '', f"The same selected configuration in Strict recorded {e['modeSafety']['strict']['byRegime']['all']['unsafeExposed']} flagged exposures. In Faster typing it recorded {e['modeSafety']['fast']['byRegime']['all']['unsafeExposed']}: sampled cases offered `because` after only `b` while the intended word was `believe`. None was accepted as a wrong logic candidate in this seed. The Faster result is a concrete weak-prefix risk; it is not evidence that a full proof was generated.",
 '',f"A targeted connector guard was then added. A post-fix **regression on the previously exposed test tasks**, not a new held-out trial, reduced Faster flagged exposures from {e['modeSafety']['fast']['byRegime']['all']['unsafeExposed']} to {regression['modeSafety']['fast']['byRegime']['all']['unsafeExposed']}; all 24 Balanced aggregate behavior results stayed identical. The original validation selection was not changed. A separate fresh synthetic prefix stress corpus had {fresh['result']['fast']['steps']} steps per mode and found {fresh['result']['fast']['weakConnector']} weak connectors, {fresh['result']['fast']['untypedVariable']} untyped X/Y/Z suggestions, and {fresh['result']['fast']['sourceLeak']} solution-role leaks in Faster; Balanced and Strict were also zero. `I becaus` still produced `because` in Balanced and Faster, while Strict abstained. This small targeted check does not establish universal safety. [Pre-fix engine](tested-engine-pre-fix.ts) · [Regression](regression.json) · [Fresh stress](fresh-connectors.json)",
 '',f"In separate **development** hard-negative probes, raw prefix copying would have exposed {safety['summary']['validation']['rawCopyWouldExpose']}/{safety['summary']['validation']['negativeCases']} validation and {safety['summary']['test']['rawCopyWouldExpose']}/{safety['summary']['test']['negativeCases']} other adversarial continuations. The actual runtime exposed {safety['summary']['validation']['actualTutorLeaks']} and {safety['summary']['test']['actualTutorLeaks']}, respectively, with no measured output-budget violation. These direct probes were inspected before model selection and are not sealed test evidence. [Details](adversarial-safety.json)",
 '', '## Conditional autocorrection', '',
 'The strict global cold-start probe failed every class: each had 246 intended corrections and 22 unintended ones among 268 eligible synthetic calibration examples, giving a 95% Wilson lower bound of 87.9%. The smaller history-development cohort also failed the 98% lower-bound rule. Its point estimates and wider intervals can be consistent with the larger cohort; neither represents real users.', '',
 'A separate preregistered expanded cohort used 1,200 fresh synthetic profiles per class in each calibration and test split, with 40 context families and modeled preference shifts. It fixed k=2 same-pair explicit manual accepts with no intervening undo, dismissal, or partial edit. All four classes passed the synthetic calibration rule. The implementation uses this conditional policy for the owner-requested experimental trial; global cold autocorrection remains closed. Any negative feedback revokes trust, and automatic outcomes do not earn it. Synthetic qualification is not evidence of human precision or authorization for a production release.', '',
 '| Pair | Calibration correct / eligible | Calibration Wilson lower | Held-out correct / eligible | Held-out Wilson lower | Held-out coverage | Whole-population harm |',
 '| --- | ---: | ---: | ---: | ---: | ---: | ---: |']
for c in personal['selected']:
 a=personal['calibration'][c];b=personal['holdoutPersonalProbe'][c]
 lines.append(f"| {c} | {a['correct']}/{a['eligible']} | {100*a['wilson95Lower']:.2f}% | {b['correct']}/{b['eligible']} | {100*b['wilson95Lower']:.2f}% | {100*b['coverage']:.1f}% | {b['incorrect']}/{b['profiles']} |")
lines += ['', 'The [family-cluster bootstrap intervals, shift counts, and full-population baselines](personal-results.json) are reported alongside Wilson bounds. The [three-occurrence cost sensitivity](personal-cost.json) charges the two required cold manual accepts and assumes a one-second undo for each later mistake; it is not a complete session or observed user behavior.', '',
 '## Larger models and reproducibility', '',
 'Six independent fixed-feature models were trained on CPU: pointwise linear, pairwise linear, two MLP sizes, and rank-4/rank-8 factor scorers. Training used only the training partition; validation chose among the 24 configurations. Their actual weights and training sizes are in [models.json](models.json) and [models.pt](models.pt). No future test vocabulary was used to allocate their fixed features.', '',
 'The local Qwen 0.5B and 1.5B Q4 GGUFs were also run on six exploratory prompts each, separately from the main ranking trial. Raw 0.5B output repeated answer/proof content and completed an untyped logic claim; 1.5B also repeated a proof step. These are ungated outputs from a tiny non-blind probe, not an accuracy comparison or a candidate for automatic insertion. [Raw outputs and native token counts](large-model-probe.json)', '',
 'The current runtime admits at most 12 tutor fragments of 240 characters each, up to 16 variables/symbols per fragment, and up to six words / 64 characters for a tutor-derived continuation. The validation-only budget sensitivity replayed 806 all-manual prefixes per configuration. With a 1024-character learner window, zero tutor fragments yielded 31 ghost events and 157 target-matching pool events; up to four yielded 43 and 168; allowing up to twelve gave the same counts in this small fixture. The latter had only 3.72 fragments on average, so it is not a full twelve-fragment stress test. Inputs averaged about 4.15 word-like units, so the 8/16/32-unit comparison cannot establish long-context behavior. Truncating already-eligible ghost text to two versus six word-like units is an offline output-volume probe, not an exposed runtime setting. Character and word-like-unit counts are not model tokens. [Budget sensitivity](budgets.json)', '',
 'A further 144-task cohort with new synthetic user/family IDs and days 100–111 was drafted after reviewing the earlier results. Its replay was stopped before completion, so it supplies **no outcome evidence**. [Unevaluated dataset](fresh-dataset.json) · [Recorded inputs](fresh-protocol.json)', '',
 'Artifacts: [dataset](dataset.json) · [manifest and selection rule](manifest.json) · [training features](train-features.json) · [pre-fix validation](validation-pre-fix.json) · [pre-fix test](evaluation-pre-fix.json) · [paired summary](summary.json) · [autocorrection calibration](autocorrect.json). Dataset, manifest, evaluator, trained scorer and pre-fix engine source hashes are embedded in the results; regression records both engine hashes. The original selection and test require the saved pre-fix source; the current engine can run the labeled regression and fresh connector stress. The supplied GGUF weights remain outside the application bundle.', '',
 'To reproduce the original model study in a separate checkout with the [pre-fix engine](tested-engine-pre-fix.ts), install the project Node dependencies and CPU PyTorch, then run `python scripts/tutor-writing-dataset.py`, `python scripts/tutor-writing-manifest.py`, `node scripts/tutor-writing-extract.mjs`, `python scripts/tutor-writing-fit.py`, `node scripts/tutor-writing-safety.mjs`, `TUTOR_WRITING_PHASE=validation node scripts/tutor-writing-evaluate.mjs`, and only then `TUTOR_WRITING_PHASE=test node scripts/tutor-writing-evaluate.mjs`. The extraction and replay use a local Vite/Chromium session; set `CHROMIUM_PATH` if needed. The tested Python/PyTorch versions are recorded in [models.json](models.json). Avoid overwriting the preserved artifacts when reproducing.']
(OUT/'README.md').write_text('\n'.join(lines)+'\n')
print(json.dumps({'winner':winner,'paired':summary['paired'],'regimes':summary['regimePaired']}))
