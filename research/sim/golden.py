"""Golden numerical steps from the supplied Python harness; no production data.

Run: python research/sim/golden.py > tests/unit/adaptive/atlas-v3-golden.json
This checks shared FSRS and ADF likelihood primitives. The full held-out model
selection and end-to-end gates remain the separate preq.py/e2e.py protocol.
"""
import json
import numpy as np
import fsrs as F

runs = []
for seed in (2000, 2001, 2002):
    rng = np.random.default_rng(seed)
    s, d, last, t = float(F.initS(F.W0, 3)), float(F.initD(F.W0, 3)), 0, 0
    rows = []
    for _ in range(20):
        t += int(rng.choice([0, 1, 3, 7]))
        grade = int(rng.choice([1, 2, 3, 4]))
        wt = float(rng.choice([0.2, 0.4, 1.0]))
        ns, nd = F.step(F.W0, s, d, t-last, grade, wt)
        s, d = float(ns), float(nd)
        reset = wt == 1.0
        if reset:
            last = t
        m, v, r, y = float(rng.normal()), float(rng.uniform(0.01, 2)), float(rng.uniform(0.1, 1)), int(rng.integers(2))
        attenuation = 1 / np.sqrt(1 + np.pi*v/8)
        e = 1 / (1 + np.exp(-m*attenuation))
        A = 0.92*r
        p = 0.05 + A*e
        derivative = A*e*(1-e)*attenuation
        rows.append(dict(day=t, grade=grade, weight=wt, reset=reset, s=s, d=d, last=last,
                         m=m, v=v, r=r, y=y, p=float(p),
                         G=float((y-p)*derivative/(p*(1-p))), H=float(derivative**2/(p*(1-p)))))
    runs.append(dict(seed=seed, rows=rows))
print(json.dumps(runs, indent=2))
