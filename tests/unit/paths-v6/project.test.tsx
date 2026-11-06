import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../../../src/features/project/Page';
import { stageNavigationIndex } from '../../../src/features/project/v6/V6Project';
import { useProject } from '../../../src/data/hooks';
import type { CheckpointUi, CheckpointView, ProjectDetail, SessionSummary, Source } from '../../../src/data/types';

const flags = vi.hoisted(() => ({ v6: true }));
vi.mock('../../../src/flags', () => ({ isFlagOn: () => flags.v6 }));
vi.mock('../../../src/data/hooks', () => ({
  useProject: vi.fn(),
  useSettings: () => ({ data: { preferredChat: 'chatgpt' } }),
  usePlanRevisions: () => ({ data: [], isPending: false, error: null }),
  useProjects: () => ({ data: [] }),
  useInsightData: () => ({ data: undefined, isPending: false }),
}));
vi.mock('../../../src/ui/Toast', () => ({ useToast: () => vi.fn() }));
vi.mock('../../../src/ui/Screen', async () => {
  const React = await import('react');
  return { Screen: ({ children, title }: { children: React.ReactNode; title?: string }) =>
    React.createElement('main', { 'data-legacy-screen': true }, title, children) };
});
vi.mock('../../../src/ui/FastTex', async () => {
  const React = await import('react');
  return { FastTex: ({ source }: { source: string }) => React.createElement('span', null, source) };
});

function cp(code: string, stage: string | null, ui: CheckpointUi, position: number): CheckpointView {
  return { id: 'id-' + code, code, stage, title: 'Checkpoint ' + code, position, ui,
    currentStep: ui === 'now' ? 2 : 0, stepsTotal: 3, recheckDue: null, dueCards: 1 };
}
function session(number: number): SessionSummary {
  return {
    id: 'session-' + number, projectSlug: 'path-a', number,
    goal: 'Session goal ' + number, checkpointCode: 'CP02',
    client: 'chatgpt', display: 'ended', goalMet: 'yes',
    startedAt: '2026-11-0' + (number % 7 + 1) + 'T12:00:00Z',
    lastActivityAt: '2026-11-06T12:00:00Z', minutes: 30,
  };
}
function source(number: number): Source {
  return { id: 'source-' + number, projectId: 'path-id', title: 'Source ' + number,
    short: 'S' + number, filename: 'source.pdf', pageCount: 10,
    status: 'ready', hasText: true, outline: [], createdAt: '2026-11-01T12:00:00Z' };
}
const fixture: ProjectDetail = {
  project: { id: 'path-id', slug: 'path-a', title: 'Algebra Path', goal: 'Prove lemmas',
    style: 'socratic', status: 'active', subjectId: 'algebra', createdAt: '2026-01-01T00:00:00Z',
    targetDate: '2026-12-01' },
  subject: { id: 'algebra', name: 'Algebra', glyph: '∑', hue: 'amber', position: 1 },
  checkpoints: [cp('CP01', 'Foundations', 'done', 1), cp('CP02', 'Foundations', 'now', 2),
    cp('CP03', 'Applications', 'next', 3), cp('CP04', 'Applications', 'locked', 4)],
  done: 1, total: 4,
  sessions: [session(6), session(7)],
  sources: [source(1), source(2), source(3)], pendingProposals: 0,
};
let root: Root, host: HTMLDivElement;
let refetch: ReturnType<typeof vi.fn>;
let query: { data?: ProjectDetail; isPending: boolean; isError: boolean; error: Error | null; refetch: ReturnType<typeof vi.fn> };
function setQuery(values: Partial<typeof query> = {}) {
  query = { data: fixture, isPending: false, isError: false, error: null, refetch, ...values };
  vi.mocked(useProject).mockImplementation(() => query as unknown as ReturnType<typeof useProject>);
}
async function mount() {
  await act(async () => root.render(<MemoryRouter initialEntries={['/p/path-a']}><Routes>
    <Route path="/p/:slug" element={<Page/>} />
    <Route path="/projects" element={<p>Paths listing</p>} />
  </Routes></MemoryRouter>));
}
function button(label: string): HTMLButtonElement {
  const node = [...host.querySelectorAll('button')].find(item =>
    item.textContent?.trim() === label || item.getAttribute('aria-label') === label);
  if (!node) throw Error('Missing button ' + label);
  return node;
}
async function click(label: string) { await act(async () => { button(label).click(); }); }
const rows = () => [...host.querySelectorAll('[data-v6-checkpoint]')];
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  flags.v6 = true; host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  refetch = vi.fn(async () => undefined);
  setQuery();
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.clearAllMocks();
});

describe('N33.2 v6 project detail', () => {
  it('uses the exact owner-project data for progress, subject and evidence counts, not invented totals', async () => {
    await mount();
    expect(host.textContent).toContain('Algebra Path');
    expect(host.textContent).toContain('Algebra');
    expect(host.textContent).toContain('Prove lemmas');
    expect(host.textContent).toContain('1 of 4 checkpoints complete');
    expect(host.textContent).toContain('Forecast unavailable');
    expect(host.textContent).toContain('Target date: 2026-12-01');
    const evidence = host.querySelector('[aria-label="Project evidence"]')!;
    expect([...evidence.querySelectorAll('strong')].map(x => x.textContent)).toEqual(['2', '3']);
    expect(useProject).toHaveBeenCalledWith('path-a');
  });

  it('selects the current checkpoint stage and links only its real checkpoints with statuses', async () => {
    await mount();
    expect(host.querySelector('[aria-label="Stage 1: Foundations"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(rows()).toHaveLength(2);
    expect(host.querySelector('a[href="/p/path-a/cp/CP02"]')?.getAttribute('aria-label'))
      .toContain('In progress');
    await click('Stage 2: Applications');
    expect(rows()).toHaveLength(2);
    expect(host.querySelector('a[href="/p/path-a/cp/CP03"]')?.getAttribute('aria-label'))
      .toContain('Up next');
    expect(host.querySelector('a[href="/p/path-a/cp/CP04"]')?.getAttribute('aria-label'))
      .toContain('Locked');
    expect(host.querySelector('a[href="/p/path-a/cp/CP01"]')).toBeNull();
  });

  it('supports arrow, Home and End keyboard navigation with focus and visible stage changes', async () => {
    expect(stageNavigationIndex(0, 'ArrowLeft', 2)).toBe(1);
    expect(stageNavigationIndex(1, 'ArrowRight', 2)).toBe(0);
    expect(stageNavigationIndex(0, 'Home', 2)).toBe(0);
    expect(stageNavigationIndex(0, 'End', 2)).toBe(1);
    expect(stageNavigationIndex(0, 'Escape', 2)).toBeNull();
    expect(stageNavigationIndex(0, 'ArrowRight', 0)).toBeNull();
    await mount();
    const first = button('Stage 1: Foundations');
    first.focus();
    await act(async () => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })));
    const second = button('Stage 2: Applications');
    expect(document.activeElement).toBe(second);
    expect(second.getAttribute('aria-pressed')).toBe('true');
    expect(rows()[0].getAttribute('data-v6-checkpoint')).toBe('CP03');
  });

  it('shows real project sessions and sources with navigation and bounded reveal', async () => {
    await mount();
    await click('Show sessions (2)');
    expect(host.textContent).toContain('Session goal 6');
    expect(host.querySelector('a[href="/s/path-a/6"]')).not.toBeNull();
    await click('Show sources (3)');
    expect(host.textContent).toContain('Source 1');
    expect(host.textContent).toContain('Source 3');
    expect(host.textContent).not.toContain('Source 4');
  });

  it('bounds large project-scoped session and source lists to 20 rows per action', async () => {
    setQuery({ data: { ...fixture, sessions: Array.from({ length: 45 }, (_, i) => session(i + 1)),
      sources: Array.from({ length: 41 }, (_, i) => source(i + 1)) } });
    await mount();
    await click('Show sessions (45)');
    expect(host.querySelectorAll('[aria-label="Project evidence"] a[href^="/s/"]')).toHaveLength(20);
    await click('Show 20 more sessions');
    expect(host.querySelectorAll('[aria-label="Project evidence"] a[href^="/s/"]')).toHaveLength(40);
    await click('Show sources (41)');
    expect(host.querySelectorAll('#v6-project-source-list p')).toHaveLength(20);
    await click('Show 20 more sources');
    expect(host.querySelectorAll('#v6-project-source-list p')).toHaveLength(40);
  });

  it('labels synthetic stage groups as grouped checkpoints rather than tutor-defined stages', async () => {
    setQuery({ data: { ...fixture, checkpoints: [
      cp('CP01', null, 'next', 1), cp('CP02', null, 'locked', 2) ] } });
    await mount();
    expect(host.textContent).toContain('Grouped checkpoints');
    expect(rows()).toHaveLength(2);
  });

  it('renders real empty states for projects without checkpoints, sessions and sources', async () => {
    setQuery({ data: { ...fixture, checkpoints: [], sessions: [], sources: [], done: 0, total: 0 } });
    await mount();
    expect(host.textContent).toContain('No checkpoints yet');
    expect(host.textContent).toContain('0 of 0 checkpoints complete');
    expect(host.querySelector('[aria-label="Project stages"]')).toBeNull();
    await click('Show sessions (0)');
    expect(host.textContent).toContain('No tutor sessions yet');
    await click('Show sources (0)');
    expect(host.textContent).toContain('No sources yet');
  });

  it('distinguishes pending and failed reads, with an explicit retry, never a false zero', async () => {
    setQuery({ data: undefined, isPending: true });
    await mount();
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Loading project');
    expect(host.textContent).not.toContain('0 checkpoints');
    setQuery({ data: undefined, isPending: false, isError: true, error: new Error('offline') });
    await mount();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('could not be loaded');
    await click('Try again');
    expect(refetch).toHaveBeenCalledOnce();
  });

  it('keeps the complete legacy page on the route when the v6 flag is off', async () => {
    flags.v6 = false;
    setQuery({ data: undefined, isPending: true });
    await mount();
    expect(host.querySelector('[data-legacy-screen]')).not.toBeNull();
    expect(host.querySelector('#v6-project-title')).toBeNull();
    expect(host.textContent).toContain('Project');
  });
});
