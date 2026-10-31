// @vitest-environment node
import { it, expect } from "vitest";
import FSRS from "../../../src/lib/fsrs/fsrs.js";
process.env.TZ = "UTC";
it("recovers most of the gap to known true weights on held-out synthetic data", async () => {
  const trueW = FSRS.DEFAULT_W.slice();
  // a learner who forgets faster, finds cards harder, and has a steeper forgetting curve
  trueW[0] = 0.5;
  trueW[1] = 0.9;
  trueW[2] = 1.6;
  trueW[3] = 5.0;
  trueW[6] = 2.2;
  trueW[8] = 1.5;
  trueW[10] = 1.1;
  trueW[11] = 1.2;
  trueW[20] = 0.35;

  const clock = FSRS.makeClock(0);
  const cfg = {
    w: trueW,
    retention: 0.88,
    maxIvl: 36500,
    learn: [1, 10],
    relearn: [10],
    fuzz: true,
    loadBalance: false,
  };
  const R = FSRS.rng(99);
  const DAY = 86400000;
  const start = Date.UTC(2025, 0, 1, 9);

  function simulateCard(id, firstDay) {
    let card = {
      st: 0,
      due: start + firstDay * DAY,
      s: 0,
      d: 0,
      last: 0,
      step: 0,
      reps: 0,
      lapses: 0,
    };
    const log = [];
    let now = card.due;
    const end = start + 400 * DAY;
    while (now < end && log.length < 40) {
      // learner shows up at the due time (+ a little lateness sometimes)
      now =
        Math.max(now, card.due) +
        (R() < 0.25 ? Math.floor(R() * 3) * DAY : 0) +
        Math.floor(R() * 2 * 3600000);
      if (now >= end) break;
      let g;
      if (card.st === 0) {
        const u = R();
        g = u < 0.2 ? 1 : u < 0.3 ? 2 : u < 0.9 ? 3 : 4;
      } else {
        const tDays = (now - card.last) / DAY;
        const p = FSRS.retrievability(trueW, tDays, card.s);
        if (R() < p) {
          const u = R();
          g = u < 0.15 ? 2 : u < 0.9 ? 3 : 4;
        } else g = 1;
      }
      const pv = FSRS.preview(card, now, cfg, { clock, key: "c" + id });
      log.push([now, g, 0]);
      card = pv[g].card;
    }
    return log;
  }

  const cards = [];
  for (let i = 0; i < 2500; i++)
    cards.push(simulateCard(i, Math.floor(i / 12)));
  const train = cards.filter((_, i) => i % 5 !== 0);
  const test = cards.filter((_, i) => i % 5 === 0);
  const dsTrain = FSRS.buildDataset(train, clock);
  const dsTest = FSRS.buildDataset(test, clock);
  const reviews = cards.reduce((n, c) => n + c.length, 0);
  console.log(
    `reviews: ${reviews}; train items: ${dsTrain.items}; test items: ${dsTest.items}`,
  );

  const t0 = Date.now();
  const res = await FSRS.optimize(dsTrain.seqs, { yieldEvery: 0 });
  const ms = Date.now() - t0;
  const evDefault = FSRS.evaluate(FSRS.DEFAULT_W, dsTest.seqs);
  const evOpt = FSRS.evaluate(res.w, dsTest.seqs);
  const evTrue = FSRS.evaluate(trueW, dsTest.seqs);
  const fmt = (e) =>
    `logloss ${e.logLoss.toFixed(4)}  rmse ${(e.rmse * 100).toFixed(2)}%`;
  console.log(`optimize took ${ms} ms`);
  console.log("default  :", fmt(evDefault));
  console.log("optimized:", fmt(evOpt));
  console.log("true     :", fmt(evTrue));
  console.log(
    "S0 pretrain:",
    res.pretrain.s0.map((x) => x.toFixed(3)).join(" "),
    "counts",
    res.pretrain.counts.join(" "),
  );
  console.log("w opt :", res.w.map((x) => x.toFixed(3)).join(" "));
  console.log("w true:", trueW.map((x) => x.toFixed(3)).join(" "));
  const ok =
    evOpt.logLoss < evDefault.logLoss &&
    evOpt.logLoss - evTrue.logLoss < 0.6 * (evDefault.logLoss - evTrue.logLoss);
  expect(ok).toBe(true);

  // simulator sanity: higher retention => more reviews per day, more memorized
  const sweep = FSRS.retentionSweep(FSRS.DEFAULT_W, {
    from: 0.75,
    to: 0.95,
    stepSize: 0.05,
    days: 365,
    newPerDay: 20,
    deckSize: 3000,
  });
  for (const r of sweep)
    console.log(
      `  retention ${r.retention}: ${r.reviewsPerDay.toFixed(1)} reviews/day, memorized ${r.memorized.toFixed(0)} of ${r.learned}`,
    );
  const t1 = Date.now();
  FSRS.retentionSweep(FSRS.DEFAULT_W, {
    from: 0.7,
    to: 0.97,
    stepSize: 0.01,
    days: 365,
    newPerDay: 20,
    deckSize: 3000,
  });
  console.log(`full sweep (28 sims) took ${Date.now() - t1} ms`);
}, 120_000);
