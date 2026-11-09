import {useState,type FormEvent} from 'react';
import Dialog from '../../../ui/v6/Dialog';
import type { ProjectSummary } from '../../../data/types';

export interface CardFilters {
  projectSlug: string;
  checkpointCode: string;
  state: string;
  noteStatus: string;
  hasOpenComments: boolean;
}
export const clearCardFilters: CardFilters = {
  projectSlug: '', checkpointCode: '', state: '', noteStatus: '', hasOpenComments: false,
};
const field = 'min-h-11 w-full rounded-ctl border border-edge bg-fill-1 px-3 py-2 text-body text-ink';
const label = 'flex flex-col gap-1 text-label text-ink-2';
const button = 'min-h-11 rounded-ctl border border-edge px-3 text-label font-semibold text-ink';

type Props = {
  values: CardFilters;
  projects: ProjectSummary[];
  projectsLoading: boolean;
  projectsError: boolean;
  onApply: (filters: CardFilters) => void;
  onDismiss: () => void;
};

/** The same six server search filters, without introducing any new API. */
export default function CardFiltersSheet({ values, projects, projectsLoading, projectsError, onApply, onDismiss }: Props) {
  const [draft, setDraft] = useState<CardFilters>({ ...values });
  function close(){onDismiss();}
  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onApply({ ...draft, checkpointCode: draft.checkpointCode.trim() });
    close();
  }
  return <Dialog title="Filter cards" onClose={close} footer={<>
    <button type="button" className={button} onClick={() => setDraft({ ...clearCardFilters })}>Clear</button>
    <button type="button" className={button} onClick={close}>Cancel</button>
    <button type="submit" form="n121-card-filters" className={button}>Apply filters</button>
   </>}>
    <form id="n121-card-filters" className="flex flex-col gap-3" onSubmit={apply}>
      <label className={label}>Project
        <select autoFocus aria-label="Filter project" className={field} value={draft.projectSlug}
          onChange={event => setDraft(old => ({ ...old, projectSlug: event.target.value, checkpointCode: '' }))}>
          <option value="">All projects</option>
          {projects.map(project => <option key={project.id} value={project.slug}>{project.title}</option>)}
        </select>
      </label>
      {projectsLoading && <p role="status" className="text-label">Loading projects…</p>}
      {projectsError && <p role="alert" className="text-label">Projects unavailable. You can filter by other fields.</p>}
      <label className={label}>Checkpoint code
        <input aria-label="Filter checkpoint" className={field} value={draft.checkpointCode}
          onChange={event => setDraft(old => ({ ...old, checkpointCode: event.target.value }))} />
      </label>
      <label className={label}>Scheduling state
        <select aria-label="Filter scheduling state" className={field} value={draft.state}
          onChange={event => setDraft(old => ({ ...old, state: event.target.value }))}>
          <option value="">All states</option><option value="0">New</option>
          <option value="1">Learning</option><option value="2">Review</option><option value="3">Relearning</option>
        </select>
      </label>
      <label className={label}>Card status
        <select aria-label="Filter note status" className={field} value={draft.noteStatus}
          onChange={event => setDraft(old => ({ ...old, noteStatus: event.target.value }))}>
          <option value="">All statuses</option><option value="active">Active</option>
          <option value="suspended">Paused</option><option value="deleted">Deleted</option>
        </select>
      </label>
      <label className="flex min-h-11 items-center gap-2 text-label text-ink">
        <input type="checkbox" aria-label="Has open comments" checked={draft.hasOpenComments}
          onChange={event => setDraft(old => ({ ...old, hasOpenComments: event.target.checked }))}/>
        Has open comments
      </label>
    </form>
  </Dialog>;
}
