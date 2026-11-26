/** An as-of snapshot shared by the Path and MCP. All times are supplied by the caller. */
export interface BlueprintRow {
  key: string; title: string; marks: number; marks_low?: number; marks_high?: number; chance?: number;
  compulsory?: boolean; provisional?: boolean; section?: string; format?: string; difficulty?: string;
  level?: string; minutes?: number; concepts?: string[]; checkpoints?: string[]; prereqs?: string[];
  source?: string; note?: string;
}
export interface Disposition { disposition: 'probe' | 'teach' | 'practice' | 'skip' | 'defer' | 'pin'; reason?: string; reopen?: string; at?: string }
export interface ExamSitting {
  id: string; project_id: string; title: string; status: 'planned' | 'active' | 'paused' | 'finished' | 'cancelled';
  phase: 'map' | 'screen' | 'teach' | 'verify'; card_mode: 'later' | 'now' | 'quiet'; time_zone: string;
  starts_at: string | null; study_minutes: number | null; last_study_at?: string | null; duration_minutes?: number | null;
  total_marks?: number | null; objective?: 'expected_marks' | 'pass_threshold'; pass_marks?: number | null; format?: string | null;
  activation_study_minutes?: number | null; study_minutes_set_at?: string | null; updated_at?: string; finished_at?: string | null;
  version: number; blueprint_version: number; blueprint: BlueprintRow[]; ledger: Record<string, Disposition>;
  bookmark?: {checkpoint?: string; title?: string; step?: number; steps?: number; session?: number; question?: string; capturedAt?: string} | null;
  next_question?: string | null; plan_note?: string | null;
}
export interface ExamAttempt {
  row_key: string; occurred_at: string; outcome: string; independence: string; hint_level: number; novelty: string;
  marks_awarded?: number | null; marks_possible?: number | null; confidence?: string; timed?: boolean; seconds?: number | null; voided_at?: string | null;
}
export interface ConceptEvidence { concept: string; occurred_at: string; outcome: string; hint_level: number; novelty: string; kind?: string; voided_at?: string | null }
export type EvidenceStatus = 'secure' | 'gap' | 'shaky' | 'stale' | 'unseen' | 'conflicting';
export interface ExamRow {
  row: BlueprintRow; status: EvidenceStatus; fact: string; expected: number; low: number; high: number;
  exposure: number; probability: number; disposition?: Disposition;
}
export interface ExamAction { kind: 'probe' | 'teach' | 'practice' | 'verify' | 'review' | 'rest' | 'confirm' | 'map' | 'resume'; keys: string[]; minutes: number; why: string }
export interface ExamPlan {
  rows: ExamRow[]; coverage: {accounted: number; secure: number; deferred: number}; next: ExamAction; runnerUp?: ExamAction;
  minutes: number | null; conflicts: string[];
}
export interface ExamSnapshot {sitting: ExamSitting; attempts: ExamAttempt[]; evidence: ConceptEvidence[]; now: string; slotMinutes?:number}
const day = 86_400_000;
const estimates: Record<EvidenceStatus, [number, number]> = {
  secure: [.85, .70], stale: [.65, .40], shaky: [.55, .35], conflicting: [.55, .25], unseen: [.50, .15], gap: [.25, .10],
};
const credits = new Map([['correct', 1], ['pass', 1], ['partial', .5], ['incorrect', 0], ['fail', 0]]);
interface Observation { time: number; credit: number; independent: boolean; guess: boolean; exam: boolean; outcome: string; timed: boolean; seconds?: number | null }

function classify(row: BlueprintRow, snapshot: ExamSnapshot): {status: EvidenceStatus; fact: string} {
  const observations: Observation[] = [];
  const now = Date.parse(snapshot.now);
  const add = (e: ExamAttempt | ConceptEvidence, exam: boolean, independent: boolean, guess: boolean, credit: number | undefined) => {
    const time = Date.parse(e.occurred_at);
    if (e.voided_at || credit === undefined || !Number.isFinite(time) || time > now) return;
    observations.push({time, credit, independent, guess, exam, outcome:e.outcome, timed:'timed' in e && !!e.timed, seconds:'seconds' in e ? e.seconds : null});
  };
  for (const e of snapshot.attempts) {
    if (e.row_key !== row.key || !credits.has(e.outcome) || e.independence === 'reading') continue;
    const credit = e.marks_awarded != null && e.marks_possible ? e.marks_awarded / e.marks_possible : credits.get(e.outcome);
    add(e, true, e.independence === 'independent' && e.hint_level === 0 && e.novelty !== 'seen_solution',
      e.confidence === 'low' && row.format?.toLowerCase() === 'mcq', credit);
  }
  for (const e of snapshot.evidence) {
    if (!row.concepts?.includes(e.concept) || e.novelty === 'self_reported') continue;
    add(e, false, e.hint_level === 0 && e.novelty !== 'seen_solution', false, credits.get(e.outcome));
  }
  observations.sort((a, b) => b.time - a.time || Number(b.exam) - Number(a.exam));
  // A linked course event and its more precise row score can have the same timestamp.
  const examTimes = new Set(observations.filter(o => o.exam).map(o => o.time));
  const independent = observations.filter(o => o.independent && (o.exam || !examTimes.has(o.time)));
  const recent = independent.filter(o => now - o.time <= 7 * day);
  const latest = independent[0];
  function fact(o: Observation) {
    const date = new Intl.DateTimeFormat('en-GB', {day:'numeric', month:'short', timeZone:snapshot.sitting.time_zone}).format(o.time);
    return `${o.outcome} ${date}, ${o.independent ? 'independent' : 'assisted'}${o.timed ? ', timed'+(o.seconds != null ? ` ${o.seconds} s` : '') : ''}${o.guess ? ', low confidence' : ''}`;
  }
  if (!latest) {
    const assisted = observations.find(o => !o.independent && o.credit > 0);
    return assisted ? {status: 'shaky', fact: fact(assisted)} : {status: 'unseen', fact: 'No independent result'};
  }
  const success = recent.find(o => o.credit >= .8 && !o.guess), failure = recent.find(o => o.credit < .4);
  if (success && failure) return {status: 'conflicting', fact: `${fact(success)} / ${fact(failure)}`};
  const age = now - latest.time;
  let status: EvidenceStatus = 'shaky';
  if (latest.credit < .4) status = 'gap';
  else if (latest.credit >= .8 && !latest.guess) {
    if (age <= (latest.exam ? 14 : 7) * day) status = 'secure';
    else if (age > 21 * day) status = 'stale';
  }
  return {status, fact: fact(latest)};
}

const lessonTime = (r: ExamRow) => r.row.minutes ? Math.max(6, Math.min(15, Math.round(.6 * r.row.minutes))) : 8;
const teaching = (r: ExamRow) => r.disposition?.disposition !== 'practice';
const cost = (r: ExamRow) => teaching(r) ? lessonTime(r) : 5;
const gain = (r: ExamRow) => r.expected * (1 - r.probability) * (teaching(r) ? .25 : .15);
const rowOrder = (a: ExamRow, b: ExamRow) => Number(!!b.row.compulsory) - Number(!!a.row.compulsory) || b.expected - a.expected;
const action = (kind: ExamAction['kind'], why: string, keys: string[] = [], minutes = 0): ExamAction => ({kind, keys, minutes, why});

function selectActions(rows: ExamRow[], sitting: ExamSitting, budget: number, remaining=budget): ExamAction[] {
  if (!rows.length) return [action('map', 'Ask for the next scored task family or revisit a deferred row.')];
  const byKey = new Map(rows.map(r => [r.row.key, r]));
  const pins = rows.some(r => r.disposition?.disposition === 'pin');
  if (!pins && (sitting.phase === 'verify' || rows.every(r => r.status === 'secure') ||
      (sitting.activation_study_minutes && remaining <= .2 * sitting.activation_study_minutes))) {
    // A full proof gets a slot first on a proof paper. Use the largest remaining weights that fit.
    const sample = [...rows].sort((a, b) => Number(b.row.format === 'proof') - Number(a.row.format === 'proof') || rowOrder(a, b));
    const keys: string[] = [];
    let minutes = 0;
    for (const r of sample) {
      const duration = r.row.minutes ?? 5;
      if (minutes + duration <= budget && keys.length < 4) { keys.push(r.row.key); minutes += duration; }
    }
    if (keys.length) return [action('verify', 'Try a fresh timed mix in the paper’s format.', keys, minutes)];
    return [action('rest', 'There is no time for a timed item. Read a light recap or rest.')];
  }
  const weights = rows.map(r => r.expected).sort((a,b) => a-b);
  const median = (weights[Math.floor((weights.length - 1) / 2)] + weights[Math.floor(weights.length / 2)]) / 2;
  const candidates: {item: ExamAction; row: ExamRow; rank: number; rate: number}[] = [];
  for (const r of rows) {
    const pinned = r.disposition?.disposition === 'pin';
    if (r.status === 'secure' && !pinned) continue;
    const rank = pinned ? 0 : 10;
    const prereqs = (r.row.prereqs ?? []).map(key => byKey.get(key)).filter((p): p is ExamRow => !!p && p.status === 'gap');
    // Include the cost of the prerequisite repair in both feasibility and ordering.
    const bundle = [...prereqs, r], duration = bundle.reduce((n, p) => n + cost(p), 0);
    const rate = bundle.reduce((n, p) => n + gain(p), 0) / duration;
    if (duration <= budget) candidates.push({row: r, rank: rank + (r.status === 'gap' || prereqs.length ? 2 : 3), rate,
      item: action(teaching(r) ? 'teach' : 'practice', prereqs.length ? 'Repair the prerequisite, then use it on the scored item.' : teaching(r) ? 'Work on the method, then try a fresh unhinted item.' : 'Practise the execution and check it independently.', bundle.map(p => p.row.key), duration)});
    const uncertain = ['unseen', 'stale', 'conflicting'].includes(r.status) || (r.status === 'shaky' && r.expected >= median);
    if (!uncertain || prereqs.length || r.expected < Math.max(3, .5 * median)) continue;
    const probeTime = r.row.format === 'mcq' ? 1 : 2;
    if (probeTime + cost(r) > budget) continue;
    const alternatives = rows.filter(o => o !== r && o.status !== 'secure' && cost(o) + probeTime <= budget);
    const alternative = alternatives.sort((a,b) => gain(b)/cost(b) - gain(a)/cost(a) || rowOrder(a,b))[0];
    if (!alternative) continue;
    const fallbackRate = gain(alternative) / cost(alternative);
    const otherGain = fallbackRate * cost(r), factor = teaching(r) ? .25 : .15;
    const secureGain = r.expected * .15 * factor, gapGain = r.expected * .75 * factor;
    if (otherGain <= secureGain || otherGain >= gapGain) continue;
    // Charge the check at the alternative lesson's marginal rate, using the two R1 scenarios.
    const gapChance = (.85 - r.probability) / (.85 - .25);
    const advantage = gapChance * gapGain + (1-gapChance) * otherGain - Math.max(gain(r),otherGain) - fallbackRate * probeTime;
    if (advantage <= 0) continue;
    const dependent = rows.some(o => o.row.prereqs?.includes(r.row.key));
    candidates.push({row:r, rank:rank + (dependent ? 0 : 1), rate:advantage / probeTime,
      item: action('probe', `A ${probeTime}-minute check decides the next lesson. If correct, ${teaching(alternative) ? 'teach' : 'practise'} ${alternative.row.key}. Otherwise work on ${r.row.key}.`, [r.row.key], probeTime)});
  }
  candidates.sort((a,b) => a.rank-b.rank || b.rate-a.rate || rowOrder(a.row,b.row));
  const first = candidates[0];
  if (!first) return [action('rest', 'No useful lesson fits the minutes left. Read a light recap or rest.')];
  if (first.item.kind !== 'probe') return candidates.map(c => c.item);
  const batch = [first];
  let minutes = first.item.minutes;
  for (const c of candidates.slice(1)) {
    if (rows.some(r => r.row.prereqs?.includes(first.row.row.key)) || c.rank !== first.rank || c.item.kind !== 'probe' || batch.length === 4) break;
    if (minutes + c.item.minutes + Math.max(cost(c.row), ...batch.map(b => cost(b.row))) > budget ||
        batch.some(b => b.row.row.prereqs?.includes(c.row.row.key) || c.row.row.prereqs?.includes(b.row.row.key))) continue;
    batch.push(c); minutes += c.item.minutes;
  }
  const keys = batch.map(b => b.row.row.key);
  return [{...first.item, keys, minutes}, ...candidates.filter(c => c.item.kind !== 'probe' && !keys.includes(c.row.row.key)).map(c => c.item)];
}

export function planExam(snapshot: ExamSnapshot): ExamPlan {
  const {sitting, now} = snapshot;
  const rows = sitting.blueprint.map(row => {
    const {status, fact} = classify(row, snapshot), [probability, lower] = estimates[status];
    const chance = row.chance ?? 1, expected = row.marks * chance;
    return {row, status, fact, expected, probability, exposure: expected * (1 - lower),
      low: (row.marks_low ?? row.marks) * chance, high: (row.marks_high ?? row.marks) * chance, disposition: sitting.ledger[row.key]};
  });
  const sum = (selected: ExamRow[]) => selected.reduce((n, r) => n + r.expected, 0);
  const coverage = {accounted: sum(rows), secure: sum(rows.filter(r => r.status === 'secure')), deferred: sum(rows.filter(r => r.disposition?.disposition === 'defer'))};
  const minutes = sitting.last_study_at && Date.parse(now) > Date.parse(sitting.last_study_at) ? 0 : sitting.study_minutes;
  const eligible = rows.filter(r => !['skip','defer'].includes(r.disposition?.disposition ?? ''));
  const conflicts = rows.filter(r => r.row.compulsory && r.status !== 'secure' && (r.disposition?.disposition === 'defer' ||
    r.disposition?.disposition === 'skip' || (minutes != null && (r.status === 'gap' ? cost(r) : r.row.format === 'mcq' ? 1 : 2) > minutes)))
    .map(r => `Compulsory ${r.row.title}: ${r.exposure.toFixed(1)} marks exposed.`);
  let actions: ExamAction[];
  if (sitting.status === 'finished' || sitting.status === 'cancelled') actions = [action('resume', 'Return to the current course task and offer saved card ideas.')];
  else if (sitting.starts_at && Date.parse(now) >= Date.parse(sitting.starts_at)) actions = [action('confirm', 'Ask whether the exam took place or was postponed before finishing.')];
  else if (minutes === 0) actions = [action('rest', 'Light recap only, or rest. Reading counts as exposure.')];
  else if (minutes == null) actions = [action('map', 'Ask how many study minutes are available before choosing a lesson.')];
  else actions = selectActions(eligible, sitting, Math.min(minutes,snapshot.slotMinutes??minutes), minutes);
  return {rows, coverage, minutes, conflicts, next: actions[0], runnerUp: actions[1]};
}
