import {useRef, type PointerEvent, type Ref} from 'react';
import {ArrowRight, RefreshCw, Undo2, X} from 'lucide-react';
import type {WritingAidProposal} from './writingAid';
import {proposalEdit} from './writingAid/policy';
import type {SymbolOption} from './input/latexShortcuts';
import {SYMBOL_CATALOG} from './input/symbolCatalog';
import type {LatexSuggestion} from './writingAid/latexGrammar';
import './writing-aid.css';

const holdCaret = (event: PointerEvent) => event.preventDefault();
export interface WritingAidBarProps {
  words: readonly WritingAidProposal[];
  edit: WritingAidProposal | null;
  ghost: WritingAidProposal | null;
  disabled: boolean;
  undoable: boolean;
  exhausted?: boolean;
  reviewRef?: Ref<HTMLDivElement>;
  onAccept: (proposal: WritingAidProposal) => void;
  onDismiss: () => void;
  onUndo: () => void;
  onRefresh: (surface: 'edit' | 'ghost', displayed: readonly WritingAidProposal[]) => void;
}

export function WritingAidWords({words, disabled, onAccept, hidden, replayDiagnostics}: Pick<WritingAidBarProps, 'words' | 'disabled' | 'onAccept'> & {hidden?: boolean; replayDiagnostics?: boolean}) {
  const pressed = useRef<WritingAidProposal | null>(null);
  const slots = [words[1], words[0], words[2]];
  // N223: when another kind of suggestion has the slots, the words are not there at all (nor counted as shown).
  if (hidden) return null;
  return <div className="sugg writing-aid-words" role="group" aria-label="Word suggestions">
    {slots.map((proposal, index) => <button type="button" key={index} data-writing-aid-word={index}
      disabled={disabled || !proposal} data-typeahead-insert={proposal?.insert}
      data-typeahead-kind={proposal ? 'word' : undefined} data-typeahead-start={proposal?.start} data-typeahead-end={proposal?.end} aria-label={proposal ? 'Insert ' + proposal.label : 'No suggestion'}
      data-typeahead-caret={replayDiagnostics && proposal ? proposalEdit(proposal).caret : undefined}
      data-typeahead-selection-end={replayDiagnostics && proposal ? proposalEdit(proposal).selectionEnd ?? proposalEdit(proposal).caret : undefined}
      onPointerDown={event => {holdCaret(event); pressed.current = proposal ?? null;}}
      onPointerCancel={() => {pressed.current = null;}}
      onClick={event => {const chosen = event.detail ? pressed.current : proposal; pressed.current = null; if (chosen) onAccept(chosen);}}
      title={proposal?.label} className={index === 1 && proposal ? 'preferred' : ''}
      data-length={!proposal || proposal.label.length < 10 ? undefined : proposal.label.length < 12 ? 'mid' : proposal.label.length < 14 ? 'long' : 'xlong'}>
      {proposal ? <span className="writing-aid-word-label">{proposal.label}</span> : <span aria-hidden="true" className="writing-aid-empty">·</span>}
    </button>)}
  </div>;
}

/** N221: symbols for the LaTeX command or short form being typed, in the word slots (best in the middle, as Gboard). */
export function SymbolWords({options, disabled, onAccept}: {
  options: readonly SymbolOption[]; disabled: boolean; onAccept: (option: SymbolOption) => void;
}) {
  const slots = [options[1], options[0], options[2]];
  return <div className="sugg symbol-words" role="group" aria-label="Symbol suggestions">
    {slots.map((option, index) => <button type="button" key={index} disabled={disabled || !option}
      aria-label={option ? 'Insert ' + option.symbol.glyph + ' (' + option.symbol.name + ')' : 'No symbol'} title={option?.symbol.tex}
      className={index === 1 && option ? 'preferred' : ''} onPointerDown={holdCaret} onClick={() => {if (option) onAccept(option);}}>
      {option ? <span className="symbol-glyph">{option.symbol.glyph}</span> : <span aria-hidden="true" className="writing-aid-empty">·</span>}
    </button>)}
  </div>;
}

const GLYPH_OF = new Map(SYMBOL_CATALOG.map(symbol => [symbol.tex, symbol.glyph]));

/** N235: the next LaTeX tokens inside $…$ (best in the middle). A token with a symbol shows its glyph, else its LaTeX. */
export function LatexWords({options, disabled, onAccept, onPress}: {
  options: readonly LatexSuggestion[]; disabled: boolean; onAccept: (option: LatexSuggestion) => void;
  onPress?: (option: LatexSuggestion) => void;
}) {
  const slots = [options[1], options[0], options[2]];
  return <div className="sugg latex-words" role="group" aria-label="LaTeX suggestions">
    {slots.map((option, index) => {
      const glyph = option && GLYPH_OF.get(option.label);
      return <button type="button" key={index} disabled={disabled || !option}
        aria-label={option ? 'Insert ' + option.label : 'No suggestion'} title={option?.label}
        className={index === 1 && option ? 'preferred' : ''} onPointerDown={event => {
          holdCaret(event);
          if (option) onPress?.(option);
        }} onClick={() => {if (option) onAccept(option);}}>
        {option ? glyph ? <span className="symbol-glyph">{glyph}</span> : <code className="latex-token">{option.label}</code>
          : <span aria-hidden="true" className="writing-aid-empty">·</span>}
      </button>;
    })}
  </div>;
}

function Choice({proposal, disabled, onAccept, onRefresh}: {
  proposal: WritingAidProposal; disabled: boolean; onAccept: WritingAidBarProps['onAccept']; onRefresh: WritingAidBarProps['onRefresh'];
}) {
  const pressed = useRef<WritingAidProposal | null>(null);
  const replacement = proposal.kind === 'replace' || proposal.kind === 'correction';
  return <div className="writing-aid-floating-choice">
    <button type="button" className="writing-aid-preview" disabled={disabled}
      data-typeahead-insert={replacement ? undefined : proposal.insert} data-writing-aid-edit={replacement ? '' : undefined} data-writing-aid-ghost={!replacement ? '' : undefined}
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
  const {edit, ghost, disabled, undoable, exhausted, reviewRef} = props;
  if (!edit && !ghost && !undoable && !exhausted) return null;
  return <div ref={reviewRef} className="writing-aid-floating" data-writing-aid-review="" role="group" aria-label="Writing suggestions" data-undo={undoable || undefined}>
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
