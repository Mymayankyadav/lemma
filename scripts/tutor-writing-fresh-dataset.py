#!/usr/bin/env python3
"""New post-fix follow-up users/families, strictly after earlier timestamps."""
import hashlib,json
from pathlib import Path
OUT=Path(__file__).resolve().parents[1]/'docs/implementation/2026-11-21/writing-aid-tutor'
families=[
 ('fresh-odd-successor','successor','n is an odd integer','n plus one is even','n plus one is odd'),
 ('fresh-positive-square','squaring','x is a positive real number','x squared is positive','x squared is negative'),
 ('fresh-rectangle','area','a rectangle has sides three and four','its area is twelve','its area is seven'),
 ('fresh-additive-inverse','cancellation','a is a real number','a plus negative a is zero','a plus negative a is one'),
 ('fresh-subset-transitive','containment','A is inside B and B is inside C','A is inside C','A is not inside C'),
 ('fresh-zero-derivative','differentiation','f is the constant zero function','its derivative is zero','its derivative is one'),
 ('fresh-consecutive','successors','n is an integer','n and its successor are distinct','n equals its successor'),
 ('fresh-reflection','reflection','r is reflection twice across a line','r is the identity','r is constant'),
]
variants=['all','no-context','untrusted-only','missing-inventory','mislabelled-solution','wrong-inventory','malformed','wrong-wording']
writing=['Could you read the {term} more slowly?','Would you show the {term} in words?',
 'I need a clearer explanation of the {term}.','The {term} in the prompt is confusing.']
rows=[]
for user in range(12):
 for step in range(12):
  family,term,given,true,false=families[(user+step)%8]
  kind=('writing','proof-false','proof-true','choice','literal','notation')[step%6]
  if kind=='writing' and user%2:kind='ghost'
  if kind=='literal' and user%2==0:kind='spelling'
  if kind=='writing':text=writing[(user+step)%4].format(term=term)
  elif kind=='ghost':text='Could you repeat the notation more clearly?'
  elif kind=='proof-false':text='My working claim is that '+false+'.'
  elif kind=='proof-true':text='My working claim is that '+true+'.'
  elif kind=='choice':text='I introduced X and Y. I will select X.'
  elif kind=='literal':text='I use the label teh as written.'
  elif kind=='spelling':text='I considered teh wording.'
  else:text='Let eps measure the gap.'
  notation=kind=='notation' and user%2==0
  repair={'source':'eps','target':'ε'} if notation else {'source':'teh','target':'the'} if kind=='spelling' else None
  intent=text.replace(repair['source'],repair['target'],1) if repair else text
  cid=f'fresh-u{user:02d}-t{step:02d}';variant=variants[(user*3+step)%8]
  signals=[{'id':cid+'-p','sourceId':cid+'-reply','role':'prompt','text':f'Consider {given}. Discuss {term}.','variables':['X','Y'],'symbols':['ε']},
   {'id':cid+'-g','sourceId':cid+'-reply','role':'given','text':f'Given that {given}. The term is {term}.','variables':['X','Y'],'symbols':['ε']},
   {'id':cid+'-w','sourceId':cid+'-reply','role':'suggested-wording','text':text if kind=='ghost' else f'Could you explain the {term} in words?','variables':[],'symbols':[]},
   {'id':cid+'-h','sourceId':cid+'-reply','role':'hint','text':f'Think about {term}.','variables':[],'symbols':[]},
   {'id':cid+'-s','sourceId':cid+'-reply','role':'solution','text':f'First use the given information. Therefore {true}.','variables':['X','Y'],'symbols':['⇒']}]
  if variant=='no-context':signals=[]
  if variant=='untrusted-only':signals=signals[3:]
  if variant=='missing-inventory':signals=[{**x,'variables':[],'symbols':[]} for x in signals]
  if variant=='mislabelled-solution':signals[-1]={**signals[-1],'role':'given'}
  if variant=='wrong-inventory':signals[1]={**signals[1],'variables':['Z','Q'],'symbols':['∃','⇒']}
  if variant=='malformed':signals=signals[:2]+[{'id':cid+'-bad','sourceId':cid+'-reply','role':'given','text':'x'*300,'variables':['Z']*20,'symbols':['⇒']*20}]
  if variant=='wrong-wording':signals[2]={**signals[2],'text':f'Therefore {false}. This completes the proof.'}
  rows.append({'id':cid,'split':'fresh-test','family':family,'template':f'fresh-{kind}-{(user+step)%4}',
   'user':f'fresh-user-{user:02d}','time':100+step,'step':step,'regime':'early' if step<6 else 'shifted',
   'kind':kind,'truth':False if kind=='proof-false' else True if kind=='proof-true' else None,
   'initial':'','manualText':text,'intent':intent,'notationGoal':notation,'repair':repair,'given':given,
   'falseClaim':false,'trueClaim':true,'term':term,'contextVariant':variant,
   'tutorContext':{'version':1,'revision':cid+'-rev','signals':signals}})
output={'scope':'New synthetic follow-up drafted after prior results; unseen users and families, later timestamps. Not an independently preregistered trial.',
 'cases':rows}
path=OUT/'fresh-dataset.json';path.write_text(json.dumps(output,indent=2)+'\n')
print(json.dumps({'cases':len(rows),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'minTime':100,'maxTime':111}))
