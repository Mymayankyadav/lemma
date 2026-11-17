import re, numpy as np, sys
rows = {'W1': [], 'W2': []}
for f in ('log_eW1.txt', 'log_eW2.txt'):
    for line in open(f):
        w = line.split()[0]; d = dict(re.findall(r"'(\w+)': np\.float64\(([\d.]+)\)", line))
        rows[w].append({k: float(v) for k, v in d.items()})
for w in ('W1', 'W2', 'all'):
    R = rows['W1'] + rows['W2'] if w == 'all' else rows[w]
    if not R: continue
    A = {p: np.array([r[p] for r in R]) for p in R[0]}; n = len(R)
    out = [f'{w} n={n}'] + [f"{p} {A[p].mean():.3f}" for p in A]
    for p in ('P1', 'P2', 'P2C', 'ORACLE'):
        d = A[p] - A['P0']; out.append(f"{p}-P0 {d.mean():+.4f}±{d.std(ddof=1)/np.sqrt(n):.4f}")
    g = (A['ORACLE'] - A['P0']).mean()
    out.append(f"P2C-P2 {(A['P2C']-A['P2']).mean():+.4f}±{(A['P2C']-A['P2']).std(ddof=1)/np.sqrt(n):.4f}")
    print(' | '.join(out))
