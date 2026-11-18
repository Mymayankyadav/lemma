"""Exports the logging-policy stream of preq.py (one learner, one world) with the oracle probabilities, for scoring the TypeScript core on the same data.

    python3 export_stream.py W1 2000 stream_W1_2000.json

The generation mirrors preq.run (same rng draws in the same order); only the recording differs. No production data.
"""
import json, sys
import numpy as np
import fsrs as F
from gt import Course, WORLDS

def export(world, seed, D=42):
    rng = np.random.default_rng(seed); C = Course(rng); W = WORLDS[world](rng, C)
    ev = []; w0 = F.W0
    cS = np.full(len(C.card_kc), np.nan); cD = np.full(len(C.card_kc), 5.); cL = np.zeros(len(C.card_kc)); due = np.full(len(C.card_kc), np.inf)
    at = [[] for _ in range(C.K)]; nxt = 0; taught = []
    for d in range(D):
        if rng.random() < .12: continue
        t0 = d + rng.uniform(.35, .85); mins = [0.]
        T = lambda: t0 + mins[0] / 1440
        def attempt(k):
            i = rng.integers(len(C.b[k])); b, be = C.b[k][i], C.b_est[k][i]; t = T(); fat = mins[0] / 60
            pt = W.p_att(k, b, t, fat); y = int(rng.random() < pt)
            ev.append(dict(kind='attempt', k=int(k), t=float(t), b=float(be), fat=float(fat), y=y, p=float(pt))); at[k].append(t)
            W.do_att(k, b, y, t); mins[0] += rng.lognormal(np.log(8), .3)
        def review(c):
            t = T(); fat = mins[0] / 60; k = C.card_kc[c]
            pt = W.p_card(c, t, fat); y = int(rng.random() < pt)
            ev.append(dict(kind='card', k=int(k), c=int(c), t=float(t), y=y)); W.do_card(c, y, t)
            ns, nd = F.step(w0, cS[c], cD[c], t - cL[c], 3 if y else 1); cS[c], cD[c], cL[c] = ns, nd, t
            due[c] = t + max(F.ivl(w0, ns), .5); mins[0] += rng.lognormal(np.log(.75), .3)
        if nxt < C.K:
            k = nxt; nxt += 1; taught.append(k); t = T()
            W.do_teach(k, t); ev.append(dict(kind='teach', k=int(k), t=float(t)))
            for c in C.kc_cards[k]:
                cS[c] = F.initS(w0, 3); cD[c] = F.initD(w0, 3); cL[c] = t; due[c] = t + F.ivl(w0, cS[c])
            mins[0] += 25
            for _ in range(3): attempt(k)
        cards = [c for k in taught for c in C.kc_cards[k] if due[c] <= d + 1 or rng.random() < .1]
        rng.shuffle(cards)
        for c in cards[:30]: review(c)
        for _ in range(4 if nxt < C.K or d < C.K else 9): attempt(int(rng.choice(taught)))
    return dict(world=world, seed=seed, K=int(C.K), sys=[int(x) for x in C.sys], pre=[[int(j) for j in p] for p in C.pre], cards=[dict(c=i, k=int(k)) for i, k in enumerate(C.card_kc)], events=ev)

if __name__ == '__main__':
    json.dump(export(sys.argv[1], int(sys.argv[2])), open(sys.argv[3], 'w'))
