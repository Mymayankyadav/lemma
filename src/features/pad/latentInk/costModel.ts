/**
 * N248 · When is auto-inserting a drawn symbol cheaper than tapping one of three choices?
 *
 * One drawn symbol ends in one of two ways:
 *  - Choose: the learner scans the three choices and taps one (or, when the symbol is not among them, falls back
 *    to Browse/redraw). This is what the strip does today.
 *  - Auto: the top reading goes in when the learner moves on (another key, another symbol). A right reading costs a
 *    glance. A wrong one costs noticing it and a one-tap replace from the strip (or a redraw when the symbol is not
 *    among the alternatives), and an error noticed only later costs far more.
 *
 * Auto is worth it for a reading of confidence c when (1 − c) · E[fix] < E[choose] − glance. The confidence that
 * reaches the policy is not calibrated: the simulation draws calibrated probabilities whose mean and top-3 rate match
 * published Detexify-family results, then distorts them by an overconfidence temperature before thresholding, and
 * keeps only a threshold whose gain stays positive in every scenario.
 *
 * Published results used (all for Detexify-style single-symbol recognisers):
 *  - Thoma 2015, on-line recogniser trained on Detexify + write-math data: top-1 error < 17.5 %, top-3 error 4.0 %.
 *  - Kirsch 2010 (Detexify): top-3 error < 10 % on 100 symbols.
 *  - Thoma 2017 HASYv2 (369 Detexify-derived classes): best CNN top-1 ≈ 81 %.
 */

export type CostParameters = Readonly<{
  /** Seconds to scan three choices (Hick–Hyman, three alternatives plus none) and decide. */
  scan: number;
  /** Seconds for one tap on a nearby touch target. */
  tap: number;
  /** Seconds to glance at the strip to confirm an auto-inserted symbol. */
  glance: number;
  /** Seconds to notice a wrong auto-inserted symbol once looked at. */
  notice: number;
  /** Probability that a wrong auto-insert is noticed at once. */
  noticeRate: number;
  /** Seconds to find and fix a wrong symbol noticed only later (re-read, move the caret, fix). */
  lateFix: number;
  /** Seconds to Browse or redraw when the symbol is not among the three readings. */
  miss: number;
}>;

/** Touch keyboard timings: tap and choice-scan from mobile KLM work; late fixes are taken pessimistically. */
export const DEFAULT_COSTS: CostParameters = {
  scan: .5, tap: .45, glance: .25, notice: .6, noticeRate: .85, lateFix: 8, miss: 4,
};

export type RecognizerProfile = Readonly<{
  /** Mean top-1 accuracy. */
  top1: number;
  /** Top-3 accuracy. */
  top3: number;
  /** Beta concentration of the calibrated confidence: small values put more readings at the extremes. */
  concentration: number;
  /** Overconfidence: displayed logit = temperature × calibrated logit. 1 is perfectly calibrated. */
  temperature: number;
}>;

/** Published Detexify-family accuracy (Thoma 2015): 82.5 % top-1, 96 % top-3. */
export const DETEXIFY_PROFILE: RecognizerProfile = {top1: .825, top3: .96, concentration: 2.5, temperature: 1};

/** Scenarios a threshold must survive: calibrated through strongly overconfident, sharp through diffuse,
 *  and a weaker top-1 (HASYv2 81 %, Detexify's ≤ 90 % top-3). */
export const ROBUSTNESS_SCENARIOS: readonly RecognizerProfile[] = [
  ...[1, 1.5, 2.2].flatMap(temperature => [1.5, 2.5, 6].map(concentration => ({...DETEXIFY_PROFILE, temperature, concentration}))),
  {top1: .81, top3: .90, concentration: 2.5, temperature: 1.5},
  {top1: .75, top3: .90, concentration: 2.5, temperature: 2.2},
];

/** Expected seconds for the learner to pick from three choices (the baseline). */
export function chooseCost(inTop3: boolean, costs: CostParameters = DEFAULT_COSTS) {
  return costs.scan + (inTop3 ? costs.tap : costs.miss);
}

/** Expected seconds after an auto-insert. */
export function autoCost(correct: boolean, inTop3: boolean, costs: CostParameters = DEFAULT_COSTS) {
  if (correct) return costs.glance;
  const fix = costs.notice + chooseCost(inTop3, costs);
  return costs.glance + costs.noticeRate * fix + (1 - costs.noticeRate) * costs.lateFix;
}

/** Below this confidence a reading is not inserted even when the learner moves on: the expected cost of a wrong
 *  insert exceeds redrawing a symbol left out, or the reading is likely a shape outside the catalogue (a digit,
 *  a letter). From the costs: inserting is right when (1 − c) · E[wrong auto] < E[omission]; held to ≥ .35. */
export function boundaryFloor(costs: CostParameters = DEFAULT_COSTS, alternativeRate = .77) {
  const wrongAuto = alternativeRate * autoCost(false, true, costs) + (1 - alternativeRate) * autoCost(false, false, costs);
  const omission = costs.notice + costs.miss;
  return Math.max(.35, 1 - omission / wrongAuto);
}

/** Calibrated confidence above which auto-insert costs less than choosing, for a wrong reading still in the top 3
 *  with probability `alternativeRate`. */
export function breakEvenConfidence(costs: CostParameters = DEFAULT_COSTS, alternativeRate = .77) {
  // Choose: scan + tap (right) — the top-1 being right means the symbol is among the three.
  const chooseRight = chooseCost(true, costs);
  const wrongChoose = alternativeRate * chooseCost(true, costs) + (1 - alternativeRate) * chooseCost(false, costs);
  const wrongAuto = alternativeRate * autoCost(false, true, costs) + (1 - alternativeRate) * autoCost(false, false, costs);
  // Auto better when c·glance + (1−c)·wrongAuto < c·chooseRight + (1−c)·wrongChoose.
  const a = chooseRight - costs.glance, b = wrongAuto - wrongChoose;
  return b / (a + b);
}

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random: () => number) {
  const u = Math.max(random(), 1e-12), v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Marsaglia–Tsang gamma sampler (shape boosted below 1). */
function gamma(shape: number, random: () => number): number {
  if (shape < 1) return gamma(shape + 1, random) * Math.pow(Math.max(random(), 1e-12), 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {x = gaussian(random); v = 1 + c * x;} while (v <= 0);
    v = v * v * v;
    const u = random();
    if (u < 1 - .0331 * x ** 4 || Math.log(u) < .5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export type Reading = Readonly<{shown: number; correct: boolean; inTop3: boolean}>;

/** Draw readings: a calibrated probability p ~ Beta(mean top1), right with probability p, shown as distorted. */
export function sampleReadings(profile: RecognizerProfile, count: number, seed = 248): Reading[] {
  const random = mulberry32(seed);
  const alpha = profile.top1 * profile.concentration, beta = (1 - profile.top1) * profile.concentration;
  const alternativeRate = (profile.top3 - profile.top1) / (1 - profile.top1);
  const readings: Reading[] = [];
  for (let index = 0; index < count; index++) {
    const x = gamma(alpha, random), y = gamma(beta, random);
    const p = Math.min(1 - 1e-9, Math.max(1e-9, x / (x + y)));
    const correct = random() < p;
    const inTop3 = correct || random() < alternativeRate;
    const logit = Math.log(p / (1 - p)) * profile.temperature;
    readings.push({shown: 1 / (1 + Math.exp(-logit)), correct, inTop3});
  }
  return readings;
}

export type ThresholdPoint = Readonly<{
  threshold: number;
  /** ROC: share of right readings auto-inserted, and of wrong ones. */
  truePositiveRate: number;
  falsePositiveRate: number;
  /** Share of symbols auto-inserted, and the error rate among them. */
  coverage: number;
  autoErrorRate: number;
  /** Mean seconds saved per symbol against always choosing (positive is better). */
  gainPerSymbol: number;
}>;

export function evaluateThreshold(readings: readonly Reading[], threshold: number, costs: CostParameters = DEFAULT_COSTS): ThresholdPoint {
  let right = 0, wrong = 0, autoRight = 0, autoWrong = 0, gain = 0;
  for (const reading of readings) {
    if (reading.correct) right++; else wrong++;
    if (reading.shown < threshold) continue;
    if (reading.correct) autoRight++; else autoWrong++;
    gain += chooseCost(reading.inTop3, costs) - autoCost(reading.correct, reading.inTop3, costs);
  }
  const auto = autoRight + autoWrong;
  return {
    threshold,
    truePositiveRate: right ? autoRight / right : 0,
    falsePositiveRate: wrong ? autoWrong / wrong : 0,
    coverage: readings.length ? auto / readings.length : 0,
    autoErrorRate: auto ? autoWrong / auto : 0,
    gainPerSymbol: readings.length ? gain / readings.length : 0,
  };
}

export const THRESHOLD_GRID: readonly number[] = Array.from({length: 49}, (_, index) => (50 + index) / 100);

export type ThresholdChoice = Readonly<{
  threshold: number;
  /** Worst scenario's gain at that threshold (seconds per symbol). */
  worstGain: number;
  perScenario: readonly ThresholdPoint[];
}>;

/** The threshold that maximises the worst scenario's gain. With no positive worst-case gain, auto-insert is off (1). */
export function chooseRobustThreshold(scenarios: readonly RecognizerProfile[] = ROBUSTNESS_SCENARIOS,
  costs: CostParameters = DEFAULT_COSTS, samples = 20_000): ThresholdChoice {
  const sets = scenarios.map((profile, index) => sampleReadings(profile, samples, 248 + index));
  let best: ThresholdChoice = {threshold: 1, worstGain: 0, perScenario: []};
  for (const threshold of THRESHOLD_GRID) {
    const perScenario = sets.map(readings => evaluateThreshold(readings, threshold, costs));
    const worstGain = Math.min(...perScenario.map(point => point.gainPerSymbol));
    if (worstGain > best.worstGain) best = {threshold, worstGain, perScenario};
  }
  return best;
}

/**
 * The threshold the Pad uses, from `chooseRobustThreshold()` with the defaults above (recorded with its table in
 * docs/current/N248.md; a unit test re-runs the simulation and fails if this drifts). The online guard in
 * latentInkPolicy.ts raises it for a learner whose own corrections show more errors than the break-even rate.
 */
export const AUTO_INSERT_THRESHOLD = .83;
