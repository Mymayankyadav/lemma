import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getApi } from '../../../data';
import { useCreateNote, useProjects } from '../../../data/hooks';
import type { CardRow, SchedulingState } from '../../../data/types';
import { Sheet } from '../../../ui/Sheet';
import { Skeleton } from '../../../ui/Skeleton';
import { useToast } from '../../../ui/Toast';
import { Tex } from '../../../ui/Tex';
import { canRenderPlainCardFront } from '../plainCardFront';
import type { EditorValue } from '../Editor';
import CardFiltersSheet, { clearCardFilters, type CardFilters } from './CardFiltersSheet';

const Editor = lazy(() => import('../Editor').then(module => ({ default: module.Editor })));
const button = 'min-h-11 rounded-[8px] border border-[var(--control-edge)] bg-transparent px-4 py-2 text-body text-ink hover:bg-[var(--paper-2)] focus-visible:outline-2 focus-visible:outline-[var(--link)]';
const hasFilters = (filters: CardFilters) => Boolean(filters.projectSlug || filters.checkpointCode ||
  filters.state || filters.noteStatus || filters.hasOpenComments);
const relative = (due: string | null) => {
  if (!due) return 'New';
  const days = Math.ceil((Date.parse(due) - Date.now()) / 86_400_000);
  return days <= 0 ? 'Due' : days === 1 ? 'in 1d' : 'in ' + days + 'd';
};

function CardItem({ row }: { row: CardRow }) {
  // N117 (mockup `18__Page`): a ruled list row with the subject glyph, serif front and a checkpoint chip.
  return <Link data-card-row to={'/cards/' + row.noteNo}
    className="flex min-w-0 items-center gap-4 border-b border-[var(--edge)] text-ink focus-visible:outline-2 focus-visible:outline-[var(--link)]">
    <span aria-hidden="true" className="w-8 shrink-0 text-center font-math text-[1.75rem] text-ink-2">{row.glyph}</span>
    <span className="min-w-0 flex-1">
      <span data-card-front className="block min-w-0 break-words font-math text-[1.125rem] leading-snug">
        {canRenderPlainCardFront(row.front) ? row.front : <Tex source={row.front} />}
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-3 text-label text-ink-2">
        <span className="rounded-[4px] border border-[var(--edge)] px-1.5 tabular-nums">{row.checkpointCode ?? 'No checkpoint'}</span>
        <span>{row.status === 'suspended' ? 'Paused' : relative(row.due)}</span>
        {row.openComments > 0 && <span>{row.openComments} open comments</span>}
      </span>
    </span>
  </Link>;
}

/** Flagged library: reuse existing bounded 50-row server search, reveal only 20 at a time. */
export default function V6Cards() {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<CardFilters>({ ...clearCardFilters });
  const [showFilters, setShowFilters] = useState(false);
  const [shown, setShown] = useState(20);
  const [creating, setCreating] = useState(false);
  // #1323 (mockup `18__Page`): a new card starts from the header "+" menu (`/cards?new=1`), not a list button.
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('new') !== '1') return;
    setCreating(true);
    const next = new URLSearchParams(params); next.delete('new'); setParams(next, { replace: true });
  }, [params, setParams]);
  const projects = useProjects();
  const create = useCreateNote();
  const notify = useToast();
  const navigate = useNavigate();
  const cards = useInfiniteQuery({
    queryKey: ['cards-v6', search, filters.projectSlug, filters.checkpointCode,
      filters.state, filters.noteStatus, filters.hasOpenComments],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getApi().searchCardsPage({
      query: search,
      projectSlug: filters.projectSlug || undefined,
      checkpointCode: filters.checkpointCode || undefined,
      state: filters.state === '' ? undefined : Number(filters.state) as SchedulingState,
      noteStatus: filters.noteStatus === '' ? undefined : filters.noteStatus as 'active' | 'suspended' | 'deleted',
      hasOpenComments: filters.hasOpenComments || undefined,
      offset: pageParam,
    }),
    getNextPageParam: (last, pages, lastPageParam, allPageParams) => {
      const offset = last.nextOffset;
      // Avoid repeated, regressing, malformed or empty owner result pages.
      if (offset === null || !Number.isSafeInteger(offset) || offset <= lastPageParam ||
          allPageParams.includes(offset) || last.rows.length === 0 || pages.length >= 1000)
        return undefined;
      return offset;
    },
    staleTime: 30_000,
  });
  const rows = useMemo(() => cards.data?.pages.flatMap(page => page.rows) ?? [], [cards.data]);
  const visible = rows.slice(0, shown);
  const more = shown < rows.length || Boolean(cards.hasNextPage);
  const filtered = search.trim().length > 0 || hasFilters(filters);

  function setQuery(value: string) { setSearch(value); setShown(20); }
  function apply(filtersToApply: CardFilters) { setFilters(filtersToApply); setShown(20); }
  function clear() { apply({ ...clearCardFilters }); setQuery(''); }
  async function showMore() {
    if (cards.isFetchingNextPage) return;
    if (shown + 20 > rows.length && cards.hasNextPage) {
      const result = await cards.fetchNextPage();
      if (result.isError) return; // Preserve the position for a retry.
    }
    setShown(value => value + 20);
  }
  async function createCard(value: EditorValue) {
    try {
      const created = await create.mutateAsync({
        front: value.front, back: value.back, type: value.type, kind: value.kind,
        projectSlug: value.projectSlug, checkpointCode: value.checkpointCode,
      });
      setCreating(false);
      notify('Card created');
      navigate('/cards/' + created.noteNo);
    } catch {
      notify('Could not create the card.', { tone: 'danger' });
    }
  }

  return <section aria-labelledby="v6-cards-title" className="flex flex-col gap-4 pb-8">
    <h2 id="v6-cards-title" className="sr-only">Cards</h2>
    <label className="relative flex flex-col text-label text-ink-2"><span className="sr-only">Search cards</span>
      <Search size={22} aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-ink-2" />
      <input type="search" aria-label="Search cards" className="min-h-12 min-w-0 w-full rounded-[8px] border border-[var(--control-edge)] bg-[var(--paper-2)] py-2 pl-12 pr-3 text-body text-ink"
        placeholder="Search cards" value={search} onChange={event => setQuery(event.target.value)} />
    </label>
    <div className="lemma-filter-summary">
      <button type="button" className={button} onClick={() => setShowFilters(true)}>Filters</button>
      {filters.projectSlug && <button type="button" className={button} onClick={() => apply({ ...filters, projectSlug: '', checkpointCode: '' })}>
        Project: {projects.data?.find(project => project.slug === filters.projectSlug)?.title ?? filters.projectSlug} ×
      </button>}
      {filters.checkpointCode && <button type="button" className={button} onClick={() => apply({ ...filters, checkpointCode: '' })}>Checkpoint: {filters.checkpointCode} ×</button>}
      {filters.state && <button type="button" className={button} onClick={() => apply({ ...filters, state: '' })}>Scheduling: {['New', 'Learning', 'Review', 'Relearning'][Number(filters.state)]} ×</button>}
      {filters.noteStatus && <button type="button" className={button} onClick={() => apply({ ...filters, noteStatus: '' })}>Status: {filters.noteStatus} ×</button>}
      {filters.hasOpenComments && <button type="button" className={button} onClick={() => apply({ ...filters, hasOpenComments: false })}>Has open comments ×</button>}
      {filtered && <button type="button" className={button} onClick={clear}>Clear all</button>}
    </div>
    {showFilters && <CardFiltersSheet values={filters} projects={projects.data ?? []}
      projectsLoading={projects.isPending} projectsError={projects.isError}
      onApply={apply} onDismiss={() => setShowFilters(false)}/>}
    {cards.isPending ? <p role="status" className="text-label text-ink-2">Loading cards…</p> :
      cards.isError ? <div role="alert" className="text-label text-ink-2">
        Could not load cards. <button type="button" className={button} onClick={() => void cards.refetch()}>Try again</button>
      </div> : <>
        <p aria-live="polite" className="text-label text-ink-2">
          {visible.length.toLocaleString()} shown{more ? ' · more available' : ''}
        </p>
        {rows.length === 0 ? <div className="rounded-ctl border border-edge bg-fill-1 p-6 text-center">
          <h2 className="text-body font-semibold text-ink">{filtered ? 'No cards match these filters' : 'No cards yet'}</h2>
          {filtered && <button type="button" className={button} onClick={clear}>Clear filters</button>}
        </div> : <div role="list" aria-label="Card results" className="lemma-card-list">
          {visible.map(row => <div role="listitem" key={row.noteNo}><CardItem row={row}/></div>)}
        </div>}
        {cards.isFetchNextPageError && <p role="alert" className="text-label text-ink-2">
          Could not load more cards. The shown cards are unchanged; try again.
        </p>}
        {more && <button type="button" className={button + ' self-center'} disabled={cards.isFetchingNextPage}
          onClick={() => { void showMore(); }}>{cards.isFetchingNextPage ? 'Loading more…' :
            cards.isFetchNextPageError ? 'Retry loading cards' : 'Load 20 more'}</button>}
      </>}
    <Sheet open={creating} onClose={() => setCreating(false)} title="New card">
      <Suspense fallback={<Skeleton h={180}/>}>{creating && <Editor creating busy={create.isPending} onSubmit={value => { void createCard(value); }}/>}</Suspense>
    </Sheet>
  </section>;
}
