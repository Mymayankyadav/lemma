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
        // The historical single-parameter memory diagnostic cannot replay a
        // per-event parameter change. The schedule projection below can.
        // Still reject malformed history, rather than certifying it as safe.
        if (!/parameters changed|Nonmonotonic scheduling days|Ambiguous scheduling timezone/.test(String(e.message || e)))
          return blocked(noteId,'replay_unsupported',String(e.message || e));
        result = {mem:null,trace:[]};
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
  const scheduleKeys = ['st','due','s','d','last','step','reps','lapses'];
  const dayMs = 86400000;
  function fixedClock(p) {
    const offset = p.timezone_offset_minutes * 60000 + p.rollover_hour * 3600000;
    return {
      dayIndex(ts) { return Math.floor((ts - offset) / dayMs); },
      dayStart(day) { return day * dayMs + offset; }
    };
  }
  function cfgFrom(p) {
    return {
      w: p.weights, retention: p.retention, maxIvl: p.max_interval_days,
      learn: fsrs.parseSteps(p.learn_steps) || [],
      relearn: fsrs.parseSteps(p.relearn_steps) || [],
      fuzz: p.fuzz, loadBalance: false
    };
  }
  function validProvenance(event) {
    const p = event.scheduling_provenance;
    if (!p || p.version !== 1 || p.algorithm !== 'fsrs-6' ||
        !Array.isArray(p.weights) || p.weights.length !== 21 ||
        !p.weights.every(Number.isFinite) ||
        !Number.isSafeInteger(p.day_index) ||
        !Number.isInteger(p.rollover_hour) || p.rollover_hour < 0 || p.rollover_hour > 23 ||
        !Number.isInteger(p.timezone_offset_minutes) ||
        Math.abs(p.timezone_offset_minutes) > 840 ||
        !(p.retention > 0 && p.retention < 1) ||
        !Number.isSafeInteger(p.max_interval_days) || p.max_interval_days < 1 ||
        typeof p.learn_steps !== 'string' || typeof p.relearn_steps !== 'string' ||
        (p.learn_steps.trim() && !fsrs.parseSteps(p.learn_steps)) ||
        (p.relearn_steps.trim() && !fsrs.parseSteps(p.relearn_steps)) ||
        typeof p.fuzz !== 'boolean' || typeof p.load_balance !== 'boolean' ||
        !Number.isSafeInteger(p.preview_at_ms) || p.preview_at_ms <= 0 ||
        p.preview_at_ms > event.occurred_at_ms ||
        !Number.isInteger(event.grade) || event.grade < 1 || event.grade > 4)
      return false;
    return true;
  }
  /* Pure schedule fold. Only call this when divergent schedules must be
   * resolved, never to overwrite a clean cache on pull or login. */
  function project(row, allEvents, allRetractions, outbox = []) {
    const diagnostic = inspect(row, allEvents, allRetractions, outbox);
    if (diagnostic.status === 'blocked') return diagnostic;
    const noteId = row.id;
    let active;
    try {
      active = ledger.activeEvents(allEvents.filter(e => e.note_id === noteId),
        allRetractions.filter(r => allEvents.some(e =>
          e.note_id === noteId && e.event_id === r.target_event_id)));
    } catch (e) {
      return blocked(noteId, 'invalid_ledger', String(e.message || e));
    }
    const events = allEvents.filter(e => e.note_id === noteId && e.kind === 0).sort(compare);
    const byOrd = new Map();
    for (const event of events) {
      if (!validProvenance(event))
        return blocked(noteId, 'replay_unsupported', 'Invalid scheduling provenance: ' + event.event_id);
      const clock = fixedClock(event.scheduling_provenance);
      if (clock.dayIndex(event.occurred_at_ms) !== event.scheduling_provenance.day_index)
        return blocked(noteId, 'clock_mismatch', 'Recorded scheduling day does not match fixed-offset clock: ' + event.event_id);
      const ord = String(event.ordinal);
      if (!byOrd.has(ord)) byOrd.set(ord, []);
      byOrd.get(ord).push(event);
    }
    const activeIds = new Set(active.map(e => e.event_id));
    const cards = {}, eventIds = [];
    for (const ord of [...byOrd.keys()].sort((a,b) => Number(a) - Number(b))) {
      const history = byOrd.get(ord);
      const baseline = history[0].scheduling_provenance.card_before;
      if (!baseline || baseline.st !== 0 || baseline.reps !== 0 ||
          !scheduleKeys.every(key => typeof baseline[key] === 'number' && Number.isFinite(baseline[key])))
        return blocked(noteId, 'legacy_baseline_required', 'No complete new-card baseline for card ' + ord);
      let card = Object.fromEntries(scheduleKeys.map(key => [key, baseline[key]]));
      try {
        for (const event of history) {
          if (!activeIds.has(event.event_id)) continue;
          const p = event.scheduling_provenance;
          const projected = fsrs.preview(card, p.preview_at_ms, cfgFrom(p),
            {clock:fixedClock(p), key:noteId + ':' + ord});
          card = Object.fromEntries(scheduleKeys.map(key => [key, projected[event.grade].card[key]]));
          if (!scheduleKeys.every(key => Number.isFinite(card[key])))
            throw new Error('Invalid projected schedule');
          eventIds.push(event.event_id);
        }
      } catch (error) {
        return blocked(noteId, 'replay_unsupported', String(error.message || error));
      }
      cards[ord] = card;
    }
    return {status:'projected',noteId,cards,eventIds};
  }
  return {inspect, project};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = LemmaReviewReplay;
