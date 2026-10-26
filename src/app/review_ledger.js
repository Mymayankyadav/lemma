/* Immutable review ledger helpers. Legacy rows are not silently deduplicated.
 * This module computes active events, not FSRS projections. */
const ReviewLedger = (() => {
  function validateRetraction(row) {
    if (!row || typeof row.retraction_id !== 'string' ||
        typeof row.target_event_id !== 'string' ||
        !['undo','correction','reset'].includes(row.reason)) {
      throw new Error('Invalid review retraction');
    }
    return row;
  }
  function activeEvents(events, retractions) {
    const seen = new Map();
    for (const row of events) {
      if (!row || !row.event_id) throw new Error('Review missing stable event ID');
      const before = seen.get(row.event_id);
      if (before && JSON.stringify(before) !== JSON.stringify(row))
        throw new Error('Conflicting review payload for same event ID');
      seen.set(row.event_id, row);
    }
    const retracted = new Map();
    for (const row of retractions) {
      validateRetraction(row);
      if (!seen.has(row.target_event_id))
        throw new Error('Retraction target not fetched');
      const prior = retracted.get(row.target_event_id);
      if (prior && prior.retraction_id !== row.retraction_id)
        throw new Error('Conflicting retractions for one review');
      retracted.set(row.target_event_id, row);
    }
    return [...seen.values()].filter(row => !retracted.has(row.event_id))
      .sort((a,b) => (a.occurred_at_ms-b.occurred_at_ms) ||
        String(a.event_id).localeCompare(String(b.event_id)));
  }
  /* Replay stability/difficulty, not due dates: due scheduling also depends on
   * prior edits, learning-step state, load balancing and timezone transitions.
   * Missing or malformed provenance is an error, never a guessed default. */
  function replayMemory(events, retractions, opts = {}) {
    const engine = opts.engine || (typeof FSRS !== 'undefined' ? FSRS :
      (typeof require === 'function' ? require('../fsrs.js') : null));
    if (!engine || typeof engine.step !== 'function') throw new Error('FSRS engine unavailable');
    const ordered = activeEvents(events, retractions);
    const baseline = opts.baseline;
    let mem = null, previousDay = null;
    const trace = [];
    if (baseline) {
      if (!Number.isSafeInteger(baseline.day_index) ||
          !baseline.memory || !Number.isFinite(baseline.memory.s) ||
          !Number.isFinite(baseline.memory.d) ||
          !Number.isSafeInteger(baseline.before_ms)) throw new Error('Invalid replay baseline');
      mem = { s: baseline.memory.s, d: baseline.memory.d };
      previousDay = baseline.day_index;
      for (const row of ordered) {
        if (row.occurred_at_ms <= baseline.before_ms)
          throw new Error('Review predates baseline; cannot replay');
      }
    }
    let lastEventId = null;
    for (const event of ordered) {
      if (event.kind === 1) continue; // practice/cram never changes scheduling
      if (event.kind !== 0 || !Number.isInteger(event.grade) ||
          event.grade < 1 || event.grade > 4) throw new Error('Invalid scheduling review');
      const p = event.scheduling_provenance;
      if (!p || p.version !== 1 || p.algorithm !== 'fsrs-6' ||
          !Array.isArray(p.weights) || p.weights.length !== 21 ||
          !p.weights.every(Number.isFinite) ||
          !Number.isSafeInteger(p.day_index) ||
          !Number.isSafeInteger(event.occurred_at_ms))
        throw new Error('Replay requires verified FSRS provenance for ' + event.event_id);
      if (previousDay !== null && p.day_index < previousDay)
        throw new Error('Nonmonotonic scheduling days');
      const elapsed = previousDay === null ? 0 : Math.max(0, p.day_index - previousDay);
      mem = engine.step(p.weights, mem, elapsed, event.grade);
      previousDay = p.day_index;
      lastEventId = event.event_id;
      trace.push({ event_id: event.event_id, day_index: previousDay, elapsed,
        s: mem.s, d: mem.d });
    }
    return { memory: mem, lastDay: previousDay, lastEventId, trace,
      active: ordered.filter(x => x.kind === 0).length };
  }
  return { activeEvents, validateRetraction, replayMemory };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ReviewLedger;
