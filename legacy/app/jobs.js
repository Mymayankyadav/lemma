/* ---------- background jobs (optimizer, simulator) in a Web Worker built from the page's own FSRS source ---------- */
const Jobs = (() => {
  const GLUE = `
self.onmessage = async (e) => {
  const { id, cmd, payload } = e.data;
  const progress = (p) => self.postMessage({ id, progress: p });
  try {
    self.postMessage({ id, done: await run(cmd, payload, progress) });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};`;
  async function run(cmd, payload, progress) {
    if (cmd === 'optimize') {
      const clock = FSRS.makeClock(payload.rollover);
      const ds = FSRS.buildDataset(payload.histories, clock);
      const before = FSRS.evaluate(payload.current, ds.seqs);
      const defaults = FSRS.evaluate(FSRS.DEFAULT_W, ds.seqs);
      const res = await FSRS.optimize(ds.seqs, { start: FSRS.DEFAULT_W, numRelearnSteps: payload.numRelearnSteps, onProgress: progress, yieldEvery: payload.inline ? 3 : 0 });
      const after = FSRS.evaluate(res.w, ds.seqs);
      return { w: res.w, items: res.items, before, after, defaults, skipped: !!res.skipped, pretrainOnly: !!res.pretrainOnly };
    }
    if (cmd === 'sweep') return FSRS.retentionSweep(payload.w, payload.opts);
    throw new Error('unknown job');
  }
  let worker = null, broken = false, seq = 0;
  const pending = new Map();
  function getWorker() {
    if (worker || broken) return worker;
    try {
      const srcEl = document.getElementById('fsrs-src');
      const src = srcEl.textContent + '\nconst run = ' + run.toString() + ';\n' + GLUE;
      worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.onmessage = (e) => {
        const { id, progress, done, error } = e.data || {};
        const p = pending.get(id);
        if (!p) return;
        if (progress != null) { p.onProgress && p.onProgress(progress); return; }
        pending.delete(id);
        if (error) p.reject(new Error(error)); else p.resolve(done);
      };
      worker.onerror = () => {
        broken = true;
        worker = null;
        for (const [id, p] of pending) { pending.delete(id); p.fallback(); }
      };
    } catch (e) { broken = true; worker = null; }
    return worker;
  }
  function exec(cmd, payload, onProgress) {
    return new Promise((resolve, reject) => {
      const inline = () => run(cmd, Object.assign({}, payload, { inline: true }), onProgress || (() => {})).then(resolve, reject);
      const w = getWorker();
      if (!w) { inline(); return; }
      const id = ++seq;
      pending.set(id, { resolve, reject, onProgress, fallback: inline });
      try { w.postMessage({ id, cmd, payload }); } catch (e) { pending.delete(id); inline(); }
    });
  }
  return { exec };
})();
