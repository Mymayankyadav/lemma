import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StudyDefaults from '../../../src/features/settings/v6/StudyDefaults';
import type { Settings } from '../../../src/data/types';
import { useReviewLog, useStyles, useUpdateSettings } from '../../../src/data/hooks';
import { useToast } from '../../../src/ui/Toast';
import type { OptimizerMessage } from '../../../src/lib/optimizer.worker';

vi.mock('../../../src/data/hooks', () => ({
  useReviewLog: vi.fn(), useStyles: vi.fn(), useUpdateSettings: vi.fn(),
}));
vi.mock('../../../src/ui/Toast', () => ({ useToast: vi.fn() }));
vi.mock('../../../src/ui/Sheet', async () => {
  const React = await import('react');
  return { Sheet: ({ open, title, children }: { open: boolean; title: string; children: React.ReactNode }) =>
    open ? React.createElement('section', { role: 'dialog', 'aria-label': title }, children) : null };
});

const settings: Settings = {
  desiredRetention: 0.9, newPerDay: 20, reviewsPerDay: 100,
  learnSteps: '1m 10m', relearnSteps: '10m', rolloverHour: 4,
  maxIntervalDays: 36500, fuzz: true, loadBalance: true, learnAheadMinutes: 20,
  fsrsWeights: null, fsrsTunedAt: null, macros: '\\newcommand{\\R}{\\mathbb{R}}',
  defaultStyle: 'socratic', tutorRules: 'Ask for a proof', mixDecks: false,
  preferredChat: 'chatgpt', connectorUrl: 'https://example.test/mcp/secret',
  connectorLastSeenAt: null, connectorLastClient: null, timeZone: 'UTC',
};
const styles = [
  { key: 'socratic', name: 'Socratic', icon: 'circle-help', instructions: '', position: 0 },
  { key: 'examples', name: 'Worked examples', icon: 'list', instructions: '', position: 1 },
];
let root: Root, host: HTMLDivElement;
let notify: ReturnType<typeof vi.fn>, update: ReturnType<typeof vi.fn>;
let refetchStyles: ReturnType<typeof vi.fn>, refetchReviews: ReturnType<typeof vi.fn>;

function setStyles(override: Record<string, unknown> = {}) {
  vi.mocked(useStyles).mockReturnValue({
    data: styles, isPending: false, isError: false, refetch: refetchStyles, ...override,
  } as unknown as ReturnType<typeof useStyles>);
}
function setReviews(override: Record<string, unknown> = {}) {
  vi.mocked(useReviewLog).mockReturnValue({
    data: [], isPending: false, isError: false, refetch: refetchReviews, ...override,
  } as unknown as ReturnType<typeof useReviewLog>);
}
async function render(data: Settings = settings) {
  await act(async () => root.render(<StudyDefaults settings={data} />));
}
function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(node =>
    node.textContent?.trim() === label || node.getAttribute('aria-label') === label);
  if (!found) throw Error('Missing button ' + label);
  return found;
}
async function click(label: string) {
  await act(async () => { button(label).click(); await Promise.resolve(); });
}
async function change(aria: string, value: string) {
  const node = host.querySelector('[aria-label="' + aria + '"]') as HTMLInputElement | HTMLTextAreaElement | null;
  expect(node, 'Missing field ' + aria).not.toBeNull();
  await act(async () => {
    const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(node, value);
    node!.dispatchEvent(new Event('input', { bubbles: true }));
    node!.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  notify = vi.fn(); update = vi.fn(async () => settings);
  refetchStyles = vi.fn(); refetchReviews = vi.fn();
  vi.mocked(useToast).mockReturnValue(notify);
  vi.mocked(useUpdateSettings).mockReturnValue({
    mutateAsync: update, isPending: false,
  } as unknown as ReturnType<typeof useUpdateSettings>);
  setStyles(); setReviews();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.unstubAllGlobals(); vi.clearAllMocks();
});

describe('N28.2.1 v6 Study defaults', () => {
  it('shows real teaching styles, saves selection with the existing update hook and reports failure', async () => {
    await render();
    expect(host.textContent).toContain('Study defaults');
    expect(host.querySelector('[role="radiogroup"][aria-label="Teaching style"]')).not.toBeNull();
    expect(host.querySelector('[role="radio"][aria-checked="true"]')?.textContent).toContain('Socratic');
    await click('Worked examples');
    expect(update).toHaveBeenCalledWith({ defaultStyle: 'examples' });
    expect(notify).toHaveBeenCalledWith('Saved', { tone: 'success' });
    update.mockRejectedValueOnce(new Error('offline'));
    await click('Worked examples');
    expect(notify).toHaveBeenCalledWith("Couldn't save settings.", { tone: 'danger' });
  });

  it('edits and resets tutor rules through the existing patch, retaining dialog on errors', async () => {
    await render();
    await click('Tutor rules');
    expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Tutor rules');
    expect((host.querySelector('[aria-label="Tutor rules text"]') as HTMLTextAreaElement).value).toBe('Ask for a proof');
    await change('Tutor rules text', '  Explain each lemma  ');
    update.mockRejectedValueOnce(new Error('offline'));
    await click('Save rules');
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(notify).toHaveBeenCalledWith("Couldn't save settings.", { tone: 'danger' });
    await click('Save rules');
    expect(update).toHaveBeenLastCalledWith({ tutorRules: 'Explain each lemma' });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    await click('Tutor rules');
    await click('Reset to default');
    await click('Save rules');
    expect(update).toHaveBeenLastCalledWith({ tutorRules: null });
  });

  it('saves keyboard and pointer recall adjustments and bounds new cards/day', async () => {
    await render();
    const range = host.querySelector('[aria-label="Target recall"]') as HTMLInputElement;
    expect(range.value).toBe('90');
    await change('Target recall', '93');
    await act(async () => { range.dispatchEvent(new Event('pointerup', { bubbles: true })); await Promise.resolve(); });
    expect(update).toHaveBeenCalledWith({ desiredRetention: 0.93 });
    await change('Target recall', '95');
    await act(async () => { range.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'ArrowRight' })); await Promise.resolve(); });
    expect(update).toHaveBeenCalledWith({ desiredRetention: 0.95 });
    await click('More new cards');
    expect(update).toHaveBeenCalledWith({ newPerDay: 25 });
    await click('Fewer new cards');
    expect(update).toHaveBeenCalledWith({ newPerDay: 15 });
    await render({ ...settings, newPerDay: 0 });
    expect(button('Fewer new cards').disabled).toBe(true);
    await render({ ...settings, newPerDay: 60 });
    expect(button('More new cards').disabled).toBe(true);
  });

  it('uses existing KaTeX macros and saved preview without a new API', async () => {
    await render();
    await click('Edit math shortcuts');
    expect((host.querySelector('[aria-label="Math shortcuts text"]') as HTMLTextAreaElement).value).toContain('newcommand');
    expect(host.querySelector('.lemma-math')).not.toBeNull();
    await change('Math shortcuts text', '\\newcommand{\\N}{\\mathbb{N}}');
    await click('Save shortcuts');
    expect(update).toHaveBeenCalledWith({ macros: '\\newcommand{\\N}{\\mathbb{N}}' });
    expect(notify).toHaveBeenCalledWith('Math shortcuts saved', { tone: 'success' });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });

  it('treats insufficient, missing and unavailable review history honestly', async () => {
    await render();
    expect(button('Tune to my reviews').disabled).toBe(true);
    expect(host.textContent).toContain('Needs 400 reviews (you have 0)');
    setReviews({ isPending: true, data: undefined });
    await render();
    expect(host.textContent).toContain('Loading review history');
    expect(host.textContent).not.toContain('you have 0');
    setReviews({ isPending: false, isError: true, data: undefined });
    await render();
    expect(host.textContent).toContain('Review history unavailable');
    await click('Retry reviews');
    expect(refetchReviews).toHaveBeenCalledOnce();
    expect(button('Tune to my reviews').disabled).toBe(true);
  });

  it('distinguishes loading, unavailable and empty teaching styles and retries errors', async () => {
    setStyles({ isPending: true, data: undefined });
    await render();
    expect(host.textContent).toContain('Loading teaching styles');
    expect(host.querySelectorAll('[role="radio"]')).toHaveLength(0);
    setStyles({ isPending: false, isError: true, data: undefined });
    await render();
    expect(host.textContent).toContain('Teaching styles unavailable');
    await click('Retry styles');
    expect(refetchStyles).toHaveBeenCalledOnce();
    setStyles({ isError: false, data: [] });
    await render();
    expect(host.textContent).toContain('No teaching styles available');
  });

  it('runs the existing optimizer only after 400 reviews; applies weights on confirmation', async () => {
    const workers: FakeWorker[] = [];
    class FakeWorker {
      onmessage: ((event: MessageEvent<OptimizerMessage>) => void) | null = null;
      onerror: ((event: ErrorEvent) => void) | null = null;
      postMessage = vi.fn();
      terminate = vi.fn();
      constructor(_url: URL, _options: WorkerOptions) { workers.push(this); }
    }
    vi.stubGlobal('Worker', FakeWorker);
    setReviews({ data: Array.from({ length: 400 }, () => ({})) });
    await render();
    expect(button('Tune to my reviews').disabled).toBe(false);
    await click('Tune to my reviews');
    expect(workers).toHaveLength(1);
    expect(workers[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'optimize', settings: expect.objectContaining({ rolloverHour: 4, timeZone: 'UTC' }),
      reviews: expect.arrayContaining([{}]),
    }));
    expect(host.textContent).toContain('Analyzing reviews');
    const id = workers[0].postMessage.mock.calls[0][0].id as string;
    await act(async () => {
      workers[0].onmessage?.({ data: { type: 'progress', id, fraction: 0.5 } } as MessageEvent<OptimizerMessage>);
    });
    expect(host.textContent).toContain('50%');
    const output = {
      w: [1.1, 0.9], before: { logLoss: 0.5 }, after: { logLoss: 0.4 }, items: 400, skipped: false,
    };
    await act(async () => {
      workers[0].onmessage?.({ data: { type: 'result', id, result: output } } as MessageEvent<OptimizerMessage>);
    });
    expect(host.textContent).toContain('Log loss');
    expect(update).not.toHaveBeenCalled();
    await click('Apply tuning');
    expect(update).toHaveBeenCalledWith({
      fsrsWeights: [1.1, 0.9], fsrsTunedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(workers[0].terminate).toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith('Memory model updated', { tone: 'success' });
  });

  it('terminates a live optimizer on unmount without applying incomplete results', async () => {
    const stopped = vi.fn();
    vi.stubGlobal('Worker', class {
      onmessage = null;
      onerror = null;
      postMessage = vi.fn();
      terminate = stopped;
    });
    setReviews({ data: Array.from({ length: 400 }, () => ({})) });
    await render();
    await click('Tune to my reviews');
    await act(async () => root.unmount());
    expect(stopped).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    root = createRoot(host);
  });

  it('exposes keyboard-operable native buttons without creating dead actions', async () => {
    await render();
    for (const label of ['Tutor rules', 'More new cards', 'Fewer new cards', 'Edit math shortcuts']) {
      const control = button(label);
      expect(control.tabIndex).toBeGreaterThanOrEqual(0);
      control.focus();
      expect(document.activeElement).toBe(control);
    }
    await click('Tutor rules');
    expect(button('Save rules').type).toBe('button');
    await click('Save rules');
    expect(update).toHaveBeenCalledWith({ tutorRules: 'Ask for a proof' });
  });
});
