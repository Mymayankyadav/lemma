# End-to-end: same learner, course, availability; policies differ only in what they do with the minutes.
import numpy as np, sys, pickle, time, copy
import fsrs as F
from gt import Course, WORLDS
from models import V2, KF, Card, probit, SIG
TEXAM = 42.5; K_UTIL = (.6, .4)

def availability(seed, D=42):
    r = np.random.default_rng(seed + 777); al = r.normal(1.2, .5); z = 0.; prev = 1; out = []
    for d in range(D):
        M = 120. if d % 7 >= 5 else 90.; z = .8 * z + r.normal(0, .4)
        att = int(r.random() < SIG(al + .5 * prev - .5 * np.log(M / 60) + z)); prev = att
        out.append(att * min(M * np.exp(r.normal(-.1, .25)), 1.5 * M))
    return out

def deps(C):
    dp = [[] for _ in range(C.K)]
    for k in range(C.K):
        for j in C.pre[k]: dp[j].append(k)
    return dp

def true_score(W, C):
    ps = np.mean([W.p_att(k, C.beta[k], TEXAM, 0.) for k in range(C.K)])
    pc = np.mean([W.p_card(c, TEXAM, 0.) for c in range(len(C.card_kc))])
    return K_UTIL[0] * ps + K_UTIL[1] * pc, ps, pc

# ---------- local snapshots of the TRUE world (oracle look-ahead) ----------
def snap(W, ks, cs):
    if hasattr(W, 'trK'):
        return ('W1', {k: (list(W.trK[k]), W.xd[k], W.xl[k], W.xt[k]) for k in ks}, {c: list(W.trC[c]) for c in cs})
    return ('W2', {k: (W.Ld[k], W.Ll[k], W.Lt[k]) for k in ks}, {c: (W.S[c], W.D[c], W.last[c]) for c in cs})
def restore(W, sn):
    tag, kk, cc = sn
    for k, v in kk.items():
        if tag == 'W1': W.trK[k], W.xd[k], W.xl[k], W.xt[k] = list(v[0]), v[1], v[2], v[3]
        else: W.Ld[k], W.Ll[k], W.Lt[k] = v
    for c, v in cc.items():
        if tag == 'W1': W.trC[c] = list(v)
        else: W.S[c], W.D[c], W.last[c] = v

class Run:
    def __init__(s, world, seed, policy, hp):
        s.rng = np.random.default_rng(seed); s.C = Course(s.rng); s.W = WORLDS[world](s.rng, s.C); s.dep = deps(s.C)
        s.orng = np.random.default_rng(seed + 99); s.pol = policy; s.avail = availability(seed); s.hp = hp
        s.taught = []; s.nxt = 0; s.na = s.nr = 0; nc = len(s.C.card_kc)
        s.kfs = [KF(s.C, dict(hp['kf'], wc=0.)), KF(s.C, dict(hp['kf'], wc=.3))]; s.kw = np.array([.5, .5]); s.kf = s.kfs[1]
        s.v2 = V2(s.C, hp['v2'])
        s.card = Card(s.C, hp['card'] if policy in ('P2', 'P2C') else {})
        s.bbar = np.array([np.mean(b) for b in s.C.b_est]); s.lastp = np.zeros(s.C.K); s.rech = {}
    # ---- model-side predictions ----
    def kf_ps(s, k, T):   # KF predicted P(solve standard item) at time T
        A = (1 - s.kf.g - s.kf.sl) * s.kf.R(k, T) ** s.kf.al * np.prod([s.kf.R(j, T) ** s.kf.ap for j in s.C.pre[k]])
        sy = s.C.sys[k]; m = s.kf.mm[0] + s.kf.sm[sy] + s.kf.km[k] + s.kf.lm[0] * np.log1p(s.kf.n[k]) - s.bbar[k]
        V = s.kf.mv[0] + s.kf.sv[sy] + s.kf.kv[k] + s.kf.lv[0] * np.log1p(s.kf.n[k]) ** 2
        return s.kf.g + A * probit(m, V)
    def card_RT(s, c): return 0. if np.isnan(s.card.S[c]) else float(F.R(s.card.w, TEXAM - s.card.L[c], s.card.S[c]))
    # ---- actions ----
    def item(s, k, t, fat, target):
        idx = s.rng.integers(len(s.C.b[k]), size=8)
        if target is None: return idx[0]
        if target == 'oracle': ps = [s.W.p_att(k, s.C.b[k][i], t, fat) for i in idx]; tgt = .8
        else:
            ps = []
            for i in idx:
                ev = dict(k=k, t=t, b=s.C.b_est[k][i], fat=fat)
                ps.append(s.pkf(ev) if target == 'kf' else s.v2.p(ev)); tgt = .8 if target == 'kf' else .85
        return idx[int(np.argmin(np.abs(np.array(ps) - tgt)))]
    def attempt(s, k, t, fat, target=None):
        i = s.item(k, t, fat, target); b, be = s.C.b[k][i], s.C.b_est[k][i]
        ev = dict(k=k, t=t, b=be, fat=fat); pk = np.array([m.p(ev) for m in s.kfs]); s.v2.p(ev)
        y = int(s.orng.random() < s.W.p_att(k, b, t, fat))
        s.kw = s.kw * np.where(y, pk, 1 - pk); s.kw /= s.kw.sum()
        [m.upd(ev, y) for m in s.kfs]; s.v2.upd(ev, y); s.card.att(k, t, y); s.W.do_att(k, b, y, t); s.na += 1; s.lastp[k] = t
        return s.rng.lognormal(np.log(8), .3)
    def review(s, c, t, fat):
        ev = dict(c=c, t=t, fat=fat, ka7=0); s.card.pc(ev); k = s.C.card_kc[c]
        y = int(s.orng.random() < s.W.p_card(c, t, fat)); s.card.updc(ev, y); [m.card(k, t, y) for m in s.kfs]; s.W.do_card(c, y, t); s.nr += 1
        return s.rng.lognormal(np.log(.75), .3)
    # ---- knowledge-gradient gains ----
    def pkf(s, ev): return float(s.kw @ np.array([m.p(ev) for m in s.kfs]))
    def gain_model(s, a, t, fat):   # Bayes-averaged over coupling hypotheses
        g = 0.
        for wi, m in zip(s.kw, s.kfs): s.kf = m; g += wi * s.gain_one(a, t, fat)
        return g
    def gain_one(s, a, t, fat):
        kind, x = a
        if kind == 'att':
            k = x; aff = [k] + s.dep[k]; base = sum(s.kf_ps(j, TEXAM) for j in aff) * K_UTIL[0] / s.C.K
            cards = s.C.kc_cards[k]; cb = sum(s.card_RT(c) for c in cards) * K_UTIL[1] / len(s.C.card_kc)
            i = s.item(k, t, fat, 'kf'); ev = dict(k=k, t=t, b=s.C.b_est[k][i], fat=fat); p = s.kf.p(ev)
            sv = (s.kf.S.copy(), s.kf.D.copy(), s.kf.L.copy(), s.kf.n.copy()); cv = (s.card.S.copy(), s.card.D.copy())
            out = 0.
            for y, py in ((1, p), (0, 1 - p)):
                s.kf.p(ev)
                # memory/learning part of the update only (ability mean change has zero expectation)
                if y:
                    s.kf.mem(k, t, 3, 1.); [s.kf.mem(j, t, 3, s.kf.hp.get('wp', .4)) for j in s.C.pre[k]]
                else:
                    r = min(max((1 - s.kf._Rk ** s.kf.al) * (1 - s.kf.g) / (1 - s.kf._P), 0), 1); s.kf.mem(k, t, 1, r); s.kf.mem(k, t, 3, 1 - r)
                if not np.isnan(s.kf.S[k]): s.kf.L[k] = t
                s.kf.n[k] += 1
                if y and s.card.om > 0:
                    for c in cards:
                        if not np.isnan(s.card.S[c]):
                            ns, nd = F.step(s.card.w, s.card.S[c], s.card.D[c], t - s.card.L[c], 3, s.card.om); s.card.S[c] = float(ns)
                u = sum(s.kf_ps(j, TEXAM) for j in aff) * K_UTIL[0] / s.C.K + sum(s.card_RT(c) for c in cards) * K_UTIL[1] / len(s.C.card_kc)
                out += py * u
                s.kf.S, s.kf.D, s.kf.L, s.kf.n = sv[0].copy(), sv[1].copy(), sv[2].copy(), sv[3].copy(); s.card.S, s.card.D = cv[0].copy(), cv[1].copy()
            return (out - base - cb) / 8.
        c = x; k = s.C.card_kc[c]; aff = [k] + s.dep[k]
        base = s.card_RT(c) * K_UTIL[1] / len(s.C.card_kc) + sum(s.kf_ps(j, TEXAM) for j in aff) * K_UTIL[0] / s.C.K
        r = float(np.clip(F.R(s.card.w, t - s.card.L[c], s.card.S[c]), 1e-4, 1)); out = 0.
        sv = (s.kf.S.copy(), s.kf.D.copy())
        for y, py in ((1, r), (0, 1 - r)):
            ns, nd = F.step(s.card.w, s.card.S[c], s.card.D[c], t - s.card.L[c], 3 if y else 1)
            rt = float(F.R(s.card.w, TEXAM - t, ns)); s.kf.mem(k, t, 3 if y else 1, s.kf.hp.get('wc', .3))
            out += py * (rt * K_UTIL[1] / len(s.C.card_kc) + sum(s.kf_ps(j, TEXAM) for j in aff) * K_UTIL[0] / s.C.K)
            s.kf.S, s.kf.D = sv[0].copy(), sv[1].copy()
        return (out - base) / .75
    def gain_oracle(s, a, t, fat):
        kind, x = a; C = s.C
        if kind == 'att':
            k = x; ks = set([k] + C.pre[k] + s.dep[k] + [d for j in C.pre[k] for d in s.dep[j]]); cs = C.kc_cards[k]
            i = s.item(k, t, fat, 'oracle'); b = C.b[k][i]; p = s.W.p_att(k, b, t, fat); dur = 8.
            act = lambda y: s.W.do_att(k, b, y, t)
        else:
            c = x; k = C.card_kc[c]; ks = set([k] + s.dep[k]); cs = [c]; p = s.W.p_card(c, t, fat); dur = .75
            act = lambda y: s.W.do_card(c, y, t)
        U = lambda: (K_UTIL[0] * sum(s.W.p_att(j, C.beta[j], TEXAM, 0.) for j in ks) / C.K +
                     K_UTIL[1] * sum(s.W.p_card(cc, TEXAM, 0.) for cc in cs) / len(C.card_kc))
        base = U(); sn = snap(s.W, ks, cs); out = 0.
        for y, py in ((1, p), (0, 1 - p)):
            act(y); out += py * U(); restore(s.W, sn)
        return (out - base) / dur
    # ---- day loop ----
    def day(s, d):
        mins = s.avail[d]
        if mins <= 0: return
        t0 = d + .6; used = [0.]; C = s.C
        T = lambda: t0 + used[0] / 1440; fat = lambda: used[0] / 60
        if s.nxt < C.K and mins >= 30:
            k = s.nxt; s.nxt += 1; s.taught.append(k); t = T()
            s.W.do_teach(k, t); [m.teach(k, t) for m in s.kfs]; s.v2.teach(k, t); s.card.teach(k, t); used[0] += 25
            gap = min(max(.15 * (42 - d), 1), 7) if s.pol == 'P1' else 2
            s.rech.setdefault(int(d + np.ceil(gap)), []).append(k)
            if s.pol in ('P0', 'P1'):
                n = 0
                while n < (3 if s.pol == 'P0' else 4) and used[0] + 8 < mins:
                    used[0] += s.attempt(k, T(), fat(), None if s.pol == 'P0' else 'v2'); n += 1
                    if s.pol == 'P1' and s.v2.p(dict(k=k, t=T(), b=s.bbar[k], fat=0.)) >= .85: break
        if s.pol in ('P0', 'P1'):
            for k in s.rech.pop(d, []):
                if used[0] + 8 < mins: used[0] += s.attempt(k, T(), fat(), None if s.pol == 'P0' else 'v2')
            budget = mins * (.25 if s.pol == 'P0' else .125); spent = 0.
            taughtc = [c for k in s.taught for c in C.kc_cards[k]]
            if s.pol == 'P0':
                due = [c for c in taughtc if F.R(s.card.w, T() - s.card.L[c], s.card.S[c]) <= .9]
            else:
                pr = [((.9 - s.card_RT(c)), c) for c in taughtc if F.R(s.card.w, T() - s.card.L[c], s.card.S[c]) <= .9 or s.card_RT(c) < .8]
                due = [c for v, c in sorted(pr, reverse=True) if v > 0]
            for c in due:
                if spent > budget or used[0] + 1 > mins: break
                dt = s.review(c, T(), fat()); used[0] += dt; spent += dt
            while used[0] + 8 < mins and s.taught:
                if s.pol == 'P0': k = min(s.taught, key=lambda j: s.lastp[j])
                else:
                    tt = np.log(.85 / .15); best = None
                    for j in s.taught:
                        sy = C.sys[j]; m = s.v2.mm[0] + s.v2.sm[sy] + s.v2.km[j] - s.bbar[j]; sd = np.sqrt(s.v2.mv[0] + s.v2.sv[sy] + s.v2.kv[j])
                        z = abs(m - tt) / sd; from scipy.stats import norm
                        pr = sd * (norm.pdf(z) - z * (1 - norm.cdf(z)))
                        if best is None or pr > best[0]: best = (pr, j)
                    k = best[1]
                used[0] += s.attempt(k, T(), fat(), None if s.pol == 'P0' else 'v2')
            return
        # P2 / ORACLE: greedy knowledge-gradient per minute over practice and review actions
        cap = mins * .125 if s.pol == 'P2C' else np.inf; cspent = 0.; model = s.pol in ('P2', 'P2C')
        while used[0] + 1 < mins and s.taught:
            t = T(); f = fat()
            acts = [('att', k) for k in s.taught] if used[0] + 8 < mins else []
            if cspent < cap:
                cc = [c for k in s.taught for c in C.kc_cards[k]]
                key = (lambda c: s.W.p_card(c, TEXAM, 0.)) if s.pol == 'ORACLE' else s.card_RT
                cc = sorted(cc, key=key)[:12]
                acts += [('card', c) for c in cc if key(c) < .98]
            if not acts: break
            g = [(s.gain_model if model else s.gain_oracle)(a, t, f) for a in acts]
            kind, x = acts[int(np.argmax(g))]
            if kind == 'att': used[0] += s.attempt(x, t, f, 'kf' if model else 'oracle')
            else: dt = s.review(x, t, f); used[0] += dt; cspent += dt

def run(world, seed, policy, hp):
    R = Run(world, seed, policy, hp)
    for d in range(42): R.day(d)
    sc, ps, pc = true_score(R.W, R.C)
    return dict(score=sc, ps=ps, pc=pc, na=R.na, nr=R.nr, mins=sum(R.avail))

if __name__ == '__main__':
    world, s0, s1, out = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
    hp = pickle.load(open('e2e_hp.pkl', 'rb')); res = []
    for sd in range(s0, s1):
        row = {}
        for pol in ('P0', 'P1', 'P2', 'P2C', 'ORACLE'):
            t = time.time(); row[pol] = run(world, sd, pol, hp); row[pol]['sec'] = time.time() - t
        res.append(row); print(world, sd, {p: round(v['score'], 3) for p, v in row.items()}, flush=True)
    pickle.dump(res, open(out, 'wb'))
