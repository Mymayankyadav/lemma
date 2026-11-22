/** Pure development-replay metrics; no user behavior or device timing is inferred. */
export interface CompletionProbe {
  id: string;
  text: string;
  intended: string;
  mode?: 'balanced' | 'fast' | 'strict';
}
export interface WordTarget {
  id: string;
  context: string;
  target: string;
  mode: 'balanced' | 'fast' | 'strict';
  originalPrefixLength: number;
}
export interface PrefixOpportunity {
  prefixLength: number;
  pool: readonly string[];
  displayed: readonly string[];
}
export interface WordReplay {
  id: string;
  target: string;
  opportunities: readonly PrefixOpportunity[];
}

/** Keep the source probes intact; expand only the final, explicitly named ASCII word. */
export function deriveWordTargets(probes: readonly CompletionProbe[]): WordTarget[] {
  const ids = new Set<string>();
  return probes.map(probe => {
    const prefix = probe.text.match(/[A-Za-z]+$/u)?.[0];
    if (!probe.id || ids.has(probe.id) || !prefix || !/^[A-Za-z]+$/u.test(probe.intended) ||
        !probe.intended.startsWith(prefix) || prefix.length >= probe.intended.length ||
        !['balanced', 'fast', 'strict'].includes(probe.mode ?? 'balanced')) {
      throw new Error('Invalid or duplicate development completion probe');
    }
    ids.add(probe.id);
    return {id: probe.id, context: probe.text.slice(0, -prefix.length), target: probe.intended,
      mode: probe.mode ?? 'balanced', originalPrefixLength: prefix.length};
  });
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator ? numerator / denominator : null;
}

function checkReplay(replay: WordReplay): void {
  if (!replay.id || !/^[A-Za-z]+$/u.test(replay.target) || replay.opportunities.length !== replay.target.length) {
    throw new Error('Each target requires every prefix from zero through its penultimate character');
  }
  replay.opportunities.forEach((opportunity, index) => {
    if (opportunity.prefixLength !== index || opportunity.displayed.length > 3 ||
        new Set(opportunity.pool).size !== opportunity.pool.length ||
        new Set(opportunity.displayed).size !== opportunity.displayed.length ||
        opportunity.displayed.some(word => !opportunity.pool.includes(word))) {
      throw new Error('Invalid prefix trajectory or a displayed word outside its eligible pool');
    }
  });
}

/** Rank is one-based; zero means the target is absent from the first k displayed candidates. */
export function displayedRank(opportunity: PrefixOpportunity, target: string, k = 3): number {
  const index = opportunity.displayed.slice(0, k).indexOf(target);
  return index < 0 ? 0 : index + 1;
}

export function measureWordReplays(replays: readonly WordReplay[]) {
  if (!replays.length || new Set(replays.map(row => row.id)).size !== replays.length) {
    throw new Error('A nonempty set of distinct target tasks is required');
  }
  replays.forEach(checkReplay);
  const opportunities = replays.flatMap(row => row.opportunities.map(opportunity => ({target: row.target, opportunity})));
  const anyPrefixPoolHits = replays.filter(row => row.opportunities.some(opportunity => opportunity.pool.includes(row.target))).length;
  function prefixMetrics(prefixLength: number) {
    const atPrefix = opportunities.filter(row => row.opportunity.prefixLength === prefixLength);
    const ranks = atPrefix.map(row => displayedRank(row.opportunity, row.target));
    const top1Hits = ranks.filter(rank => rank === 1).length;
    const top3Hits = ranks.filter(rank => rank > 0).length;
    const reciprocalRankSum = ranks.reduce((sum, rank) => sum + (rank ? 1 / rank : 0), 0);
    return {prefixLength, opportunities: ranks.length, top1Hits, top3Hits,
      top1Accuracy: ratio(top1Hits, ranks.length), top3Accuracy: ratio(top3Hits, ranks.length),
      mrrAt3: ratio(reciprocalRankSum, ranks.length)};
  }
  function idealSavings(k: 1 | 3) {
    let charactersNotTyped = 0, acceptanceTaps = 0;
    const targetCharacters = replays.reduce((sum, row) => sum + row.target.length, 0);
    for (const row of replays) {
      const first = row.opportunities.find(opportunity => displayedRank(opportunity, row.target, k) > 0);
      if (first) {
        charactersNotTyped += row.target.length - first.prefixLength;
        acceptanceTaps++;
      }
    }
    const netTapsSaved = charactersNotTyped - acceptanceTaps;
    return {k, targetCharacters, charactersNotTyped, acceptanceTaps, netTapsSaved,
      savingsFraction: netTapsSaved / targetCharacters};
  }
  const reciprocalRankSum = opportunities.reduce((sum, row) => {
    const rank = displayedRank(row.opportunity, row.target);
    return sum + (rank ? 1 / rank : 0);
  }, 0);
  return {targetTasks: replays.length, prefixOpportunities: opportunities.length,
    anyPrefixPoolHits, anyPrefixPoolRecall: anyPrefixPoolHits / replays.length,
    overallMrrAt3: reciprocalRankSum / opportunities.length,
    byPrefix: [0, 1, 2, 3].map(prefixMetrics),
    idealSavings: [idealSavings(1), idealSavings(3)]};
}
export type ReplayMetrics = ReturnType<typeof measureWordReplays>;

export type Control = 'actual' | 'random' | 'degraded' | 'oracle';

/** Controls reorder the exact same eligible pool. The runtime still selects the final slate. */
export function controlOrder<T>(items: readonly T[], label: (item: T) => string, target: string,
  control: Control, seed = 0, opportunityId = ''): T[] {
  const ordered = [...items];
  if (control === 'degraded') return ordered.reverse();
  if (control === 'oracle') {
    const index = ordered.findIndex(item => label(item) === target);
    if (index >= 0) ordered.unshift(...ordered.splice(index, 1));
    return ordered;
  }
  if (control !== 'random') return ordered;
  let state = (2166136261 ^ seed) >>> 0;
  for (const character of opportunityId) state = Math.imul(state ^ character.charCodeAt(0), 16777619) >>> 0;
  function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ state >>> 15, state | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  }
  for (let index = ordered.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [ordered[index], ordered[other]] = [ordered[other], ordered[index]];
  }
  return ordered;
}

/** Random-control counts are averages over the fixed seeds, not additional independent data. */
export function meanMetrics(runs: readonly ReplayMetrics[]): ReplayMetrics {
  if (!runs.length) throw new Error('Missing random-control runs');
  const first = runs[0];
  if (runs.some(run => run.targetTasks !== first.targetTasks || run.prefixOpportunities !== first.prefixOpportunities ||
      run.anyPrefixPoolHits !== first.anyPrefixPoolHits || run.anyPrefixPoolRecall !== first.anyPrefixPoolRecall ||
      run.byPrefix.length !== first.byPrefix.length || run.byPrefix.some((row, index) =>
        row.prefixLength !== first.byPrefix[index].prefixLength || row.opportunities !== first.byPrefix[index].opportunities) ||
      run.idealSavings.length !== first.idealSavings.length || run.idealSavings.some((row, index) =>
        row.k !== first.idealSavings[index].k || row.targetCharacters !== first.idealSavings[index].targetCharacters))) {
    throw new Error('Controls must use identical opportunities, eligible-pool coverage, and denominators');
  }
  function average(values: readonly number[]): number {return values.reduce((sum, value) => sum + value, 0) / values.length;}
  return {...first,
    anyPrefixPoolHits: average(runs.map(run => run.anyPrefixPoolHits)),
    anyPrefixPoolRecall: average(runs.map(run => run.anyPrefixPoolRecall)),
    overallMrrAt3: average(runs.map(run => run.overallMrrAt3)),
    byPrefix: first.byPrefix.map((row, index) => ({...row,
      top1Hits: average(runs.map(run => run.byPrefix[index].top1Hits)),
      top3Hits: average(runs.map(run => run.byPrefix[index].top3Hits)),
      top1Accuracy: row.top1Accuracy === null ? null : average(runs.map(run => run.byPrefix[index].top1Accuracy!)),
      top3Accuracy: row.top3Accuracy === null ? null : average(runs.map(run => run.byPrefix[index].top3Accuracy!)),
      mrrAt3: row.mrrAt3 === null ? null : average(runs.map(run => run.byPrefix[index].mrrAt3!)),
    })),
    idealSavings: first.idealSavings.map((row, index) => ({...row,
      charactersNotTyped: average(runs.map(run => run.idealSavings[index].charactersNotTyped)),
      acceptanceTaps: average(runs.map(run => run.idealSavings[index].acceptanceTaps)),
      netTapsSaved: average(runs.map(run => run.idealSavings[index].netTapsSaved)),
      savingsFraction: average(runs.map(run => run.idealSavings[index].savingsFraction)),
    })),
  };
}
