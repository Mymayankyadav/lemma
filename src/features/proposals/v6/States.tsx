import type { ReactNode } from 'react';

export type InboxKind = 'cards' | 'plan';
export type InboxPhase = 'loading' | 'error' | 'empty' | 'filtered-empty' | 'ready';
export type InboxOutcome = {
  action: 'approve' | 'reject';
  committed: number;
  remaining: number;
  failed: boolean;
};

export function inboxPhase(loading: boolean, failed: boolean, total: number, visible: number): InboxPhase {
  if (loading) return 'loading';
  if (failed) return 'error';
  if (total === 0) return 'empty';
  if (visible === 0) return 'filtered-empty';
  return 'ready';
}

const control = 'min-h-11 rounded-ctl border border-edge px-4 py-2 text-label font-semibold text-amber focus-visible:outline-2 focus-visible:outline-amber';

export function V6InboxState({ phase, kind, otherCount, onRetry, onSwitch }: {
  phase: Exclude<InboxPhase, 'ready'>;
  kind: InboxKind;
  otherCount: number;
  onRetry: () => void;
  onSwitch: () => void;
}): ReactNode {
  if (phase === 'loading') return <p role="status" className="min-h-20 p-4 text-label text-ink-2">
    Loading Inbox proposals…
  </p>;
  if (phase === 'error') return <section role="alert" className="flex flex-col items-start gap-3 rounded-slab border border-edge p-4">
    <h2 className="text-body font-semibold text-ink">Could not load Inbox</h2>
    <p className="text-label text-ink-2">Check your connection; nothing has been changed.</p>
    <button type="button" className={control} onClick={onRetry}>Try again</button>
  </section>;
  if (phase === 'empty') return <section aria-label="Empty Inbox" className="rounded-slab border border-edge p-4">
    <h2 className="text-body font-semibold text-ink">No proposals yet</h2>
    <p className="mt-2 text-label text-ink-2">Your tutor's new decisions will appear here.</p>
  </section>;
  const other = kind === 'cards' ? 'Plan' : 'Cards';
  return <section aria-label="Filtered Inbox" className="flex flex-col items-start gap-3 rounded-slab border border-edge p-4">
    <h2 className="text-body font-semibold text-ink">No {kind === 'cards' ? 'card' : 'plan'} proposals in this tab</h2>
    <p className="text-label text-ink-2">{otherCount} {other === 'Cards' ? 'card' : 'plan'} {otherCount === 1 ? 'proposal is' : 'proposals are'} waiting in the other tab.</p>
    <button type="button" className={control} onClick={onSwitch}>View {other} proposals</button>
  </section>;
}

export function V6BatchRecovery({ outcome, onRetry }: { outcome: InboxOutcome; onRetry: () => void }): ReactNode {
  const verb = outcome.action === 'approve' ? 'approved' : 'rejected';
  if (!outcome.failed) return <p role="status" className="rounded-ctl border border-edge p-3 text-label text-ink-2">
    {outcome.committed} {verb}; no proposals left in this batch.
  </p>;
  return <section role="alert" aria-label="Batch decision recovery" className="flex flex-col items-start gap-2 rounded-ctl border border-edge p-3 text-label">
    <p><strong>{outcome.committed} {verb}; {outcome.remaining} not saved.</strong> No successful decision will be retried.</p>
    <p className="text-ink-2">Refresh the Inbox before retrying the remaining selected proposals. Changes elsewhere may have caused a conflict.</p>
    <button type="button" className={control} onClick={onRetry}>Refresh proposals</button>
  </section>;
}

/** Return focus to the first still-pending selection; fall back to visible actions and the current tab. */
export function focusInboxAfterBatch(root: ParentNode, remainingId: string | null): boolean {
  const selection = root.querySelector<HTMLElement>('[aria-label="Select Inbox proposals"]');
  const checkboxes = Array.from(selection?.querySelectorAll<HTMLInputElement>('input[data-inbox-proposal-id]') ?? []);
  const preferred = remainingId === null ? null :
    checkboxes.find(input => input.dataset.inboxProposalId === remainingId && !input.disabled);
  const fallback = checkboxes.find(input => !input.disabled) ??
    selection?.querySelector<HTMLButtonElement>('button[data-inbox-action]:not([disabled])') ??
    root.querySelector<HTMLButtonElement>('[role="group"][aria-label="Proposal types"] button[aria-pressed="true"]');
  const next = preferred ?? fallback;
  if (!next) return false;
  next.focus();
  return true;
}
