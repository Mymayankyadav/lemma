#!/usr/bin/env python3
"""Fit six independent CPU rankers on training-only candidate features."""
import hashlib
import json
from pathlib import Path
import random
import time

import torch
from torch import nn

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/implementation/2026-11-21/writing-aid-tutor'
SEED=736021
torch.set_num_threads(2)
torch.manual_seed(SEED)
random.seed(SEED)
data=json.loads((OUT/'train-features.json').read_text())
examples=data['examples']
assert examples and all(row['id'].startswith('train-') for row in examples)
x=torch.tensor([r['x'] for r in examples],dtype=torch.float32)
y=torch.tensor([r['y'] for r in examples],dtype=torch.float32)
assert x.shape[1]==32 and 0<y.sum()<len(y)


class Factor(nn.Module):
 def __init__(self,rank):
  super().__init__();self.base=nn.Linear(32,1);self.a=nn.Linear(32,rank,bias=False);self.b=nn.Linear(32,rank,bias=False)
 def forward(self,z):return self.base(z).squeeze(-1)+(self.a(z)*self.b(z)).sum(dim=1)


def export(model,kind):
 def arr(t):return t.detach().cpu().tolist()
 if kind in ('linear','pairwise-linear'):
  return {'kind':'linear','w':arr(model.weight[0]),'b':float(model.bias[0])}
 if kind.startswith('mlp'):
  return {'kind':'mlp','w1':arr(model[0].weight),'b1':arr(model[0].bias),
          'w2':arr(model[2].weight[0]),'b2':float(model[2].bias[0])}
 return {'kind':'factor','w':arr(model.base.weight[0]),'b':float(model.base.bias[0]),
         'a':arr(model.a.weight),'bFactor':arr(model.b.weight)}


grouped={}
for i,r in enumerate(examples):
 bucket=grouped.setdefault(r['group'],[[],[]]);bucket[r['y']].append(i)
pairs=[]
for negative,positive in grouped.values():
 if negative and positive:
  for pi in positive:
   pairs.append((pi,negative[(pi+SEED)%len(negative)]))
assert pairs, 'No positive/negative training pairs'
pair_index=torch.tensor(pairs,dtype=torch.long)
positive=int(y.sum().item()); negative=len(y)-positive
pos_weight=min(8.,negative/max(1,positive))
models={};states={};training={}
for ordinal,name in enumerate(('linear','pairwise-linear','mlp16','mlp64','factor4','factor8')):
 torch.manual_seed(SEED+ordinal)
 if name in ('linear','pairwise-linear'):model=nn.Linear(32,1)
 elif name.startswith('mlp'):
  hidden=int(name[3:]);model=nn.Sequential(nn.Linear(32,hidden),nn.ReLU(),nn.Linear(hidden,1))
 else:model=Factor(int(name[6:]))
 optimizer=torch.optim.Adam(model.parameters(),lr=.005,weight_decay=.0001)
 start=time.perf_counter(); generator=torch.Generator().manual_seed(SEED+ordinal)
 if name=='pairwise-linear':
  for epoch in range(24):
   order=torch.randperm(len(pair_index),generator=generator)
   for begin in range(0,len(order),1024):
    idx=pair_index[order[begin:begin+1024]]
    difference=model(x[idx[:,0]]).squeeze(-1)-model(x[idx[:,1]]).squeeze(-1)
    loss=nn.functional.softplus(-difference).mean();optimizer.zero_grad();loss.backward();optimizer.step()
 else:
  objective=nn.BCEWithLogitsLoss(pos_weight=torch.tensor(pos_weight))
  for epoch in range(16):
   order=torch.randperm(len(x),generator=generator)
   for begin in range(0,len(order),1024):
    idx=order[begin:begin+1024];loss=objective(model(x[idx]).reshape(-1),y[idx]);optimizer.zero_grad();loss.backward();optimizer.step()
 elapsed=time.perf_counter()-start
 models[name]=export(model,name);states[name]=model.state_dict()
 with torch.no_grad():
  scores=model(x).reshape(-1);training[name]={'seconds':elapsed,'parameters':sum(t.numel() for t in model.parameters()),
      'trainMeanPositiveScore':float(scores[y>0].mean()),'trainMeanNegativeScore':float(scores[y==0].mean())}
 print(name,training[name],flush=True)

checkpoint=OUT/'models.pt'
torch.save({'seed':SEED,'models':states,'features':32,'torch':torch.__version__},checkpoint)
result={'version':1,'seed':SEED,'architecture':'Six independently trained fixed-feature CPU scorers; factor models are low-rank rerankers, not foundation-model LoRA.',
 'trainDatasetSha256':data['datasetSha256'],'engineSources':data['sources'],'trainingExamples':len(examples),'positive':positive,'negative':negative,
 'pairwisePairs':len(pairs),'positiveWeight':pos_weight,'models':models,'training':training,
 'weightsFile':checkpoint.name,'weightsSha256':hashlib.sha256(checkpoint.read_bytes()).hexdigest(),
 'pythonTorch':torch.__version__}
(OUT/'models.json').write_text(json.dumps(result,indent=2)+'\n')
