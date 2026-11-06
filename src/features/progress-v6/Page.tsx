import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { getStudyApi } from '../../data/study';
import type { StudyEntryRecord } from '../../data/study/contract';
import { Segmented } from '../../ui/Segmented';
import { Slab } from '../../ui/Slab';
import { SectionHeading } from '../../ui/SectionHeading';
import { progressMetrics, progressWindow, type ProgressRange } from './metrics';

const options = [{value:'day',label:'Day'},{value:'week',label:'Week'},{value:'month',label:'Month'}];
const readable = (minutes: number) => `${new Intl.NumberFormat(undefined, {maximumFractionDigits: 1}).format(minutes)} min`;
const validRange = (value: string | null): ProgressRange =>
  value === 'week' || value === 'month' ? value : 'day';

type State = {status:'loading'} | {status:'error'} | {status:'ready'; entries: StudyEntryRecord[]};

export default function ProgressV6() {
  const [params, setParams] = useSearchParams();
  const kind = validRange(params.get('range'));
  const [now] = useState(() => new Date().toISOString());
  const [zone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const window = useMemo(() => progressWindow(kind, zone, now), [kind, zone, now]);
  const [state, setState] = useState<State>({status:'loading'});
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setState({status:'loading'});
    getStudyApi().listStudyEntries(window.range).then(
      entries => { if (active) setState({status:'ready',entries}); },
      () => { if (active) setState({status:'error'}); },
    );
    return () => { active = false; };
  }, [window.range.start, window.range.end, retry]);
  const metrics = useMemo(() => state.status === 'ready'
    ? progressMetrics(state.entries, kind, zone, now) : null, [state, kind, zone, now]);
  function changeRange(value: string) {
    setParams(previous => {
      const updated = new URLSearchParams(previous);
      updated.set('range', validRange(value));
      return updated;
    }, {replace:true});
  }
  const maxDay = Math.max(1, ...(metrics?.perDay.map(day => day.minutes) ?? []));
  return <section aria-label="Effort progress" className="flex flex-col gap-3">
    <SectionHeading>Saved study time</SectionHeading>
    <Segmented label="Effort range" options={options} value={kind} onChange={changeRange}/>
    {state.status === 'loading' && <p role="status" className="text-ink-2">Loading saved time…</p>}
    {state.status === 'error' && <p role="alert" className="text-ink-2">Couldn’t load saved time. <button type="button" className="text-amber underline" onClick={()=>setRetry(value=>value+1)}>Try again</button></p>}
    {metrics && <>
      <Slab className="p-4">
        <span className="block text-label text-ink-2">Logged {kind === 'day' ? 'today' : `this ${kind}`}</span>
        <strong data-testid="v6-logged-total" className="block text-2xl tabular-nums font-semibold">{readable(metrics.total)}</strong>
        <p className="mt-1 text-caption text-ink-3">Saved focus only. Breaks and drafts are excluded.</p>
      </Slab>
      {kind !== 'day' && <Slab className="p-4" >
        <SectionHeading>Daily saved time</SectionHeading>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Daily effort chart">
          <ol className="mt-3 flex min-w-max items-end gap-1.5" aria-label="Logged minutes by day">
            {metrics.perDay.map(day => <li key={day.date} className="flex w-7 shrink-0 flex-col items-center gap-1" aria-label={`${day.date}: ${readable(day.minutes)}`}>
              <div className="flex h-16 w-4 items-end rounded-sm bg-well" aria-hidden="true">
                <div className="w-full rounded-sm bg-amber" style={{height:`${(day.minutes/maxDay)*100}%`}}/>
              </div>
              <span className="text-[10px] tabular-nums text-ink-2" aria-hidden="true">{day.date.slice(-2)}</span>
            </li>)}
          </ol>
        </div>
      </Slab>}
      <Slab className="p-4">
        <SectionHeading>By subject</SectionHeading>
        {!metrics.total && <p className="mt-2 text-label text-ink-2">No saved study time in this range.</p>}
        <ul className="mt-2 flex flex-col gap-2">
          {metrics.subjects.filter(row=>row.minutes>0).map(row =>
            <li key={row.id} className="flex min-w-0 items-center justify-between gap-3 text-label">
              <span className="min-w-0 truncate" title={row.id}>{row.name}</span>
              <strong className="shrink-0 tabular-nums">{readable(row.minutes)}</strong>
            </li>)}
        </ul>
      </Slab>
    </>}
  </section>;
}
