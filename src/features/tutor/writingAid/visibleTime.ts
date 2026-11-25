import type {WritingAidProposal, WritingAidRefreshSurface} from './policy';

interface ExposureTime {elapsed: number; since?: number}
export function exposureIdentity(proposal: WritingAidProposal): string {
  return JSON.stringify([proposal.kind, proposal.start, proposal.insert.toLocaleLowerCase()]);
}

/** Measure actual visible intervals, keeping identity across increasingly typed prefixes. */
export function visibleTime() {
  const surfaces: WritingAidRefreshSurface[] = ['words', 'edit', 'ghost'];
  const rows = new Map<WritingAidRefreshSurface, Map<string, ExposureTime>>();
  function update(surface: WritingAidRefreshSurface, visible: readonly string[], now: number) {
    const counts = rows.get(surface) ?? new Map<string, ExposureTime>();
    rows.set(surface, counts);
    const appearing = new Set(visible);
    for (const [key, row] of counts) if (row.since !== undefined && !appearing.has(key)) {
      row.elapsed += Math.max(0, now - row.since);
      row.since = undefined;
    }
    for (const key of appearing) {
      const row = counts.get(key);
      if (!row) counts.set(key, {elapsed: 0, since: now});
      else row.since ??= now;
    }
    for (const [key, row] of counts) {
      if (counts.size <= 64) break;
      if (row.since === undefined) counts.delete(key);
    }
  }
  return {
    update,
    hide(now: number) {for (const surface of surfaces) update(surface, [], now);},
    reset() {rows.clear();},
    elapsed(surface: WritingAidRefreshSurface, key: string, now: number): number {
      const row = rows.get(surface)?.get(key);
      return row ? row.elapsed + (row.since === undefined ? 0 : Math.max(0, now - row.since)) : 0;
    },
  };
}
