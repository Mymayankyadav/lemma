# Aggregate prequential results: KL to oracle (reducible error), log loss, calibration, residual structure.
import pickle, numpy as np, sys
from scipy.optimize import minimize
def kl(p, q):
    p = np.clip(p, 1e-4, 1 - 1e-4); q = np.clip(q, 1e-4, 1 - 1e-4)
    return p * np.log(p / q) + (1 - p) * np.log((1 - p) / (1 - q))
def ll(y, q): q = np.clip(q, 1e-4, 1 - 1e-4); return -(y * np.log(q) + (1 - y) * np.log(1 - q))
def calib(y, q, fat):
    """logistic regression y ~ a + b*logit(q) + c*fat ; returns (a, b, z_c)"""
    q = np.clip(q, 1e-4, 1 - 1e-4); X = np.c_[np.ones_like(q), np.log(q / (1 - q)), fat]
    def f(w):
        z = X @ w; p = 1 / (1 + np.exp(-z)); return -np.sum(y * np.log(p + 1e-12) + (1 - y) * np.log(1 - p + 1e-12)), X.T @ (p - y)
    w = minimize(f, np.array([0., 1., 0.]), jac=True).x; p = 1 / (1 + np.exp(-X @ w))
    cov = np.linalg.inv(X.T @ (X * (p * (1 - p))[:, None])); return w[0], w[1], w[2] / np.sqrt(cov[2, 2])
BINS = [(0, 30), (30, 100), (100, 200), (200, 10 ** 6)]
def table(files, typ, key, worlds=('W1', 'W2'), detail=False):
    res = {w: [x for f in files[w] for x in pickle.load(open(f, 'rb'))] for w in worlds}
    names = list(res[worlds[0]][0][key].keys()); out = {}
    for n in names:
        row = {}
        for w in worlds:
            per = [kl(r[typ][:, 0], r[key][n]).mean() for r in res[w]]
            row[w] = (np.mean(per), np.std(per) / np.sqrt(len(per)))
            if detail:
                P = np.concatenate([r[typ][:, 0] for r in res[w]]); Y = np.concatenate([r[typ][:, 1] for r in res[w]])
                Q = np.concatenate([r[key][n] for r in res[w]]); FT = np.concatenate([r[typ][:, 2] for r in res[w]])
                IX = np.concatenate([r[typ][:, 3] for r in res[w]]); K = kl(P, Q)
                row[w + 'bins'] = [K[(IX >= a) & (IX < b)].mean() for a, b in BINS]
                row[w + 'll'] = (ll(Y, Q).mean(), ll(Y, P).mean())
                row[w + 'cal'] = calib(Y, Q, FT)
        out[n] = row
    return out, res
if __name__ == '__main__':
    stage = sys.argv[1]
    files = {w: [f'{stage}_{w}.pkl'] for w in ('W1', 'W2')} if stage == 'tune' else {w: sys.argv[2:] and [f for f in sys.argv[2:] if w in f] for w in ('W1', 'W2')}
    for typ, key in (('att', 'PA'), ('card', 'PC')):
        T, _ = table(files, typ, key, detail=(stage != 'tune'))
        print(f'== {typ}: mean KL to oracle (nats/prediction), W1 | W2 | avg')
        for n, r in sorted(T.items(), key=lambda kv: kv[1]['W1'][0] + kv[1]['W2'][0]):
            s = f"{n:18s} {r['W1'][0]:.4f}±{r['W1'][1]:.4f} | {r['W2'][0]:.4f}±{r['W2'][1]:.4f} | {(r['W1'][0]+r['W2'][0])/2:.4f}"
            if 'W1bins' in r:
                s += ' | bins W1 ' + ' '.join(f'{x:.3f}' for x in r['W1bins']) + ' W2 ' + ' '.join(f'{x:.3f}' for x in r['W2bins'])
                s += f" | LL W1 {r['W1ll'][0]:.3f} (orc {r['W1ll'][1]:.3f}) W2 {r['W2ll'][0]:.3f} (orc {r['W2ll'][1]:.3f})"
                s += ' | cal a,b,zfat W1 ' + ','.join(f'{x:.2f}' for x in r['W1cal']) + ' W2 ' + ','.join(f'{x:.2f}' for x in r['W2cal'])
            print(s)
