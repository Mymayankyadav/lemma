import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, ChevronRight, Ellipsis, Search, Waypoints } from 'lucide-react';
import { useProjects, useSubjects, useUpdateProject } from '../../../data/hooks';
import type { ProjectStatus, ProjectSummary } from '../../../data/types';
import { useToast } from '../../../ui/Toast';

type Status = 'active' | 'paused' | 'done' | 'archived';
const statuses: Status[] = ['active', 'paused', 'done', 'archived'];
const btn = 'min-h-11 rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] px-3 py-2 text-label font-semibold text-ink hover:bg-[var(--paper-2)] focus-visible:outline-2 focus-visible:outline-[var(--link)]';
const matches = (project: ProjectSummary, status: Status) =>
  status === 'active' ? project.status === 'active' || project.status === 'planning' : project.status === status;

/** N33.1: owner-scoped Paths list; project details are N33.2. */
export default function V6Paths() {
  const projects = useProjects(), subjects = useSubjects(), update = useUpdateProject(), notify = useToast();
  const [status, setStatus] = useState<Status>('active');
  const [search, setSearch] = useState('');
  const [limit, setLimit] = useState(20);
  const [menu, setMenu] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const all = useMemo(() => (projects.data ?? []).filter(row => !row.system), [projects.data]);
  const visible = useMemo(() => all.filter(project =>
    matches(project, status) && (!search.trim() ||
      [project.title, project.subject?.name ?? '', ...(project.sourceTitles ?? [])]
        .some(value => value.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))))
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      (Date.parse(b.lastActivityAt ?? '') || 0) - (Date.parse(a.lastActivityAt ?? '') || 0) ||
      a.title.localeCompare(b.title)), [all, search, status]);
  const shown = visible.slice(0, limit);
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; title: string; glyph: string; items: ProjectSummary[] }>();
    for (const project of shown) {
      const id = project.subject?.id ?? 'unassigned';
      const subject = subjects.data?.find(item => item.id === id);
      const group = map.get(id) ?? {
        key: id, title: subject?.name ?? project.subject?.name ?? 'Unassigned',
        glyph: subject?.glyph ?? project.subject?.glyph ?? '∫', items: [],
      };
      group.items.push(project);
      map.set(id, group);
    }
    return [...map.values()];
  }, [shown, subjects.data]);

  function selectStatus(next: Status) { setStatus(next); setLimit(20); setMenu(null); }
  function setSearchValue(next: string) { setSearch(next); setLimit(20); }
  async function change(project: ProjectSummary, patch: { pinned?: boolean; status?: ProjectStatus }) {
    if (busyId) return;
    if (patch.pinned && all.filter(row => row.pinned && row.status !== 'archived').length >= 4) {
      notify('At most four projects can be pinned. Unpin one first.', { tone: 'danger' }); return;
    }
    setBusyId(project.id);
    try {
      await update.mutateAsync({ id: project.id, patch });
      notify('Path updated', { tone: 'success' });
      setMenu(null);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not update path.', { tone: 'danger' });
    } finally { setBusyId(null); }
  }

  // N114 (mockup `/projects` in `53__index`): search, Concept map link, status tabs and
  // subject groups whose rows carry a progress rail.
  return <section aria-labelledby="v6-paths-title" className="flex flex-col gap-4 pb-8">
    <h2 id="v6-paths-title" className="sr-only">Paths</h2>
    <label className="relative flex flex-col text-label text-ink-2"><span className="sr-only">Find a path</span>
      <Search size={20} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2" />
      <input aria-label="Search paths" type="search" className="min-h-12 w-full rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper)] py-2 pl-12 pr-3 text-body text-ink"
        value={search} onChange={event => setSearchValue(event.target.value)} placeholder="Find a path or subject" />
    </label>
    <div role="group" aria-label="Path status filters" className="ui-segmented flex">
      {statuses.filter(next => next !== 'archived').map(next => <button type="button" key={next} aria-pressed={status === next}
        className="min-h-11 flex-1 capitalize text-ink" onClick={() => selectStatus(next)}>{next}</button>)}
    </div>
    <Link to="/atlas" className="notebook-concept-entry"><Waypoints size={20} aria-hidden="true" /><span>Concept map</span><ChevronRight size={19} aria-hidden="true" /></Link>
    {subjects.isPending && <p role="status" className="text-label text-ink-2">Loading subjects…</p>}
    {subjects.isError && <p role="alert" className="text-label text-ink-2">Subjects unavailable; saved path labels remain visible.</p>}
    {projects.isPending ? <p role="status" className="text-label text-ink-2">Loading paths…</p> :
     projects.isError ? <div role="alert" className="text-label text-ink-2">Could not load Paths.
       <button type="button" className={btn} onClick={() => void projects.refetch()}>Try again</button>
     </div> : <>
       <p aria-live="polite" className="sr-only">{shown.length} paths shown{shown.length < visible.length ? ' · more available' : ''}</p>
       {status === 'archived' && <p className="text-label text-ink-2">Archived paths</p>}
       {visible.length === 0 ? <div className="lemma-project-study">
         <p>{all.length === 0 ? 'No paths yet. Create your first path.' :
           search ? 'No paths match your search.' : 'No paths in this status.'}</p>
         {all.length > 0 && search && <button type="button" className={btn + ' self-start'} onClick={() => setSearchValue('')}>Clear search</button>}
       </div> : <div aria-label="Paths by subject" className="flex flex-col gap-6">
         {groups.map(group => {
           // N121 F1: a subject with one path shows that path straight away; only several paths fold.
           const single = group.items.length === 1;
           const open = single || !collapsed.has(group.key);
           return <section key={group.key} aria-label={group.title + ' paths'} data-style="role-projects">
           {single ? <h2 className="min-w-0 text-ink"><span aria-hidden="true">{group.glyph} </span>{group.title}</h2> :
           <button type="button" aria-expanded={open} className="flex w-full items-center gap-3 text-left"
             onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(group.key)) next.delete(group.key); else next.add(group.key); return next; })}>
             <h2 className="min-w-0 flex-1 text-ink"><span aria-hidden="true">{group.glyph} </span>{group.title}</h2>
             <span className="shrink-0 text-label text-ink-2">{group.items.length} paths</span>
             <ChevronDown size={20} aria-hidden="true" className={'shrink-0 text-ink-2 ' + (open ? '' : '-rotate-90')} />
           </button>}
           {open && <div className="flex flex-col">
             {group.items.map(project => <article key={project.id} data-v6-project={project.slug} data-project-row=""
               className="relative border-t border-[var(--hair)]">
               <div>
                 <Link to={'/p/' + project.slug}
                   className="min-w-0 break-words text-ink focus-visible:outline-2 focus-visible:outline-[var(--link)]">
                   <div><span className="font-semibold">{project.title}</span></div>
                   <div>{project.pinned ? 'Pinned · ' : ''}{project.current ? <span aria-label={'Now: ' + project.current.title + ' (' + project.current.code + ')'}>Now: {project.current.title}</span> : 'No current checkpoint'}
                     {project.scheduleHeadline ? ' · ' + project.scheduleHeadline : ''}</div>
                 </Link>
                 <button type="button" className="path-action-control" disabled={busyId === project.id}
                   aria-label={'Manage ' + project.title} aria-expanded={menu === project.id} aria-haspopup="menu"
                   onClick={() => setMenu(value => value === project.id ? null : project.id)}>
                   <span className="path-action-mark"><Ellipsis size={18} aria-hidden="true" /></span></button>
               </div>
               <div className="flex items-center">
                 <div><span className="notebook-progress-rail" role="progressbar" aria-label={project.title + ' checkpoints done'}
                   aria-valuemin={0} aria-valuemax={project.total} aria-valuenow={project.done}>
                   <span style={{ width: (project.total ? 100 * project.done / project.total : 0) + '%' }} /></span></div>
                 <span className="tabular-nums text-ink-2" aria-label={project.done + ' of ' + project.total + ' checkpoints'}>{project.done} of {project.total} checkpoints</span>
               </div>
               {menu === project.id && <div role="menu" aria-label={'Manage ' + project.title + ' actions'}
                 onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setMenu(null); } }}
                 onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setMenu(null); }}
                 className="absolute right-0 top-12 z-30 flex w-44 flex-col gap-1 rounded-[12px] border border-[var(--hair)] bg-[var(--paper)] p-1 shadow-lg">
                 {project.status !== 'archived' && <button type="button" role="menuitem" autoFocus className={btn + ' text-left'} disabled={busyId !== null}
                   onClick={() => void change(project, { pinned: !project.pinned })}>{project.pinned ? 'Unpin' : 'Pin'}</button>}
                 <button type="button" role="menuitem" autoFocus={project.status === 'archived'} className={btn + ' text-left'} disabled={busyId !== null}
                   onClick={() => void change(project, { status: project.status === 'archived' ? 'active' : 'archived' })}>
                   {project.status === 'archived' ? 'Restore' : 'Archive'}
                 </button>
               </div>}
             </article>)}
           </div>}
         </section>;})}
         {shown.length < visible.length && <button type="button" className={btn + ' self-center'}
           onClick={() => setLimit(value => value + 20)}>Show 20 more</button>}
       </div>}
     </>}
    <Link to="/projects/new" className="notebook-primary flex min-h-12 items-center justify-center">New path</Link>
    <div aria-label="Archived paths navigation">
      <button type="button" aria-pressed={status === 'archived'} className="flex min-h-11 w-full items-center text-label text-[var(--link)]"
        onClick={() => selectStatus(status === 'archived' ? 'active' : 'archived')}>{status === 'archived' ? 'Back to active paths' : 'Archived paths'}</button>
    </div>
  </section>;
}
