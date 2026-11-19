import {padEdit} from './padEdit';
import {PadDraftError, type PadDraft, type PadDraftRead, type bindPadDraft} from './padDraftStore';

type Binding = NonNullable<ReturnType<typeof bindPadDraft>>;
type Status = 'loading' | 'empty' | 'saved' | 'recovered' | 'unsaved' | 'saving'
  | 'load-failed' | 'save-failed' | 'conflict' | 'scope-changed';
export interface PadDraftState {
  readonly status: Status;
  readonly draft: PadDraft;
  readonly hasPrevious: boolean;
}

function empty(): PadDraft {return {edit: padEdit(''), strokes: []};}

/** Headless state seam. Host must unmount/key the workspace on account or checkpoint changes. */
export function createPadDraftSession(binding: Binding) {
  let state: PadDraftState = {status: 'loading', draft: empty(), hasPrevious: false};
  let started = false, edits = 0, saved: PadDraftRead | undefined;

  function active() {
    if (binding.isCurrent()) return true;
    if (state.status !== 'scope-changed') {
      binding.close();
      saved = undefined;
      state = {status: 'scope-changed', draft: empty(), hasPrevious: false};
    }
    return false;
  }
  function edit(draft: PadDraft) {
    if (!active() || state.status === 'loading') return;
    edits++;
    state = {...state, draft, status: state.status === 'saving' || state.status === 'conflict' ? state.status : saved ? 'unsaved' : 'load-failed'};
  }
  return {
    snapshot: () => {active(); return state;},
    close: () => {binding.close(); active();},
    edit,
    previousDraft: () => active() ? saved?.previous?.draft ?? null : null,
    restorePrevious() {
      if (active() && saved?.previous) edit(saved.previous.draft);
    },
    async load() {
      if (!active() || started) return;
      started = true;
      try {
        const result = await binding.read();
        if (!active()) return;
        saved = result;
        state = {status: result.status, draft: result.current?.draft ?? empty(), hasPrevious: !!result.previous};
      } catch {
        if (active()) state = {...state, status: 'load-failed'};
      }
    },
    async save() {
      if (!active() || state.status === 'saving' || state.status === 'loading') return;
      // Don't replace the previous revision with a duplicate, or overwrite after a failed load.
      if (!saved || state.status === 'saved' || state.status === 'empty') return;
      const atStart = edits, candidate = state.draft;
      state = {...state, status: 'saving'};
      try {
        const result = await binding.save(candidate, saved.current?.id ?? null);
        if (!active()) return;
        saved = result;
        state = {...state, status: edits === atStart ? 'saved' : 'unsaved', hasPrevious: !!result.previous};
      } catch (error) {
        if (active()) state = {...state, status: error instanceof PadDraftError && error.code === 'conflict'
          ? 'conflict' : 'save-failed'};
      }
    },
  };
}
