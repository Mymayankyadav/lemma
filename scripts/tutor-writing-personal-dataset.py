#!/usr/bin/env python3
"""Preregister and generate fresh synthetic users for a fixed personal gate."""
import hashlib
import json
from pathlib import Path

OUT=Path(__file__).resolve().parents[1]/'docs/implementation/2026-11-21/writing-aid-tutor'
OUT.mkdir(parents=True,exist_ok=True)
SEED=4029931
N=1200
protocol={'seed':SEED,'usersPerClassPerSplit':N,'splits':['calibration','test'],'familiesPerSplit':40,
 'rule':'Last two same-pair attempts were explicit manual accepts, neither undone nor edited. Apply only after actual deterministic prose gate.',
 'selection':'Choose k=2 per class only if calibration has at least 200 eligible distinct users and Wilson 95% lower precision >=0.98; do not change k after inspecting test.',
 'report':'Held-out coverage, whole-population harmful correction rate, conditional precision, Wilson and family-cluster bootstrap; synthetic evidence is not human precision.',
 'generativeAssumptions':'Family-dependent intention, behavior shift and acceptance noise; independent pseudo-random users conditional on family, with shared family context.'}
(OUT/'personal-protocol.json').write_text(json.dumps(protocol,indent=2)+'\n')

def draw(*parts):
 return int.from_bytes(hashlib.sha256('/'.join(map(str,(SEED,)+parts)).encode()).digest()[:8],'big')/2**64

pairs=[('teh','the'),('recieve','receive'),('recieved','received'),('seperate','separate')]
topics=['garden','letter','meeting','picture','journey','collection','journal','painting','story','music',
 'archive','library','market','festival','kitchen','village','calendar','message','parcel','museum',
 'exhibition','bookcase','window','project','lesson','notebook','photograph','chapter','envelope','orchard',
 'forest','seaside','painting','theatre','river','concert','workshop','school','review','discussion']
leads=['In','After','Before','During','Inside','Beside','Near','Regarding','Considering','While reading']
actions=['I wrote','we noticed','I copied']
rows=[]
for split in ('calibration','test'):
 for typo,replacement in pairs:
  for i in range(N):
   family=i%40; template=i//40
   family_intent=.055+.005*(family%19)
   family_shift=.004+.002*(family%20)
   intentional=draw(split,typo,i,'intentional')<family_intent
   shifted=draw(split,typo,i,'shift')<family_shift
   prior_wanted=(not intentional)!=shifted
   accept_rate=(.84+.15*draw(split,typo,i,'accept-rate')) if prior_wanted else (.03+.22*draw(split,typo,i,'accept-rate'))
   undo_rate=(.005+.045*draw(split,typo,i,'undo-rate')) if prior_wanted else (.25+.60*draw(split,typo,i,'undo-rate'))
   history=[]
   for attempt in range(6):
    accepted=draw(split,typo,i,attempt,'accept')<accept_rate
    undo=accepted and draw(split,typo,i,attempt,'undo')<undo_rate
    history.append({'at':attempt,'pair':typo+'->'+replacement,'action':'manual-accept' if accepted else 'dismiss',
                    'undo':undo,'partialEdit':False})
   literal=draw(split,typo,i,'literal')<.045
   math=draw(split,typo,i,'math')<.06
   lead=leads[template//3]; action=actions[template%3]; topic=topics[family]
   before=f'{lead} the {topic} {action} '
   if literal:before=f'The literal named token near the {topic} is '
   if math:before='For x = 2, '+before
   rows.append({'id':f'{split}-{typo}-{i:04d}','split':split,'class':typo+'->'+replacement,
    'user':f'{split}-{typo}-user-{i:04d}','family':f'{split}-family-{family:02d}',
    'draft':before+typo,'intent':before+(typo if intentional else replacement),
    'intentional':intentional,'preferenceShift':shifted,'literal':literal,'math':math,'history':history})
(OUT/'personal-dataset.json').write_text(json.dumps({'protocol':'personal-protocol.json','cases':rows},separators=(',',':'))+'\n')
print(json.dumps({'rows':len(rows),'perClassPerSplit':N,'familiesPerSplit':40}))
