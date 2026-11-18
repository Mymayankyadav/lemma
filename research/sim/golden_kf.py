"""Golden stream for the harness KF (models.KF): per-attempt predictions the TypeScript core must reproduce in research mode.

Run: python research/sim/golden_kf.py > tests/unit/adaptive/atlas-v3-kf-golden.json
A small synthetic course (12 KCs in 3 systems, prerequisites), every KC taught once on day 0, then attempts with fatigue and item difficulty and
occasional card reviews. Times are whole days so the TypeScript day-floor and the harness's float days agree. No production data.
"""
import json
import numpy as np
import fsrs as F
from models import KF

class Course:
    def __init__(self, K=12):
        self.K = K; self.sys = np.arange(K) % 3
        self.pre = [[] for _ in range(K)]
        for k in range(3, K): self.pre[k] = [k - 3] + ([k - 2] if k % 2 == 0 and k >= 4 else [])

runs = []
for seed in (2000, 2001, 2002):
    rng = np.random.default_rng(seed); C = Course(); kf = KF(C, dict(al=1., mS=1.))
    events, preds = [], []
    for k in range(C.K): kf.teach(k, 0.); events.append(dict(kind='teach', k=k, t=0))
    for d in range(40):
        for _ in range(int(rng.integers(3, 7))):
            k = int(rng.integers(C.K)); fat = round(float(rng.uniform(0, 10)), 3); b = round(float(rng.normal(0, .5)), 3)
            ev = dict(k=k, t=float(d), fat=fat, b=b)
            p = kf.p(ev); y = int(rng.random() < .6)
            kf.upd(ev, y); events.append(dict(kind='attempt', k=k, t=d, fat=fat, b=b, y=y)); preds.append(float(p))
        if d % 3 == 2:
            for k in rng.choice(C.K, 2, replace=False):
                y = int(rng.random() < .7); kf.card(int(k), float(d), y); events.append(dict(kind='card', k=int(k), t=d, y=y))
    runs.append(dict(seed=seed, K=C.K, sys=[int(x) for x in C.sys], pre=C.pre, events=events, p=preds))
print(json.dumps(runs))
