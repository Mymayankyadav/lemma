# Duration models (checkpoint minutes) and adherence/calendar models, prequential, vs ground truth.
import numpy as np, sys
from scipy.stats import norm, t as tdist
SIG = lambda x: 1 / (1 + np.exp(-x))

def durations(seed, n=40):
    r = np.random.default_rng(seed)
    mu = r.normal(.8, .3); bk = r.normal(0, .25, 3); g = .35; rho = r.normal(0, .2); se = r.uniform(.25, .45)
    est = np.exp(r.normal(np.log(60), .4, n)); kind = r.integers(0, 3, n); diff = r.normal(0, 1, n); prox = diff + r.normal(0, .6, n)
    drift = np.cumsum(r.normal(0, .03, n))
    y = mu + bk[kind] + g * diff + rho * np.log(est / 60) + drift + r.normal(0, se, n)     # log(actual/est)
    out = {}
    # T0: EWMA pace factor (N169), sd fixed 0.5
    pf = 1.; lp = []; cov = []
    for j in range(n):
        m = np.log(np.clip(pf, .5, 3)); lp.append(norm.logpdf(y[j], m, .5)); cov.append(abs(y[j] - m) < 1.2816 * .5)
        pf = .7 * pf + .3 * np.exp(y[j])
    out['T0_ewma'] = (np.mean(lp), np.mean(cov))
    # T1: per-kind normal-inverse-gamma, prior mean = pooled mean so far (0 if none), kappa0=3, sd0=.5 (pack 10 §1)
    lp = []; cov = []
    for j in range(n):
        prev = y[:j]; pm = prev.mean() if j else 0.; sel = prev[kind[:j] == kind[j]]; k0, a0, b0 = 3., 3., 3 * .25
        kn = k0 + len(sel); mn = (k0 * pm + sel.sum()) / kn; an = a0 + len(sel) / 2
        bn = b0 + .5 * ((sel - sel.mean()) ** 2).sum() + (k0 * len(sel) * (sel.mean() - pm) ** 2 / (2 * kn) if len(sel) else 0)
        sc = np.sqrt(bn * (kn + 1) / (an * kn)); lp.append(tdist.logpdf(y[j], 2 * an, mn, sc)); cov.append(abs(y[j] - mn) < tdist.ppf(.9, 2 * an) * sc)
    out['T1_nig'] = (np.mean(lp), np.mean(cov))
    # T2: Kalman dynamic regression: level (random walk, population prior N(.7,.4^2)) + kind (N(0,.25^2)) + proxy + log size;
    #     adaptive noise variance (prior .4^2 worth 5 obs)
    X = np.c_[np.ones(n), np.eye(3)[kind], prox, np.log(est / 60)]
    m = np.r_[.7, 0, 0, 0, .2, 0]; P = np.diag([.16, .0625, .0625, .0625, .04, .04]); s2n, s2w = .16 * 5, 5.; lp = []; cov = []
    for j in range(n):
        P[0, 0] += .03 ** 2; x = X[j]; f = x @ m; s2 = s2n / s2w; Q = x @ P @ x + s2
        lp.append(norm.logpdf(y[j], f, np.sqrt(Q))); cov.append(abs(y[j] - f) < 1.2816 * np.sqrt(Q))
        e = y[j] - f; Kg = P @ x / Q; m = m + Kg * e; P = P - np.outer(Kg, x @ P)
        s2n += max(e * e - x @ P @ x, .01); s2w += 1
    out['T2_kalman'] = (np.mean(lp), np.mean(cov))
    out['oracle'] = (np.mean(norm.logpdf(y, mu + bk[kind] + g * diff + rho * np.log(est / 60) + drift, se)), .8)
    return out

def adherence(seed, D=60, policy='random', model='A2'):
    r = np.random.default_rng(seed)
    al = r.normal(1., .5); bwd = r.normal(0, .4, 7); bh = r.normal(0, .6, 4); gam = r.uniform(.3, 1.); dl = r.normal(-.5, .2)
    M = np.where(np.arange(D) % 7 >= 5, 120., 90.); z = 0.; prev = 1
    # A2 state: weights for [1, wd(7), slot(4), lag, logM] with ADF, intercept drift
    mw = np.zeros(14); vw = np.r_[.5, [.16] * 7, [.36] * 4, .25, .04]; mw[0] = 1.; mw[12] = .5; mw[13] = -.5
    sa = 4.; na = 5.; ll = {'A0': [], 'A1': [], 'A2': []}; mins = []; br = {'A0': [], 'A1': [], 'A2': []}
    for d in range(D):
        wd = d % 7
        def xv(h): x = np.zeros(14); x[0] = 1; x[1 + wd] = 1; x[8 + h] = 1; x[12] = prev; x[13] = np.log(M[d] / 60); return x
        if policy == 'random': h = r.integers(4)
        elif policy == 'fixed': h = 2
        elif policy == 'oracle': h = int(np.argmax(bh))
        else:   # Thompson sampling with the A2 posterior
            ws = r.normal(mw, np.sqrt(vw)); h = int(np.argmax([xv(hh) @ ws for hh in range(4)]))
        x = xv(h); z = .8 * z + r.normal(0, .4)
        pt = SIG(al + bwd[wd] + bh[h] + gam * prev + dl * np.log(M[d] / 60) + z); att = int(r.random() < pt)
        real = att * min(M[d] * np.exp(r.normal(-.1, .25)), 1.5 * M[d]); mins.append(real)
        mz = x @ mw; V = np.sum(vw * x * x); p2 = SIG(mz / np.sqrt(1 + np.pi * V / 8)); p1 = sa / na; p0 = .99
        for k, p in (('A0', p0), ('A1', p1), ('A2', p2)):
            ll[k].append(-(att * np.log(p) + (1 - att) * np.log(1 - p))); br[k].append((p - att) ** 2)
        den = 1 + V * p2 * (1 - p2); mw += vw * x * (att - p2) / den; vw = np.maximum(vw - (vw * x) ** 2 * p2 * (1 - p2) / den, 1e-3)
        vw[0] = min(vw[0] + .02, .5); sa += att; na += 1; prev = att
    return {k: (np.mean(ll[k]), np.mean(br[k])) for k in ll}, np.mean(mins)

if __name__ == '__main__':
    N = 200
    R = [durations(s) for s in range(N)] if len(sys.argv) < 2 else []
    for k in (R[0] if R else []):
        a = np.array([x[k] for x in R]); print(f'{k:10s} LPD {a[:,0].mean():.3f} ±{a[:,0].std()/np.sqrt(N):.3f}  cov80 {a[:,1].mean():.2f}')
    A = [adherence(s)[0] for s in range(N)]
    for k in ('A0', 'A1', 'A2'):
        a = np.array([x[k] for x in A]); print(f'{k} logloss {a[:,0].mean():.3f} ±{a[:,0].std()/np.sqrt(N):.3f} brier {a[:,1].mean():.3f}')
    for pol in ('fixed', 'random', 'thompson', 'oracle'):
        m = np.array([adherence(s, policy=pol)[1] for s in range(N)]); print(f'calendar {pol:9s} min/day {m.mean():.1f} ±{m.std()/np.sqrt(N):.1f}')
