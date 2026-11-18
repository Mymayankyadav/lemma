"""Turns the seeded harness outputs into the `gates` object of the release report that atlas_v2_activate checks (07 Simulation gates).

    python3 gates.py test_W1.pkl test_W2.pkl --time-log time_sim.txt --tokens tokens.json --e2e e2e_W1.pkl e2e_W2.pkl > gates.json

Inputs: the held-out test-stage pickles of preq.py (both worlds), the stdout of time_sim.py, and the e2e.py pickles. The token gates come from the TypeScript side (`tokenGates` in _shared/adaptive/tokens.ts, run over the real `resume` texts and Atlas cards) as a small JSON file {resume_tokens_max, card_tokens_max}; without it they are left out and activation refuses.
The thresholds below must equal those in supabase/migrations/*_n175_atlas_migrate.sql (tests/unit/adaptive/gate-thresholds.test.ts compares them).
"""
import json, pickle, re, sys
import numpy as np
from analyze import kl, calib

THRESHOLDS = {  # name: (operator, threshold)
    'kf_kl_w1': ('<=', 0.040), 'kf_kl_w2': ('<=', 0.050), 'kf_reduction_vs_v2': ('>=', 0.40),
    'attempt_calibration_slope_lo': ('>=', 0.85), 'attempt_calibration_slope_hi': ('<=', 1.15), 'attempt_calibration_abs_intercept': ('<=', 0.2),
    'fatigue_abs_z': ('<=', 3), 'card_kl_vs_default': ('<=', 0), 'duration_log_density': ('>=', -0.70),
    'duration_coverage_lo': ('>=', 0.75), 'duration_coverage_hi': ('<=', 0.85), 'attendance_log_loss': ('<=', 0.57),
    'e2e_p2c_minus_p0': ('>', 0), 'e2e_se_ratio': ('>', 2), 'resume_tokens_max': ('<=', 1500), 'card_tokens_max': ('<=', 100),
}
OPS = {'<=': lambda v, t: v <= t, '>=': lambda v, t: v >= t, '>': lambda v, t: v > t}

def load(files):
    return [x for f in files for x in pickle.load(open(f, 'rb'))]

def attempt_gates(w1, w2, kf='kf_1.0_1.0', v2='v2_0'):
    out, per = {}, {}
    for name, res in (('w1', w1), ('w2', w2)):
        k = np.mean([kl(r['att'][:, 0], r['PA'][kf]).mean() for r in res]); v = np.mean([kl(r['att'][:, 0], r['PA'][v2]).mean() for r in res])
        P = np.concatenate([r['att'][:, 0] for r in res]); Y = np.concatenate([r['att'][:, 1] for r in res]); Q = np.concatenate([r['PA'][kf] for r in res]); FT = np.concatenate([r['att'][:, 2] for r in res])
        a, b, z = calib(Y, Q, FT)
        out['kf_kl_' + name] = float(k); per[name] = dict(kf=float(k), v2=float(v), a=float(a), b=float(b), z=float(z))
    out['kf_reduction_vs_v2'] = float(min(1 - per[w]['kf'] / per[w]['v2'] for w in per))
    out['attempt_calibration_slope_lo'] = float(min(per[w]['b'] for w in per)); out['attempt_calibration_slope_hi'] = float(max(per[w]['b'] for w in per))
    out['attempt_calibration_abs_intercept'] = float(max(abs(per[w]['a']) for w in per)); out['fatigue_abs_z'] = float(max(abs(per[w]['z']) for w in per))
    return out

def card_gate(w1, w2, coupled='c_cpl_0.2', default='c_def'):
    d = [np.mean([kl(r['card'][:, 0], r['PC'][coupled]).mean() for r in res]) - np.mean([kl(r['card'][:, 0], r['PC'][default]).mean() for r in res]) for res in (w1, w2)]
    return {'card_kl_vs_default': float(np.mean(d))}

def time_gates(text):
    lpd = float(re.search(r'T2_kalman\s+LPD\s+(-?[\d.]+)', text).group(1)); cov = float(re.search(r'T2_kalman.*cov80\s+([\d.]+)', text).group(1))
    att = float(re.search(r'A2 logloss\s+([\d.]+)', text).group(1))
    return {'duration_log_density': lpd, 'duration_coverage_lo': cov, 'duration_coverage_hi': cov, 'attendance_log_loss': att}

def e2e_gates(files):
    rows = load(files); d = np.array([r['P2C']['score'] if isinstance(r['P2C'], dict) else r['P2C'] for r in rows]) - np.array([r['P0']['score'] if isinstance(r['P0'], dict) else r['P0'] for r in rows])
    n = len(d); se = d.std(ddof=1) / np.sqrt(n)
    return {'e2e_p2c_minus_p0': float(d.mean()), 'e2e_se_ratio': float(d.mean() / se) if se > 0 else float('inf')}

def evaluate(gates):
    """Names of the gates that are missing or fail, with the reason; empty means every gate holds."""
    bad = []
    for name, (op, t) in THRESHOLDS.items():
        if name not in gates: bad.append(f'{name}: missing')
        elif not OPS[op](gates[name], t): bad.append(f'{name}: {gates[name]:.4f} not {op} {t}')
    return bad

if __name__ == '__main__':
    args = sys.argv[1:]; tl = args.index('--time-log'); e = args.index('--e2e'); tk = args.index('--tokens') if '--tokens' in args else None
    tests, time_log, e2e = args[:tl], args[tl + 1], args[e + 1:]
    tokens = json.load(open(args[tk + 1])) if tk is not None else {}
    w1 = load([f for f in tests if 'W1' in f]); w2 = load([f for f in tests if 'W2' in f])
    gates = {**attempt_gates(w1, w2), **card_gate(w1, w2), **time_gates(open(time_log).read()), **e2e_gates(e2e), **tokens}
    print(json.dumps({'gates': gates, 'failing': evaluate(gates)}, indent=1))
