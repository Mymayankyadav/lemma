/* Lemma · FSRS-6 engine: memory model, scheduler, optimizer, simulator.
   Formulas follow fsrs-rs 6.x / ts-fsrs 5.x (FSRS-6, 21 parameters). */
const FSRS = (() => {
  'use strict';

  const DEFAULT_W = Object.freeze([
    0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
    0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425,
    0.0912, 0.0658, 0.1542,
  ]);
  // Prior spread used by fsrs-rs for L2 regularisation toward the starting parameters.
  const STDDEV = [6.43, 9.66, 17.58, 27.85, 0.57, 0.28, 0.6, 0.12, 0.39, 0.18, 0.33,
    0.3, 0.09, 0.16, 0.57, 0.25, 1.03, 0.31, 0.32, 0.14, 0.27];
  const S_MIN = 0.001, S_MAX = 36500, D_MIN = 1, D_MAX = 10, INIT_S_MAX = 100;
  const DAY = 86400000;
  const NEW = 0, LEARNING = 1, REVIEW = 2, RELEARNING = 3;

  const clamp = (x, lo, hi) => Math.min(Math.max(x, lo), hi);

  function bounds(numRelearnSteps) {
    const b = [
      [S_MIN, INIT_S_MAX], [S_MIN, INIT_S_MAX], [S_MIN, INIT_S_MAX], [S_MIN, INIT_S_MAX],
      [1, 10], [0.001, 4], [0.001, 4], [0.001, 0.75], [0, 4.5], [0, 0.8], [0.001, 3.5],
      [0.001, 5], [0.001, 0.25], [0.001, 0.9], [0, 4], [0, 1], [1, 6],
      [0, 2], [0, 2], [0.01, 0.8], [0.1, 0.8],
    ];
    return b;
  }

  /** Clamp parameters into the ranges fsrs-rs allows. */
  function clip(w, numRelearnSteps = 1) {
    const b = bounds();
    const out = new Array(21);
    for (let i = 0; i < 21; i++) {
      const x = Number.isFinite(w[i]) ? w[i] : DEFAULT_W[i];
      out[i] = clamp(x, b[i][0], b[i][1]);
    }
    if (numRelearnSteps > 1) {
      const v = -(Math.log(out[11]) + Math.log(Math.pow(2, out[13]) - 1) + out[14] * 0.3) / numRelearnSteps;
      const ceil = clamp(Math.sqrt(Math.max(v, 0)), 0.01, 2);
      out[17] = Math.min(out[17], ceil);
      out[18] = Math.min(out[18], ceil);
    }
    return out;
  }

  /** Accept FSRS-4.5 (17), FSRS-5 (19) or FSRS-6 (21) parameter lists. Returns 21 numbers or null. */
  function normalizeParams(input) {
    let w = Array.isArray(input) ? input.map(Number) : String(input || '')
      .split(/[\s,;]+/).filter(Boolean).map(Number);
    if (w.some((x) => !Number.isFinite(x))) return null;
    if (w.length === 21) return clip(w);
    if (w.length === 19) return clip(w.concat([0, 0.5]));
    if (w.length === 17) {
      const v = w.slice();
      v[4] = v[5] * 2 + v[4];
      v[5] = Math.log(v[5] * 3 + 1) / 3;
      v[6] = v[6] + 0.5;
      return clip(v.concat([0, 0, 0, 0.5]));
    }
    return null;
  }

  // ---------- memory model ----------
  function decayFactor(w) {
    const decay = -w[20];
    return [decay, Math.pow(0.9, 1 / decay) - 1];
  }
  /** Probability of recall after t days for stability s. */
  function retrievability(w, t, s) {
    if (s <= 0) return 0;
    const [decay, factor] = decayFactor(w);
    return Math.pow(1 + factor * Math.max(0, t) / s, decay);
  }
  /** Days until recall probability falls to r. */
  function intervalFor(w, s, r) {
    const [decay, factor] = decayFactor(w);
    return (s / factor) * (Math.pow(r, 1 / decay) - 1);
  }
  const initS = (w, g) => clamp(w[g - 1], S_MIN, S_MAX);
  const initDRaw = (w, g) => w[4] - Math.exp(w[5] * (g - 1)) + 1;
  const initD = (w, g) => clamp(initDRaw(w, g), D_MIN, D_MAX);
  function nextD(w, d, g) {
    const delta = -w[6] * (g - 3);
    const nd = d + (delta * (10 - d)) / 9;
    return clamp(w[7] * initDRaw(w, 4) + (1 - w[7]) * nd, D_MIN, D_MAX);
  }
  function recallS(w, d, s, r, g) {
    const hard = g === 2 ? w[15] : 1;
    const easy = g === 4 ? w[16] : 1;
    return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) *
      (Math.exp((1 - r) * w[10]) - 1) * hard * easy);
  }
  function forgetS(w, d, s, r) {
    const ns = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]);
    return Math.min(ns, s / Math.exp(w[17] * w[18]));
  }
  function shortS(w, s, g) {
    let sinc = Math.exp(w[17] * (g - 3 + w[18])) * Math.pow(s, -w[19]);
    if (g >= 2) sinc = Math.max(sinc, 1);
    return s * sinc;
  }
  /** One memory update. state = null for a new card; t = whole days since last review. */
  function step(w, state, t, g) {
    if (!state) return { s: initS(w, g), d: initD(w, g) };
    const s = clamp(state.s, S_MIN, S_MAX);
    const d = clamp(state.d, D_MIN, D_MAX);
    let ns;
    if (t <= 0) ns = shortS(w, s, g);
    else {
      const r = retrievability(w, t, s);
      ns = g === 1 ? forgetS(w, d, s, r) : recallS(w, d, s, r, g);
    }
    return { s: clamp(ns, S_MIN, S_MAX), d: nextD(w, d, g) };
  }

  // ---------- small utilities ----------
  function hash32(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    return h1 >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Local-time day arithmetic with a rollover hour (a "day" starts at e.g. 4 AM). */
  function makeClock(rolloverHour = 4) {
    const shift = rolloverHour * 3600000;
    return {
      rolloverHour,
      dayIndex(ts) {
        const d = new Date(ts - shift);
        return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);
      },
      dayStart(idx) {
        const u = new Date(idx * DAY);
        return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), rolloverHour, 0, 0, 0).getTime();
      },
    };
  }

  /** Parse "1m 10m 1h 1d" into minutes. Returns null when malformed. */
  function parseSteps(text) {
    const parts = String(text || '').trim().split(/[\s,]+/).filter(Boolean);
    const out = [];
    for (const p of parts) {
      const m = /^(\d+(?:\.\d+)?)([smhd]?)$/i.exec(p);
      if (!m) return null;
      const v = parseFloat(m[1]);
      const unit = (m[2] || 'm').toLowerCase();
      const minutes = unit === 's' ? v / 60 : unit === 'h' ? v * 60 : unit === 'd' ? v * 1440 : v;
      if (!(minutes > 0)) return null;
      out.push(minutes);
    }
    return out;
  }
  function formatSteps(steps) {
    return steps.map((m) => (m % 1440 === 0 ? m / 1440 + 'd' : m % 60 === 0 ? m / 60 + 'h' : Math.round(m * 10) / 10 + 'm')).join(' ');
  }

  // ---------- fuzz + load balancing ----------
  const FUZZ_RANGES = [[2.5, 7, 0.15], [7, 20, 0.1], [20, Infinity, 0.05]];
  function fuzzRange(ivl, elapsed, maxIvl) {
    let delta = 1;
    for (const [start, end, f] of FUZZ_RANGES) delta += f * Math.max(Math.min(ivl, end) - start, 0);
    ivl = Math.min(ivl, maxIvl);
    let lo = Math.max(2, Math.round(ivl - delta));
    const hi = Math.min(Math.round(ivl + delta), maxIvl);
    if (ivl > elapsed) lo = Math.max(lo, elapsed + 1);
    lo = Math.min(lo, hi);
    return [lo, hi];
  }
  /** Choose a whole-day interval: fuzzed, and nudged toward lightly loaded days when a load function is given. */
  function pickInterval(raw, elapsed, cfg, env, seed) {
    const base = clamp(Math.round(raw), 1, cfg.maxIvl);
    if (!cfg.fuzz || raw < 2.5) return base;
    const [lo, hi] = fuzzRange(raw, elapsed, cfg.maxIvl);
    const u = rng(seed)();
    if (!cfg.loadBalance || !env.loadAt || hi - lo < 1) return Math.floor(u * (hi - lo + 1) + lo);
    const weights = [];
    let total = 0;
    for (let d = lo; d <= hi; d++) {
      const n = env.loadAt(env.today + d);
      const wgt = 1 / Math.pow(n + 1, 2.15);
      weights.push(wgt);
      total += wgt;
    }
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i] / total;
      if (u <= acc) return lo + i;
    }
    return hi;
  }

  // ---------- scheduler ----------
  /**
   * Preview all four answers for a card.
   * card: {st, due, s, d, last, step, reps, lapses}
   * cfg: {w, retention, maxIvl, learn:[min], relearn:[min], fuzz, loadBalance}
   * env: {clock, loadAt(dayIdx)?, key}
   */
  function preview(card, now, cfg, env) {
    const w = cfg.w;
    const clock = env.clock;
    const today = clock.dayIndex(now);
    const ctx = { today, loadAt: env.loadAt };
    const st = card.st || NEW;
    const elapsed = st === NEW || !card.last ? 0 : Math.max(0, today - clock.dayIndex(card.last));
    const mem = st === NEW ? null : { s: card.s, d: card.d };
    const r = mem ? retrievability(w, elapsed, Math.max(mem.s, S_MIN)) : null;
    const seedBase = hash32(String(env.key || '') + ':' + (card.reps || 0));
    const result = {};
    const dayDue = (days) => clock.dayStart(today + days);
    const stepDue = (minutes) => (minutes >= 1440 ? dayDue(Math.round(minutes / 1440)) : now + Math.round(minutes * 60000));
    const ivlOf = (s, g) => pickInterval(intervalFor(w, s, cfg.retention), elapsed, cfg, ctx, seedBase + g * 7919);

    for (let g = 1; g <= 4; g++) {
      const m = step(w, mem, elapsed, g);
      result[g] = {
        g,
        card: {
          st, due: now, s: m.s, d: m.d, last: now, step: card.step || 0,
          reps: (card.reps || 0) + 1, lapses: card.lapses || 0,
        },
        ivl: 0, delay: 0,
      };
    }

    const toReview = (g, days) => {
      const o = result[g];
      o.card.st = REVIEW; o.card.step = 0; o.ivl = days; o.card.due = dayDue(days); o.delay = o.card.due - now;
    };
    const toStep = (g, state, idx, minutes) => {
      const o = result[g];
      o.card.st = state; o.card.step = idx; o.card.due = stepDue(minutes); o.ivl = 0; o.delay = o.card.due - now;
      if (minutes >= 1440) o.ivl = Math.round(minutes / 1440);
    };
    const hardDelay = (steps, idx) => {
      if (idx > 0) return steps[idx];
      if (steps.length > 1) return (steps[0] + steps[1]) / 2;
      return Math.min(steps[0] * 1.5, steps[0] + 1440);
    };

    if (st === REVIEW) {
      let hard = ivlOf(result[2].card.s, 2);
      let good = ivlOf(result[3].card.s, 3);
      let easy = ivlOf(result[4].card.s, 4);
      hard = Math.min(hard, good);
      good = Math.max(good, hard + 1);
      easy = Math.max(easy, good + 1);
      toReview(2, hard); toReview(3, good); toReview(4, easy);
      result[1].card.lapses += 1;
      if (cfg.relearn.length) toStep(1, RELEARNING, 0, cfg.relearn[0]);
      else toReview(1, ivlOf(result[1].card.s, 1));
    } else {
      const learningState = st === RELEARNING ? RELEARNING : LEARNING;
      const steps = st === RELEARNING ? cfg.relearn : cfg.learn;
      const cur = st === NEW ? 0 : Math.min(card.step || 0, Math.max(0, steps.length - 1));
      let goodGraduates = false;
      if (!steps.length) {
        toReview(1, ivlOf(result[1].card.s, 1));
        toReview(2, ivlOf(result[2].card.s, 2));
        goodGraduates = true;
      } else {
        toStep(1, learningState, 0, steps[0]);
        toStep(2, learningState, cur, hardDelay(steps, cur));
      }
      const nextIdx = st === NEW ? 1 : cur + 1;
      let goodDays = 0;
      if (steps.length && nextIdx < steps.length) {
        toStep(3, learningState, nextIdx, steps[nextIdx]);
      } else {
        goodDays = ivlOf(result[3].card.s, 3);
        if (!steps.length) goodDays = Math.max(goodDays, result[2].ivl + 1);
        toReview(3, goodDays);
        goodGraduates = true;
      }
      let easyDays = ivlOf(result[4].card.s, 4);
      if (goodGraduates) easyDays = Math.max(easyDays, goodDays + 1);
      toReview(4, easyDays);
    }
    result.elapsed = elapsed;
    result.r = r;
    return result;
  }

  // ---------- history replay ----------
  /**
   * Replay one card's reviews ([ts, g, kind] in time order) and return the memory state
   * plus the predicted recall at each review. kind 2 = reset (forget).
   */
  function replay(w, reviews, clock) {
    let mem = null, lastDay = null;
    const trace = [];
    for (const [ts, g, kind] of reviews) {
      if (kind === 2) { mem = null; lastDay = null; trace.push({ ts, g, kind, reset: true }); continue; }
      if (kind === 1) continue;
      const day = clock.dayIndex(ts);
      const t = mem ? Math.max(0, day - lastDay) : 0;
      const r = mem ? retrievability(w, t, mem.s) : null;
      mem = step(w, mem, t, g);
      lastDay = day;
      trace.push({ ts, g, t, r, s: mem.s, d: mem.d });
    }
    return { mem, trace };
  }

  // ---------- training data ----------
  /**
   * cards: array of review lists [[ts, g, kind], ...] (time ordered).
   * Produces sequences of {t, g} in whole days, split at resets, with recency weights.
   */
  function buildDataset(cards, clock) {
    const seqs = [];
    for (const list of cards) {
      let cur = [], lastDay = null;
      for (const [ts, g, kind] of list) {
        if (kind === 1) continue;
        if (kind === 2) { if (cur.length > 1) seqs.push(cur); cur = []; lastDay = null; continue; }
        if (!(g >= 1 && g <= 4)) continue;
        const day = clock.dayIndex(ts);
        cur.push({ t: lastDay === null ? 0 : Math.max(0, day - lastDay), g, ts, wt: 1 });
        lastDay = day;
      }
      if (cur.length > 1) seqs.push(cur);
    }
    // recency weights over training items (reviews with t > 0, not the first)
    const items = [];
    for (const s of seqs) for (let i = 1; i < s.length; i++) if (s[i].t > 0) items.push(s[i]);
    items.sort((a, b) => a.ts - b.ts);
    const n = Math.max(1, items.length - 1);
    items.forEach((it, idx) => { it.wt = 0.25 + 0.75 * Math.pow(idx / n, 3); });
    return { seqs: seqs.filter((s) => s.some((r, i) => i > 0 && r.t > 0)), items: items.length };
  }

  /** Weighted log loss over a set of sequences. Returns [lossSum, weightSum, count]. */
  function lossOn(w, seqs, idx) {
    let L = 0, W = 0, n = 0;
    const list = idx || seqs.map((_, i) => i);
    for (let k = 0; k < list.length; k++) {
      const seq = seqs[list[k]];
      let s = initS(w, seq[0].g), d = initD(w, seq[0].g);
      for (let i = 1; i < seq.length; i++) {
        const { t, g, wt } = seq[i];
        if (t > 0) {
          const r = clamp(retrievability(w, t, s), 1e-4, 1 - 1e-4);
          L -= (g > 1 ? Math.log(r) : Math.log(1 - r)) * wt;
          W += wt; n++;
        }
        const m = step(w, { s, d }, t, g);
        s = m.s; d = m.d;
      }
    }
    return [L, W, n];
  }

  /** Predictions for evaluation: list of [p, y]. */
  function predictions(w, seqs) {
    const out = [];
    for (const seq of seqs) {
      let s = initS(w, seq[0].g), d = initD(w, seq[0].g);
      for (let i = 1; i < seq.length; i++) {
        const { t, g } = seq[i];
        if (t > 0) out.push([retrievability(w, t, s), g > 1 ? 1 : 0]);
        const m = step(w, { s, d }, t, g);
        s = m.s; d = m.d;
      }
    }
    return out;
  }

  function evaluate(w, seqs) {
    const preds = predictions(w, seqs);
    if (!preds.length) return { n: 0, logLoss: NaN, rmse: NaN, bins: [] };
    let ll = 0;
    const bins = Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 }));
    for (const [p0, y] of preds) {
      const p = clamp(p0, 1e-4, 1 - 1e-4);
      ll -= y ? Math.log(p) : Math.log(1 - p);
      const b = bins[Math.min(9, Math.floor(p0 * 10))];
      b.n++; b.p += p0; b.y += y;
    }
    let se = 0, tot = 0;
    for (const b of bins) if (b.n) { se += b.n * Math.pow(b.p / b.n - b.y / b.n, 2); tot += b.n; }
    return {
      n: preds.length,
      logLoss: ll / preds.length,
      rmse: Math.sqrt(se / tot),
      bins: bins.map((b, i) => ({ lo: i / 10, n: b.n, pred: b.n ? b.p / b.n : null, actual: b.n ? b.y / b.n : null })),
    };
  }

  /** Fit initial stabilities w0..w3 from first long-term reviews (MLE with a prior toward the defaults). */
  function pretrainS0(seqs, w) {
    const groups = [[], [], [], []];
    for (const seq of seqs) {
      const first = seq[0].g;
      let t = 0;
      for (let i = 1; i < seq.length; i++) {
        t += seq[i].t;
        if (seq[i].t > 0) { groups[first - 1].push([t, seq[i].g > 1 ? 1 : 0]); break; }
      }
    }
    const out = w.slice(0, 4);
    const counts = groups.map((g) => g.length);
    for (let k = 0; k < 4; k++) {
      const data = groups[k];
      if (data.length < 4) continue;
      const prior = Math.log(Math.max(w[k], S_MIN));
      const nll = (logS) => {
        const s = Math.exp(logS);
        let L = 0;
        for (const [t, y] of data) {
          const r = clamp(retrievability(w, t, s), 1e-4, 1 - 1e-4);
          L -= y ? Math.log(r) : Math.log(1 - r);
        }
        return L + 0.5 * Math.pow((logS - prior) / 1.0, 2) * 2; // prior ~ 2 pseudo-observations
      };
      // golden-section search on log S in [log 0.01, log 100]
      let a = Math.log(0.01), b = Math.log(INIT_S_MAX);
      const gr = (Math.sqrt(5) - 1) / 2;
      let c = b - gr * (b - a), dd = a + gr * (b - a);
      let fc = nll(c), fd = nll(dd);
      for (let it = 0; it < 60; it++) {
        if (fc < fd) { b = dd; dd = c; fd = fc; c = b - gr * (b - a); fc = nll(c); }
        else { a = c; c = dd; fc = fd; dd = a + gr * (b - a); fd = nll(dd); }
      }
      out[k] = clamp(Math.exp((a + b) / 2), S_MIN, INIT_S_MAX);
    }
    // keep S0(Again) <= S0(Hard) <= S0(Good) <= S0(Easy)
    for (let k = 1; k < 4; k++) if (out[k] < out[k - 1]) {
      if (counts[k] >= counts[k - 1]) out[k - 1] = out[k]; else out[k] = out[k - 1];
    }
    for (let k = 1; k < 4; k++) out[k] = Math.max(out[k], out[k - 1]);
    return { s0: out, counts };
  }

  /**
   * Optimise parameters from review history (Adam on weighted log loss + L2 prior, as in fsrs-rs).
   * Returns a promise; onProgress(fraction) is called between batches.
   */
  async function optimize(seqs, opts = {}) {
    const start = clip(opts.start || DEFAULT_W);
    const numRelearn = opts.numRelearnSteps || 1;
    const epochs = opts.epochs || 5;
    const batchItems = opts.batchSize || 512;
    const lr0 = opts.lr || 0.04;
    const gamma = opts.gamma ?? 1;
    const onProgress = opts.onProgress || (() => {});
    const yieldEvery = opts.yieldEvery ?? 4;
    const pre = pretrainS0(seqs, start);
    const init = start.slice();
    for (let k = 0; k < 4; k++) init[k] = pre.s0[k];
    const prior = init.slice();
    let w = clip(init, numRelearn);
    const total = seqs.reduce((n, s) => n + s.reduce((m, r, i) => m + (i > 0 && r.t > 0 ? 1 : 0), 0), 0);
    if (total < 8) return { w: clip(start), items: total, skipped: true };
    if (total < 64) return { w: clip(w, numRelearn), items: total, pretrainOnly: true };

    // batches of whole sequences holding ~batchItems training items
    const order = seqs.map((_, i) => i);
    const R = rng(opts.seed || 2024);
    const batches = [];
    const makeBatches = () => {
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const out = [];
      let cur = [], cnt = 0;
      for (const i of order) {
        const n = seqs[i].reduce((m, r, k) => m + (k > 0 && r.t > 0 ? 1 : 0), 0);
        cur.push(i); cnt += n;
        if (cnt >= batchItems) { out.push([cur, cnt]); cur = []; cnt = 0; }
      }
      if (cur.length) out.push([cur, cnt]);
      return out;
    };
    const iterations = (Math.floor(total / batchItems) + 1) * epochs;
    let iter = 0;
    const m = new Array(21).fill(0), v = new Array(21).fill(0);
    const b1 = 0.9, b2 = 0.999, eps = 1e-8;
    // Summed weighted BCE over the batch plus the L2 prior scaled by batch share (as fsrs-rs).
    const objective = (wt, idx, cnt) => {
      const [L] = lossOn(wt, seqs, idx);
      let reg = 0;
      for (let i = 0; i < 21; i++) reg += Math.pow((wt[i] - prior[i]) / STDDEV[i], 2);
      return L + gamma * (cnt / total) * reg;
    };
    for (let ep = 0; ep < epochs; ep++) {
      const bs = makeBatches();
      batches.length = 0; batches.push(...bs);
      for (const [idx, cnt] of batches) {
        const lr = 0.5 * lr0 * (1 + Math.cos(Math.PI * Math.min(iter, iterations) / iterations));
        const f0 = objective(w, idx, cnt);
        const grad = new Array(21).fill(0);
        for (let i = 0; i < 21; i++) {
          const h = 1e-5 * Math.max(1, Math.abs(w[i]));
          const wp = w.slice(); wp[i] += h;
          grad[i] = (objective(wp, idx, cnt) - f0) / h;
        }
        iter++;
        for (let i = 0; i < 21; i++) {
          m[i] = b1 * m[i] + (1 - b1) * grad[i];
          v[i] = b2 * v[i] + (1 - b2) * grad[i] * grad[i];
          const mh = m[i] / (1 - Math.pow(b1, iter));
          const vh = v[i] / (1 - Math.pow(b2, iter));
          w[i] -= (lr * mh) / (Math.sqrt(vh) + eps);
        }
        w = clip(w, numRelearn);
        onProgress(Math.min(1, iter / iterations));
        if (yieldEvery && iter % yieldEvery === 0) await new Promise((r) => setTimeout(r, 0));
      }
    }
    return { w, items: total, pretrain: pre };
  }

  // ---------- workload simulator ----------
  /**
   * Simulate a learner for `days` days at a given desired retention.
   * Returns average reviews/day (excluding first sight), memorized cards at the end, and the daily series.
   */
  function simulate(w, o) {
    const days = o.days || 365;
    const newPerDay = o.newPerDay ?? 20;
    const deck = o.deckSize || 1000;
    const maxIvl = o.maxIvl || 36500;
    const first = o.firstProbs || [0.24, 0.094, 0.495, 0.171];
    const recall = o.recallProbs || [0.224, 0.631, 0.145];
    const R = rng(o.seed || 7);
    const pick = (p) => { let u = R(), acc = 0; for (let i = 0; i < p.length; i++) { acc += p[i]; if (u <= acc) return i; } return p.length - 1; };
    const S = new Float64Array(deck), D = new Float64Array(deck), L = new Int32Array(deck);
    const buckets = Array.from({ length: days }, () => []);
    const perDay = new Float64Array(days);
    let learned = 0, reviews = 0;
    const schedule = (i, day) => {
      const ivl = clamp(Math.round(intervalFor(w, S[i], o.retention)), 1, maxIvl);
      if (day + ivl < days) buckets[day + ivl].push(i);
    };
    for (let day = 0; day < days; day++) {
      const due = buckets[day];
      for (const i of due) {
        const t = day - L[i];
        const r = retrievability(w, t, S[i]);
        const g = R() < r ? pick(recall) + 2 : 1;
        const m = step(w, { s: S[i], d: D[i] }, t, g);
        S[i] = m.s; D[i] = m.d; L[i] = day;
        schedule(i, day);
        reviews++; perDay[day]++;
      }
      buckets[day] = null;
      for (let k = 0; k < newPerDay && learned < deck; k++) {
        const i = learned++;
        const g = pick(first) + 1;
        S[i] = initS(w, g); D[i] = initD(w, g); L[i] = day;
        schedule(i, day);
      }
    }
    let memorized = 0;
    for (let i = 0; i < learned; i++) memorized += retrievability(w, days - L[i], S[i]);
    return { reviewsPerDay: reviews / days, reviews, memorized, learned, perDay: Array.from(perDay) };
  }

  /** Sweep desired retention and report workload and knowledge. */
  function retentionSweep(w, o) {
    const out = [];
    for (let r = o.from || 0.7; r <= (o.to || 0.97) + 1e-9; r += o.stepSize || 0.01) {
      const ret = Math.round(r * 100) / 100;
      const sim = simulate(w, Object.assign({}, o, { retention: ret }));
      out.push({ retention: ret, reviewsPerDay: sim.reviewsPerDay, memorized: sim.memorized, learned: sim.learned });
    }
    return out;
  }

  // ---------- display helpers ----------
  function formatIvl(ms) {
    const min = ms / 60000;
    if (min < 1) return '<1m';
    if (min < 60) return Math.round(min) + 'm';
    const h = min / 60;
    if (h < 24) return (h < 10 ? Math.round(h * 10) / 10 : Math.round(h)) + 'h';
    const d = h / 24;
    if (d < 30) return Math.round(d) + 'd';
    if (d < 365) { const mo = d / 30.4; return (mo < 10 ? Math.round(mo * 10) / 10 : Math.round(mo)) + 'mo'; }
    const y = d / 365; return (y < 10 ? Math.round(y * 10) / 10 : Math.round(y)) + 'y';
  }
  function formatDays(days) { return formatIvl(days * DAY); }

  return {
    DEFAULT_W, STDDEV, S_MIN, S_MAX, DAY, NEW, LEARNING, REVIEW, RELEARNING,
    clip, normalizeParams, retrievability, intervalFor, step, nextD, initS, initD,
    preview, replay, buildDataset, lossOn, evaluate, predictions, pretrainS0, optimize,
    simulate, retentionSweep, makeClock, parseSteps, formatSteps, formatIvl, formatDays,
    fuzzRange, hash32, rng,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = FSRS;
