import '../section-controls.css';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useReviewLog, useStyles, useUpdateSettings } from '../../../data/hooks';
import type { SettingsPatch } from '../../../data/api';
import type { Settings } from '../../../data/types';
import type { OptimizerMessage, OptimizerRequest } from '../../../lib/optimizer.worker';
import { renderMarkdown } from '../../../lib/render';
import { Sheet as LegacySheet } from '../../../ui/Sheet';
import {Button, Sheet} from '../../../ui/v7/components';
import {requestSettingsClose} from '../v7/SettingsLists';
import { useToast } from '../../../ui/Toast';

const button = 'min-h-11 rounded-ctl border settings-section-button px-3 py-2 text-label font-semibold settings-section-text focus-visible:outline-2  disabled:opacity-50';
const field = 'mt-2 min-h-32 w-full rounded-ctl border settings-section-field p-3 text-body settings-section-text';
type OptimizerResult = Extract<OptimizerMessage, { type: 'result' }>['result'];
type Editor = 'rules' | 'macros' | 'optimizer' | null;

/** Native-style radio movement for every teaching option, including Home and End. */
export function teachingStyleDestination(index: number, key: string, count: number): number | null {
  if (count < 1) return null;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (index + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (index + count - 1) % count;
  return null;
}


/** N28.2.1: v6 Study defaults. All writes use the existing updateSettings mutation. */
/** N121 F9: `part` splits the page between Tutor (teaching style, tutor rules) and Study & review (memory, shortcuts). */
export default function StudyDefaults({ settings, part = 'all', v7 = false }: { settings: Settings; part?: 'all' | 'tutor' | 'study'; v7?: boolean }) {
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

  async function save(patch: SettingsPatch, message = 'Saved', undo?:SettingsPatch): Promise<boolean> {
    try {
      await update.mutateAsync(patch);
      notify(message, {tone:'success',action:undo?{label:'Undo',onClick:async()=>{
        try{await update.mutateAsync(undo);}
        catch{notify("Couldn't undo settings.",{tone:'danger'});}
      }}:undefined});
      return true;
    } catch {
      notify("Couldn't save settings.", { tone: 'danger' });
      return false;
    }
  }
  function moveStyle(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const available = styles.data ?? [];
    const destination = teachingStyleDestination(index, event.key, available.length);
    if (destination === null || busy) return;
    event.preventDefault();
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[destination]?.focus();
    if(!v7)void save({defaultStyle:available[destination].key});
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
  const rulesChanged=rules.trim()!==(settings.tutorRules??'').trim();
  const macrosChanged=macros!==settings.macros;
  const saveRules=async()=>{if(await save({tutorRules:rules.trim()||null},'Tutor rules saved'))setEditor(null);};
  const saveMacros=async()=>{if(await save({macros},'Math shortcuts saved'))setEditor(null);};
  const applyTuning=async()=>{
    if(result&&!result.skipped&&await save({fsrsWeights:result.w,fsrsTunedAt:new Date().toISOString()},'Memory model updated'))
      closeOptimizer();
  };
  const Control=v7?Button:'button';
  const preview = renderMarkdown('$\\R \\quad \\norm{x}$', { macros });

  return <section aria-labelledby="v6-study-title" className="flex flex-col gap-4 pb-8">
    <h2 id="v6-study-title" className="text-title-s font-semibold settings-section-text">{part === 'tutor' ? 'Teaching style' : 'Study defaults'}</h2>
    {part !== 'study' && <section className="rounded-slab border settings-section-card p-4">
      {part==='all'&&<h3 className="mb-2 text-body font-semibold settings-section-text">Teaching style</h3>}
      {styles.isPending ? <p role="status">Loading teaching styles…</p> :
        styles.isError ? <div role="alert">Teaching styles unavailable.
          <Control type="button" className={button} onClick={() => void styles.refetch()}>Retry styles</Control>
        </div> : !styles.data?.length ? <p>No teaching styles available.</p> :
        <div role="radiogroup" aria-label="Teaching style" data-teaching-styles className="flex flex-col gap-2">
          {styles.data.map((style, index) => <button key={style.key} type="button" role="radio"
            aria-checked={settings.defaultStyle === style.key} disabled={busy}
            className="flex min-h-11 w-full items-center gap-3 rounded-[8px] px-2 text-left text-body settings-section-text settings-section-radio focus-visible:outline-2  disabled:opacity-50"
            onKeyDown={event => moveStyle(event, index)}
            onClick={() => {
              if(settings.defaultStyle!==style.key)void save({defaultStyle:style.key},v7?'Teaching style set to '+style.name:undefined,
                v7?{defaultStyle:settings.defaultStyle}:undefined);
            }}>
            <span aria-hidden="true" className="settings-section-radio-mark flex size-5 shrink-0 items-center justify-center rounded-full border-2"/>
            {style.name}
          </button>)}
        </div>}
      <Control type="button" className={button + ' mt-3'} disabled={busy} onClick={openRules}>Tutor rules</Control>
    </section>}
    {part !== 'tutor' && <section className="rounded-slab border settings-section-card p-4">
      <h3 className="mb-3 text-body font-semibold settings-section-text">Memory</h3>
      <label className="flex items-center justify-between gap-2 text-label font-semibold settings-section-text" htmlFor="v6-retention">
        <span>Target recall</span><output htmlFor="v6-retention">{Math.round((retention ?? settings.desiredRetention) * 100)}%</output>
      </label>
      <input id="v6-retention" aria-label="Target recall" type="range" min="80" max="97" step="1"
        className="my-3 min-h-11 w-full settings-section-accent"
        disabled={busy} value={Math.round((retention ?? settings.desiredRetention) * 100)}
        onChange={event => setRetention(Number(event.target.value) / 100)}
        onPointerUp={event => saveRetention(Number(event.currentTarget.value) / 100)}
        onKeyUp={event => {
          if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key))
            saveRetention(Number(event.currentTarget.value) / 100);
        }}/>
      <p className="text-caption settings-section-meta">Higher recall means more reviews each day.</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-label font-semibold settings-section-text">New cards a day</span>
        <div className="flex items-center gap-3">
          <Control type="button" aria-label="Fewer new cards" className={button} disabled={busy || settings.newPerDay <= 0}
            onClick={() => { void save({ newPerDay: Math.max(0, settings.newPerDay - 5) }); }}>−</Control>
          <output className="min-w-7 text-center tabular-nums">{settings.newPerDay}</output>
          <Control type="button" aria-label="More new cards" className={button} disabled={busy || settings.newPerDay >= 60}
            onClick={() => { void save({ newPerDay: Math.min(60, settings.newPerDay + 5) }); }}>+</Control>
        </div>
      </div>
      {reviews.isPending ? <p role="status" className="mt-3 text-label">Loading review history…</p> :
        reviews.isError ? <div role="alert" className="mt-3 text-label">Review history unavailable.
          <Control type="button" className={button} onClick={() => void reviews.refetch()}>Retry reviews</Control>
        </div> : !canTune ? <p className="mt-3 text-label settings-section-meta">
          Needs 400 reviews (you have {reviewCount ?? 0})
        </p> : null}
      <Control type="button" className={button + ' mt-3 w-full'} disabled={busy || !canTune} onClick={tune}>
        Tune to my reviews
      </Control>
    </section>}
    {part !== 'tutor' && <section className="rounded-slab border settings-section-card p-4">
      <h3 className="mb-3 text-body font-semibold settings-section-text">Math shortcuts</h3>
      <Control type="button" className={button} disabled={busy} onClick={openMacros}>Edit math shortcuts</Control>
    </section>}
    {v7 ? <>
      <Sheet open={editor==='rules'} onClose={()=>{if(!busy)setEditor(null);}} title="Tutor rules" dirty={rulesChanged&&!busy}
        footer={<><Button variant="ghost" disabled={busy} onClick={requestSettingsClose}>Cancel</Button>
          <Button disabled={busy||!rules} onClick={()=>setRules('')}>Reset to default</Button>
          <Button variant="primary" disabled={!rulesChanged} loading={busy} onClick={()=>void saveRules()}>Save rules</Button></>}>
        <label className="v7-settings-staged-field">Rules
          <textarea aria-label="Tutor rules text" data-v7-autofocus="true" className="v7-field" value={rules}
            onChange={event=>setRules(event.target.value)}/>
        </label>
      </Sheet>
      <Sheet open={editor==='macros'} onClose={()=>{if(!busy)setEditor(null);}} title="Math shortcuts" dirty={macrosChanged&&!busy}
        footer={<><Button variant="ghost" disabled={busy} onClick={requestSettingsClose}>Cancel</Button>
          <Button variant="primary" disabled={!macrosChanged} loading={busy} onClick={()=>void saveMacros()}>Save shortcuts</Button></>}>
        <label className="v7-settings-staged-field">KaTeX macros
          <textarea aria-label="Math shortcuts text" data-v7-autofocus="true" className="v7-field font-mono" value={macros}
            onChange={event=>setMacros(event.target.value)}/>
        </label>
        <p className="v7-meta">Preview</p>
        <div className="lemma-math" dangerouslySetInnerHTML={{__html:preview}}/>
      </Sheet>
      <Sheet open={editor==='optimizer'} onClose={()=>{if(!busy)closeOptimizer();}} title="Tune to your reviews" focusTitle
        dirty={!!result&&!result.skipped&&!busy}
        footer={<><Button variant="ghost" disabled={busy} onClick={requestSettingsClose}>Cancel</Button>
          <Button variant="primary" disabled={!result||result.skipped} loading={busy} onClick={()=>void applyTuning()}>Apply tuning</Button></>}>
        {progress!==null?<p role="status">Analyzing reviews… {Math.round(progress*100)}%</p>:result?<>
          <p>Log loss: {result.before.logLoss.toFixed(3)} → {result.after.logLoss.toFixed(3)} · {result.items} answers</p>
          {result.skipped&&<p>There was not enough usable history to tune the model.</p>}
        </>:<p>Optimization did not finish. Try again.</p>}
      </Sheet>
    </> : <>
    <LegacySheet open={editor === 'rules'} onClose={() => setEditor(null)} title="Tutor rules" footer={<>
        <button type="button" className={button} onClick={() => setRules('')}>Reset to default</button>
        <button type="button" className={button} disabled={busy}
          onClick={async () => { if (await save({ tutorRules: rules.trim() || null }, 'Tutor rules saved')) setEditor(null); }}>Save rules</button>
      </>}>
      <label className="text-label settings-section-text">Rules
        <textarea aria-label="Tutor rules text" className={field} value={rules}
          onChange={event => setRules(event.target.value)}/>
      </label>
    </LegacySheet>
    <LegacySheet open={editor === 'macros'} onClose={() => setEditor(null)} title="Math shortcuts" footer={
      <button type="button" className={button + ' w-full'} disabled={busy}
        onClick={async () => { if (await save({ macros }, 'Math shortcuts saved')) setEditor(null); }}>Save shortcuts</button>}>
      <label className="text-label settings-section-text">KaTeX macros
        <textarea aria-label="Math shortcuts text" className={field + ' font-mono'} value={macros}
          onChange={event => setMacros(event.target.value)}/>
      </label>
      <p className="mt-3 text-label settings-section-meta">Preview</p>
      <div className="lemma-math my-3" dangerouslySetInnerHTML={{ __html: preview }}/>
    </LegacySheet>
    <LegacySheet open={editor === 'optimizer'} onClose={closeOptimizer} title="Tune to your reviews">
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
    </LegacySheet>
    </>}
  </section>;
}
