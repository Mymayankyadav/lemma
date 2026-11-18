# Candidate predictors. Attempt models: p(ev) then upd(ev, y). Card models: pc(ev) then updc(ev, y).
import numpy as np
from scipy.optimize import minimize
import fsrs as F
SIG = lambda x: 1 / (1 + np.exp(-np.clip(x, -30, 30)))
def probit(m, V): return SIG(m / np.sqrt(1 + np.pi * V / 8))
WIN = (1, 7, 30, 1e9)

class History:
    """Shared, model-free event history + DAS3H-style features (computed once per event)."""
    def __init__(s, C):
        s.C = C; s.at = [[] for _ in range(C.K)]; s.ay = [[] for _ in range(C.K)]
        s.cs = np.zeros(C.K); s.cf = np.zeros(C.K); s.teach = np.full(C.K, np.nan)
    def feats(s, k, t, fat, b):
        ts = np.array(s.at[k]); ys = np.array(s.ay[k]); f = []
        for w in WIN:
            m = ts > t - w if len(ts) else np.zeros(0, bool)
            f += [np.log1p(ys[m].sum() if len(ts) else 0), np.log1p(m.sum())]
        pre = s.C.pre[k]
        f += [np.mean([np.log1p(sum(s.ay[j])) for j in pre]) if pre else 0.,
              np.mean([np.log1p(len(s.ay[j])) for j in pre]) if pre else 0.]
        f += [np.log1p(s.cs[k]), np.log1p(s.cf[k]), np.log1p(max(t - s.teach[k], 0) if np.isfinite(s.teach[k]) else 0)]
        f += [b, fat]
        return np.array(f)          # 15 features
    def add_att(s, k, t, y): s.at[k].append(t); s.ay[k].append(y)
    def add_card(s, k, y): (s.cs if y else s.cf)[k] += 1

def adf(comps, m, V, x, G, H):
    """Gaussian ADF / one Newton step. comps: list of (arr_m, arr_v, idx, feature x_c)."""
    den = 1 + V * H
    for am, av, i, xc in comps:
        vc = av[i]; am[i] += vc * xc * G / den; av[i] = max(vc - (vc * xc) ** 2 * H / den, 1e-4)

class Beta:
    def __init__(s, C, hp): s.s = np.zeros(C.K); s.n = np.zeros(C.K)
    def p(s, ev): k = ev['k']; return (1 + s.s[k]) / (2 + s.n[k])
    def upd(s, ev, y): k = ev['k']; s.s[k] += y; s.n[k] += 1
    def teach(s, k, t): pass
    def day_end(s, d): pass

class V2:
    """Previous pack: hierarchical Gaussian logit (learner, system, KC) - b, noisy-AND over required prereqs (demand -1),
    ADF updates with blame shares, variance aging, instruction bump. Measurement only (no learning term)."""
    def __init__(s, C, hp):
        s.C = C; ns = C.sys.max() + 1; s.hp = hp
        s.mm = np.zeros(1); s.mv = np.full(1, hp.get('vmu', 1.))
        s.sm = np.zeros(ns); s.sv = np.full(ns, hp.get('vs', .25))
        s.km = np.zeros(C.K); s.kv = np.full(C.K, hp.get('vk', .5)); s.last = np.zeros(C.K)
    def tag(s, j, t):
        q = s.hp.get('q', .01); s.kv[j] = min(s.kv[j] + q * max(t - s.last[j], 0), s.hp.get('vk', .5)); s.last[j] = t
        sy = s.C.sys[j]
        return s.mm[0] + s.sm[sy] + s.km[j], s.mv[0] + s.sv[sy] + s.kv[j], [(s.mm, s.mv, 0, 1.), (s.sm, s.sv, sy, 1.), (s.km, s.kv, j, 1.)]
    def _tags(s, ev):
        k, t = ev['k'], ev['t']; out = []
        m, V, c = s.tag(k, t); out.append((m - ev['b'], V, c))
        for j in s.C.pre[k]:
            m, V, c = s.tag(j, t); out.append((m + 1., V, c))
        return out
    def p(s, ev):
        s._c = s._tags(ev); s._p = [probit(m, V) for m, V, _ in s._c]; return float(np.prod(s._p))
    def upd(s, ev, y):
        P = np.prod(s._p)
        for (m, V, c), pj in zip(s._c, s._p):
            w = 1. if y else min(max((1 - pj) / max(1 - P, 1e-6), 0), 1)
            adf(c, m, V, 1., w * (y - pj), w * pj * (1 - pj))
    def teach(s, k, t): s.kv[k] = min(s.kv[k] + .5, s.hp.get('vk', .5)); s.last[k] = t
    def day_end(s, d): pass

class LR:
    """MAP logistic regression on History features (PFA = counts; DAS3H = windowed counts + cross-type), KC & system
    random effects. Refit nightly (L-BFGS, analytic gradient)."""
    def __init__(s, C, hp):
        s.C = C; s.cols = hp['cols']; s.sf = hp.get('sf', 1.); s.sre = hp.get('sre', .5)
        s.ns = C.sys.max() + 1; nf = len(s.cols); s.nf = nf
        s.X = []; s.Y = []; s.K = []; s.beta = np.zeros(1 + nf + C.K + s.ns)
        s.mu0 = np.zeros_like(s.beta); s.sd0 = np.full_like(s.beta, s.sf); s.sd0[0] = 2.
        bi = s.cols.index(13) if 13 in s.cols else None
        if bi is not None: s.mu0[1 + bi] = -1.; s.sd0[1 + bi] = .5
        s.sd0[1 + nf:] = s.sre; s.beta = s.mu0.copy()
    def lin(s, x, k): return s.beta[0] + x @ s.beta[1:1 + s.nf] + s.beta[1 + s.nf + k] + s.beta[1 + s.nf + s.C.K + s.C.sys[k]]
    def p(s, ev): s._x = ev['f'][s.cols]; return float(SIG(s.lin(s._x, ev['k'])))
    def upd(s, ev, y): s.X.append(s._x); s.Y.append(y); s.K.append(ev['k'])
    def teach(s, k, t): pass
    def day_end(s, d):
        if len(s.Y) < 5: return
        X = np.array(s.X); Y = np.array(s.Y, float); K = np.array(s.K); n = len(Y); nf = s.nf
        Z = np.zeros((n, len(s.beta))); Z[:, 0] = 1; Z[:, 1:1 + nf] = X; Z[np.arange(n), 1 + nf + K] = 1
        Z[np.arange(n), 1 + nf + s.C.K + s.C.sys[K]] = 1
        def f(b):
            z = Z @ b; p = SIG(z)
            l = -np.sum(Y * np.log(p + 1e-12) + (1 - Y) * np.log(1 - p + 1e-12)) + .5 * np.sum(((b - s.mu0) / s.sd0) ** 2)
            return l, Z.T @ (p - Y) + (b - s.mu0) / s.sd0 ** 2
        s.beta = minimize(f, s.beta, jac=True, method='L-BFGS-B', options={'maxiter': 200}).x

class KF:
    """NEW: KC-level FSRS memory (retrieval) x hierarchical ADF execution ability with a learning slope,
    noisy-AND over prerequisites, guess/slip, fatigue. Learning effects make it usable for planning."""
    def __init__(s, C, hp):
        s.C = C; s.hp = hp; ns = C.sys.max() + 1; s.w = F.W0.copy()
        s.S = np.full(C.K, np.nan); s.D = np.full(C.K, 5.); s.L = np.zeros(C.K); s.n = np.zeros(C.K)
        s.mm = np.array([hp.get('m0', 0.)]); s.mv = np.array([hp.get('vmu', 1.)])
        s.sm = np.zeros(ns); s.sv = np.full(ns, hp.get('vs', .25)); s.km = np.zeros(C.K); s.kv = np.full(C.K, hp.get('vk', .5))
        s.lm = np.array([hp.get('lam', .3)]); s.lv = np.array([.1]); s.fm = np.array([.2]); s.fv = np.array([.04])
        s.last = np.zeros(C.K); s.g = hp.get('g', .05); s.sl = .03; s.al = hp.get('al', 1.); s.ap = hp.get('ap', .5)
    def R(s, j, t): return 0. if np.isnan(s.S[j]) else float(F.R(s.w, t - s.L[j], s.S[j]))
    def lin(s, k, t, fat):
        q = s.hp.get('q', .01); s.kv[k] = min(s.kv[k] + q * max(t - s.last[k], 0), s.hp.get('vk', .5)); s.last[k] = t
        sy = s.C.sys[k]; x = np.log1p(s.n[k])
        comps = [(s.mm, s.mv, 0, 1.), (s.sm, s.sv, sy, 1.), (s.km, s.kv, k, 1.), (s.lm, s.lv, 0, x), (s.fm, s.fv, 0, -fat)]
        m = sum(a[i] * xc for a, _, i, xc in comps); V = sum(v[i] * xc * xc for _, v, i, xc in comps)
        return m, V, comps
    def p(s, ev):
        k, t = ev['k'], ev['t']
        s._Rk = s.R(k, t); s._A = (1 - s.g - s.sl) * s._Rk ** s.al * np.prod([s.R(j, t) ** s.ap for j in s.C.pre[k]])
        s._m, s._V, s._c = s.lin(k, t, ev['fat']); s._m -= ev['b']
        s._pe = probit(s._m, s._V); s._P = s.g + s._A * s._pe; return float(s._P)
    def mem(s, j, t, g, wt, reset=False):
        if np.isnan(s.S[j]) or wt <= 0: return
        ns, nd = F.step(s.w, s.S[j], s.D[j], t - s.L[j], g, wt); s.S[j], s.D[j] = float(ns), float(nd)
        if reset: s.L[j] = t
    def upd(s, ev, y):
        k, t = ev['k'], ev['t']; P = min(max(s._P, 1e-6), 1 - 1e-6); ds = s._pe * (1 - s._pe) * s._A
        G = ds / P if y else -ds / (1 - P); H = ds * ds / (P * (1 - P))
        adf(s._c, s._m, s._V, 1., G, H)
        if y:
            s.mem(k, t, 3, 1.)
            for j in s.C.pre[k]: s.mem(j, t, 3, s.hp.get('wp', .4))
        else:   # blame: P(retrieval failed | fail) = r -> Again with weight r, Good with 1-r
            r = min(max((1 - s._Rk ** s.al) * (1 - s.g) / (1 - P), 0), 1)
            s.mem(k, t, 1, r); s.mem(k, t, 3, 1 - r)
        if not np.isnan(s.S[k]): s.L[k] = t
        s.n[k] += 1
    def card(s, k, t, y): s.mem(k, t, 3 if y else 1, s.hp.get('wc', .3))
    def teach(s, k, t):
        if np.isnan(s.S[k]): s.S[k] = float(F.initS(s.w, 3)) * s.hp.get('mS', 1.); s.D[k] = float(F.initD(s.w, 3)); s.L[k] = t
        else: s.mem(k, t, 3, 1., True)
    def day_end(s, d): pass

class GB:
    """ML baseline: histogram gradient boosting on the same features + KC/system ids; refit every 3 days."""
    def __init__(s, C, hp): s.C = C; s.hp = hp; s.X = []; s.Y = []; s.m = None; s.br = .7
    def xf(s, ev): return np.r_[ev['f'], ev['k'], s.C.sys[ev['k']]]
    def p(s, ev):
        s._x = s.xf(ev)
        return float(np.clip(s.m.predict_proba(s._x[None])[0, 1], .01, .99)) if s.m is not None else s.br
    def upd(s, ev, y): s.X.append(s._x); s.Y.append(y)
    def teach(s, k, t): pass
    def day_end(s, d):
        if len(s.Y) < 40 or d % 3: s.br = (1 + sum(s.Y)) / (2 + len(s.Y)); return
        from sklearn.ensemble import HistGradientBoostingClassifier as H
        if len(set(s.Y)) < 2: return
        n = s.X[0].shape[0]; cat = np.zeros(n, bool); cat[-2:] = True
        s.m = H(learning_rate=s.hp.get('lr', .1), max_iter=100, max_depth=3, min_samples_leaf=s.hp.get('leaf', 20),
                l2_regularization=1., categorical_features=cat, random_state=0).fit(np.array(s.X), np.array(s.Y))

class Mix:
    """Fixed-share Bayesian mixture over member predictions (Herbster & Warmuth). Regret <= ln M + switching cost."""
    def __init__(s, members, alpha=.02):
        s.mem = members; s.w = np.ones(len(members)) / len(members); s.a = alpha
    def p(s, ev):
        s._p = np.array([m.p(ev) for m in s.mem]); return float(np.clip(s.w @ s._p, 1e-4, 1 - 1e-4))
    def upd(s, ev, y):
        for m in s.mem: m.upd(ev, y)
        lik = np.where(y, s._p, 1 - s._p); s.w = s.w * np.clip(lik, 1e-4, 1); s.w /= s.w.sum()
        s.w = (1 - s.a) * s.w + s.a / len(s.w)
    def teach(s, k, t): [m.teach(k, t) for m in s.mem]
    def day_end(s, d): [m.day_end(d) for m in s.mem]

class Calib:
    """Residual layer: online Bayesian logistic recalibration logit p = a*logit(p_base) + b (+ c*fat)."""
    def __init__(s, base, use_fat=False):
        s.b = base; s.m = np.array([1., 0., 0.]); s.v = np.array([.01, .04, .01 if use_fat else 1e-9])
    def p(s, ev):
        pb = min(max(s.b.p(ev), 1e-4), 1 - 1e-4); s._x = np.array([np.log(pb / (1 - pb)), 1., -ev['fat']])
        s._mz = s.m @ s._x; s._V = np.sum(s.v * s._x ** 2); s._q = probit(s._mz, s._V); return float(s._q)
    def upd(s, ev, y):
        s.b.upd(ev, y); q = s._q
        adf([(s.m, s.v, i, s._x[i]) for i in range(3)], s._mz, s._V, 1., y - q, q * (1 - q))
    def teach(s, k, t): s.b.teach(k, t)
    def day_end(s, d): s.b.day_end(d)

# ---------------- card models ----------------
class Card:
    """FSRS card memory. map_kappa=None -> default weights. couple>0 -> attempts on the card's KC are fractional Good
    reviews (implicit retrieval). resid -> ADF logit offsets per global/system/KC + fatigue."""
    def __init__(s, C, hp):
        s.C = C; s.kap = hp.get('kappa'); s.om = hp.get('couple', 0.); s.res = hp.get('resid', False); s.rich = hp.get('rich', False)
        s.rm = np.zeros(4); s.rv = np.full(4, .05); s.nrev = np.zeros(len(C.card_kc))
        n = len(C.card_kc); s.w = F.W0.copy(); s.S = np.full(n, np.nan); s.D = np.full(n, 5.); s.L = np.zeros(n)
        s.ev = [[] for _ in range(n)]          # (t, kind, g, wt, y)
        ns = C.sys.max() + 1; s.o = [np.zeros(1), np.full(1, .1), np.zeros(ns), np.full(ns, .05), np.zeros(C.K), np.full(C.K, .1),
                                     np.zeros(1), np.full(1, hp.get('fatv', .01))]
        s.slope = hp.get('slope', False); s.am = np.zeros(1); s.av = np.full(1, hp.get('slv', .01))
    def first(s, c, t):
        s.S[c] = float(F.initS(s.w, 3)); s.D[c] = float(F.initD(s.w, 3)); s.L[c] = t; s.ev[c].append((t, 1, 3, 1., 0))
    def teach(s, k, t):
        for c in s.C.kc_cards[k]: s.first(c, t)
    def att(s, k, t, y):
        if s.om <= 0 or not y: return
        for c in s.C.kc_cards[k]:
            if np.isnan(s.S[c]): continue
            ns, nd = F.step(s.w, s.S[c], s.D[c], t - s.L[c], 3, s.om); s.S[c], s.D[c] = float(ns), float(nd)
            s.ev[c].append((t, 3, 3, s.om, 0))
    def pc(s, ev):
        c, t = ev['c'], ev['t']; r = float(np.clip(F.R(s.w, t - s.L[c], s.S[c]), 1e-4, 1 - 1e-4)); s._r = r
        if not s.res: return r
        k = s.C.card_kc[c]; sy = s.C.sys[k]; o = s.o
        s._c = [(o[0], o[1], 0, 1.), (o[2], o[3], sy, 1.), (o[4], o[5], k, 1.), (o[6], o[7], 0, -ev['fat'])]
        if s.slope: s._c.append((s.am, s.av, 0, np.log(r / (1 - r))))
        if s.rich:
            xs = [np.log1p(max(t - s.L[c], 0)) - 1, np.log(max(s.S[c], 1e-3)) - 1, np.log1p(s.nrev[c]) - 1, np.log1p(ev.get('ka7', 0)) - 1]
            s._c += [(s.rm, s.rv, i, x) for i, x in enumerate(xs)]
        s._mz = np.log(r / (1 - r)) + sum(a[i] * x for a, _, i, x in s._c); s._V = sum(v[i] * x * x for _, v, i, x in s._c)
        s._q = float(probit(s._mz, s._V)); return s._q
    def updc(s, ev, y):
        c, t = ev['c'], ev['t']
        if s.res: adf(s._c, s._mz, s._V, 1., y - s._q, s._q * (1 - s._q))
        ns, nd = F.step(s.w, s.S[c], s.D[c], t - s.L[c], 3 if y else 1); s.S[c], s.D[c] = float(ns), float(nd); s.L[c] = t
        s.ev[c].append((t, 2, 3 if y else 1, 1., y)); s.nrev[c] += 1
    def seq(s):
        seqs = [e for e in s.ev if e]; L = max(len(e) for e in seqs); N = len(seqs)
        A = {k: np.zeros((N, L)) for k in ('kind', 'dt', 'g', 'wt', 'y')}
        for i, e in enumerate(seqs):
            lastreal = e[0][0]
            for j, (t, kd, g, wt, y) in enumerate(e):
                A['kind'][i, j] = kd; A['dt'][i, j] = t - lastreal; A['g'][i, j] = g; A['wt'][i, j] = wt; A['y'][i, j] = y
                if kd in (1, 2): lastreal = t
        A['kind'] = A['kind'].astype(int); A['g'] = A['g'].astype(int); return A
    def day_end(s, d):
        if s.kap is None or d not in (9, 19, 29): return
        A = s.seq()
        if (A['kind'] == 2).sum() < 30: return
        s.w = F.fit_map(A, s.kap, s.w)
        for c, e in enumerate(s.ev):                 # replay states with new weights
            if not e: continue
            S = D = None; lastreal = e[0][0]
            for (t, kd, g, wt, y) in e:
                if kd == 1: S = float(F.initS(s.w, g)); D = float(F.initD(s.w, g)); lastreal = t
                else:
                    ns, nd = F.step(s.w, S, D, t - lastreal, g, wt if kd == 3 else 1.); S, D = float(ns), float(nd)
                    if kd == 2: lastreal = t
            s.S[c], s.D[c], s.L[c] = S, D, lastreal

class CardLR(Card):
    """FSRS (default w + coupling) as an anchor feature + MAP logistic correction on cross-type history
    (KC attempts in windows, card counts, time since teach, fatigue); refit nightly."""
    def __init__(s, C, hp):
        super().__init__(C, dict(couple=hp.get('couple', .2))); s.sf = hp.get('sf', .3); s.X = []; s.Y = []; s.Kc = []
        s.nf = 10; s.ns = C.sys.max() + 1; s.beta = np.zeros(1 + s.nf + C.K + s.ns); s.beta[1] = 1.
        s.mu0 = s.beta.copy(); s.sd0 = np.full_like(s.beta, s.sf); s.sd0[0] = .5; s.sd0[1] = .3; s.sd0[1 + s.nf:] = .3
        s.nsucc = np.zeros(len(C.card_kc))
    def pc(s, ev):
        c, t = ev['c'], ev['t']; k = s.C.card_kc[c]; r = float(np.clip(F.R(s.w, t - s.L[c], s.S[c]), 1e-4, 1 - 1e-4))
        s._x = np.array([np.log(r / (1 - r)), np.log1p(max(t - s.L[c], 0)), np.log1p(s.nrev[c]), np.log1p(s.nsucc[c]),
                         np.log1p(ev['ka1']), np.log1p(ev['ka7']), np.log1p(ev['ka30']), np.log1p(ev['kai']), np.log1p(ev['tt']), ev['fat']])
        z = s.beta[0] + s._x @ s.beta[1:1 + s.nf] + s.beta[1 + s.nf + k] + s.beta[1 + s.nf + s.C.K + s.C.sys[k]]
        return float(SIG(z))
    def updc(s, ev, y):
        s.X.append(s._x); s.Y.append(y); s.Kc.append(s.C.card_kc[ev['c']]); s.nsucc[ev['c']] += y
        super().updc(ev, y)
    def day_end(s, d):
        if len(s.Y) < 20: return
        X = np.array(s.X); Y = np.array(s.Y, float); K = np.array(s.Kc); n = len(Y); nf = s.nf
        Z = np.zeros((n, len(s.beta))); Z[:, 0] = 1; Z[:, 1:1 + nf] = X; Z[np.arange(n), 1 + nf + K] = 1; Z[np.arange(n), 1 + nf + s.C.K + s.C.sys[K]] = 1
        def f(b):
            p = SIG(Z @ b); return (-np.sum(Y * np.log(p + 1e-12) + (1 - Y) * np.log(1 - p + 1e-12)) + .5 * np.sum(((b - s.mu0) / s.sd0) ** 2),
                                    Z.T @ (p - Y) + (b - s.mu0) / s.sd0 ** 2)
        s.beta = minimize(f, s.beta, jac=True, method='L-BFGS-B', options={'maxiter': 200}).x

class CMix:
    """Fixed-share mixture for card predictors."""
    def __init__(s, members, alpha=.001): s.mem = members; s.w = np.ones(len(members)) / len(members); s.a = alpha
    def pc(s, ev): s._p = np.array([m.pc(ev) for m in s.mem]); return float(np.clip(s.w @ s._p, 1e-4, 1 - 1e-4))
    def updc(s, ev, y):
        for m in s.mem: m.updc(ev, y)
        s.w = s.w * np.clip(np.where(y, s._p, 1 - s._p), 1e-4, 1); s.w /= s.w.sum(); s.w = (1 - s.a) * s.w + s.a / len(s.w)
    def att(s, k, t, y): [m.att(k, t, y) for m in s.mem]
    def teach(s, k, t): [m.teach(k, t) for m in s.mem]
    def day_end(s, d): [m.day_end(d) for m in s.mem]
