import {useRef, type PointerEvent} from 'react';
import {ArrowRight, RefreshCw, Undo2, X} from 'lucide-react';
import type {WritingAidProposal} from './writingAid';
import './writing-aid.css';

const holdCaret = (event: PointerEvent) => event.preventDefault();
export interface WritingAidBarProps {
  words: readonly WritingAidProposal[];
  edit: WritingAidProposal | null;
  ghost: WritingAidProposal | null;
  disabled: boolean;
  undoable: boolean;
  exhausted?: boolean;
  swipeProgress?: number;
  onAccept: (proposal: WritingAidProposal) => void;
  onDismiss: () => void;
  onUndo: () => void;
  onRefresh: (surface: 'edit' | 'ghost', displayed: readonly WritingAidProposal[]) => void;
}

export function WritingAidWords({words, disabled, onAccept}: Pick<WritingAidBarProps, 'words' | 'disabled' | 'onAccept'>) {
  const pressed = useRef<WritingAidProposal | null>(null);
  const slots = [words[1], words[0], words[2]];
  return <div className="sugg writing-aid-words" role="group" aria-label="Word suggestions">
    {slots.map((proposal, index) => <button type="button" key={index} data-writing-aid-word={index}
      disabled={disabled || !proposal} aria-label={proposal ? 'Insert ' + proposal.label : 'No suggestion'}
      onPointerDown={event => {holdCaret(event); pressed.current = proposal ?? null;}}
      onPointerCancel={() => {pressed.current = null;}}
      onClick={event => {const chosen = event.detail ? pressed.current : proposal; pressed.current = null; if (chosen) onAccept(chosen);}}
      title={proposal?.label} className={index === 1 && proposal ? 'preferred' : ''}>
      {proposal ? <span className="writing-aid-word-label">{proposal.label}</span> : <span aria-hidden="true" className="writing-aid-empty">·</span>}
    </button>)}
  </div>;
}

function Choice({proposal, disabled, onAccept, onRefresh}: {
  proposal: WritingAidProposal; disabled: boolean; onAccept: WritingAidBarProps['onAccept']; onRefresh: WritingAidBarProps['onRefresh'];
}) {
  const pressed = useRef<WritingAidProposal | null>(null);
  const replacement = proposal.kind === 'replace' || proposal.kind === 'correction';
  return <div className="writing-aid-floating-choice">
    <button type="button" className="writing-aid-preview" disabled={disabled}
      data-writing-aid-edit={replacement ? '' : undefined} data-writing-aid-ghost={!replacement ? '' : undefined}
      aria-label={replacement ? 'Replace ' + proposal.before + ' with ' + proposal.label : 'Accept continuation ' + proposal.label}
      onPointerDown={event => {holdCaret(event); pressed.current = proposal;}}
      onPointerCancel={() => {pressed.current = null;}}
      onClick={event => {const chosen = event.detail ? pressed.current : proposal; pressed.current = null; if (chosen) onAccept(chosen);}}>
      <small>{proposal.kind === 'correction' ? 'Spelling' : replacement ? 'Notation' : <>
        <span className="writing-aid-touch-hint">Swipe right or tap</span><span className="writing-aid-key-hint">Tab or tap</span>
      </>}</small>
      <span className="writing-aid-diff">{replacement && <><del>{proposal.before}</del><ArrowRight aria-hidden="true"/></>}
        <strong>{proposal.label}</strong>{!replacement && <ArrowRight aria-hidden="true"/>}</span>
    </button>
    <button type="button" className="writing-aid-refresh" disabled={disabled}
      aria-label={replacement ? 'Refresh replacement' : 'Refresh continuation'} onPointerDown={holdCaret}
      onClick={() => onRefresh(replacement ? 'edit' : 'ghost', [proposal])}><RefreshCw aria-hidden="true"/></button>
  </div>;
}

/** A small card floats beside the draft instead of allocating another keyboard row. */
export function WritingAidBar(props: WritingAidBarProps) {
  const {edit, ghost, disabled, undoable, exhausted, swipeProgress = 0} = props;
  if (!edit && !ghost && !undoable && !exhausted) return null;
  return <div className="writing-aid-floating" data-writing-aid-review="" role="group" aria-label="Writing suggestions"
    data-swiping={swipeProgress > 0 || undefined} style={{'--writing-swipe': Math.min(1, swipeProgress)} as React.CSSProperties}>
    <div className="writing-aid-floating-body">
      {undoable ? <button type="button" className="writing-aid-undo" onPointerDown={holdCaret} disabled={disabled}
        onClick={props.onUndo}><Undo2 aria-hidden="true"/>Undo suggestion</button>
      : <>
        {edit && <Choice proposal={edit} disabled={disabled} onAccept={props.onAccept} onRefresh={props.onRefresh}/>}
        {ghost && <Choice proposal={ghost} disabled={disabled} onAccept={props.onAccept} onRefresh={props.onRefresh}/>}
        {!edit && !ghost && exhausted && <span className="writing-aid-exhausted" role="status">No other matching suggestion</span>}
      </>}
    </div>
    <button type="button" className="writing-aid-dismiss" aria-label={undoable ? 'Keep accepted suggestion' : 'Dismiss suggestion'}
      onPointerDown={holdCaret} onClick={props.onDismiss}><X aria-hidden="true"/></button>
  </div>;
}
