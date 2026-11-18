# FSRS-6 (port of supabase/functions/_shared/fsrs.js), vectorised; MAP fit with fsrs-rs prior spread.
import numpy as np
from scipy.optimize import minimize
W0 = np.array([0.212,1.2931,2.3065,8.2956,6.4133,0.8334,3.0194,0.001,1.8722,0.1666,0.796,
               1.4835,0.0614,0.2629,1.6483,0.6014,1.8729,0.5425,0.0912,0.0658,0.1542])
SD = np.array([6.43,9.66,17.58,27.85,0.57,0.28,0.6,0.12,0.39,0.18,0.33,0.3,0.09,0.16,0.57,0.25,1.03,0.31,0.32,0.14,0.27])
LB = np.array([1e-3]*4+[1,1e-3,1e-3,1e-3,0,0,1e-3,1e-3,1e-3,1e-3,0,0,1,0,0,.01,.1])
UB = np.array([100]*4+[10,4,4,.75,4.5,.8,3.5,5,.25,.9,4,1,6,2,2,.8,.8])
EPS = 1e-6

def R(w, t, s):
    f = 0.9 ** (-1 / w[20]) - 1
    return (1 + f * np.maximum(t, 0) / np.maximum(s, 1e-3)) ** (-w[20])

def ivl(w, s, r=0.9):
    f = 0.9 ** (-1 / w[20]) - 1
    return s / f * (r ** (-1 / w[20]) - 1)

def initS(w, g): return np.clip(w[np.asarray(g) - 1], 1e-3, 100)
def initD(w, g): return np.clip(w[4] - np.exp(w[5] * (np.asarray(g) - 1)) + 1, 1, 10)

def nextD(w, d, g):
    nd = d + (-w[6] * (g - 3)) * (10 - d) / 9
    return np.clip(w[7] * (w[4] - np.exp(w[5] * 3) + 1) + (1 - w[7]) * nd, 1, 10)

def recallS(w, d, s, r, g):
    hard = np.where(g == 2, w[15], 1.0); easy = np.where(g == 4, w[16], 1.0)
    return s * (1 + np.exp(w[8]) * (11 - d) * s ** (-w[9]) * (np.exp((1 - r) * w[10]) - 1) * hard * easy)

def forgetS(w, d, s, r):
    ns = w[11] * d ** (-w[12]) * ((s + 1) ** w[13] - 1) * np.exp((1 - r) * w[14])
    return np.minimum(ns, s / np.exp(w[17] * w[18]))

def shortS(w, s, g):
    sinc = np.exp(w[17] * (g - 3 + w[18])) * s ** (-w[19])
    return s * np.where(g >= 2, np.maximum(sinc, 1), sinc)

def step(w, s, d, t, g, wt=1.0):
    """One (possibly fractional, weight wt) memory update. Arrays OK. Same-day (t<0.5) uses shortS."""
    s = np.clip(s, 1e-3, 36500); d = np.clip(d, 1, 10); g = np.asarray(g)
    r = R(w, t, s)
    full = np.where(t < 0.5, shortS(w, s, g), np.where(g == 1, forgetS(w, d, s, r), recallS(w, d, s, r, g)))
    ns = s + wt * (full - s)
    nd = d + wt * (nextD(w, d, g) - d)
    return np.clip(ns, 1e-3, 36500), nd

def nll(w, seq, ret_p=False):
    """seq: dict of (N,L) arrays: kind 0 pad,1 first exposure,2 observed review,3 implicit; dt; g; wt; y."""
    N, L = seq['kind'].shape
    s = np.full(N, 1.0); d = np.full(N, 5.0); tot = 0.0; ps = []
    for j in range(L):
        k = seq['kind'][:, j]; dt = seq['dt'][:, j]; g = seq['g'][:, j]
        first = k == 1
        if first.any():
            s = np.where(first, initS(w, np.maximum(g, 1)), s); d = np.where(first, initD(w, np.maximum(g, 1)), d)
        obs = k == 2
        if obs.any():
            p = np.clip(R(w, dt, s), EPS, 1 - EPS); y = seq['y'][:, j]
            tot -= np.sum(np.where(obs, y * np.log(p) + (1 - y) * np.log(1 - p), 0))
            if ret_p: ps.append((j, p))
        upd = (k == 2) | (k == 3)
        if upd.any():
            ns, nd = step(w, s, d, dt, np.maximum(g, 1), np.where(k == 3, seq['wt'][:, j], 1.0))
            s = np.where(upd, ns, s); d = np.where(upd, nd, d)
    return (tot, ps) if ret_p else tot

def fit_map(seq, kappa=1.0, w_start=None, maxiter=40):
    w_start = W0 if w_start is None else w_start
    sd = SD * kappa
    f = lambda w: nll(w, seq) + 0.5 * np.sum(((w - W0) / sd) ** 2)
    r = minimize(f, w_start, method='L-BFGS-B', bounds=list(zip(LB, UB)), options={'maxiter': maxiter})
    return r.x
