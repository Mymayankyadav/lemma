import {useEffect, useId, useRef, useState, type PointerEvent} from 'react';
import {ArrowRight, Check, Ellipsis, SlidersHorizontal, Undo2, X} from 'lucide-react';
import type {WritingAidProposal} from './writingAid';
import './writing-aid.css';

const holdCaret = (event: PointerEvent) => event.preventDefault();

export interface WritingAidBarProps {
  words: readonly WritingAidProposal[];
  edit: WritingAidProposal | null;
  ghost: WritingAidProposal | null;
  signature: string;
  mode: string;
  disabled: boolean;
  undoable: boolean;
  onAccept: (proposal: WritingAidProposal) => void;
  onDismiss: () => void;
  onUndo: () => void;
  onSettings: () => void;
}

export function WritingAidWords({words, disabled, onAccept}: Pick<WritingAidBarProps, 'words' | 'disabled' | 'onAccept'>) {
  const pressed = useRef<WritingAidProposal | null>(null);
  // Keep the best candidate in the centre. Targets never follow a moving finger.
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

function ProposalText({proposal}: {proposal: WritingAidProposal}) {
  return proposal.kind === 'replace' || proposal.kind === 'correction'
    ? <><del>{proposal.before}</del><ArrowRight aria-hidden="true"/><strong>{proposal.label}</strong></>
    : <><span>{proposal.label}</span><ArrowRight aria-hidden="true"/></>;
}

export function WritingAidBar(props: WritingAidBarProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const pressed = useRef<WritingAidProposal | null>(null);
  const optionsId = useId();
  const {edit, ghost, words, disabled, undoable, mode} = props;
  const preview = edit ?? ghost;
  const proposals = [...(edit ? [edit] : []), ...words, ...(ghost ? [ghost] : [])]
    .filter((item, index, all) => all.findIndex(other => other.start === item.start && other.end === item.end && other.insert === item.insert) === index);
  useEffect(() => {setOpen(false);}, [props.signature, mode, disabled]);
  useEffect(() => {
    if (!open) return;
    function outside(event: globalThis.PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  function dismiss() {setOpen(false); props.onDismiss();}
  return <div ref={root} className="writing-aid-review" data-writing-aid-review=""
    onKeyDown={event => {
      if (event.key === 'Escape' && open) {event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();}
    }}>
    {undoable ? <button type="button" className="writing-aid-preview writing-aid-undo" onPointerDown={holdCaret}
      disabled={disabled} onClick={props.onUndo}><Undo2 aria-hidden="true"/><span>Undo suggestion</span></button>
    : preview ? <button type="button" className={'writing-aid-preview ' + preview.kind}
      onPointerDown={event => {holdCaret(event); pressed.current = preview;}} onPointerCancel={() => {pressed.current = null;}}
      data-writing-aid-edit={edit ? '' : undefined} data-writing-aid-ghost={ghost && !edit ? '' : undefined}
      disabled={disabled} onClick={event => {const chosen = event.detail ? pressed.current : preview; pressed.current = null; if (chosen) props.onAccept(chosen);}}
      aria-label={edit ? 'Replace ' + edit.before + ' with ' + edit.label : 'Accept continuation ' + ghost?.label}>
      <ProposalText proposal={preview}/>{ghost && !edit && <kbd>Tab</kbd>}
    </button>
    : <span className="writing-aid-status"><span aria-hidden="true">Aa</span>{mode === 'off' ? 'Writing aid off' : mode === 'fast' ? 'Earlier suggestions' : mode === 'strict' ? 'Literal only' : 'Writing aid'}</span>}
    <button type="button" className="writing-aid-more" aria-label="More writing suggestions" ref={trigger}
      aria-expanded={open} aria-controls={optionsId} onPointerDown={holdCaret}
      onClick={() => setOpen(value => !value)}><Ellipsis aria-hidden="true"/></button>
    {open && <div className="writing-aid-options" id={optionsId} role="group" aria-label="Writing suggestions">
      <div className="writing-aid-options-title"><strong>Your wording</strong><button type="button" aria-label="Close suggestions"
        onPointerDown={holdCaret} onClick={() => {setOpen(false); trigger.current?.focus();}}><X aria-hidden="true"/></button></div>
      {proposals.length > 0 && <div className="writing-aid-alternatives">{proposals.map((proposal, index) =>
        <button type="button" key={index} onPointerDown={event => {holdCaret(event); pressed.current = proposal;}}
          onPointerCancel={() => {pressed.current = null;}} disabled={disabled}
          onClick={event => {const chosen = event.detail ? pressed.current : proposal; pressed.current = null; setOpen(false); if (chosen) props.onAccept(chosen);}}><ProposalText proposal={proposal}/></button>)}</div>}
      <button type="button" className="writing-aid-keep" disabled={disabled} onPointerDown={holdCaret} onClick={dismiss}>
        <Check aria-hidden="true"/>Keep what I typed</button>
      <button type="button" className="writing-aid-settings-link" onPointerDown={holdCaret}
        onClick={() => {setOpen(false); props.onSettings();}}><SlidersHorizontal aria-hidden="true"/>Writing assistance</button>
    </div>}
  </div>;
}
