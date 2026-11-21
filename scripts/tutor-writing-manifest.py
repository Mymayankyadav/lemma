#!/usr/bin/env python3
"""Write the model manifest and selection rule before opening test results."""
import json
from pathlib import Path

out=Path(__file__).resolve().parents[1]/'docs/implementation/2026-11-21/writing-aid-tutor'
out.mkdir(parents=True,exist_ok=True)
rows=[
 ('off','control','none'),('random','control','all'),('static','control','none'),
 ('frequency','online reward','none'),('contextual','production online reward','none'),('online-rank4','online low-rank','none'),
 ('tutor-none','source ablation','none'),('tutor-terms','source ablation','terms'),
 ('tutor-wording','source ablation','wording'),('tutor-symbols','source ablation','symbols'),
 ('tutor-terms-wording','source ablation','terms-wording'),('tutor-terms-symbols','source ablation','terms-symbols'),
 ('tutor-wording-symbols','source ablation','wording-symbols'),('tutor-all','source ablation','all'),
 ('tutor-prompt-first','source-weight variant','all'),('tutor-given-first','source-weight variant','all'),
 ('tutor-repeat','source-count variant','all'),('tutor-learner','learner/source-weight variant','all'),
 ('linear','trained CPU model','all'),('pairwise-linear','trained CPU model','all'),
 ('mlp16','trained CPU model','all'),('mlp64','trained CPU model','all'),
 ('factor4','trained CPU low-rank model','all'),('factor8','trained CPU low-rank model','all'),
]
assert len(rows)==24 and len({x[0] for x in rows})==24
result={'version':1,'seed':736021,'candidates':[{'id':a,'family':b,'contextFlags':c} for a,b,c in rows],
 'selectionRule':{'stage':'Validation families and users only, after independent training and calibration.',
   'priority':['Exclude any candidate with a tutor proof/solution leak or uncommitted logic/operand exposure in validation.',
               'Exclude any automatic correction class lacking >=200 calibration examples and Wilson 95% lower precision >=0.98.',
               'Among remaining candidates, maximize modeled WPM at 40ms per observed list.',
               'Within 0.10 WPM prefer lower stored bytes, then manifest order.'],
   'test':'Run the frozen selected candidate once on held-out test users, tasks and proof families; report all candidates for comparison but do not reselect on test.',
   'note':'Manual control has the same spelling-error/recovery trajectory; notation uses a best-case direct-symbol route and one switch tap. Zero observed validation failures is not proof of logical safety; random coin is a control, not a safety strategy.'}}
(out/'manifest.json').write_text(json.dumps(result,indent=2)+'\n')
print('Wrote 24-candidate manifest and validation-only selection rule')
