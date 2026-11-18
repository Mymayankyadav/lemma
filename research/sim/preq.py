# Prequential (one-step-ahead) evaluation of all candidates on data from a model-free logging policy.
import numpy as np, sys, pickle, time
import fsrs as F
from gt import Course, WORLDS
from models import History, Beta, V2, LR, KF, GB, Mix, Calib, Card, CardLR, CMix

PFA = [6, 7, 8, 9, 13, 14]; DAS = list(range(15))
def att_specs(stage):
    if stage == 'tune':
        sp = {'beta': (Beta, {})}
        for i, (vk, q) in enumerate([(.25, .005), (.5, .01), (1., .02)]): sp[f'v2_{i}'] = (V2, dict(vk=vk, q=q))
        for sf in (.5, 1, 2):
            for sre in (.3, .7): sp[f'pfa_{sf}_{sre}'] = (LR, dict(cols=PFA, sf=sf, sre=sre))
        for sf in (.3, .7, 1.5):
            for sre in (.3, .7): sp[f'das_{sf}_{sre}'] = (LR, dict(cols=DAS, sf=sf, sre=sre))
        for al in (.5, 1.):
            for mS in (.5, 1., 2.): sp[f'kf_{al}_{mS}'] = (KF, dict(al=al, mS=mS))
        sp['gb_a'] = (GB, dict(lr=.05, leaf=20)); sp['gb_b'] = (GB, dict(lr=.1, leaf=10))
        return sp
    return stage   # dict passed in for test stage

def card_specs():
    sp = {'c_def': {}, 'c_map_.3': dict(kappa=.3), 'c_map_1': dict(kappa=1.)}
    for om in (.2, .4):
        sp[f'c_cpl_{om}'] = dict(couple=om, resid=True)
        for kap in (.3, 1.): sp[f'c_full_{kap}_{om}'] = dict(kappa=kap, couple=om, resid=True)
    for om in (0., .2):
        for kap in (.3, 1.): sp[f'c_rich_{kap}_{om}'] = dict(kappa=kap, couple=om, resid=True, rich=True)
    return sp

def build(spec, C, H):
    if isinstance(spec, tuple):
        cls, hp = spec
        if cls == 'mix': return Mix([build(s, C, H) for s in hp['members']], hp.get('alpha', .02))
        if cls == 'calib': return Calib(build(hp['base'], C, H), hp.get('fat', False))
        return cls(C, hp)
    raise ValueError(spec)

def run(world, seed, aspec, cspec, D=42):
    rng = np.random.default_rng(seed); C = Course(rng); W = WORLDS[world](rng, C); H = History(C)
    A = {n: build(s, C, H) for n, s in aspec.items()}
    def cb(hp):
        if hp.get('mix'): return CMix([cb(h) for h in hp['mix']])
        return CardLR(C, hp) if hp.get('lr') else Card(C, hp)
    Cm = {n: cb(hp) for n, hp in cspec.items()}
    rec = {'att': [], 'card': []}; PA = {n: [] for n in A}; PC = {n: [] for n in Cm}
    w0 = F.W0; cS = np.full(len(C.card_kc), np.nan); cD = np.full(len(C.card_kc), 5.); cL = np.zeros(len(C.card_kc)); due = np.full(len(C.card_kc), np.inf)
    nxt = 0; taught = []; na = 0
    for d in range(D):
        if rng.random() < .12: [m.day_end(d) for m in A.values()]; [m.day_end(d) for m in Cm.values()]; continue
        t0 = d + rng.uniform(.35, .85); mins = [0.]
        T = lambda: t0 + mins[0] / 1440
        def attempt(k):
            nonlocal na
            i = rng.integers(len(C.b[k])); b, be = C.b[k][i], C.b_est[k][i]; t = T(); fat = mins[0] / 60
            ev = dict(k=k, t=t, b=be, fat=fat, f=H.feats(k, t, fat, be))
            pt = W.p_att(k, b, t, fat); y = int(rng.random() < pt)
            for n, m in A.items(): PA[n].append(m.p(ev))
            rec['att'].append((pt, y, fat, na, d, k)); na += 1
            for m in A.values(): m.upd(ev, y)
            for m in Cm.values(): m.att(k, t, y)
            H.add_att(k, t, y); W.do_att(k, b, y, t); mins[0] += rng.lognormal(np.log(8), .3)
        def review(c):
            t = T(); fat = mins[0] / 60; k = C.card_kc[c]; at = np.array(H.at[k])
            ev = dict(c=c, t=t, fat=fat, ka1=int(np.sum(at > t - 1)), ka7=int(np.sum(at > t - 7)), ka30=int(np.sum(at > t - 30)), kai=len(at), tt=t - H.teach[k])
            pt = W.p_card(c, t, fat); y = int(rng.random() < pt)
            for n, m in Cm.items(): PC[n].append(m.pc(ev))
            rec['card'].append((pt, y, fat, len(rec['card']), d, c))
            for m in Cm.values(): m.updc(ev, y)
            for m in A.values():
                if isinstance(m, KF): m.card(k, t, y)
                if isinstance(m, Mix):
                    for mm in m.mem:
                        if isinstance(mm, KF): mm.card(k, t, y)
                if isinstance(m, Calib) and isinstance(m.b, (KF, Mix)):
                    for mm in (m.b.mem if isinstance(m.b, Mix) else [m.b]):
                        if isinstance(mm, KF): mm.card(k, t, y)
            H.add_card(k, y); W.do_card(c, y, t)
            ns, nd = F.step(w0, cS[c], cD[c], t - cL[c], 3 if y else 1); cS[c], cD[c], cL[c] = ns, nd, t
            due[c] = t + max(F.ivl(w0, ns), .5); mins[0] += rng.lognormal(np.log(.75), .3)
        if nxt < C.K:
            k = nxt; nxt += 1; taught.append(k); t = T()
            W.do_teach(k, t); H.teach[k] = t; [m.teach(k, t) for m in A.values()]; [m.teach(k, t) for m in Cm.values()]
            for c in C.kc_cards[k]:
                cS[c] = F.initS(w0, 3); cD[c] = F.initD(w0, 3); cL[c] = t; due[c] = t + F.ivl(w0, cS[c])
            mins[0] += 25
            for _ in range(3): attempt(k)
        cards = [c for k in taught for c in C.kc_cards[k] if due[c] <= d + 1 or rng.random() < .1]
        rng.shuffle(cards)
        for c in cards[:30]: review(c)
        for _ in range(4 if nxt < C.K or d < C.K else 9): attempt(int(rng.choice(taught)))
        [m.day_end(d) for m in A.values()]; [m.day_end(d) for m in Cm.values()]
    return {'att': np.array(rec['att']), 'card': np.array(rec['card']),
            'PA': {n: np.array(v) for n, v in PA.items()}, 'PC': {n: np.array(v) for n, v in PC.items()}}

if __name__ == '__main__':
    world, s0, s1, stage, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5]
    suf = '_c' if stage == 'cards' else ''
    aspec = att_specs('tune') if stage == 'tune' else pickle.load(open(f'test_specs{suf}.pkl', 'rb'))
    cspec = card_specs() if stage == 'tune' else pickle.load(open(f'test_cspecs{suf}.pkl', 'rb'))
    res = []
    for sd in range(s0, s1):
        t = time.time(); res.append(run(world, sd, aspec, cspec)); print(world, sd, f'{time.time()-t:.1f}s', flush=True)
    pickle.dump(res, open(out, 'wb'))
