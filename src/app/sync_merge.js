/* Pure deterministic merge for concurrent mathematical flashcard edits.
 * Does not touch DOM, IndexedDB, network, or mutable live Model state.
 */
const SyncMerge = (() => {
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const eventKey = (e) => [e[0], e[1], e[2], e[5] || 0].join(':');
  const reviewedAt = (note, ordinal) => {
    let t = 0;
    for (const entry of note.log || []) {
      if (String(entry[1]) === String(ordinal) && (entry[5] || 0) === 0) {
        t = Math.max(t, Number(entry[0]) || 0);
      }
    }
    return t;
  };
  const prefersA = (a, b) => JSON.stringify(a) > JSON.stringify(b);
  function mergeNotes(local, remote) {
    if (!local) return copy(remote);
    if (!remote) return copy(local);
    if (local.id !== remote.id) throw new Error('Cannot merge notes with different IDs');
    const lm = Number(local.modified || 0);
    const rm = Number(remote.modified || 0);
    // Explicit tie breaker prevents oscillations from reversed merge argument order.
    const chooseLocal = lm > rm || (lm === rm && prefersA(local, remote));
    const result = copy(chooseLocal ? local : remote);
    const events = new Map();
    for (const item of [...(remote.log || []), ...(local.log || [])]) {
      if (!Array.isArray(item) || item.length < 4) continue;
      const k = eventKey(item);
      // Same review recorded on both devices is one event.
      if (!events.has(k)) events.set(k, copy(item));
    }
    result.log = [...events.values()].sort((a, b) =>
      (a[0] - b[0]) || (String(a[1]).localeCompare(String(b[1]))) || (a[2] - b[2]));
    result.cards = {};
    const ordinals = new Set([...Object.keys(local.cards || {}), ...Object.keys(remote.cards || {})]);
    for (const ord of ordinals) {
      const lc = local.cards && local.cards[ord];
      const rc = remote.cards && remote.cards[ord];
      if (!lc) { result.cards[ord] = copy(rc); continue; }
      if (!rc) { result.cards[ord] = copy(lc); continue; }
      const lt = Math.max(reviewedAt(local, ord), Number(lc.last || 0));
      const rt = Math.max(reviewedAt(remote, ord), Number(rc.last || 0));
      // Provisional projection; Phase 2 will replay immutable review events for full correctness.
      const localWins = lt > rt || (lt === rt && prefersA(lc, rc));
      result.cards[ord] = copy(localWins ? lc : rc);
    }
    result.created = Math.min(Number(local.created || Infinity), Number(remote.created || Infinity));
    if (!Number.isFinite(result.created)) result.created = 0;
    result.modified = Math.max(lm, rm);
    return result;
  }
  return { mergeNotes, eventKey, reviewedAt };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = SyncMerge;
