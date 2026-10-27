/* SYNC-03: read-only, fail-closed FSRS memory replay diagnostics.
 * A memory trace is NOT an authoritative due date or permission to overwrite
 * a note snapshot. Never infer unavailable historical reviews from card state. */
const LemmaReviewReplay = (() => {
  const ledger = typeof module !== 'undefined' && module.exports
    ? require('./review_ledger.js') : ReviewLedger;
  const fsrs = typeof module !== 'undefined' && module.exports
    ? require('../fsrs.js') : FSRS;
  const compare = (a,b) => a.occurred_at_ms - b.occurred_at_ms ||
    (a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0);
  const blocked = (noteId, code, message) =>
    ({status:'blocked',noteId,code,message,scheduleReady:false});
  function inspect(row, allEvents, allRetractions, outbox = []) {
    const noteId = row?.id;
    if (typeof noteId !== 'string' || !noteId || !row.data || row.deleted)
      return blocked(noteId || null,'missing_note','An active note is required.');
    const snapshots = [row.data, row.base?.known && row.base.data,
      row.remote?.known && row.remote.data,
      ...outbox.filter(op => op.entityId === noteId && op.kind === 'note').map(op => op.data)]
      .filter(Boolean);
    // Include local and server history evidence; do not treat an incomplete
    // local log as proof that older or remote reviews never existed.
    const noteEvents = allEvents.filter(e => e.note_id === noteId);
    const eventIds = new Set(noteEvents.map(e => e.event_id));
    const retractions = allRetractions.filter(r => eventIds.has(r.target_event_id));
    // A dangling retraction anywhere in the account means a partial ledger
    // pull. It is unsafe to certify completeness until that target arrives.
    const knownIds = new Set(allEvents.map(e => e.event_id));
    if (allRetractions.some(r => !knownIds.has(r.target_event_id)))
      return blocked(noteId,'incomplete_ledger','An Undo target has not been fetched.');
    for (const data of snapshots) {
      if (!Array.isArray(data.log) || !data.cards || typeof data.cards !== 'object')
        return blocked(noteId,'invalid_snapshot','Card history is malformed.');
      for (const entry of data.log) {
        if (!Array.isArray(entry) || (entry[5] !== 0 && entry[5] !== 1))
          return blocked(noteId,'legacy_history','Unsupported historic review format.');
        // Cram events do not change FSRS memory. Scheduled history must have
        // immutable matching event IDs, even when an Undo later retracts them.
        if (entry[5] === 0 && (!entry[6] || !eventIds.has(entry[6])))
          return blocked(noteId,'legacy_history','A scheduled review is missing from the immutable ledger.');
      }
    }
    let active;
    try { active = ledger.activeEvents(noteEvents,retractions); }
    catch (e) { return blocked(noteId,'invalid_ledger',String(e.message || e)); }
    if (allRetractions.some(r => r.reason === 'reset' && eventIds.has(r.target_event_id)))
      return blocked(noteId,'reset_policy_required','Reset semantics require a verified replay baseline.');
    const scheduled = noteEvents.filter(e => e.kind === 0).sort(compare);
    if (noteEvents.some(e => ![0,1].includes(e.kind) ||
        !Number.isSafeInteger(e.ordinal) || e.ordinal < 1 ||
        !Number.isSafeInteger(e.occurred_at_ms) || e.occurred_at_ms <= 0 ||
        typeof e.event_id !== 'string' || !e.event_id))
      return blocked(noteId,'invalid_ledger','Invalid review kind, ordinal, ID or timestamp.');
    const byOrd = new Map();
    for (const event of scheduled) {
      const key = String(event.ordinal);
      if (!byOrd.has(key)) byOrd.set(key,[]);
      byOrd.get(key).push(event);
    }
    for (const [ord, entries] of byOrd) {
      const p = entries[0].scheduling_provenance;
      const before = p?.card_before;
      if (!before || before.st !== 0 || before.reps !== 0)
        return blocked(noteId,'legacy_baseline_required','The first known review of card '+ord+' lacks a verified new-card baseline.');
    }
    for (const data of snapshots) {
      for (const [ord,card] of Object.entries(data.cards)) {
        const total = byOrd.get(ord)?.length || 0;
        if (Number.isFinite(card?.reps) && (card.reps > total || (total === 0 && card.st !== 0)))
          return blocked(noteId,'legacy_baseline_required','Card '+ord+' has reviews not represented in the ledger.');
      }
    }
    const ordinals = {};
    for (const ord of [...byOrd.keys()].sort((a,b) => Number(a)-Number(b))) {
      const entries = active.filter(e => e.kind === 0 && String(e.ordinal) === ord);
      let input, result;
      try {
        input = ledger.fsrsInput(entries,[]);
        result = input.reviews.length ? fsrs.replay(input.weights,input.reviews,input.clock) :
          {mem:null,trace:[]};
      } catch (e) {
        return blocked(noteId,'replay_unsupported',String(e.message || e));
      }
      ordinals[ord] = {activeReviews:entries.length, totalReviews:byOrd.get(ord).length,
        memory:result.mem, trace:result.trace.map((t,i) => ({
          eventId:entries[i]?.event_id || null,
          timestamp:t.ts, dayElapsed:t.t, stability:t.s, difficulty:t.d
        }))};
    }
    return {status:scheduled.length?'memory-only':'empty',noteId,
      scheduledReviews:scheduled.length,activeReviews:active.filter(e=>e.kind===0).length,
      retractions:retractions.length,ordinals,scheduleReady:false,
      message:'Only FSRS memory was replayed. Due dates, steps, fuzz, legacy baselines and concurrent scheduling are not reconstructed.'};
  }
  return {inspect};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LemmaReviewReplay;
