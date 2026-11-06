import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../../../src/features/projects/Page';
import type { ProjectSummary, Subject } from '../../../src/data/types';

const flags = vi.hoisted(() => ({ v6: true }));
const mocks = vi.hoisted(() => ({
  data: [] as any[], subjects: [] as any[],
  pending: false, failed: false, subjectPending: false, subjectFailed: false,
  update: vi.fn(async (_: unknown) => {}), refetch: vi.fn(), toast: vi.fn(),
}));
vi.mock('../../../src/flags', () => ({ isFlagOn: () => flags.v6 }));
vi.mock('../../../src/data/hooks', () => ({
  useProjects: () => ({ data: mocks.data, isPending: mocks.pending, isError: mocks.failed, error: mocks.failed ? new Error('offline') : null, refetch: mocks.refetch }),
  useSubjects: () => ({ data: mocks.subjects, isPending: mocks.subjectPending, isError: mocks.subjectFailed }),
  useUpdateProject: () => ({ mutateAsync: mocks.update, isPending: false }),
}));
vi.mock('../../../src/ui/Toast', () => ({ useToast: () => mocks.toast }));
const subjects: Subject[] = [
  { id: 'subject-a', name: 'Analysis', glyph: '∫', hue: 'amber', position: 0 },
  { id: 'subject-b', name: 'Geometry', glyph: '△', hue: 'cyan', position: 1 },
];
const project = (id: string, subject = subjects[0], status: ProjectSummary['status'] = 'active',
  pinned = false): ProjectSummary => ({
  id, slug: id, title: 'Path ' + id, subject, status, pinned,
  done: 2, total: 5, current: { code: 'C2', title: 'Limits', step: 1, stepsTotal: 3 },
  lastActivityAt: '2026-11-05T09:00:00Z', cardsCount: 8, sessionsCount: 2,
  sourcesCount: 3, sourceTitles: ['Proof notes'],
});
let host: HTMLDivElement, root: Root, client: QueryClient;
async function mount() {
  await act(async () => root.render(<QueryClientProvider client={client}><MemoryRouter>
    <Page/>
  </MemoryRouter></QueryClientProvider>));
}
function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(node =>
    node.textContent?.trim() === label || node.getAttribute('aria-label') === label);
  if (!found) throw Error('Missing button ' + label);
  return found;
}
async function click(label: string) { await act(async () => button(label).click()); }
async function search(value: string) {
  const node = host.querySelector('[aria-label="Search paths"]') as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, value);
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const projectRows = () => [...host.querySelectorAll('[data-v6-project]')];
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  flags.v6 = true; mocks.data = [project('analysis', subjects[0], 'active', true),
    project('geometry', subjects[1]), project('archive', subjects[1], 'archived'),
    project('paused', subjects[0], 'paused')];
  mocks.subjects = subjects; mocks.pending = false; mocks.failed = false;
  mocks.subjectPending = false; mocks.subjectFailed = false;
  mocks.update.mockReset().mockResolvedValue(undefined);
  mocks.refetch.mockReset(); mocks.toast.mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} unobserve() {} });
});
afterEach(async () => {
  await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals();
});

describe('N33.1 v6 Paths list', () => {
  it('groups real active paths under their subjects, shows pinned and counts without invented forecast', async () => {
    await mount();
    expect(projectRows()).toHaveLength(2);
    expect(host.querySelector('[aria-label="Analysis paths"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Geometry paths"]')).not.toBeNull();
    expect(host.textContent).toContain('Pinned');
    expect(host.textContent).toContain('2 of 5 checkpoints');
    expect(host.textContent).toContain('Forecast unavailable');
    expect(host.querySelector('a[href="/p/analysis"]')).not.toBeNull();
    expect(host.querySelector('a[href="/projects/new"]')).not.toBeNull();
    expect(host.querySelectorAll('a[href="/projects/new"]')).toHaveLength(1);
  });
  it('searches real title, subject and source title, and distinguishes filtered-empty', async () => {
    await mount();
    await search('geometry');
    expect(projectRows()).toHaveLength(1);
    expect(host.textContent).toContain('1 paths shown');
    await search('no matching path');
    expect(projectRows()).toHaveLength(0);
    expect(host.textContent).toContain('No paths match your search');
    await click('Clear search');
    expect(projectRows()).toHaveLength(2);
  });
  it('navigates statuses including archived and paused without fabricating missing projects', async () => {
    await mount();
    await click('archived');
    expect(projectRows()).toHaveLength(1);
    expect(host.textContent).toContain('Path archive');
    await click('paused');
    expect(projectRows()).toHaveLength(1);
    expect(host.textContent).toContain('Path paused');
    await click('done');
    expect(projectRows()).toHaveLength(0);
    expect(host.textContent).toContain('No paths in this status');
  });
  it('uses existing update mutation to pin/unpin, archive or restore and exposes keyboard targets', async () => {
    await mount();
    button('Manage Path analysis').focus();
    await click('Manage Path analysis');
    expect(button('Unpin').disabled).toBe(false);
    await click('Unpin');
    expect(mocks.update).toHaveBeenCalledWith({ id: 'analysis', patch: { pinned: false } });
    await click('Manage Path analysis');
    await click('Archive');
    expect(mocks.update).toHaveBeenCalledWith({ id: 'analysis', patch: { status: 'archived' } });
    await click('archived');
    await click('Manage Path archive');
    await click('Restore');
    expect(mocks.update).toHaveBeenCalledWith({ id: 'archive', patch: { status: 'active' } });
  });
  it('limits pinned paths to four using existing data, without calling update', async () => {
    mocks.data = Array.from({ length: 5 }, (_, i) => project('p' + i, subjects[0], 'active', i < 4));
    await mount();
    await click('Manage Path p4');
    await click('Pin');
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('four'), { tone: 'danger' });
  });
  it('reveals only 20 projects first and another 20 on demand', async () => {
    mocks.data = Array.from({ length: 33 }, (_, i) => project('p' + i));
    await mount();
    expect(projectRows()).toHaveLength(20);
    expect(host.textContent).toContain('20 paths shown');
    await click('Show 20 more');
    expect(projectRows()).toHaveLength(33);
    expect(host.textContent).toContain('33 paths shown');
  });
  it('distinguishes loading, empty and failed data with accessible retry', async () => {
    mocks.pending = true;
    await mount();
    expect(host.textContent).toContain('Loading paths');
    expect(host.textContent).not.toContain('0 paths shown');
    mocks.pending = false; mocks.data = [];
    await mount();
    expect(host.textContent).toContain('No paths yet');
    mocks.failed = true;
    await mount();
    expect(host.textContent).toContain('Could not load Paths');
    await click('Try again');
    expect(mocks.refetch).toHaveBeenCalledOnce();
  });
  it('labels subject lookup failure without dropping existing project labels', async () => {
    mocks.subjectFailed = true;
    await mount();
    expect(host.textContent).toContain('Subjects unavailable');
    expect(host.textContent).toContain('Analysis');
    expect(projectRows()).toHaveLength(2);
  });
  it('flag off preserves the original Paths page rather than mounting N33.1', async () => {
    flags.v6 = false; mocks.data = [];
    await mount();
    expect(host.querySelector('#v6-paths-title')).toBeNull();
    expect(host.textContent).toContain('Every proof starts somewhere');
  });
});
