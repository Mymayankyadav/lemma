import BlockSheetActions from './block-sheet/BlockSheetActions';
import OverdueBanner from './deadlines/OverdueBanner';
import TimeGrid from './grid/TimeGrid';
import AgendaView,{BlockLines} from './views/AgendaView';
import {civilDayLabel,civilMonthLabel,civilRangeLabel} from './views/labels';
import {useToast} from '../../ui/Toast';
import PlannerLaunch from '../planner/Sheet';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Navigate, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isFlagOn } from '../../flags';
import { getApi } from '../../data';
import { getStudyApi } from '../../data/study';
import type { CalendarBlockRecord, StudyEntryRecord } from '../../data/study/contract';
import type { ProjectSummary } from '../../data/types';
import { Segmented } from '../../ui/Segmented';
import { formatDuration } from '../../lib/format';
import { WeekView } from './views/WeekView';
import { MonthView } from './views/MonthView';
import {DueDayItems,dueForDay,emptyCalendarDues,type CalendarDues} from './deadlines/DueDayItems';
import {loadCalendarDues} from './deadlines/load';
import { calendarRange, dayCapacity, dayKey, monthBounds, shiftDay, shiftMonth, validDayKey, weekStartDay } from './model';

const actionClass = 'min-h-11 rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] px-3 text-label text-ink hover:bg-[var(--paper-2)] focus-visible:outline-2 focus-visible:outline-[var(--link)]';
const arrowClass = 'flex size-11 items-center justify-center rounded-[8px] text-ink hover:bg-[var(--paper-2)] focus-visible:outline-2 focus-visible:outline-[var(--link)]';
type View = 'agenda' | 'day' | 'week' | 'month';

function writeError(error: unknown): string {
  const value = error as { code?: string; message?: string } | null;
  return value?.code === 'conflict' || /conflict|version|stale/i.test(value?.message ?? '')
    ? 'Changed elsewhere, reload to see the latest changes.'
    : (value?.message || 'Could not save the block. Try again.');
}
/** N121 B7: the navigator names what each view shows. */
function viewLabel(view: View, date: string, firstDay: number): string {
  if (view === 'day') return civilDayLabel(date);
  if (view === 'month') return civilMonthLabel(date);
  const from = view === 'week' ? weekStartDay(date, firstDay) : date;
  return civilRangeLabel(from, shiftDay(from, 6));
}
const unit = (view: View) => view === 'day' ? 'day' : view === 'month' ? 'month' : 'week';

function V6Calendar() {
  const [ownerSettings,setOwnerSettings]=useState<{weekStart?:number;clock24h?:boolean;window?:{start:string;end:string}|null}|null>(null);
  const [preferencesError,setPreferencesError]=useState(false);
  const [projects,setProjects]=useState<ProjectSummary[]>([]);
  // Calendar is also mounted by standalone N27/N74 tests without React Query.
  // Load owner settings through the same mode-aware API used by Settings.
  useEffect(()=>{
    let active=true;
    const load=()=>{
      try{
        void getApi().getSettings().then(settings=>{
          if(!active)return;
          const planning=settings.planning;
          setOwnerSettings({weekStart:settings.weekStart,clock24h:settings.clock24h,
            window:planning?.window_start&&planning?.window_end?{start:planning.window_start,end:planning.window_end}:null});
          setPreferencesError(false);
        }).catch(()=>{if(active)setPreferencesError(true)});
      }catch{
        // Adapter initialization can also fail synchronously (configuration,
        // unavailable mode data); never break the whole Calendar route.
        if(active)setPreferencesError(true);
      }
    };
    load();
    try{void getApi().listProjects().then(rows=>{if(active)setProjects(rows)}).catch(()=>{/* names are optional */});}
    catch{/* names are optional */}
    window.addEventListener('focus',load);
    return()=>{active=false;window.removeEventListener('focus',load)};
  },[]);
  const firstDay=ownerSettings?.weekStart??1;
  const clock24h=ownerSettings?.clock24h??true;
  const notify=useToast();
  const [params, setParams] = useSearchParams();
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const view: View = params.get('view') === 'day' ? 'day' : params.get('view') === 'week' ? 'week' : params.get('view') === 'month' ? 'month' : 'agenda';
  const rawDay = params.get('date');
  const date = validDayKey(rawDay) ? rawDay : dayKey(new Date(), zone);
  const [entries, setEntries] = useState<StudyEntryRecord[]>([]);
  const [blocks, setBlocks] = useState<CalendarBlockRecord[]>([]);
  const [dues, setDues] = useState<CalendarDues>(emptyCalendarDues);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [readError, setReadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [reload, setReload] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const tools = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    let active = true;
    setPhase('loading'); setReadError('');
    const range = view === 'month' ? monthBounds(date, zone, firstDay).range :
      calendarRange(view === 'week' ? weekStartDay(date, firstDay) : date, zone, view === 'day' ? 1 : 7);
    const api = getStudyApi();
    // Load owner-only due and projected records alongside saved study data.
    // Their read-only presence never changes dayCapacity or saved effort totals.
    void Promise.all([api.listStudyEntries(range),api.listCalendarBlocks(range),
      loadCalendarDues()])
      .then(([nextEntries,nextBlocks,nextDues]) => {
        if (!active) return;
        setEntries(nextEntries);setBlocks(nextBlocks);setDues(nextDues);
        setPhase('ready');
      })
      .catch(error => {
        if (!active) return;
        setReadError((error as Error).message || 'Could not load the calendar.'); setPhase('error');
      });
    return () => { active = false; };
  }, [date, zone, view, reload, firstDay]);

  useEffect(() => {
    const refetch = () => setReload(n => n + 1);
    const onVisible = () => { if (document.visibilityState === 'visible') refetch(); };
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refetch);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => { setConfirmDelete(null); setActionError(''); }, [date]);

  function updateUrl(key: 'view' | 'date', value: string) {
    const next = new URLSearchParams(params);
    next.set('view', view); next.set('date', date);
    next.set(key, value);
    setParams(next);
  }
  function remember(event?: MouseEvent<HTMLElement>) {
    if (event?.currentTarget) opener.current = event.currentTarget;
    if (tools.current) tools.current.open = false;
  }
  function openNew(event?: MouseEvent<HTMLElement>, startsAt?: string) {
    remember(event);
    const next = new URLSearchParams(params);
    next.set('new', 'block'); next.delete('edit');
    if (startsAt) next.set('start', startsAt); else next.delete('start');
    setParams(next);
  }
  function openEdit(block: CalendarBlockRecord, event?: MouseEvent<HTMLElement>) {
    remember(event);
    const next = new URLSearchParams(params);
    next.set('edit', block.id); next.delete('new'); next.delete('start');
    setParams(next);
  }
  function restoreFocus() {
    const target = opener.current;
    opener.current = null;
    if (target?.isConnected) target.focus();
    if (!target?.isConnected || document.activeElement !== target) tools.current?.querySelector('summary')?.focus();
  }
  async function mutate<T>(perform: () => Promise<T>, done: (receipt: T) => void) {
    if (saving) return;
    setSaving(true); setActionError('');
    try { done(await perform()); }
    catch (error) { setActionError(writeError(error)); }
    finally { setSaving(false); }
  }
  function doneBlock(block: CalendarBlockRecord) {
    void mutate(
      () => getStudyApi().updateCalendarBlock(block.id, block.version, { status: 'done' }),
      receipt => setBlocks(old => old.map(b => b.id === block.id ? receipt.record : b)),
    );
  }
  function deleteBlock(block: CalendarBlockRecord) {
    const api = getStudyApi();
    void mutate(
      () => api.deleteCalendarBlock(block.id, block.version),
      () => {
        setBlocks(old => old.filter(b => b.id !== block.id)); setConfirmDelete(null);
        notify('Calendar block deleted', { tone: 'success', action: { label: 'Undo', onClick: () => {
          void api.createCalendarBlock(block).then(() => setReload(n => n + 1))
            .catch(error => { setActionError(writeError(error)); setReload(n => n + 1); });
        } } });
      },
    );
  }
  function adjustGridBlock(block:CalendarBlockRecord,patch:{startsAt?:string;endsAt?:string}){
    if(saving)return;
    if(!patch.startsAt||!patch.endsAt||Date.parse(patch.endsAt)<=Date.parse(patch.startsAt)){
     setActionError('Block must finish after it starts.');return;
    }
    const before={startsAt:block.startsAt,endsAt:block.endsAt},api=getStudyApi();
    void mutate(()=>api.updateCalendarBlock(block.id,block.version,patch),receipt=>{
     setBlocks(old=>old.map(item=>item.id===block.id?receipt.record:item));
     notify('Calendar block moved',{tone:'success',action:{label:'Undo',onClick:()=>{
      void api.updateCalendarBlock(block.id,receipt.record.version,before).then(()=>{
       setReload(n=>n+1);notify('Calendar change undone',{tone:'success'});
      }).catch(error=>{setActionError(writeError(error));setReload(n=>n+1);});
     }}});
    });
  }
  const full = phase === 'ready' && view === 'day' ? dayCapacity(date, zone, entries, blocks) : null;
  const inWindow = phase === 'ready' && view === 'day' ? dayCapacity(date, zone, entries, blocks, ownerSettings?.window) : null;
  const dayBlocks = view === 'day' ? blocks.filter(b => b.status !== 'cancelled').sort((a, b) => a.startsAt.localeCompare(b.startsAt)) : [];
  const step = view === 'day' ? 1 : 7;
  const shift = (direction: 1 | -1) => updateUrl('date', view === 'month' ? shiftMonth(date, direction) : shiftDay(date, direction * step));

  return <section aria-labelledby="calendar-title" data-calendar-view={view} className="flex min-w-0 max-w-full flex-col gap-4 overflow-x-clip pb-8">
    <h1 id="calendar-title" className="sr-only">Calendar</h1>
    {preferencesError&&<p aria-live="polite" className="text-label text-ink-2">Calendar preferences unavailable; showing default week start and clock format.</p>}
    <nav aria-label="Calendar date" className="grid grid-cols-[44px_minmax(0,1fr)_44px_auto] items-center gap-2">
      <button type="button" className={arrowClass} aria-label={'Previous ' + unit(view)} onClick={() => shift(-1)}><ChevronLeft size={22} aria-hidden="true"/></button>
      <strong className="min-w-0 truncate text-center text-body font-medium text-ink" aria-live="polite">{viewLabel(view, date, firstDay)}</strong>
      <button type="button" className={arrowClass} aria-label={'Next ' + unit(view)} onClick={() => shift(1)}><ChevronRight size={22} aria-hidden="true"/></button>
      <button type="button" className="min-h-11 rounded-[8px] px-2 text-body text-ink-2" onClick={() => updateUrl('date', dayKey(new Date(), zone))}>Today</button>
    </nav>
    {phase==='ready'&&<OverdueBanner dues={dues} zone={zone} projects={projects}
      onRefresh={()=>setReload(n=>n+1)}/>}
    <div className="flex min-w-0 items-start gap-2" onKeyDown={event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      if (!(event.target as HTMLElement).closest('[role=group][aria-label="Calendar view"]')) return;
      const choices = ['agenda', 'day', 'week', 'month'];
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const next = (choices.indexOf(view) + offset + choices.length) % choices.length;
      event.preventDefault();
      updateUrl('view', choices[next]);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[aria-label="Calendar view"] button')[next]?.focus();
    }}>
      <div className="min-w-0 flex-1"><Segmented label="Calendar view" value={view} onChange={value => updateUrl('view', value)}
        options={[{ value: 'agenda', label: 'Agenda' }, { value: 'day', label: 'Day' }, { value: 'week', label: 'Week' }, { value: 'month', label: 'Month' }]} /></div>
      {/* #1321 (mockup): one "Planning tools" button; N121 B7 makes it a right-anchored menu with two items. */}
      <details ref={tools} className="lemma-planning-tools relative shrink-0">
        <summary className="cr-calendar-tools flex min-h-12 cursor-pointer list-none items-center justify-center rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] px-3 text-label text-ink [&::-webkit-details-marker]:hidden">Planning tools</summary>
        <div aria-label="Planning tools" role="group" className="absolute right-0 top-full z-[60] mt-2 flex w-56 flex-col gap-1 rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-2 shadow-lg [&_button]:w-full [&_button]:text-left">
          <button type="button" className={actionClass} disabled={phase!=='ready'} onClick={event=>openNew(event)}>New time block</button>
          <PlannerLaunch date={date} zone={zone}/>
        </div>
      </details>
    </div>
    <BlockSheetActions showLaunchers={false} blocks={blocks} date={date} zone={zone} ready={phase==='ready'}
      onRefresh={()=>setReload(n=>n+1)} onClosed={restoreFocus}/>

    {phase === 'loading' && <p role="status">Loading calendar…</p>}
    {phase === 'error' && <div role="alert">{readError} <button type="button" className={actionClass} onClick={() => { setActionError(''); setReload(n => n + 1); }}>Reload</button></div>}
    {actionError && <div role="alert" className="rounded-ctl border border-edge p-3 text-label">{actionError} <button type="button" className={actionClass} onClick={() => { setActionError(''); setReload(n => n + 1); }}>Reload</button></div>}

    {phase === 'ready' && view === 'agenda' && <AgendaView date={date} zone={zone} clock24h={clock24h}
      entries={entries} blocks={blocks} dues={dues} projects={projects}
      onEdit={openEdit} onRefresh={()=>setReload(n=>n+1)}/>}

    {phase === 'ready' && view === 'week' && <WeekView date={date} zone={zone} firstDay={firstDay} clock24h={clock24h}
      entries={entries} blocks={blocks} dues={dues} onEdit={block=>openEdit(block)} onAdjust={adjustGridBlock} onDay={selected => {
        const next = new URLSearchParams(params);
        next.set('view', 'day'); next.set('date', selected); setParams(next);
      }} />}

    {phase === 'ready' && view === 'month' && <MonthView date={date} zone={zone} firstDay={firstDay} clock24h={clock24h}
      entries={entries} blocks={blocks} dues={dues} onDay={selected => {
        const next = new URLSearchParams(params);
        next.set('view', 'day'); next.set('date', selected); setParams(next);
      }} />}

    {phase === 'ready' && view === 'day' && <>
      {full && inWindow && <p aria-label="Day capacity" className="text-label text-ink-2">
        Logged <strong className="tabular-nums text-ink">{formatDuration(full.logged)}</strong>
        {full.busy > 0 && <> · Busy <strong className="tabular-nums text-ink">{formatDuration(full.busy)}</strong></>}
        {' · '}Planned <strong className="tabular-nums text-ink">{formatDuration(full.planned)}</strong>
        {' · '}Free <strong className="tabular-nums text-ink">{formatDuration(inWindow.free)}</strong>
      </p>}
      <section aria-label="Day schedule" className="min-w-0 max-w-full">
        <h2 className="sr-only">Day schedule</h2>
        <TimeGrid date={date} zone={zone} clock24h={clock24h}
          entries={entries} blocks={blocks} busy={saving}
          onCreate={startsAt=>openNew(undefined,startsAt)} onEdit={block=>openEdit(block)} onAdjust={adjustGridBlock}/>
        {dayBlocks.length === 0 && entries.length === 0 && dueForDay(date,date,zone,dues).length===0 &&
          <p className="mt-2 text-label text-ink-2">Nothing planned. Tap the grid to add a block.</p>}
        <div className="mt-2"><DueDayItems date={date} firstVisible={date} zone={zone} dues={dues} projects={projects}/></div>
      </section>
      {dayBlocks.length > 0 && <section aria-labelledby="calendar-events" className="cr-event-details flex min-w-0 flex-col gap-2">
        <h2 id="calendar-events" className="text-label font-semibold text-ink">Events for selected day · {dayBlocks.length}</h2>
        <ul className="flex flex-col gap-2">{dayBlocks.map(block => <li key={block.id} className="flex min-w-0 flex-col gap-2 rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-3">
          <button type="button" aria-label={'Edit block ' + block.title} className="min-h-11 min-w-0 text-left" onClick={event => openEdit(block, event)}>
            <BlockLines block={block} zone={zone} clock24h={clock24h}/>
          </button>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={actionClass} disabled={saving} onClick={event => openEdit(block, event)} aria-label={'Move ' + block.title}>Move</button>
            {block.status !== 'done' && <button type="button" className={actionClass} disabled={saving} onClick={() => doneBlock(block)} aria-label={'Mark ' + block.title + ' done'}>Done</button>}
            <button type="button" className={actionClass + ' lemma-destructive'} disabled={saving} onClick={() => setConfirmDelete(block.id)} aria-label={'Delete ' + block.title}>Delete</button>
          </div>
          {confirmDelete === block.id && <div className="flex flex-wrap items-center gap-2 text-label">
            <span>Delete this block?</span>
            <button type="button" className={actionClass} onClick={() => setConfirmDelete(null)}>Keep</button>
            <button type="button" className={actionClass + ' lemma-destructive'} disabled={saving} onClick={() => deleteBlock(block)}>Confirm delete</button>
          </div>}
        </li>)}</ul>
      </section>}
    </>}
  </section>;
}

/** The legacy route stays a redirect and does not mount any v6 data reads. */
export default function CalendarPage() {
  if (!isFlagOn('v6Shell')) return <Navigate to="/" replace />;
  return <V6Calendar />;
}
