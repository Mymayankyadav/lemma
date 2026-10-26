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
  return { activeEvents, validateRetraction };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ReviewLedger;
