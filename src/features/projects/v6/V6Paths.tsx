import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useProjects, useSubjects, useUpdateProject } from '../../../data/hooks';
import type { ProjectStatus, ProjectSummary } from '../../../data/types';
import { useToast } from '../../../ui/Toast';

type Status = 'active' | 'paused' | 'done' | 'archived';
const statuses: Status[] = ['active', 'paused', 'done', 'archived'];
const btn = 'min-h-11 rounded-ctl border border-edge px-3 py-2 text-label font-semibold text-ink hover:bg-fill-1 focus-visible:outline-2 focus-visible:outline-amber';
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

  return <section aria-labelledby="v6-paths-title" className="flex flex-col gap-4 pb-8">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <h1 id="v6-paths-title" className="text-title-l font-semibold text-ink">Paths</h1>
      <Link to="/projects/new" className={btn}>New path</Link>
    </header>
    <label className="flex flex-col gap-1 text-label text-ink-2">Find a path
      <input aria-label="Search paths" type="search" className="min-h-11 rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-body text-ink"
        value={search} onChange={event => setSearchValue(event.target.value)} placeholder="Subject or path" />
    </label>
    <div role="group" aria-label="Path status filters" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {statuses.map(next => <button type="button" key={next} aria-pressed={status === next}
        className={btn + ' capitalize'} onClick={() => selectStatus(next)}>{next}</button>)}
    </div>
    {subjects.isPending && <p role="status" className="text-label text-ink-2">Loading subjects…</p>}
    {subjects.isError && <p role="alert" className="text-label text-ink-2">Subjects unavailable; saved path labels remain visible.</p>}
    {projects.isPending ? <p role="status" className="text-label text-ink-2">Loading paths…</p> :
     projects.isError ? <div role="alert" className="text-label text-ink-2">Could not load Paths.
       <button type="button" className={btn} onClick={() => void projects.refetch()}>Try again</button>
     </div> : <>
       <p aria-live="polite" className="text-label text-ink-2">{shown.length} paths shown{shown.length < visible.length ? ' · more available' : ''}</p>
       {visible.length === 0 ? <div className="rounded-ctl border border-edge bg-fill-1 p-5 text-label">
         <p>{all.length === 0 ? 'No paths yet. Create your first path.' :
           search ? 'No paths match your search.' : 'No paths in this status.'}</p>
         {all.length > 0 && search && <button type="button" className={btn} onClick={() => setSearchValue('')}>Clear search</button>}
       </div> : <div aria-label="Paths by subject" className="flex flex-col gap-4">
         {groups.map(group => <section key={group.key} aria-label={group.title + ' paths'}
           className="rounded-ctl border border-edge bg-fill-1 p-3">
           <h2 className="mb-2 text-body font-semibold text-ink"><span aria-hidden="true">{group.glyph} </span>{group.title}</h2>
           <div className="flex flex-col gap-2">
             {group.items.map(project => <article key={project.id} data-v6-project={project.slug}
               className="rounded-ctl border border-edge bg-[var(--paper)] p-3">
               <div className="flex flex-wrap items-start justify-between gap-2">
                 <Link to={'/p/' + project.slug}
                   className="min-h-11 min-w-0 flex-1 break-words text-body font-semibold text-ink focus-visible:outline-2 focus-visible:outline-amber">{project.title}</Link>
                 <button type="button" className={btn} disabled={busyId === project.id}
                   aria-label={'Manage ' + project.title} aria-expanded={menu === project.id}
                   onClick={() => setMenu(value => value === project.id ? null : project.id)}>Manage</button>
               </div>
               <p className="mt-1 break-words [overflow-wrap:anywhere] text-caption text-ink-2">
                 {project.pinned ? 'Pinned · ' : ''}{project.status} · {project.done} of {project.total} checkpoints
               </p>
               <p className="break-words [overflow-wrap:anywhere] text-caption text-ink-2">
                 {project.current ? 'Current: ' + project.current.code + ' · ' + project.current.title : 'No current checkpoint'}
                 {' · '}{project.scheduleHeadline || 'Forecast unavailable'}
               </p>
               {menu === project.id && <div role="group" aria-label={'Manage ' + project.title + ' actions'}
                 className="mt-2 grid grid-cols-2 gap-2 border-t border-edge pt-2">
                 {project.status !== 'archived' && <button type="button" className={btn} disabled={busyId !== null}
                   onClick={() => void change(project, { pinned: !project.pinned })}>{project.pinned ? 'Unpin' : 'Pin'}</button>}
                 <button type="button" className={btn} disabled={busyId !== null}
                   onClick={() => void change(project, { status: project.status === 'archived' ? 'active' : 'archived' })}>
                   {project.status === 'archived' ? 'Restore' : 'Archive'}
                 </button>
                 <button type="button" className={btn} onClick={() => setMenu(null)}>Close</button>
               </div>}
             </article>)}
           </div>
         </section>)}
         {shown.length < visible.length && <button type="button" className={btn + ' self-center'}
           onClick={() => setLimit(value => value + 20)}>Show 20 more</button>}
       </div>}
     </>}
  </section>;
}
