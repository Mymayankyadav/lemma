import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Page from '../../../src/features/proposals/Page';
import type { Proposal } from '../../../src/data/types';
import {
  V6InboxState, V6BatchRecovery, inboxPhase, focusInboxAfterBatch,
} from '../../../src/features/proposals/v6/States';
import { renderToStaticMarkup } from 'react-dom/server';

const data = vi.hoisted(() => ({
  v6: true,
  rows: [] as unknown[],
  loading: false,
  failed: false,
  fetching: false,
  refetch: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('../../../src/flags', () => ({ isFlagOn: () => data.v6 }));
vi.mock('../../../src/data/hooks', () => ({
  useProposals: () => ({
    data: data.rows, isLoading: data.loading, isError: data.failed,
    isFetching: data.fetching, refetch: data.refetch,
  }),
  useApproveProposal: () => ({ isPending: false, mutateAsync: data.approve }),
  useRejectProposal: () => ({ isPending: false, mutateAsync: data.reject }),
  useProjects: () => ({ data: [] }),
}));
vi.mock('../../../src/ui/Toast', () => ({ useToast: () => data.notify }));
vi.mock('../../../src/ui/Screen', async () => {
  const React = await import('react');
  return { Screen: ({ title, children }: { title: string; children: React.ReactNode }) =>
    React.createElement('main', { 'data-test-screen': true }, React.createElement('h1', null, title), children) };
});
vi.mock('../../../src/ui/MathText', async () => {
  const React = await import('react');
  return { MathText: ({ source }: { source: string }) => React.createElement('span', null, source) };
});
vi.mock('../../../src/ui/Tex', async () => {
  const React = await import('react');
  return { Tex: ({ source }: { source: string }) => React.createElement('span', null, source) };
});
vi.mock('../../../src/ui/Slab', async () => {
  const React = await import('react');
  return { Slab: ({ children }: { children: React.ReactNode }) => React.createElement('section', null, children) };
});
vi.mock('../../../src/ui/Card', async () => {
  const React = await import('react');
  return { Card: ({ children }: { children: React.ReactNode }) => React.createElement('article', null, children) };
});
vi.mock('../../../src/ui/EmptyState', async () => {
  const React = await import('react');
  return { EmptyState: ({ title, body }: { title: string; body: string }) =>
    React.createElement('section', null, React.createElement('h2', null, title), body) };
});
vi.mock('../../../src/ui/Sheet', async () => {
  const React = await import('react');
  return { Sheet: ({ open, children, title }: { open: boolean; children: React.ReactNode; title: string }) =>
    open ? React.createElement('section', { role: 'dialog', 'aria-label': title }, children) : null };
});
vi.mock('../../../src/ui/Glyph', async () => {
  const React = await import('react');
  return { Glyph: ({ subject }: { subject: string }) => React.createElement('span', null, subject) };
});
vi.mock('../../../src/ui/Button', async () => {
  const React = await import('react');
  return { Button: ({ disabled, onClick, children }: {
    disabled?: boolean; onClick?: () => void; children: React.ReactNode;
  }) => React.createElement('button', { type: 'button', disabled, onClick }, children) };
});
vi.mock('motion/react', async () => {
  const React = await import('react');
  const animated = (tag: 'div' | 'span') => React.forwardRef<HTMLElement, Record<string, unknown>>(
    (props, ref) => {
      const { children, initial, animate, transition, drag, dragConstraints, dragElastic,
        onDragEnd, layoutId, style, ...rest } = props;
      void initial; void animate; void transition; void drag; void dragConstraints;
      void dragElastic; void onDragEnd; void layoutId; void style;
      return React.createElement(tag, { ...rest, ref }, children as React.ReactNode);
    },
  );
  return {
    motion: { div: animated('div'), span: animated('span') },
    useMotionValue: () => 0, useTransform: () => 0, useReducedMotion: () => true,
  };
});

const card = (id: string): Proposal => ({
  id, kind: 'card', projectSlug: 'proofs', projectGlyph: '∑', sessionNumber: 2,
  origin: 'chatgpt', reason: 'From the tutor', createdAt: '2026-11-06T10:00:00Z',
  card: { front: 'Front ' + id, back: 'Back ' + id, type: 'basic',
    kind: 'proof', checkpoint: 'C1' },
  cardEdit: null, plan: null, planChange: null,
} as unknown as Proposal);
const plan = (id: string): Proposal => ({
  id, kind: 'plan', projectSlug: 'proofs', projectGlyph: '∑', sessionNumber: 3,
  origin: 'chatgpt', reason: null, createdAt: '2026-11-06T10:00:00Z',
  card: null, cardEdit: null,
  plan: { checkpoints: [{ code: 'C2', title: 'Plan lemma', steps: [] }] },
  planChange: null,
} as unknown as Proposal);

let root: Root, host: HTMLDivElement;
async function mount(route = '/proposals') {
  await act(async () => root.render(<MemoryRouter initialEntries={[route]}><Page/></MemoryRouter>));
}
function button(name: string): HTMLButtonElement {
  const found = [...document.querySelectorAll('button')].find(node =>
    node.textContent?.trim() === name || node.getAttribute('aria-label') === name);
  if (!found) throw Error('Missing button: ' + name);
  return found;
}
async function click(name: string) { await act(async () => button(name).click()); }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  data.v6 = true; data.rows = []; data.loading = false; data.failed = false; data.fetching = false;
  data.refetch.mockReset().mockImplementation(async () => ({ data: data.rows }));
  data.approve.mockReset().mockResolvedValue({ actionNo: 17 });
  data.reject.mockReset().mockResolvedValue({ actionNo: 19 });
  data.notify.mockReset();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.stubGlobal('ResizeObserver', class {
    observe() {} disconnect() {} unobserve() {}
  });
});
afterEach(async () => {
  vi.useRealTimers();
  await act(async () => root.unmount());
  host.remove(); vi.unstubAllGlobals(); vi.clearAllMocks();
});

describe('N32.2.2 v6 Inbox distinct states and recovery', () => {
  it('classifies immediate loading, failed, real empty and filtered-empty without guessing counts', () => {
    expect(inboxPhase(true, false, 0, 0)).toBe('loading');
    expect(inboxPhase(false, true, 2, 2)).toBe('error');
    expect(inboxPhase(false, false, 0, 0)).toBe('empty');
    expect(inboxPhase(false, false, 4, 0)).toBe('filtered-empty');
    expect(inboxPhase(false, false, 4, 2)).toBe('ready');
    const html = renderToStaticMarkup(<V6InboxState phase="filtered-empty" kind="plan" otherCount={3}
      onRetry={() => {}} onSwitch={() => {}}/>);
    expect(html).toContain('No plan proposals in this tab');
    expect(html).toContain('3 card proposals');
    expect(html).toContain('min-h-11');
  });

  it('never leaves a blank loading Inbox in the v6 lane', async () => {
    data.loading = true;
    await mount();
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Loading Inbox proposals');
    expect(host.querySelector('[aria-label="Select Inbox proposals"]')).toBeNull();
    expect(host.textContent).not.toContain('No proposals yet');
  });

  it('shows a visible fetch failure with a retry action, not an empty Inbox', async () => {
    data.failed = true;
    await mount();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not load Inbox');
    expect(host.textContent).not.toContain('No proposals yet');
    await click('Try again');
    expect(data.refetch).toHaveBeenCalledOnce();
  });

  it('distinguishes a genuinely empty Inbox from an empty Cards tab', async () => {
    await mount();
    expect(host.querySelector('[aria-label="Empty Inbox"]')).not.toBeNull();
    expect(host.textContent).toContain('No proposals yet');
    expect(host.textContent).not.toContain('No card proposals');
    expect(host.querySelector('[aria-label="Select Inbox proposals"]')).toBeNull();
  });

  it('identifies a filtered-empty Cards tab and navigates to the real pending plan', async () => {
    data.rows = [plan('plan-1')];
    await mount();
    expect(host.querySelector('[aria-label="Filtered Inbox"]')?.textContent).toContain('No card proposals');
    expect(host.textContent).not.toContain('No proposals yet');
    await click('View Plan proposals');
    expect(host.textContent).toContain('See the whole plan');
    expect(host.textContent).toContain('Rationale unavailable');
    expect(host.querySelector('[aria-label="Filtered Inbox"]')).toBeNull();
  });

  it('identifies a filtered-empty Plan tab while retaining real card evidence', async () => {
    data.rows = [card('card-1')];
    await mount('/proposals?tab=plan');
    expect(host.textContent).toContain('No plan proposals in this tab');
    await click('View Cards proposals');
    expect(host.textContent).toContain('Front card-1');
    expect(host.textContent).toContain('From the tutor');
    // The v6 decision bar is intentionally portalled outside the page host.
    expect(document.body.querySelector('button[aria-label="Approve card"]')).not.toBeNull();
  });

  it('restores the keyboard cursor to the remaining checkbox after a partial conflict', async () => {
    data.rows = [card('a'), card('b'), card('c')];
    data.approve.mockImplementation(async ({ id }: { id: string }) => {
      if (id === 'b') throw new Error('stale version');
      return { actionNo: 1 };
    });
    data.refetch.mockImplementation(async () => {
      data.rows = [card('b'), card('c')];
      return { data: data.rows };
    });
    await mount();
    await click('Select this page');
    expect(host.querySelectorAll('[data-inbox-proposal-id]:checked')).toHaveLength(3);
    vi.useFakeTimers();
    await click('Approve 3 selected');
    expect(host.textContent).toContain('saving in 6 s');
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(data.approve.mock.calls.map(([input]) => input.id)).toEqual(['a', 'b']);
    expect(data.refetch).toHaveBeenCalled();
    expect(host.querySelector('[aria-label="Batch decision recovery"]')?.textContent)
      .toContain('1 approved; 2 not saved');
    expect(host.querySelectorAll('[data-inbox-proposal-id]:checked')).toHaveLength(2);
    expect(document.activeElement?.getAttribute('data-inbox-proposal-id')).toBe('b');
    await click('Refresh proposals');
    expect(data.refetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the full six-second Undo for selected rejection and returns focus without writes', async () => {
    data.rows = [card('a')];
    await mount();
    await click('Select this page');
    vi.useFakeTimers();
    await click('Reject 1 selected');
    expect(host.textContent).toContain('saving in 6 s');
    await click('Undo');
    expect(data.notify).toHaveBeenCalledWith('Batch rejection cancelled');
    expect(document.activeElement?.getAttribute('data-inbox-proposal-id')).toBe('a');
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
    expect(data.reject).not.toHaveBeenCalled();
    expect(data.approve).not.toHaveBeenCalled();
  });

  it('provides a keyboard focus fallback to a visible action or the current tab', () => {
    const example = document.createElement('div');
    example.innerHTML = '<div role="group" aria-label="Proposal types"><button aria-pressed="true">Cards</button></div>'
      + '<section aria-label="Select Inbox proposals"><input type="checkbox" data-inbox-proposal-id="b" />'
      + '<button data-inbox-action="approve">Approve selected</button></section>';
    document.body.append(example);
    expect(focusInboxAfterBatch(example, 'b')).toBe(true);
    expect(document.activeElement?.getAttribute('data-inbox-proposal-id')).toBe('b');
    example.querySelector('input')!.remove();
    expect(focusInboxAfterBatch(example, 'gone')).toBe(true);
    expect(document.activeElement?.getAttribute('data-inbox-action')).toBe('approve');
    example.querySelector('section')!.remove();
    expect(focusInboxAfterBatch(example, null)).toBe(true);
    expect(document.activeElement?.textContent).toBe('Cards');
    example.remove();
  });

  it('renders real recovery outcomes without suggesting a batch transaction', () => {
    const html = renderToStaticMarkup(<V6BatchRecovery outcome={{
      action: 'reject', committed: 2, remaining: 3, failed: true,
    }} onRetry={() => {}}/>);
    expect(html).toContain('2 rejected; 3 not saved');
    expect(html).toContain('No successful decision will be retried');
    expect(html).toContain('Refresh proposals');
  });

  it('preserves the original flag-off Inbox rendering and does not mount new states', async () => {
    data.v6 = false;
    await mount();
    expect(host.textContent).toContain('All clear');
    expect(host.textContent).not.toContain('No proposals yet');
    expect(host.querySelector('[aria-label="Select Inbox proposals"]')).toBeNull();
    expect(host.querySelector('[aria-label="Batch decision recovery"]')).toBeNull();
  });
});
