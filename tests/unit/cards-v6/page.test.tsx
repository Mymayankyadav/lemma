import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../../../src/features/cards/Page';
import type { CardRow, CardSearchFilters, CardSearchPage } from '../../../src/data/types';

const flags = vi.hoisted(() => ({ v6: true }));
const mocks = vi.hoisted(() => ({
  api: null as unknown as { searchCardsPage: ReturnType<typeof vi.fn> },
  projects: [{
    id: 'p1', slug: 'project-1', title: 'Analysis',
    subject: { id: 's1', name: 'Mathematics', glyph: '∑', hue: 'slate', position: 0 },
    status: 'active',
  }] as any[],
  projectFailure: false, projectLoading: false,
}));
vi.mock('../../../src/flags', () => ({ isFlagOn: () => flags.v6 }));
vi.mock('../../../src/data', () => ({ getApi: () => mocks.api }));
vi.mock('../../../src/data/hooks', () => ({
  useProjects: () => ({ data: mocks.projects, isError: mocks.projectFailure, isPending: mocks.projectLoading }),
  useCreateNote: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock('../../../src/ui/Toast', () => ({ useToast: () => vi.fn() }));
vi.mock('../../../src/ui/Sheet', () => ({
  Sheet: ({ open, title }: { open: boolean; title?: string }) => open ? <div role="dialog">{title}</div> : null,
}));

const records: CardRow[] = Array.from({ length: 75 }, (_, i) => ({
  noteNo: i + 1, front: 'Card number ' + (i + 1), type: 'basic', kind: 'theorem',
  projectSlug: i < 40 ? 'project-1' : 'project-2', glyph: '∑',
  checkpointCode: 'C1', due: null, status: i < 40 ? 'active' : 'suspended',
  openComments: i % 5 ? 0 : 1,
}));
let root: Root, host: HTMLDivElement, client: QueryClient;
let search: ReturnType<typeof vi.fn>;

function api(rows = records) {
  search = vi.fn(async (filter: CardSearchFilters): Promise<CardSearchPage> => {
    const subset = rows.filter(row =>
      (!filter.query || row.front.toLowerCase().includes(filter.query.toLowerCase())) &&
      (!filter.projectSlug || row.projectSlug === filter.projectSlug) &&
      (!filter.checkpointCode || row.checkpointCode === filter.checkpointCode) &&
      (!filter.noteStatus || row.status === filter.noteStatus) &&
      (!filter.hasOpenComments || row.openComments > 0));
    const offset = filter.offset ?? 0;
    const end = Math.min(subset.length, offset + 50);
    return { rows: subset.slice(offset, end), nextOffset: end < subset.length ? end : null };
  });
  mocks.api = { searchCardsPage: search };
}
async function mount() {
  await act(async () => root.render(
    <QueryClientProvider client={client}><MemoryRouter><Page/></MemoryRouter></QueryClientProvider>
  ));
  if (flags.v6) await vi.waitFor(() => expect(host.textContent).not.toContain('Loading cards'));
}
function rows() { return [...host.querySelectorAll('[data-card-row]')]; }
function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label);
  if (!found) throw Error('Missing button ' + label);
  return found;
}
async function click(label: string) { await act(async () => button(label).click()); }
async function change(ariaLabel: string, value: string) {
  const element = host.querySelector('[aria-label="' + ariaLabel + '"]') as HTMLInputElement | HTMLSelectElement | null;
  expect(element, 'Missing field ' + ariaLabel).not.toBeNull();
  await act(async () => {
    const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value);
    element!.dispatchEvent(new Event('input', { bubbles: true }));
    element!.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  flags.v6 = true; mocks.projectFailure = false; mocks.projectLoading = false;
  document.body.style.overflow = ''; document.documentElement.style.overflow = '';
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true, value: function(this: HTMLDialogElement) { this.open = true; },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true, value: function(this: HTMLDialogElement) { this.open = false; },
  });
  api();
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove();
  vi.unstubAllGlobals(); vi.clearAllMocks();
});

describe('N31 v6 Cards', () => {
  it('reveals exactly 20 at first, then 20 per action from bounded 50-row pages', async () => {
    await mount();
    expect(rows()).toHaveLength(20);
    expect(host.textContent).toContain('20 shown');
    expect(host.textContent).not.toContain('75 total');
    expect(search).toHaveBeenCalledTimes(1);
    expect(search.mock.calls[0][0]).toMatchObject({ query: '', offset: 0 });
    await click('Load 20 more');
    expect(rows()).toHaveLength(40);
    expect(search).toHaveBeenCalledTimes(1);
    await click('Load 20 more');
    await vi.waitFor(() => expect(rows()).toHaveLength(60));
    expect(search.mock.calls.at(-1)?.[0].offset).toBe(50);
    await click('Load 20 more');
    expect(rows()).toHaveLength(75);
    expect(host.textContent).toContain('75 shown');
    // #1323: no list button; a new card starts from the header "+" menu (`/cards?new=1`).
    expect([...host.querySelectorAll('button')].some(b => b.textContent?.trim() === 'New card')).toBe(false);
  });

  it('opens the new-card sheet from /cards?new=1 (the header Add menu)', async () => {
    await act(async () => root.render(
      <QueryClientProvider client={client}><MemoryRouter initialEntries={['/cards?new=1']}><Page/></MemoryRouter></QueryClientProvider>
    ));
    await vi.waitFor(() => expect(host.querySelector('[role="dialog"]')?.textContent ?? '').toBe('New card'));
  });

  it('applies existing server filters via native dialog and removes chips without replacing editor', async () => {
    await mount();
    const trigger = button('Filters'); trigger.focus();
    await click('Filters');
    const dialog = host.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.body.style.overflow).toBe('hidden');
    await change('Filter project', 'project-1');
    await change('Filter note status', 'active');
    await click('Apply filters');
    await vi.waitFor(() => expect(search.mock.calls.at(-1)?.[0]).toMatchObject({
      query: '', projectSlug: 'project-1', noteStatus: 'active', offset: 0,
    }));
    expect(host.textContent).toContain('Project: Analysis');
    expect(host.textContent).toContain('Status: active');
    expect(host.querySelector('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);
    await click('Status: active ×');
    await vi.waitFor(() => expect(search.mock.calls.at(-1)?.[0].noteStatus).toBeUndefined());
    await click('Project: Analysis ×');
    await vi.waitFor(() => expect(search.mock.calls.at(-1)?.[0].projectSlug).toBeUndefined());
  });

  it('forwards checkpoint, scheduling state and comment-only filters', async () => {
    await mount();
    await click('Filters');
    await change('Filter checkpoint', 'C1');
    await change('Filter scheduling state', '2');
    const checkbox = host.querySelector('[aria-label="Has open comments"]') as HTMLInputElement;
    await act(async () => { checkbox.click(); });
    await click('Apply filters');
    await vi.waitFor(() => expect(search.mock.calls.at(-1)?.[0]).toMatchObject({
      checkpointCode: 'C1', state: 2, hasOpenComments: true, offset: 0,
    }));
    expect(host.textContent).toContain('Has open comments ×');
  });

  it('distinguishes truly empty and filtered-empty with reset, never fabricates a total', async () => {
    api([]);
    await mount();
    expect(host.textContent).toContain('No cards yet');
    expect(host.textContent).toContain('0 shown');
    await change('Search cards', 'nonexistent');
    await vi.waitFor(() => expect(host.textContent).toContain('No cards match these filters'));
    await click('Clear filters');
    await vi.waitFor(() => expect(host.textContent).toContain('No cards yet'));
  });

  it('shows failed state with a retry rather than zero results', async () => {
    search.mockRejectedValueOnce(new Error('Network offline'));
    await mount();
    await vi.waitFor(() => expect(host.textContent).toContain('Could not load cards'));
    expect(host.textContent).not.toContain('No cards yet');
    await click('Try again');
    await vi.waitFor(() => expect(rows()).toHaveLength(20));
  });

  it('shows loading without inventing a count or rows', async () => {
    search.mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => root.render(
      <QueryClientProvider client={client}><MemoryRouter><Page/></MemoryRouter></QueryClientProvider>
    ));
    expect(host.textContent).toContain('Loading cards');
    expect(rows()).toHaveLength(0);
    expect(host.textContent).not.toContain('0 shown');
  });

  it('Escape restores focus and discards unapplied selections', async () => {
    await mount();
    button('Filters').focus();
    await click('Filters');
    await change('Filter note status', 'suspended');
    const dialog = host.querySelector('dialog')!;
    await act(async () => { dialog.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })); await Promise.resolve(); });
    expect(host.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(button('Filters'));
    expect(search.mock.calls.at(-1)?.[0].noteStatus).toBeUndefined();
    expect(host.textContent).not.toContain('Status: suspended');
  });

  it('flag-off library retains original filters and controls', async () => {
    flags.v6 = false;
    await mount();
    expect(host.querySelector('[aria-label="Card filters"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Filter project"]')).not.toBeNull();
    expect(host.querySelector('#v6-cards-title')).toBeNull();
  });

  it('distinguishes unavailable project list from an empty project list in the dialog', async () => {
    mocks.projectFailure = true;
    await mount();
    await click('Filters');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Projects unavailable');
  });
});
