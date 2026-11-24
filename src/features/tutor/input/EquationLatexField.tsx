import {useLayoutEffect, useRef, useState} from 'react';
import type {TutorAcceptedSpan} from '../../../../supabase/functions/_shared/tutor-answer';
import type {TutorAnswerAid} from '../../../../supabase/functions/_shared/tutor-answer-aids';
import {effectiveAidLevel} from '../../../../supabase/functions/_shared/tutor-answer-aids';
import {LatexWords} from '../WritingAidBar';
import {moveAcceptedSpans} from '../writingAid/authorship';
import {planEquationSuggestion, type equationSurroundings} from '../writingAid/equationAuthorship';
import {tutorHint} from '../writingAid/answerAids';
import {insertionEligible} from '../writingAid/eligibility';
import {latexCommandPrefix, type LatexSuggestion} from '../writingAid/latexGrammar';
import {WRITING_AID_LIMIT} from '../writingAid/policy';
import {useLatexSuggestions} from '../writingAid/useLatexSuggestions';
import {decoderSymbols} from '../writingAid/decoder/ngramSpatial';

type Selection = {start: number; end: number};
type Surroundings = ReturnType<typeof equationSurroundings>;

export function EquationLatexField({value, onChange, acceptedSpans = [], remainingSlots, suggestions, before, surroundings, readSurroundings, notationContext, aid, mastery, subject, step}: {
  value: string;
  onChange: (next: string, acceptedSpans: readonly TutorAcceptedSpan[]) => void;
  acceptedSpans?: readonly TutorAcceptedSpan[];
  remainingSlots: number;
  suggestions: boolean;
  before: string;
  surroundings: Surroundings;
  readSurroundings: () => Surroundings;
  notationContext?: readonly string[];
  aid?: TutorAnswerAid;
  mastery?: number;
  subject?: string;
  step?: string;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const restore = useRef<Selection | undefined>(undefined);
  const [selection, setSelection] = useState<Selection>(() => ({start: value.length, end: value.length}));
  const [composing, setComposing] = useState(false);
  const [undo, setUndo] = useState<{before: string; after: string; selection: Selection; spans: readonly TutorAcceptedSpan[]}>();
  const pressed = useRef<string | undefined>(undefined);
  const pressKey = (option: LatexSuggestion) => JSON.stringify([
    value, selection, surroundings, aid?.turnId, aid?.id, aid?.version, subject, step, option.insert, option.caret,
  ]);
  useLayoutEffect(() => {
    const node = field.current;
    if (node) node.setSelectionRange(node.value.length, node.value.length);
  }, []);
  useLayoutEffect(() => {
    if (!restore.current || !field.current) return;
    field.current.focus();
    field.current.setSelectionRange(restore.current.start, restore.current.end);
    restore.current = undefined;
  }, [value]);

  const math = value.slice(0, selection.start);
  const typed = latexCommandPrefix(math);
  const position = selection.start - typed.length;
  const hint = (insert: string) => tutorHint({aid, mastery, subject, step, mode: 'equation',
    before: before + math.slice(0, position), prefix: typed}, insert);
  const draft = surroundings && surroundings.before + value + surroundings.after;
  const base = surroundings?.before.length ?? 0;
  const plan = (option: LatexSuggestion) => draft !== undefined &&
    draft.length - (selection.end - position) + option.insert.length <= WRITING_AID_LIMIT &&
    insertionEligible({text: draft, start: base + position, end: base + selection.end, insert: option.insert, mode: 'equation', aid,
      authoredPrefix: typed, role: hint(option.insert).role})
    ? planEquationSuggestion(value, position, selection.end, option.insert, acceptedSpans, remainingSlots) : null;
  const {items: options} = useLatexSuggestions(suggestions && draft !== undefined && draft.length <= WRITING_AID_LIMIT &&
    acceptedSpans.length < remainingSlots && !composing && selection.start === selection.end
    ? {math, typed, before, after: value.slice(selection.start), knownSymbols: decoderSymbols(before, notationContext ?? [])}
    : undefined, 3, {
    declarations: aid && effectiveAidLevel(aid.level, mastery) !== 'none' ? aid.ranking?.declaredSymbols : undefined,
    eligible: option => plan(option) !== null,
    adjustment: option => hint(option.insert).adjustment,
  });

  function apply(option: LatexSuggestion) {
    const stamp = pressed.current;
    pressed.current = undefined;
    if (stamp !== undefined && stamp !== pressKey(option)) return;
    const live = readSurroundings();
    if (!surroundings || !live || live.before !== surroundings.before || live.after !== surroundings.after) return;
    const node = field.current;
    if (acceptedSpans.length >= remainingSlots || !node || node.value !== value || node.selectionStart !== selection.start || node.selectionEnd !== selection.end) return;
    const current = options.find(item => item.insert === option.insert && item.caret === option.caret);
    if (!current) return;
    const edit = plan(current);
    if (!edit) return;
    const caret = position + current.caret;
    restore.current = {start: caret, end: caret};
    setSelection(restore.current);
    setUndo({before: value, after: edit.text, selection, spans: acceptedSpans});
    onChange(edit.text, edit.spans);
  }
  function undoSuggestion() {
    if (!undo || value !== undo.after) return;
    restore.current = undo.selection;
    setSelection(undo.selection);
    onChange(undo.before, undo.spans);
    setUndo(undefined);
  }

  return <>
    <label className="tutor-equation-latex">LaTeX
      <textarea ref={field} rows={2} value={value} spellCheck={false} autoCapitalize="off" autoCorrect="off"
        onSelect={event => setSelection({start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd})}
        onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}
        onKeyDown={event => {
          if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && undo?.after === value) {
            event.preventDefault();
            undoSuggestion();
          }
        }}
        onChange={event => {
          const node = event.currentTarget;
          setSelection({start: node.selectionStart, end: node.selectionEnd});
          setUndo(undefined);
          onChange(node.value, moveAcceptedSpans(value, node.value, acceptedSpans, undefined, remainingSlots));
        }}/>
    </label>
    {options.length > 0 && <div className="tutor-equation-sheet-suggestions">
      <LatexWords options={options} disabled={false} onAccept={apply} onPress={option => {pressed.current = pressKey(option);}}/>
    </div>}
    {undo?.after === value && <button type="button" className="tutor-equation-sheet-undo" onClick={undoSuggestion}>Undo LaTeX suggestion</button>}
  </>;
}
