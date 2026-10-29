// @vitest-environment node
import { it, expect } from "vitest";
import FSRS from "../../../src/lib/fsrs/fsrs.js";
import {
  fsrs,
  createEmptyCard,
  FSRSAlgorithm,
  default_w,
  generatorParameters,
} from "ts-fsrs";
import {
  preview,
  scheduleConfig,
  toEngineCard,
  fromEngineCard,
  reviewDataset,
  makeClock,
} from "../../../src/lib/fsrs";
import { card, NOW, settings } from "./fixtures";
process.env.TZ = "UTC";
it("matches ts-fsrs 5.4.1 over the full legacy golden comparison", () => {
  const failures: string[] = [];
  const check = (cond: boolean, msg: string) => {
    if (!cond) {
      failures.push(msg);
    }
  };
  const rel = (a: number, b: number) =>
    Math.abs(a - b) / Math.max(1e-9, Math.abs(b));
  // ts-fsrs rounds intermediate memory values to 8 decimal places. Over 14
  // transitions, a relative-only bound exaggerates that error for tiny stability.
  // Keep the 1ppm relative bound plus 1e-7 days (8.64ms) absolute rounding allowance.
  const closeStability = (a: number, b: number) =>
    Math.abs(a - b) <= 1e-7 + 1e-6 * Math.abs(b);

  const w = [...default_w];
  const alg = new FSRSAlgorithm(
    generatorParameters({ w, enable_short_term: true, enable_fuzz: false }),
  );

  // 1. Initial states
  for (const g of [1, 2, 3, 4]) {
    const ref = alg.next_state(null, 0, g);
    const mine = FSRS.step(w, null, 0, g);
    check(
      rel(mine.s, Math.max(w[g - 1], 0.1)) < 1e-9 &&
        rel(mine.d, ref.difficulty) < 1e-7,
      `init g=${g} ${JSON.stringify(mine)} vs ${JSON.stringify(ref)}`,
    );
  }

  // 2. Random memory transitions
  const R = FSRS.rng(1);
  let n2 = 0;
  for (let i = 0; i < 20000; i++) {
    const s = Math.exp(
      Math.log(0.01) + R() * (Math.log(3000) - Math.log(0.01)),
    );
    const d = 1 + R() * 9;
    const t = R() < 0.2 ? 0 : Math.floor(R() * 500);
    const g = 1 + Math.floor(R() * 4);
    const ref = alg.next_state({ stability: s, difficulty: d }, t, g);
    const mine = FSRS.step(w, { s, d }, t, g);
    n2++;
    check(
      rel(mine.s, ref.stability) < 1e-6,
      `S s=${s} d=${d} t=${t} g=${g}: ${mine.s} vs ${ref.stability}`,
    );
    check(
      Math.abs(mine.d - ref.difficulty) < 1e-6,
      `D s=${s} d=${d} t=${t} g=${g}: ${mine.d} vs ${ref.difficulty}`,
    );
  }

  // 3. Forgetting curve and intervals
  for (let i = 0; i < 5000; i++) {
    const s = Math.exp(Math.log(0.01) + R() * 10);
    const t = R() * 1000;
    check(
      Math.abs(FSRS.retrievability(w, t, s) - alg.forgetting_curve(t, s)) <
        1e-7,
      `R t=${t} s=${s}`,
    );
    const ivlRef = alg.next_interval(s, 0);
    const ivlMine = Math.min(
      Math.max(1, Math.round(FSRS.intervalFor(w, s, 0.9))),
      36500,
    );
    check(ivlRef === ivlMine, `ivl s=${s}: ${ivlMine} vs ${ivlRef}`);
  }
  // interval at other retentions
  for (const ret of [0.8, 0.85, 0.95]) {
    const a2 = new FSRSAlgorithm(
      generatorParameters({ w, request_retention: ret, enable_fuzz: false }),
    );
    for (let i = 0; i < 2000; i++) {
      const s = Math.exp(Math.log(0.05) + R() * 9);
      const ivlRef = a2.next_interval(s, 0);
      const ivlMine = Math.min(
        Math.max(1, Math.round(FSRS.intervalFor(w, s, ret))),
        36500,
      );
      check(
        ivlRef === ivlMine,
        `ivl ret=${ret} s=${s}: ${ivlMine} vs ${ivlRef}`,
      );
    }
  }

  // 4. Full scheduler walk with learning steps, compared state-by-state
  const f = fsrs({
    w,
    enable_fuzz: false,
    enable_short_term: true,
    learning_steps: ["1m", "10m"],
    relearning_steps: ["10m"],
  });
  const clock = FSRS.makeClock(0);
  const cfg = {
    w,
    retention: 0.9,
    maxIvl: 36500,
    learn: [1, 10],
    relearn: [10],
    fuzz: false,
    loadBalance: false,
  };
  let walks = 0,
    compared = 0,
    skippedHard = 0;
  for (let walk = 0; walk < 400; walk++) {
    let ref: any = createEmptyCard(new Date(Date.UTC(2026, 0, 1, 10, 0, 0)));
    let mine: any = {
      st: 0,
      due: ref.due.getTime(),
      s: 0,
      d: 0,
      last: 0,
      step: 0,
      reps: 0,
      lapses: 0,
    };
    let now = ref.due.getTime();
    for (let k = 0; k < 14; k++) {
      // occasionally review late or early
      const jitter = R() < 0.3 ? Math.floor(R() * 5) * 86400000 : 0;
      now = Math.max(now, mine.due) + jitter + Math.floor(R() * 3600000);
      const pv = FSRS.preview(mine, now, cfg, { clock, key: "w" + walk });
      const rf = f.repeat(ref, new Date(now));
      for (const g of [1, 2, 3, 4]) {
        const a = pv[g].card,
          b = rf[g].card;
        const learningHardLater =
          (mine.st === 1 || mine.st === 3) && g === 2 && mine.step > 0;
        compared++;
        check(
          closeStability(a.s, b.stability),
          `walk ${walk} k ${k} g ${g} S ${a.s} vs ${b.stability} st=${mine.st}`,
        );
        check(
          Math.abs(a.d - b.difficulty) < 1e-6,
          `walk ${walk} k ${k} g ${g} D ${a.d} vs ${b.difficulty}`,
        );
        check(
          a.st === b.state,
          `walk ${walk} k ${k} g ${g} state ${a.st} vs ${b.state} (from ${mine.st} step ${mine.step})`,
        );
        if (learningHardLater) {
          skippedHard++;
          continue;
        }
        if (b.scheduled_days > 0) {
          const myDays = clock.dayIndex(a.due) - clock.dayIndex(now);
          // ts-fsrs does not force Easy > Good when both graduate from learning; ours does (as Anki).
          const easyGraduation = g === 4 && mine.st !== 2;
          check(
            easyGraduation
              ? myDays >= b.scheduled_days
              : myDays === b.scheduled_days,
            `walk ${walk} k ${k} g ${g} days ${myDays} vs ${b.scheduled_days} st=${mine.st}`,
          );
        } else {
          check(
            Math.abs(a.due - b.due.getTime()) < (g === 2 ? 30001 : 1000),
            `walk ${walk} k ${k} g ${g} due ${a.due - now} vs ${b.due.getTime() - now}`,
          );
        }
      }
      const g = 1 + Math.floor(R() * 4);
      mine = pv[g].card;
      ref = rf[g].card;
    }
    walks++;
  }
  console.log(
    `memory transitions: ${n2}, scheduler comparisons: ${compared} over ${walks} walks (skipped ${skippedHard} later-step Hard delays, which follow Anki)`,
  );
  expect(failures).toEqual([]);
}, 30_000);
it("round-trips domain states and applies previews without changing the engine", () => {
  const state = card("c").state,
    cfg = scheduleConfig(settings);
  expect(fromEngineCard(toEngineCard(state))).toEqual(state);
  const result = preview(state, NOW, cfg, { key: "c" });
  const raw = FSRS.preview(toEngineCard(state), NOW, cfg, {
    clock: makeClock(4, "UTC"),
    key: "c",
  });
  for (const grade of [1, 2, 3, 4] as const) {
    expect(result[grade].card).toEqual(fromEngineCard(raw[grade].card));
    expect(result[grade].label).toBe(FSRS.formatIvl(raw[grade].delay));
  }
  const rows = [
    {
      cardId: "b",
      reviewedAt: new Date(NOW).toISOString(),
      rating: 3 as const,
    },
    {
      cardId: "b",
      reviewedAt: new Date(NOW - 86400000).toISOString(),
      rating: 1 as const,
    },
  ];
  expect(
    reviewDataset(rows, makeClock(4, "UTC")).seqs[0].map((r) => r.g),
  ).toEqual([1, 3]);
  expect(() => scheduleConfig({ ...settings, learnSteps: "bad" })).toThrow(
    "learning steps",
  );
});
