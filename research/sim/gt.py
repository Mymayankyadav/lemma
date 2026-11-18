# Ground-truth learner worlds. Time in days. p_* return the TRUE success probability (oracle).
import numpy as np
import fsrs as F
SIG = lambda x: 1 / (1 + np.exp(-x))

class Course:
    def __init__(s, rng, K=24, n_sys=4, cards_per=2, items_per=40):
        s.K = K; s.sys = np.repeat(np.arange(n_sys), K // n_sys)
        s.pre = [[] for _ in range(K)]
        for k in range(1, K):
            m = rng.choice([0, 1, 1, 2]); cand = list(range(max(0, k - 8), k))
            if m: s.pre[k] = [int(x) for x in rng.choice(cand, size=min(m, len(cand)), replace=False)]
        s.beta = rng.normal(0, 0.6, K) + rng.normal(0, 0.4, n_sys)[s.sys]
        s.card_kc = np.repeat(np.arange(K), cards_per)
        s.kc_cards = [list(np.where(s.card_kc == k)[0]) for k in range(K)]
        s.b = [rng.normal(s.beta[k], 0.6, items_per) for k in range(K)]
        s.b_est = [b + rng.normal(0, 0.4, items_per) for b in s.b]   # curator estimate (noisy)

class W1:
    """Two-process cognitive world: ACT-R memory with spacing (Pavlik & Anderson 2005) x execution skill
    that learns most at moderate difficulty and partly decays. Conjunctive prerequisites. Fatigue."""
    def __init__(s, rng, C):
        s.C = C
        s.a = rng.uniform(.15, .25); s.c = rng.uniform(.15, .28); s.tau = rng.normal(-.5, .2); s.s = rng.uniform(.25, .4)
        s.eta = rng.uniform(.06, .14); s.phi = rng.uniform(.1, .4); s.om = rng.uniform(.2, .5); s.Tl = rng.uniform(10, 30)
        mux = rng.normal(-.3, .4); us = rng.normal(0, .5, C.sys.max() + 1)
        s.xd = mux + us[C.sys] - .5 * C.beta + rng.normal(0, .4, C.K); s.xl = np.zeros(C.K); s.xt = np.zeros(C.K)
        s.dc = .4 * C.beta[C.card_kc] + rng.normal(0, .4, len(C.card_kc))
        s.trK = [[] for _ in range(C.K)]; s.trC = [[] for _ in range(len(C.card_kc))]
        s.g, s.sl = .05, .03
    def act(s, tr, t):
        if not tr: return -np.inf
        return np.log(sum(w * max(t - t0, .0035) ** (-d) for t0, w, d in tr))
    def add(s, tr, t, w):
        m = s.act(tr, t); d = min(s.c * np.exp(m) + s.a, .9) if np.isfinite(m) else s.a
        tr.append((t, w, d))
    def Rm(s, tr, t, off=0.):
        m = s.act(tr, t); return 0. if not np.isfinite(m) else SIG((m - s.tau - off) / s.s)
    def x(s, k, t): return s.xd[k] + s.xl[k] * np.exp(-(t - s.xt[k]) / s.Tl)
    def p_att(s, k, b, t, fat):
        pr = np.prod([s.Rm(s.trK[j], t) ** .5 for j in s.C.pre[k]]) if s.C.pre[k] else 1.
        return s.g + (1 - s.g - s.sl) * s.Rm(s.trK[k], t) * pr * SIG(s.x(k, t) - b - s.phi * fat)
    def p_card(s, c, t, fat):
        m = s.act(s.trC[c], t)
        return 0.02 if not np.isfinite(m) else SIG((m - s.tau - s.dc[c]) / s.s - .5 * s.phi * fat)
    def do_att(s, k, b, y, t):
        pe = SIG(s.x(k, t) - b); dx = s.eta * (.3 + 4 * pe * (1 - pe)) * (1 if y else .7)
        s.xl[k] = s.xl[k] * np.exp(-(t - s.xt[k]) / s.Tl) + .4 * dx; s.xt[k] = t; s.xd[k] += .6 * dx
        s.add(s.trK[k], t, 1. if y else .8)
        for j in s.C.pre[k]: s.add(s.trK[j], t, .4)
        for c in s.C.kc_cards[k]: s.add(s.trC[c], t, s.om)
    def do_card(s, c, y, t):
        s.add(s.trC[c], t, 1. if y else .8); s.add(s.trK[s.C.card_kc[c]], t, .3)
    def do_teach(s, k, t):
        s.add(s.trK[k], t, 1.5); s.xd[k] += .4
        for c in s.C.kc_cards[k]: s.add(s.trC[c], t, .7)

class W2:
    """Additive world: compensatory logistic skill with success/failure learning and labile decay;
    cards follow FSRS-6 with learner-specific weights; weak attempt->card transfer. Fatigue."""
    def __init__(s, rng, C):
        s.C = C
        s.w = np.clip(F.W0 * np.exp(rng.normal(0, .15, 21)), F.LB, F.UB)
        s.D0 = np.clip(5 + 1.5 * C.beta[C.card_kc] + rng.normal(0, 1, len(C.card_kc)), 1, 10)
        mux = rng.normal(-.3, .4); us = rng.normal(0, .5, C.sys.max() + 1)
        s.th0 = mux + us[C.sys] - .5 * C.beta + rng.normal(0, .4, C.K) - 2.5   # untaught: very low
        s.Ld = np.zeros(C.K); s.Ll = np.zeros(C.K); s.Lt = np.zeros(C.K); s.Tl = rng.uniform(10, 30)
        s.es = rng.uniform(.10, .2); s.ef = rng.uniform(.05, .12); s.phi = rng.uniform(.1, .4); s.om = rng.uniform(0, .3)
        n = len(C.card_kc); s.S = np.full(n, np.nan); s.D = s.D0.copy(); s.last = np.zeros(n)
    def th(s, k, t): return s.th0[k] + s.Ld[k] + s.Ll[k] * np.exp(-(t - s.Lt[k]) / s.Tl)
    def p_att(s, k, b, t, fat):
        return SIG(s.th(k, t) - b + .5 * sum(min(0., s.th(j, t)) for j in s.C.pre[k]) - s.phi * fat)
    def p_card(s, c, t, fat):
        if np.isnan(s.S[c]): return .02
        r = np.clip(F.R(s.w, t - s.last[c], s.S[c]), 1e-4, 1 - 1e-4)
        return SIG(np.log(r / (1 - r)) - .5 * s.phi * fat)
    def _learn(s, k, t, dL):
        s.Ll[k] = s.Ll[k] * np.exp(-(t - s.Lt[k]) / s.Tl) + .4 * dL; s.Lt[k] = t; s.Ld[k] += .6 * dL
    def do_att(s, k, b, y, t):
        s._learn(k, t, s.es if y else s.ef)
        if y and s.om > 0:
            for c in s.C.kc_cards[k]:
                if not np.isnan(s.S[c]):
                    s.S[c], s.D[c] = s.step(c, t, 3, s.om)
    def step(s, c, t, g, wt=1.):
        ns, nd = F.step(s.w, s.S[c], s.D[c], t - s.last[c], g, wt); s.last[c] = t if wt == 1. else s.last[c]
        return ns, nd
    def do_card(s, c, y, t):
        s.S[c], s.D[c] = F.step(s.w, s.S[c], s.D[c], t - s.last[c], 3 if y else 1); s.last[c] = t
    def do_teach(s, k, t):
        s._learn(k, t, 2.5)
        for c in s.C.kc_cards[k]:
            s.S[c] = F.initS(s.w, 3); s.D[c] = s.D0[c]; s.last[c] = t

WORLDS = {'W1': W1, 'W2': W2}
