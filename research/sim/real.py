# Real-data sanity check: prequential log loss on Lemma production attempts (read-only export, de-duplicated).
# Needs the read-only production export (rows.txt, seq.txt), which is not shipped in this pack.
import numpy as np, sys
sys.path.insert(0, '/home/claude/sim2')
from models import History, Beta, V2, LR, KF, Mix, Calib
rows = open('/home/claude/analysis/rows.txt').read().strip().split(';'); seq = open('/home/claude/analysis/seq.txt').read().split()
CON = ['M', 'C', 'I', 'E', 'Z']; SYS = {'M': 0, 'C': 0, 'I': 1, 'E': 1, 'Z': 1}
class RC:
    K = 5; sys = np.array([SYS[c] for c in CON]); pre = [[] for _ in range(5)]; kc_cards = [[] for _ in range(5)]; card_kc = np.zeros(0, int)
ev = []; seen = set()
for r, s in zip(rows, seq):
    f = r.split(','); key = (f[0], f[1], f[2], s[2])
    if key in seen: continue
    seen.add(key); ev.append((int(f[0]) / 86400, CON.index(f[1]), 1 if s[2] == '1' else 0, f[5], f[6]))
t0 = ev[0][0]; ev = [(t - t0, k, y, kd, ss) for t, k, y, kd, ss in ev]
PFA = [6, 7, 8, 9, 13, 14]; DAS = list(range(15))
def mk():
    C = RC()
    return {'beta': Beta(C, {}), 'v2': V2(C, dict(vk=.5, q=.01)), 'pfa': LR(C, dict(cols=PFA, sf=.5, sre=.3)),
            'das': LR(C, dict(cols=DAS, sf=.3, sre=.3)), 'kf': KF(C, dict(al=1., mS=1.)),
            'mix': Mix([V2(C, dict(vk=.5, q=.01)), LR(C, dict(cols=PFA, sf=.5, sre=.3)), LR(C, dict(cols=DAS, sf=.3, sre=.3)), KF(C, dict(al=1., mS=1.))]),
            'mixcal': Calib(Mix([V2(C, dict(vk=.5, q=.01)), LR(C, dict(cols=PFA, sf=.5, sre=.3)), LR(C, dict(cols=DAS, sf=.3, sre=.3)), KF(C, dict(al=1., mS=1.))]))}
M = mk(); H = History(RC()); L = {n: [] for n in M}; taught = set(); lastday = -1; sess = None; sst = 0
for t, k, y, kd, ss in ev:
    day = int(t)
    if day != lastday and lastday >= 0:
        for d in range(lastday, day): [m.day_end(d) for m in M.values()]
    lastday = day
    if ss != sess: sess = ss; sst = t
    if k not in taught:
        taught.add(k); H.teach[k] = t; [m.teach(k, t) for m in M.values()]
    fat = (t - sst) * 24; e = dict(k=k, t=t, b=0., fat=fat, f=H.feats(k, t, fat, 0.))
    for n, m in M.items():
        q = min(max(m.p(e), 1e-4), 1 - 1e-4); L[n].append(-(y * np.log(q) + (1 - y) * np.log(1 - q))); m.upd(e, y)
    H.add_att(k, t, y)
y = np.array([e[2] for e in ev]); print('rows', len(ev), 'clean-pass rate %.3f' % y.mean())
for n, v in L.items(): print(f'{n:7s} log loss {np.mean(v):.3f}  (last half {np.mean(v[len(v)//2:]):.3f})')
