import { useEffect, useRef, useState } from 'react';
import { useReviewLog, useStyles, useUpdateSettings } from '../../../data/hooks';
import type { SettingsPatch } from '../../../data/api';
import type { Settings } from '../../../data/types';
import type { OptimizerMessage, OptimizerRequest } from '../../../lib/optimizer.worker';
import { renderMarkdown } from '../../../lib/render';
import { Sheet } from '../../../ui/Sheet';
import { useToast } from '../../../ui/Toast';

const button = 'min-h-11 rounded-ctl border border-edge px-3 py-2 text-label font-semibold text-ink focus-visible:outline-2 focus-visible:outline-amber disabled:opacity-50';
const field = 'mt-2 min-h-32 w-full rounded-ctl border border-edge bg-well p-3 text-body text-ink';
type OptimizerResult = Extract<OptimizerMessage, { type: 'result' }>['result'];
type Editor = 'rules' | 'macros' | 'optimizer' | null;

/** N28.2.1: v6 Study defaults. All writes use the existing updateSettings mutation. */
export default function StudyDefaults({ settings }: { settings: Settings }) {
  const styles = useStyles();
  const reviews = useReviewLog();
  const update = useUpdateSettings();
  const notify = useToast();
  const busy = update.isPending;
  const [editor, setEditor] = useState<Editor>(null);
  const [rules, setRules] = useState('');
  const [macros, setMacros] = useState('');
  const [retention, setRetention] = useState<number | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<OptimizerResult | null>(null);
  const worker = useRef<Worker | null>(null);
  const operationId = useRef('');

  useEffect(() => () => {
    operationId.current = '';
    worker.current?.terminate();
    worker.current = null;
  }, []);

  async function save(patch: SettingsPatch, message = 'Saved'): Promise<boolean> {
    try {
      await update.mutateAsync(patch);
      notify(message, { tone: 'success' });
      return true;
    } catch {
      notify("Couldn't save settings.", { tone: 'danger' });
      return false;
    }
  }
  function saveRetention(value: number) {
    if (busy) return;
    void save({ desiredRetention: value }).then(() => setRetention(null));
  }
  function openRules() {
    setRules(settings.tutorRules ?? '');
    setEditor('rules');
  }
  function openMacros() {
    setMacros(settings.macros);
    setEditor('macros');
  }
  function closeOptimizer() {
    operationId.current = '';
    worker.current?.terminate();
    worker.current = null;
    setProgress(null);
    setResult(null);
    setEditor(null);
  }
  function tune() {
    if (busy || reviews.isPending || reviews.isError || !reviews.data || reviews.data.length < 400) return;
    closeOptimizer();
    const id = globalThis.crypto?.randomUUID?.() ?? 'optimizer-' + Date.now();
    try {
      const next = new Worker(new URL('../../../lib/optimizer.worker.ts', import.meta.url), { type: 'module' });
      worker.current = next;
      operationId.current = id;
      setEditor('optimizer');
      setProgress(0);
      next.onmessage = (event: MessageEvent<OptimizerMessage>) => {
        const message = event.data;
        if (message.id !== operationId.current) return;
        if (message.type === 'progress') { setProgress(message.fraction); return; }
        setProgress(null);
        next.terminate();
        worker.current = null;
        if (message.type === 'result') setResult(message.result);
        else notify(message.message, { tone: 'danger' });
      };
      next.onerror = () => {
        if (operationId.current !== id) return;
        next.terminate();
        worker.current = null;
        setProgress(null);
        notify('Optimization failed.', { tone: 'danger' });
      };
      const request: OptimizerRequest = { type: 'optimize', id, reviews: reviews.data, settings };
      next.postMessage(request);
    } catch {
      worker.current?.terminate();
      worker.current = null;
      setProgress(null);
      setEditor(null);
      notify('Optimization could not start.', { tone: 'danger' });
    }
  }
  const reviewCount = reviews.data?.length;
  const canTune = !reviews.isPending && !reviews.isError && (reviewCount ?? 0) >= 400;
  const preview = renderMarkdown('$\\R \\quad \\norm{x}$', { macros });

  return <section aria-labelledby="v6-study-title" className="flex flex-col gap-4 pb-8">
    <h2 id="v6-study-title" className="text-title-s font-semibold text-ink">Study defaults</h2>
    <section className="rounded-slab border border-edge bg-[var(--paper)] p-4">
      <h3 className="mb-2 text-body font-semibold text-ink">Teaching style</h3>
      {styles.isPending ? <p role="status">Loading teaching styles…</p> :
        styles.isError ? <div role="alert">Teaching styles unavailable.
          <button type="button" className={button} onClick={() => void styles.refetch()}>Retry styles</button>
        </div> : !styles.data?.length ? <p>No teaching styles available.</p> :
        <div role="radiogroup" aria-label="Teaching style" className="flex flex-col gap-2">
          {styles.data.map(style => <button key={style.key} type="button" role="radio"
            aria-checked={settings.defaultStyle === style.key} disabled={busy}
            className={button + ' w-full text-left'} onClick={() => { void save({ defaultStyle: style.key }); }}>
            {style.name}{settings.defaultStyle === style.key ? ' · Selected' : ''}
          </button>)}
        </div>}
      <button type="button" className={button + ' mt-3'} disabled={busy} onClick={openRules}>Tutor rules</button>
    </section>
    <section className="rounded-slab border border-edge bg-[var(--paper)] p-4">
      <h3 className="mb-3 text-body font-semibold text-ink">Memory</h3>
      <label className="flex items-center justify-between gap-2 text-label font-semibold text-ink" htmlFor="v6-retention">
        <span>Target recall</span><output htmlFor="v6-retention">{Math.round((retention ?? settings.desiredRetention) * 100)}%</output>
      </label>
      <input id="v6-retention" aria-label="Target recall" type="range" min="80" max="97" step="1"
        className="my-3 min-h-11 w-full accent-amber"
        disabled={busy} value={Math.round((retention ?? settings.desiredRetention) * 100)}
        onChange={event => setRetention(Number(event.target.value) / 100)}
        onPointerUp={event => saveRetention(Number(event.currentTarget.value) / 100)}
        onKeyUp={event => {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key))
            saveRetention(Number(event.currentTarget.value) / 100);
        }}/>
      <p className="text-caption text-ink-2">Higher recall means more reviews each day.</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-label font-semibold text-ink">New cards a day</span>
        <div className="flex items-center gap-3">
          <button type="button" aria-label="Fewer new cards" className={button} disabled={busy || settings.newPerDay <= 0}
            onClick={() => { void save({ newPerDay: Math.max(0, settings.newPerDay - 5) }); }}>−</button>
          <output className="min-w-7 text-center tabular-nums">{settings.newPerDay}</output>
          <button type="button" aria-label="More new cards" className={button} disabled={busy || settings.newPerDay >= 60}
            onClick={() => { void save({ newPerDay: Math.min(60, settings.newPerDay + 5) }); }}>+</button>
        </div>
      </div>
      {reviews.isPending ? <p role="status" className="mt-3 text-label">Loading review history…</p> :
        reviews.isError ? <div role="alert" className="mt-3 text-label">Review history unavailable.
          <button type="button" className={button} onClick={() => void reviews.refetch()}>Retry reviews</button>
        </div> : !canTune ? <p className="mt-3 text-label text-ink-2">
          Needs 400 reviews (you have {reviewCount ?? 0})
        </p> : null}
      <button type="button" className={button + ' mt-3 w-full'} disabled={busy || !canTune} onClick={tune}>
        Tune to my reviews
      </button>
    </section>
    <section className="rounded-slab border border-edge bg-[var(--paper)] p-4">
      <h3 className="mb-3 text-body font-semibold text-ink">Math shortcuts</h3>
      <button type="button" className={button} disabled={busy} onClick={openMacros}>Edit math shortcuts</button>
    </section>
    <Sheet open={editor === 'rules'} onClose={() => setEditor(null)} title="Tutor rules">
      <label className="text-label text-ink">Rules
        <textarea aria-label="Tutor rules text" className={field} value={rules}
          onChange={event => setRules(event.target.value)}/>
      </label>
      <div className="mt-3 flex flex-wrap gap-3">
        <button type="button" className={button} onClick={() => setRules('')}>Reset to default</button>
        <button type="button" className={button} disabled={busy}
          onClick={async () => { if (await save({ tutorRules: rules.trim() || null }, 'Tutor rules saved')) setEditor(null); }}>Save rules</button>
      </div>
    </Sheet>
    <Sheet open={editor === 'macros'} onClose={() => setEditor(null)} title="Math shortcuts">
      <label className="text-label text-ink">KaTeX macros
        <textarea aria-label="Math shortcuts text" className={field + ' font-mono'} value={macros}
          onChange={event => setMacros(event.target.value)}/>
      </label>
      <p className="mt-3 text-label text-ink-2">Preview</p>
      <div className="lemma-math my-3" dangerouslySetInnerHTML={{ __html: preview }}/>
      <button type="button" className={button + ' w-full'} disabled={busy}
        onClick={async () => { if (await save({ macros }, 'Math shortcuts saved')) setEditor(null); }}>Save shortcuts</button>
    </Sheet>
    <Sheet open={editor === 'optimizer'} onClose={closeOptimizer} title="Tune to your reviews">
      {progress !== null ? <p role="status">Analyzing reviews… {Math.round(progress * 100)}%</p> :
        result ? <>
          <p>Log loss: {result.before.logLoss.toFixed(3)} → {result.after.logLoss.toFixed(3)} · {result.items} answers</p>
          {result.skipped && <p>There was not enough usable history to tune the model.</p>}
          <button type="button" className={button + ' mt-3 w-full'} disabled={busy || result.skipped}
            onClick={async () => {
              if (await save({ fsrsWeights: result.w, fsrsTunedAt: new Date().toISOString() }, 'Memory model updated'))
                closeOptimizer();
            }}>Apply tuning</button>
        </> : <p>Optimization did not finish. Try again.</p>}
    </Sheet>
  </section>;
}
