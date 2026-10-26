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
  /* Adapt the immutable ledger to the EXISTING FSRS.replay() API.
   * Do not implement memory mathematics here. Reject parameter changes, missing
   * provenance and ambiguous timestamps until a versioned replay policy exists. */
  function fsrsInput(events, retractions) {
    const active = activeEvents(events, retractions).filter(x => x.kind === 0);
    if (!active.length) return { weights: null, reviews: [], clock: null };
    let weights = null;
    const days = new Map();
    const reviews = [];
    let previousDay = -Infinity;
    for (const row of active) {
      const p = row.scheduling_provenance;
      if (!p || p.version !== 1 || p.algorithm !== 'fsrs-6' ||
          !Array.isArray(p.weights) || p.weights.length !== 21 ||
          !p.weights.every(Number.isFinite) ||
          !Number.isSafeInteger(p.day_index) ||
          !Number.isSafeInteger(row.occurred_at_ms) ||
          !Number.isInteger(row.grade) || row.grade < 1 || row.grade > 4)
        throw new Error('Missing or invalid FSRS provenance: ' + row.event_id);
      if (weights && JSON.stringify(weights) !== JSON.stringify(p.weights))
        throw new Error('FSRS parameters changed; replay requires a verified baseline');
      if (p.day_index < previousDay)
        throw new Error('Nonmonotonic scheduling days');
      const existingDay = days.get(row.occurred_at_ms);
      if (existingDay !== undefined && existingDay !== p.day_index)
        throw new Error('Ambiguous scheduling timezone for identical timestamps');
      days.set(row.occurred_at_ms, p.day_index);
      weights = p.weights;
      previousDay = p.day_index;
      reviews.push([row.occurred_at_ms, row.grade, 0]);
    }
    return { weights, reviews,
      clock: { dayIndex(ts) {
        if (!days.has(ts)) throw new Error('Unknown review timestamp');
        return days.get(ts);
      } } };
  }
  return { activeEvents, validateRetraction, fsrsInput };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ReviewLedger;
