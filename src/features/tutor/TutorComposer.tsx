import {useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type PointerEvent} from 'react';
import {ArrowDown, ArrowUp, ChevronDown, Ellipsis, HelpCircle, Keyboard, MoveRight, Paperclip, Camera, PenLine, Radical, Undo2, Redo2, SlidersHorizontal, RefreshCw, Signature, X} from 'lucide-react';
import {isFlagOn} from '../../flags';
import {TutorInkTray,type TutorInkState} from './TutorInk';
import {Button,IconButton,Sheet} from '../../ui/v7/components';
import {authGeneration,authOwner} from '../../data/authBoundary';
import {tutorOwnerDeleted} from '../../data/tutor/local-storage';
import {MathText} from '../../ui/MathText';
import {haptic} from '../../ui/v7/haptics';
import {
  changePadText, createPadTextHistory, deletePadBackward, movePadCaret, padEdit, redoPadText, undoPadText,
  type PadEdit, type PadTextHistory,
} from '../pad/padEdit';
import {findNotationSlot, insertNotation, notation} from './notation';
import {removeTutorImageReferences,TUTOR_ATTACHMENT_COUNT} from '../../data/tutor/attachment-types';
import {inkIssueText,tutorInkIssue} from '../../data/tutor/ink-storage';
import {imageReference, referencedImageIds, tutorAnswerParts} from '../../../supabase/functions/_shared/tutor-answer';
import {readTutorAnswer, renderTutorAnswer, setTutorAnswerSelection, TutorAnswerEditor} from './TutorAnswerEditor';
import {TutorKeyboard} from './TutorKeyboard';
import {TutorInkPad} from './input/TutorInkPad';
import {TutorSymbolPicker} from './input/TutorSymbolPicker';
import {insertTutorSymbol, symbolLatex, tutorMathContext} from './input/symbolEdit';
import {symbolByGlyph} from './input/symbolCatalog';
import {useTutorInputAssist} from './input/useTutorInputAssist';
import {useTutorInputPreferences} from './input/inputPreferences';
import {sameEditTarget} from './input/recognitionPolicy';
import type {EditTarget} from './input/types';
import {useWritingAid, useWritingAidPreferences, WritingAidSettings, advanceWritingAidAnchor, continueWritingAidAnchor, applyWritingAidProposal, type WritingAidAnchor, type WritingAidProposal} from './writingAid';
import {SymbolWords, WritingAidBar, WritingAidWords} from './WritingAidBar';
import {typedEquationAt} from './input/typedEquation';
import {useAutoeqReadings} from './input/useAutoeqReadings';
import {latexSymbolOptions, type SymbolOption} from './input/latexShortcuts';
import {TutorEquationPanel} from './input/TutorEquationPanel';
import {INK_VIEWPORT} from './input/TutorInkPad';
import {resampleInkPath} from './input/inkGeometry';
import {PAD_PAPER, type PadStrokes} from '../../ui/v7/ink/ink';
import {prepareWritingDecoder, recordKeyTouch, setDecoderContext, writingDecoderReady, type KeyTouch} from './writingAid/decoder/ngramSpatial';
import './keyboard.css';
import './input/input.css';
import './writing-aid.css';

const keepSelection = (event: PointerEvent) => event.preventDefault();
const ANSWER_CLIPBOARD = 'application/x-lemma-tutor-answer';
const MAX_ANSWER_LENGTH = 2000;
const IMAGE_REFERENCE_LENGTH = imageReference('00000000-0000-0000-0000-000000000000').length;

interface Props {
  value: string;
  onChange: (text: string) => void;
  onSend: (text: string) => void;
  onAsk: (kind: 'hint' | 'stuck' | 'notation') => void;
  hintLevel?: number;
  canSend: boolean;
  readOnly: boolean;
  pending: boolean;
  onContext: () => void;
  hasContext: boolean;
  notationContext?: readonly string[];
  ink?: TutorInkState;
  canQueueImage?: boolean;
  inputScopeKey?: string;
}

/** N221: where the learner writes: the keys, Draw symbol, equation mode or the scratch pad. */
type Surface = 'keys' | 'symbol' | 'equation' | 'scratch';

export function TutorComposer(props: Props) {
  const field = useRef<HTMLTextAreaElement>(null);
  const richField = useRef<HTMLDivElement>(null);
  const fieldElement = () => richField.current ?? field.current;
  const drawingSelection = useRef<PadEdit | null>(null);
  const drawingOccurrence = useRef<number | null>(null);
  const focusAfterSymbol = useRef(false);
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [scratch,setScratch]=useState(false),[photo,setPhoto]=useState(false);
  const [editMenu,setEditMenu]=useState(false);
  const [answerError,setAnswerError]=useState('');
  const [shown, setShown] = useState(false);
  /** N227 (Owner): the keyboard icon in the answer box keeps the keys up and the answer selected while the chat scrolls. */
  const [pinned, setPinned] = useState(false);
  const composerRoot = useRef<HTMLDivElement>(null);
  const [view, setView] = useState('abc');
  const [lastMath, setLastMath] = useState('∀∃');
  const composition = useRef(false);
  const [compositionText, setCompositionText] = useState<string | null>(null);
  const composing = compositionText !== null;
  const history = useRef(createPadTextHistory(padEdit(props.value)));
  const [cursor, setCursor] = useState(history.current.present);
  const [mountId] = useState(()=>crypto.randomUUID());
  const revision = useRef({editorRevision:0,selectionRevision:0,modeRevision:0});
  const pendingSelection = useRef<PadEdit | null>(history.current.present);
  const authoredAnchor = useRef<WritingAidAnchor | null>(null);
  const acceptedSuggestion = useRef<{before: PadTextHistory; after: PadEdit; proposal: WritingAidProposal} | null>(null);
  const [hideSuggestionUndo, setHideSuggestionUndo] = useState(false);
  const decoderSeen = useRef(false);
  const [decoderReady, setDecoderReady] = useState(writingDecoderReady);
  const shownSuggestions = useRef(0);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const swipe = useRef<{pointer: number; x: number; y: number; time: number; proposal: WritingAidProposal; cursor: PadEdit} | null>(null);
  const [aidSettings, setAidSettings] = useState(false);
  /** N221: the equation chip being edited: its $…$ source at `offset`, and the LaTeX in the sheet. */
  const [equationEdit, setEquationEdit] = useState<{source: string; offset: number; tex: string} | null>(null);
  /** N221 (Owner): equation mode, where the keys give way to paper; `writeReplace` is the equation it will replace, if any. */
  const [equationMode, setEquationMode] = useState(false);
  const [writeReplace, setWriteReplace] = useState<{source: string; offset: number} | null>(null);
  /** Where the caret was when equation mode or Draw symbol opened: insertions go there, not where focus happens to land. */
  const surfaceSelection = useRef<PadEdit | null>(null);
  const [dismissedAid, setDismissedAid] = useState<string | null>(null);
  const rejectedEdits = useRef(new Set<string>());
  const writingPrefs = useWritingAidPreferences();
  const incomplete = props.value.includes('□');
  const images = props.ink?.draft.photos;
  const availableIds = useMemo(() => new Set(images?.map(image => image.id.toLowerCase())), [images]);
  const previousIds = useRef(availableIds);
  const imageReferences = useMemo(() => referencedImageIds(props.value), [props.value]);
  const refs = imageReferences.filter(id => availableIds.has(id));
  const hasImage = refs.length > 0;
  const imageTarget = drawingSelection.current?.text === props.value ? drawingSelection.current : cursor;
  const canInsertImage = props.value.length - (imageTarget.end - imageTarget.start) + IMAGE_REFERENCE_LENGTH <= MAX_ANSWER_LENGTH;
  const inkDraft = props.ink?.draft;
  const readOnly = props.readOnly || inkDraft?.queuedText !== undefined;
  const imageIssue = tutorInkIssue(props.value, props.ink);
  const recoveryIssue = imageIssue ?? (props.ink?.status === 'failed' ? 'failed' : undefined);
  const uncommitted = props.ink?.ready && inkDraft && (inkDraft.inlineImages || hasImage) && Boolean(inkDraft.strokes.length ||
    (inkDraft.editingDrawing && refs.includes(inkDraft.editingDrawing.id)));
  const queue=props.canQueueImage&&hasImage;
  const blocked = readOnly || !queue&&!props.canSend || incomplete || composing || scratch || uncommitted || Boolean(imageIssue);
  const editingDisabled = readOnly || composing;
  const inputPrefs = useTutorInputPreferences();
  const scopeKey = props.inputScopeKey ?? 'tutor-preview';
  const editTarget = ():EditTarget => ({scopeKey:scopeKey+'|'+authGeneration(),mountId,...revision.current});
  const assist = useTutorInputAssist({scopeKey,enabled:inputPrefs.recognition,automatic:inputPrefs.automatic,readOnly,composing,
    target:editTarget,insert:(id,target)=>{
      remember();
      const live = editTarget(), owner=authOwner();
      if (readOnly || owner&&tutorOwnerDeleted(owner) || composition.current || !sameEditTarget(target,live)) return false;
      const edited = insertTutorSymbol(history.current.present,id);
      if (!edited || !commit(changePadText(history.current,edited),false,true,true))return false;
      focusAfterSymbol.current=true;
      setShown(true);
      haptic('snap');
      return true;
    }});


  const aidSignature = JSON.stringify([scopeKey, writingPrefs.scopeKey, writingPrefs.mode, revision.current, cursor]);
  const writingRequest = {cursor, anchor: authoredAnchor.current, target: editTarget(), mode: writingPrefs.mode,
    surfaces: writingPrefs.surfaces, composing, readOnly: readOnly || scratch || assist.drawing || editMenu || aidSettings || !shown};
  const writing = useWritingAid(writingRequest);
  const aidVisible = dismissedAid !== aidSignature && !editingDisabled;
  const writingWords = aidVisible ? writing.words : [];
  const rejectionKey = (proposal: WritingAidProposal) => JSON.stringify([proposal.start, proposal.end, proposal.before, proposal.insert]);
  const writingEdit = aidVisible && writing.edit && !rejectedEdits.current.has(rejectionKey(writing.edit)) ? writing.edit : null;
  const writingGhost = aidVisible ? writing.ghost : null;
  const ghostSuffix = writingGhost?.insert;
  const suggestionUndoable = !hideSuggestionUndo && Boolean(acceptedSuggestion.current && acceptedSuggestion.current.after.text === cursor.text);
  const refreshable = writingWords.length > 0 || Boolean(writingEdit || writingGhost);
  /** N221: whether the strip offered suggestions when Answer actions opened (the menu pauses the writing aid). */
  const [menuRefreshable, setMenuRefreshable] = useState(false);
  /** Refresh suggestions was chosen in the menu: it applies once the menu has closed and the strip shows them again. */
  const refreshAfterMenu = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** N220: a word is being typed (a collapsed caret right after a letter), so the strip is the word suggestions'. */
  // N221: and has suggestions to show; with none, the strip keeps the maths symbols instead of empty slots, as Gboard
  // keeps its toolbar.
  const wordInProgress = cursor.start === cursor.end && /[A-Za-z]$/.test(cursor.text.slice(0, cursor.start)) && writingWords.length > 0;
  shownSuggestions.current = writingWords.length + Number(Boolean(writingEdit || writingGhost || suggestionUndoable));
  // N221 (Owner): the writing aid's replacement or continuation takes the strip as Gboard shows a correction: for the
  // word at the caret, for a continuation, or at a word boundary. While a new word is typed with its own suggestions,
  // a fix for an earlier word steps aside (the answer still marks it) and returns at the next space. It leaves when
  // tapped, dismissed with ✕, or when the text no longer has it. Undo is a small key at the strip's left edge.
  const aidExhausted = aidVisible && (writing.exhausted.edit || writing.exhausted.ghost);
  const shownEdit = writingEdit && (writingEdit.end === cursor.end || !wordInProgress) ? writingEdit : null;
  const reviewChoice = Boolean(shownEdit || writingGhost || aidExhausted) && !suggestionUndoable;
  const review = reviewChoice || suggestionUndoable;
  // N221 (Owner): symbols for a LaTeX command or short form being typed. A command (\alp) or short form (->) takes the
  // word slots; a bare name (lambda) puts its symbol beside the words. Off mode turns them off with the rest of the aid.
  const symbolOptions = useMemo(() => writingPrefs.mode === 'off' || !shown ? [] : latexSymbolOptions(cursor),
    [cursor, writingPrefs.mode, shown]);
  // N223 (Owner: "integrate all this in one hood"): an equation just typed in prose (x1 + x2 = 4) is read by N222's
  // autoeq, its rules and then its on-device model, ordered by the words before it.
  const typedEquation = useMemo(() => shown && !scratch && writingPrefs.mode !== 'off' ? typedEquationAt(cursor) : null,
    [cursor, shown, scratch, writingPrefs.mode]);
  const equationReadings = useAutoeqReadings(typedEquation?.text ?? '', typedEquation?.context ?? '').readings.slice(0, 3);
  /**
   * One strip, one frame: Draw symbol (or Next □) at the left edge, Equation mode at the right, and three slots between
   * them that show the first of: autoeq's readings of a typed equation; the symbols for a LaTeX command, short form or
   * name (\al, ->, eps); the word suggestions; and, with nothing to suggest, ∀ ∈ ⇒.
   */
  const slots: 'equation' | 'symbols' | 'words' | 'quick' = typedEquation && equationReadings.length ? 'equation'
    : symbolOptions.length ? 'symbols' : writingWords.length ? 'words' : 'quick';
  const symbolSlots = slots === 'symbols' ? symbolOptions : [];
  /** The strip frames word slots (Gboard's typing strip) rather than spreading its idle icons. */
  const stripActive = slots !== 'quick' || reviewChoice;

  useEffect(() => {
    const reportVisibility = () => {
      const visible = shown && !editingDisabled && !scratch && !assist.drawing && !aidSettings && !editMenu && document.visibilityState !== 'hidden';
      writing.shown('words', visible && slots === 'words' ? writingWords : []);
      writing.shown('edit', visible && shownEdit && !suggestionUndoable ? [shownEdit] : []);
      writing.shown('ghost', visible && writingGhost ? [writingGhost] : []);
    };
    reportVisibility();
    document.addEventListener('visibilitychange', reportVisibility);
    return () => document.removeEventListener('visibilitychange', reportVisibility);
  }, [writing.shown, writingWords, slots, shownEdit, writingGhost, shown, editingDisabled, scratch, assist.drawing, aidSettings, editMenu, suggestionUndoable]);

  // N221: load N219's lexicon for the n-gram and touch decoder when the keyboard opens, and let the tutor's question
  // (with the checkpoint's title and step) favour its own words while the learner answers it.
  // Once it is ready, an empty strip is worked out again; a suggestion already shown never changes under the finger.
  useEffect(() => {
    if (!shown) return;
    let live = true;
    void prepareWritingDecoder().then(() => {
      if (!live || !writingDecoderReady()) return;
      setDecoderReady(true);
      if (decoderSeen.current || shownSuggestions.current) return;
      decoderSeen.current = true;
      // A new cursor object recomputes; the edit target's revisions stay, so a picker or drawing in progress stays valid.
      setCursor(current => ({...current}));
    });
    return () => {live = false;};
  }, [shown]);
  const decoderContext = JSON.stringify(props.notationContext ?? []);
  useEffect(() => {setDecoderContext(JSON.parse(decoderContext) as string[]);}, [decoderContext]);

  useEffect(() => {
    swipe.current = null;
    setSwipeProgress(0);
  }, [shown, editingDisabled, scratch, assist.drawing, aidSettings, editMenu, scopeKey, writingPrefs.mode]);

  useLayoutEffect(() => {
    const hadEvidence = authoredAnchor.current !== null || acceptedSuggestion.current !== null;
    authoredAnchor.current = null;
    acceptedSuggestion.current = null;
    rejectedEdits.current.clear();
    setDismissedAid(null);
    if (hadEvidence) setCursor({...history.current.present});
  }, [scopeKey, writingPrefs.scopeKey, writingPrefs.mode]);

  function dismissWriting() {
    if (suggestionUndoable && acceptedSuggestion.current) {
      writing.feedback('kept', acceptedSuggestion.current.proposal);
      setHideSuggestionUndo(true);
      return;
    }
    if (writingEdit) writing.feedback('dismiss', writingEdit);
    if (writingGhost) writing.feedback('dismiss', writingGhost);
    if (writingEdit) rejectedEdits.current.add(rejectionKey(writingEdit));
    setDismissedAid(aidSignature);
  }

  function acceptWriting(proposal: WritingAidProposal) {
    remember();
    if (!writing.isCurrent(proposal)) return;
    const before = history.current, anchor = authoredAnchor.current;
    const next = applyWritingAidProposal({...writingRequest, cursor: before.present, anchor, target: editTarget(),
      composing: composition.current, readOnly: readOnly || scratch || assist.drawing || editMenu || aidSettings || !shown}, proposal);
    if (!next || !commit(changePadText(before, next), true)) return;
    authoredAnchor.current = continueWritingAidAnchor(anchor, proposal, next);
    acceptedSuggestion.current = {before, after: next, proposal};
    setHideSuggestionUndo(false);
    writing.feedback('accept', proposal);
    haptic('snap');
  }
  /** N223: a reading of the typed equation replaces it in the answer as an equation chip. */
  function acceptTypedEquation(latex: string) {
    remember();
    const span = typedEquation, edit = history.current.present;
    if (!span || readOnly || edit.text.slice(span.start, span.end) !== span.text) return;
    if (commit(changePadText(history.current, insertNotation(padEdit(edit.text, span.start, span.end), '$' + latex + '$')), true)) haptic('snap');
  }
  function acceptSymbol(option: SymbolOption) {
    remember();
    const edit = history.current.present;
    if (editingDisabled || edit.start !== edit.end || edit.end !== option.end ||
        edit.text.slice(option.start, option.end) !== option.token) return;
    const base = padEdit(edit.text.slice(0, option.start) + edit.text.slice(option.end), option.start);
    // Inside $…$ the symbol is its LaTeX command (\alp completes to \alpha); in prose, its glyph.
    const next = insertTutorSymbol(base, option.symbol.id) ?? insertNotation(base, option.symbol.glyph);
    if (commit(changePadText(history.current, next), true)) haptic('snap');
  }
  function undoWriting() {
    const saved = acceptedSuggestion.current;
    if (!saved || saved.after.text !== history.current.present.text || editingDisabled) return;
    writing.feedback('undo', saved.proposal);
    commit(saved.before, true);
    haptic('snap');
  }

  useLayoutEffect(() => {
    const input = fieldElement();
    if (!input) return;
    if (input instanceof HTMLTextAreaElement) {
      input.style.paddingBottom = '';
      input.style.height = '44px';
      const mirror = input.previousElementSibling instanceof HTMLElement ? input.previousElementSibling : null;
      if (ghostSuffix && mirror) {
        // The mirror includes faded text, while the native value does not.
        // Reserve its wrapped lines as padding so both short and capped inputs
        // can display the continuation without changing the learner's text.
        const extra = Math.max(0, mirror.scrollHeight - input.scrollHeight);
        if (extra) input.style.paddingBottom = (parseFloat(getComputedStyle(input).paddingBottom) + extra) + 'px';
      }
      input.style.height = Math.min(120, Math.max(44, input.scrollHeight)) + 'px';
      if (ghostSuffix && mirror) {
        input.scrollTop = Math.max(0, input.scrollHeight - input.clientHeight);
        mirror.scrollTop = input.scrollTop;
      }
    }
    if (history.current.present.text !== props.value) {
      revision.current.editorRevision++;
      revision.current.selectionRevision++;
      assist.stop();
      acceptedSuggestion.current = null;
      authoredAnchor.current = null;
      rejectedEdits.current.clear();
      history.current = createPadTextHistory(padEdit(props.value));
      setCursor(history.current.present);
      pendingSelection.current = history.current.present;
    }
    if (pendingSelection.current && input instanceof HTMLTextAreaElement) {
      // Focusing dispatches remember synchronously. Restore the inserted caret before it can pause Keep drawing.
      selectField(pendingSelection.current);
      pendingSelection.current = null;
    }
    if(focusAfterSymbol.current&&!assist.picker) {
      focusAfterSymbol.current=false;
      input.focus({preventScroll:true});
    }
    const edit = pendingSelection.current;
    if (edit && document.activeElement === input) {
      selectField(edit);
      pendingSelection.current = null;
    }
  }, [props.value, compositionText, assist.picker, assist.drawing, ghostSuffix]);

  useLayoutEffect(() => {
    const previous = previousIds.current;
    previousIds.current = availableIds;
    if (!props.ink?.ready || ![...previous].some(id => !availableIds.has(id))) return;
    const saved = history.current;
    const valid = (edit: PadEdit) => referencedImageIds(edit.text).every(id => availableIds.has(id));
    const past = saved.past.slice(saved.past.map(valid).lastIndexOf(false) + 1);
    const invalidFuture = saved.future.findIndex(edit => !valid(edit));
    const future = invalidFuture < 0 ? saved.future : saved.future.slice(0, invalidFuture);
    if (past.length === saved.past.length && future.length === saved.future.length) return;
    acceptedSuggestion.current = null;
    authoredAnchor.current = null;
    history.current = {...saved, past, future};
    setCursor({...saved.present});
  }, [availableIds, props.ink?.ready]);


  function fieldSelection(input: HTMLElement) {
    return input instanceof HTMLTextAreaElement
      ? padEdit(input.value, input.selectionStart, input.selectionEnd, input.selectionDirection)
      : readTutorAnswer(input);
  }
  function selectField(edit: PadEdit) {
    if (field.current) field.current.setSelectionRange(edit.start, edit.end, edit.direction);
    else if (richField.current && document.activeElement === richField.current) setTutorAnswerSelection(richField.current, edit);
  }
  function remember() {
    if (swipe.current) return;
    const input = fieldElement();
    if (!input || composition.current || (input === richField.current && document.activeElement !== input)) return;
    const edit = fieldSelection(input);
    const present = history.current.present;
    if (edit.text !== present.text || (edit.start === present.start && edit.end === present.end && edit.direction === present.direction)) return;
    revision.current.selectionRevision++;
    assist.pause();
    authoredAnchor.current = null;
    acceptedSuggestion.current = null;
    history.current = {...history.current, present: edit};
    setCursor(edit);
  }
  function tooManyImages(text: string) {
    return referencedImageIds(text).filter(id => availableIds.has(id)).length > TUTOR_ATTACHMENT_COUNT;
  }
  function commit(next: PadTextHistory, focus = false, restore = true, fromAssist = false, manuallyTyped = false) {
    const edit = next.present;
    if (readOnly || edit.text.length > MAX_ANSWER_LENGTH) return false;
    if (tooManyImages(edit.text)) {
      setAnswerError('An answer can have up to three images.');
      return false;
    }
    const previous=history.current.present;
    const changed = edit.text !== previous.text;
    const moved = edit.start!==previous.start||edit.end!==previous.end||edit.direction!==previous.direction;
    if(changed)revision.current.editorRevision++;
    if(moved)revision.current.selectionRevision++;
    if(!fromAssist&&(changed||moved))assist.pause();
    if (focus && !(document.activeElement instanceof HTMLButtonElement)) fieldElement()?.focus({preventScroll: true});
    const nextAnchor = manuallyTyped ? advanceWritingAidAnchor(previous, edit, authoredAnchor.current) : null;
    history.current = next;
    if (changed || moved) authoredAnchor.current = nextAnchor;
    setCursor(edit);
    if (changed) {
      acceptedSuggestion.current = null;
      for (const key of rejectedEdits.current) {
        const [start, end, source] = JSON.parse(key) as [number, number, string, string];
        if (edit.text.slice(start, end) !== source) rejectedEdits.current.delete(key);
      }
      setAnswerError('');
      if (restore) pendingSelection.current = edit;
      props.onChange(edit.text);
    } else if (restore) {
      if(fromAssist)pendingSelection.current=edit;
      else selectField(edit);
    }
    return true;
  }
  function change(edit: PadEdit, focus = false) {
    commit(changePadText(history.current, edit), focus);
  }
  function typeText(edit: PadEdit, text: string, focus: boolean) {
    // A candidate supplies its own trailing space. Punctuation replaces only
    // that generated space; learner-authored spaces are left untouched.
    const suppliedSpace = /^[.,;:!?]$/u.test(text) && edit.start === edit.end && edit.end === edit.text.length &&
      edit.text.endsWith(' ') && acceptedSuggestion.current?.after.text === edit.text;
    const target = suppliedSpace ? padEdit(edit.text, edit.start - 1, edit.end) : edit;
    return commit(changePadText(history.current, insertNotation(target, text)), focus, true, false, true);
  }
  function insert(text: string, typed = false, touch?: KeyTouch) {
    remember();
    const edit = history.current.present;
    // N221: the decoder's spatial model reads where this letter was tapped (memory only).
    if (touch && /^[A-Za-z]$/.test(text)) recordKeyTouch(edit.start, text, touch);
    const symbol=symbolByGlyph(text.trim());
    if(symbol && tutorMathContext(edit)!=='prose') {
      const converted=insertTutorSymbol(edit,symbol.id);
      if(converted)change(converted,true);
      else setAnswerError('Choose a selection within one math or text region.');
      return;
    }
    if (typed) typeText(edit, text, true);
    else change(insertNotation(edit, text), true);
  }
  /** N221: tapping an equation chip opens it in the equation sheet. */
  function openEquation(source: string, offset: number) {
    if (editingDisabled || history.current.present.text.slice(offset, offset + source.length) !== source) return;
    const tex = source.replace(/^\$\$?|\$\$?$/gu, '');
    setEquationEdit({source, offset, tex});
  }
  /** Closing the equation sheet puts the caret just after the equation, not where the focus lands. */
  function closeEquation() {
    const target = equationEdit;
    setEquationEdit(null);
    const {text} = history.current.present;
    if (target && text.slice(target.offset, target.offset + target.source.length) === target.source) {
      const after = padEdit(text, target.offset + target.source.length);
      history.current = {...history.current, present: after};
      pendingSelection.current = after;
      setCursor(after);
    }
  }
  /** Replace the edited equation with `tex` (empty removes it), keeping its $ or $$ delimiters. */
  function saveEquation(tex: string) {
    const target = equationEdit;
    setEquationEdit(null);
    if (!target || readOnly) return;
    const {text} = history.current.present;
    if (text.slice(target.offset, target.offset + target.source.length) !== target.source) return;
    const fence = target.source.startsWith('$$') ? '$$' : '$';
    const replacement = tex.trim() ? fence + tex.trim() + fence : '';
    const range = padEdit(text, target.offset, target.offset + target.source.length);
    if (commit(changePadText(history.current, insertNotation(range, replacement)), true)) haptic('snap');
    if (surfaceSelection.current) surfaceSelection.current = history.current.present;
  }
  /** N221: recognised handwriting goes in at the caret, as $…$ in prose or as plain LaTeX inside $…$. */
  function insertEquation(latex: string) {
    remember();
    if (readOnly) return false;
    const target = writeReplace;
    if (target) {
      setWriteReplace(null);
      const {text} = history.current.present;
      if (text.slice(target.offset, target.offset + target.source.length) === target.source) {
        const range = padEdit(text, target.offset, target.offset + target.source.length);
        return commit(changePadText(history.current, insertNotation(range, '$' + latex + '$')), true);
      }
    }
    const saved = surfaceSelection.current;
    const edit = saved && saved.text === history.current.present.text ? saved : history.current.present;
    const inMath = tutorMathContext(edit) === 'tex';
    const before = edit.text.slice(0, edit.start);
    const text = inMath ? latex : (before && !/\s$/.test(before) ? ' ' : '') + '$' + latex + '$';
    const inserted = commit(changePadText(history.current, insertNotation(edit, text)), true);
    if (inserted && surfaceSelection.current) surfaceSelection.current = history.current.present;
    return inserted;
  }
  function nextSlot(backward = false) {
    remember();
    const slot = findNotationSlot(history.current.present, backward);
    if (slot) change(slot, true);
  }
  function undo(redo = false) {
    if (!redo && acceptedSuggestion.current?.after.text === history.current.present.text) writing.feedback('undo', acceptedSuggestion.current.proposal);
    commit(redo ? redoPadText(history.current) : undoPadText(history.current), true);
  }
  function changeView(next: string) {
    revision.current.modeRevision++;
    assist.pause();
    setView(next);
    if (notation[next]) setLastMath(next);
  }
  function send() {
    if (!blocked && (props.value.trim()||hasImage)) {
      revision.current.modeRevision++;
      assist.stop();
      props.onSend(props.value);
    }
  }

  /**
   * N227 (Owner: "auto close and open the keyboard when input is not selected or selected respectively"): the keys open
   * when the answer is selected (focusAnswer) and close when the learner touches the chat or the header instead. With
   * the keyboard icon pressed they stay, and the answer keeps its selection, so the learner can scroll back to the
   * question while typing. Drawing surfaces (scratch pad, equation mode, Draw symbol) are not closed this way.
   */
  useEffect(() => {
    const root = composerRoot.current, page = root?.closest<HTMLElement>('.lemma-tutor');
    if (!props.ink || !shown || !root || !page) return;
    const down = (event: globalThis.PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || root.contains(target) || target.closest('[role="dialog"]')) return;
      if (pinned) {
        // Keep the answer selected; controls in the chat (Copy, links, Make a card) still work.
        if (!target.closest('button,a[href],input,textarea,select,summary,[contenteditable="true"]')) event.preventDefault();
        return;
      }
      if (scratch || equationMode || assist.drawing) return;
      assist.pause();
      setShown(false);
    };
    page.addEventListener('pointerdown', down, true);
    return () => page.removeEventListener('pointerdown', down, true);
  }, [props.ink, shown, pinned, scratch, equationMode, assist.drawing, assist.pause]);
  function pinKeys() {
    haptic('snap');
    if (pinned) {setPinned(false); return;}
    setPinned(true);
    keys();
    fieldElement()?.focus({preventScroll: true});
  }
  function keys() {
    setScratch(false);
    setShown(true);
  }
  useEffect(() => {
    if (equationMode && shown && !scratch && inputPrefs.recognition && !assist.drawing && !editingDisabled) assist.openDraw();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [equationMode, shown, scratch, inputPrefs.recognition, assist.drawing, editingDisabled]);
  /**
   * N221 (Owner): the ways to write share the keyboard's place: the keys, Draw symbol (one symbol), equation mode
   * (handwriting, read as an equation and as symbols, with a row of variables) and the scratch pad (a drawing).
   */
  function selectSurface(next: Surface) {
    if (editingDisabled && next !== 'keys') return;
    if (next !== 'equation') {setEquationMode(false); setWriteReplace(null);}
    if (next !== 'symbol' && assist.drawing) assist.stop();
    if (next === 'scratch') {openDrawing(); return;}
    if (scratch) closeDrawing(); else setShown(true);
    if (next === 'symbol' || next === 'equation') {remember(); surfaceSelection.current ??= history.current.present;}
    if (next === 'symbol') {revision.current.modeRevision++; assist.openDraw();}
    if (next === 'equation') setEquationMode(true);
    if (next === 'keys') {
      const saved = surfaceSelection.current;
      surfaceSelection.current = null;
      if (saved?.text === history.current.present.text) pendingSelection.current = saved;
      fieldElement()?.focus({preventScroll: true});
      if (saved?.text === history.current.present.text) {selectField(saved); history.current = {...history.current, present: saved}; setCursor(saved);}
    }
  }
  /** N223 (Owner: "just show the scratch pad with one tap on the pencil"): the composer's pencil opens the scratch pad, or closes it. */
  function pencil() {
    haptic('snap');
    selectSurface(scratch ? 'keys' : 'scratch');
  }
  /**
   * N223: a symbol read in equation mode goes into the answer as an equation chip of its LaTeX command (\forall), or
   * as its glyph where it has no command.
   */
  function insertSymbolChip(id: string) {
    const latex = symbolLatex(id);
    return Boolean(latex) && !editingDisabled && insertEquation(latex!);
  }
  /**
   * The equation paper's ink also goes to the Draw single symbols reader: scaled into its small paper, as if drawn
   * there, so one drawing is read both as an equation and as a symbol. It never inserts on its own here.
   */
  function readSymbol(strokes: PadStrokes, size: {width: number; height: number}) {
    if (!equationMode || !inputPrefs.recognition) return;
    replayInk(strokes, size);
    assist.lockAutomatic();
  }
  function replayInk(strokes: PadStrokes, size: {width: number; height: number}) {
    assist.onClear();
    if (!strokes.length) return;
    const points = strokes.map(stroke => stroke.map(point => ({x: point.x / PAD_PAPER.width * size.width, y: point.y / PAD_PAPER.height * size.height})));
    const all = points.flat();
    const left = Math.min(...all.map(point => point.x)), top = Math.min(...all.map(point => point.y));
    const width = Math.max(...all.map(point => point.x)) - left, height = Math.max(...all.map(point => point.y)) - top;
    const scale = Math.min((INK_VIEWPORT.width - 24) / Math.max(width, 1), (INK_VIEWPORT.height - 24) / Math.max(height, 1));
    const offsetX = (INK_VIEWPORT.width - width * scale) / 2, offsetY = (INK_VIEWPORT.height - height * scale) / 2;
    let t = performance.now() - strokes.length * 400;
    points.forEach((stroke, index) => {
      const path = resampleInkPath(stroke.map(point => ({x: offsetX + (point.x - left) * scale, y: offsetY + (point.y - top) * scale, t: 0})),
        Math.min(64, Math.max(2, stroke.length)));
      const timed = path.map(point => ({...point, t: t += 8}));
      const id = 9000 + index;
      assist.onBegin(id, 'pen', timed[0]);
      for (const point of timed.slice(1, -1)) assist.onMove(id, point);
      assist.onEnd(id, timed.at(-1)!);
      t += 120;
    });
  }
  function keyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget || composition.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    const modified = event.ctrlKey || event.metaKey;
    if (event.key === 'Enter' && modified) {
      event.preventDefault();
      send();
    }
    if (!modified && !event.altKey && event.key === 'Escape' && shown) {
      event.preventDefault();
      if (writingGhost || writingEdit || writingWords.length) {dismissWriting(); return;}
      if(assist.drawing)assist.stop();
      else {setPinned(false); setShown(false);}
    }
    if (readOnly) return;
    const key = event.key.toLowerCase();
    if (modified && !event.altKey && (key === 'z' || key === 'y')) {
      event.preventDefault();
      undo(key === 'y' || event.shiftKey);
      return;
    }
    remember();
    const edit = history.current.present;
    if (!modified && !event.altKey && !event.shiftKey && event.key === 'Tab' && writingGhost) {
      event.preventDefault(); acceptWriting(writingGhost); return;
    }
    if (!modified && !event.altKey && event.key === 'Tab' && edit.text.slice(edit.start, edit.end) === '□') {
      const slot = findNotationSlot(edit, event.shiftKey);
      if (slot && (event.shiftKey ? slot.start < edit.start : slot.start > edit.start)) {
        event.preventDefault();
        change(slot);
      }
    }
    if (modified || event.altKey) return;
    if (/^[.,;:!?]$/u.test(event.key) && edit.start === edit.end && edit.end === edit.text.length &&
        edit.text.endsWith(' ') && acceptedSuggestion.current?.after.text === edit.text) {
      event.preventDefault(); typeText(edit, event.key, false); return;
    }
    if (richField.current && event.key === 'Enter') {
      event.preventDefault();
      change(insertNotation(edit, '\n'));
      return;
    }
    if (richField.current && (event.key === 'Backspace' || event.key === 'Delete')) {
      const range = imageDeletion(edit, event.key === 'Backspace');
      if (range) {event.preventDefault(); change(insertNotation(range, '')); return;}
    }

  }
  function beginComposition(input: HTMLElement) {
    remember();
    authoredAnchor.current = null;
    acceptedSuggestion.current = null;
    composition.current=true;
    revision.current.selectionRevision++;
    assist.pause();
    setCursor({...history.current.present});
    setCompositionText(fieldSelection(input).text);
  }
  function inputChanged(input: HTMLElement, manuallyTyped = true) {
    if (readOnly) {
      if (input === richField.current) renderTutorAnswer(input, props.value, images ?? [], true);
      return;
    }
    const edit = fieldSelection(input);
    if (composition.current) setCompositionText(edit.text);
    else if (edit.text.length <= MAX_ANSWER_LENGTH && !tooManyImages(edit.text)) commit(changePadText(history.current, edit), false, false, false, manuallyTyped);
    else if (input === richField.current) {
      // A native edit may exceed the limit by a grapheme. Restore the saved value.
      if (tooManyImages(edit.text)) setAnswerError('An answer can have up to three images.');
      const saved = history.current.present;
      renderTutorAnswer(input, saved.text, images ?? [], readOnly);
      setTutorAnswerSelection(input, saved);
    }
  }
  function imageRanges(text: string) {
    let offset = 0;
    return tutorAnswerParts(text).flatMap(part => {
      if (part.type === 'text') {offset += part.text.length; return [];}
      const start = offset;
      offset += imageReference(part.id).length;
      return [{id: part.id, start, end: offset}];
    });
  }
  function deleteBackward() {
    remember();
    const edit = history.current.present;
    const image = imageDeletion(edit, true);
    change(image ? insertNotation(image, '') : deletePadBackward(edit), true);
  }
  function imageDeletion(edit: PadEdit, backward: boolean) {
    if (edit.start !== edit.end) return;
    const image = imageRanges(edit.text).find(item => backward ? edit.start === item.end : edit.start === item.start);
    if (image) return padEdit(edit.text, image.start, image.end);
  }
  function openDrawing(id: string | null = null, offset: number | null = null) {
    if (editingDisabled) return;
    remember();
    revision.current.modeRevision++;
    assist.stop();
    drawingOccurrence.current = offset;
    drawingSelection.current = history.current.present;
    fieldElement()?.blur();
    setShown(false);
    setEditingImageId(id);
    setScratch(true);
  }
  function closeDrawing() {
    setScratch(false);
    setEditingImageId(null);
    setShown(true);
    const saved = drawingSelection.current;
    drawingSelection.current = null;
    drawingOccurrence.current = null;
    fieldElement()?.focus({preventScroll: true});
    if (saved?.text === history.current.present.text) change(saved);
  }
  function insertImage(id: string, replacesId?: string) {
    const edit = history.current.present;
    if (readOnly) return false;
    const saved = drawingSelection.current;
    const replaced = replacesId && saved?.text === edit.text && imageRanges(edit.text).find(item =>
      item.id === replacesId && item.start === drawingOccurrence.current);
    if (replacesId && !replaced) {
      setAnswerError('That drawing is no longer at this position in the answer.');
      return false;
    }
    const target = replaced ? padEdit(edit.text, replaced.start, replaced.end) : saved?.text === edit.text ? saved : edit;
    const inserted = insertNotation(target, imageReference(id));
    if (inserted.text.length > MAX_ANSWER_LENGTH) {
      setAnswerError('Shorten your answer to insert another image.');
      return false;
    }
    if (referencedImageIds(inserted.text).filter(ref => ref === id || availableIds.has(ref)).length > TUTOR_ATTACHMENT_COUNT) {
      setAnswerError('An answer can have up to three images.');
      return false;
    }
    change(inserted);
    closeDrawing();
    return true;
  }
  function migrateImages(ids: readonly string[]) {
    if (readOnly) return false;
    const {text} = history.current.present;
    const present = new Set(referencedImageIds(text));
    const markers = ids.filter(id => !present.has(id)).slice(0, TUTOR_ATTACHMENT_COUNT - present.size).map(imageReference);
    const withImages = insertNotation(padEdit(text), markers.join(''));
    if (withImages.text.length > MAX_ANSWER_LENGTH) {
      setAnswerError('Shorten your answer to restore the saved images.');
      return false;
    }
    if (markers.length) change(withImages);
    return true;
  }
  function chipAction(id: string, offset: number, action: 'edit' | 'remove') {
    if (editingDisabled || props.ink?.draft.queuedText !== undefined) return;
    if (action === 'edit') {if (availableIds.has(id)) openDrawing(id, offset); return;}
    const {text} = history.current.present;
    const image = imageRanges(text).find(item => item.id === id && item.start === offset);
    if (image) {
      fieldElement()?.focus({preventScroll: true});
      change(insertNotation(padEdit(text, image.start, image.end), ''));
    }
  }
  function clipboardPlain(text: string) {
    return tutorAnswerParts(text).map(part => {
      if (part.type === 'text') return part.text;
      const image = images?.find(item => item.id === part.id);
      return image?.kind === 'drawing' ? '[Drawing]' : image?.kind === 'photo' ? '[Photo]' : '[Image]';
    }).join('');
  }
  function copyAnswer(event: ClipboardEvent<HTMLDivElement>, cut = false) {
    const edit = fieldSelection(event.currentTarget);
    if (edit.start === edit.end) return;
    event.preventDefault();
    const text = edit.text.slice(edit.start, edit.end);
    event.clipboardData.setData('text/plain', clipboardPlain(text));
    event.clipboardData.setData(ANSWER_CLIPBOARD, text);
    if (cut && !editingDisabled) {
      remember();
      change(insertNotation(edit, ''));
    }
  }
  function pasteAnswer(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    if (editingDisabled) return;
    remember();
    const local = event.clipboardData.getData(ANSWER_CLIPBOARD);
    const known = local && referencedImageIds(local).every(id => availableIds.has(id));
    const text = known ? tutorAnswerParts(local).map(part => part.type === 'text' ? part.text : imageReference(part.id)).join('')
      : clipboardPlain(event.clipboardData.getData('text/plain'));
    if (!text) return;
    change(insertNotation(history.current.present, text.replace(/\r\n?/g, '\n')));
  }
  function refreshWriting() {
    if (editingDisabled) return;
    if (writingWords.length) writing.refresh('words', writingWords);
    if (writingEdit) writing.refresh('edit', [writingEdit]);
    if (writingGhost) writing.refresh('ghost', [writingGhost]);
    haptic('snap');
  }
  useEffect(() => {
    if (!refreshAfterMenu.current || editMenu || !refreshable) return;
    clearTimeout(refreshAfterMenu.current);
    refreshAfterMenu.current = null;
    refreshWriting();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMenu, refreshable, writingWords, writingEdit, writingGhost]);
  function stopSwipe() {
    swipe.current = null;
    setSwipeProgress(0);
    remember();
  }
  function beginSwipe(event: PointerEvent<HTMLDivElement>) {
    const editor = fieldElement();
    if (!writingGhost || editingDisabled || event.pointerType !== 'touch' || !event.isPrimary ||
        !editor || !(event.target instanceof Node) || !editor.contains(event.target) ||
        event.target instanceof Element && event.target.closest('button') || cursor.start !== cursor.end) return;
    swipe.current = {pointer: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(),
      proposal: writingGhost, cursor: history.current.present};
  }
  function moveSwipe(event: PointerEvent<HTMLDivElement>) {
    const held = swipe.current;
    if (!held || held.pointer !== event.pointerId) return;
    const dx = event.clientX - held.x, dy = Math.abs(event.clientY - held.y);
    if (performance.now() - held.time > 600 || dy > 18 || dx < -12) {stopSwipe(); return;}
    if (dx > 24 && dx >= 2 * dy) {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setSwipeProgress(Math.min(1, dx / 56));
    }
  }
  function endSwipe(event: PointerEvent<HTMLDivElement>) {
    const held = swipe.current;
    if (!held || held.pointer !== event.pointerId) return;
    const dx = event.clientX - held.x, dy = Math.abs(event.clientY - held.y);
    const input = fieldElement();
    const selected = input && fieldSelection(input);
    const accept = dx >= 56 && dy <= 18 && dx >= 2 * dy && performance.now() - held.time <= 600 &&
      selected?.start === selected?.end && history.current.present.text === held.cursor.text && !editingDisabled;
    swipe.current = null;
    setSwipeProgress(0);
    if (accept) {
      event.preventDefault();
      selectField(held.cursor);
      acceptWriting(held.proposal);
    } else remember();
  }
  function focusAnswer() {
    const pending=pendingSelection.current;
    if(pending && pending.text===props.value) {
      selectField(pending);
      pendingSelection.current=null;
    }
    remember();
    if (!readOnly) {setShown(true); setScratch(false);}
  }
  // N221: in the Android app Hide keyboard sits in the band under the keys, where Gboard's ⌄ is; browsers keep it in the strip.
  const hideButton = (className: string) => <button className={className} type="button" aria-label="Hide keyboard"
    onPointerDown={keepSelection} onClick={() => {haptic('snap'); setPinned(false); setShown(false);}}><ChevronDown aria-hidden="true"/></button>;
  const scratchButton = props.ink && <button className="sbtn" type="button" aria-label="Scratch" aria-pressed={scratch}
    disabled={editingDisabled || props.ink.draft.queuedText !== undefined} onPointerDown={keepSelection} onClick={pencil}><PenLine aria-hidden="true"/></button>;
  const nextSlotButton = <button type="button" className="sbtn" aria-label="Next □" disabled={editingDisabled} onPointerDown={keepSelection}
    onClick={() => {haptic('key'); nextSlot();}}><MoveRight aria-hidden="true"/></button>;
  const drawButton = <button className="sbtn" type="button" aria-label="Draw symbol" disabled={editingDisabled} onPointerDown={keepSelection}
    onClick={()=>{haptic('snap');selectSurface('symbol');}}><PenLine aria-hidden="true"/></button>;
  const surface: Surface = scratch ? 'scratch' : equationMode ? 'equation' : assist.drawing ? 'symbol' : 'keys';
  // N221 (Owner): the strip's right end is Equation mode (it was Refresh, now in Answer actions): the keys give way
  // to paper and the strip stays. Pressed while equation mode is open; a tap goes back to the keys.
  const equationButton = <button className="sbtn tutor-equation-toggle" type="button" aria-label="Equation mode" aria-pressed={surface === 'equation'}
    disabled={editingDisabled} onPointerDown={keepSelection}
    onClick={()=>{haptic('snap');selectSurface(surface === 'equation' ? 'keys' : 'equation');}}><Radical aria-hidden="true"/></button>;
  const keysButton = <button className="sbtn" type="button" aria-label="Keys" onPointerDown={keepSelection}
    onClick={()=>{haptic('snap');selectSurface('keys');}}><Keyboard aria-hidden="true"/></button>;
  return <div ref={composerRoot} className="keyboard-composer" data-keyboard={shown ? 'math' : 'hidden'} data-symbols={shown && Boolean(notation[view]) || undefined}>
    {props.value.includes('$') && !props.ink && <div className="composer-preview"><MathText source={tutorAnswerParts(props.value).map(part=>part.type==='text'?part.text:' ').join('')}/></div>}
    {answerError && <p className="composer-status" role="alert">{answerError}</p>}
    {recoveryIssue && <div className="composer-status" role={recoveryIssue==='loading'?'status':'alert'}>
      {inkIssueText[recoveryIssue]}
      {props.ink && (recoveryIssue==='failed'||recoveryIssue==='missing') &&
        <Button small type="button" onClick={props.ink.retry}>Retry restoring images</Button>}
      {props.ink && imageIssue==='failed' && !imageReferences.length && !editingDisabled && props.value.trim() &&
        <Button small type="button" onClick={()=>{props.ink?.continueWithText();setScratch(false);}}>Continue with text</Button>}
      {!props.ink && imageIssue==='unavailable' && !editingDisabled &&
        <Button small type="button" onClick={()=>change(padEdit(removeTutorImageReferences(props.value)))}>Remove image references</Button>}
    </div>}
    {/* N227 (Owner: "extremely annoying text that comes in a way an actual tutor question"): a small pill by the answer,
        not a line in the conversation's type, and a tap reopens the drawing to insert or discard it. */}
    {!scratch && uncommitted && <div className="composer-pill" role="status">
      <span>Unfinished drawing</span>
      <button type="button" disabled={editingDisabled || props.ink?.draft.queuedText !== undefined} onPointerDown={keepSelection}
        onClick={() => {haptic('snap'); selectSurface('scratch');}}>Open</button>
    </div>}
    {incomplete && <p className="composer-status" role="status">Fill each □ before sending.</p>}
    <form className="composer" onSubmit={event => {event.preventDefault(); send();}}>
      <div className="writing-composer-card" data-can-swipe={Boolean(writingGhost) || undefined}
        onPointerDownCapture={beginSwipe} onPointerMove={moveSwipe} onPointerUp={endSwipe} onPointerCancel={stopSwipe}
        onLostPointerCapture={event => {if (event.target === event.currentTarget && swipe.current) stopSwipe();}}>
      <div className="field">
        {/* N227 (Owner: "remove the pencil icon from the input box"): the scratch pad opens from the strip's pencil. */}
        {props.ink && <IconButton label="Keep keyboard open" type="button" aria-pressed={pinned} disabled={editingDisabled}
          onPointerDown={keepSelection} onClick={pinKeys}><Keyboard aria-hidden="true"/></IconButton>}
        {!props.ink && <IconButton label="Keys" type="button" aria-pressed={shown} disabled={editingDisabled} onPointerDown={keepSelection}
              onClick={()=>{if(shown){assist.pause();setShown(false);}else keys();}}><Keyboard aria-hidden="true"/></IconButton>}
        {props.ink ? <TutorAnswerEditor editor={richField} value={props.value} images={props.ink.draft.photos}
          placeholder={props.pending ? 'Draft your next answer…' : 'Write your answer…'} readOnly={readOnly}
          composing={composing} ghost={ghostSuffix} marked={writingEdit ? {start: writingEdit.start, end: writingEdit.end} : undefined} onSelection={remember} onChip={chipAction} onMath={openEquation} onFocus={event=>{
            if (event.target === event.currentTarget) focusAnswer();
          }} onKeyDown={keyDown}
          onPointerDown={event=>{if (event.target === event.currentTarget && !readOnly) setShown(true);}}
          onCompositionStart={event=>beginComposition(event.currentTarget)}
          onCompositionEnd={event=>{
            composition.current = false;
            inputChanged(event.currentTarget);
            setCompositionText(null);
          }}
          onInput={event=>inputChanged(event.currentTarget, (event.nativeEvent as InputEvent).inputType === 'insertText')}
          onCopy={event=>copyAnswer(event)}
          onCut={event=>copyAnswer(event, true)}
          onPaste={pasteAnswer}
          onDrop={event=>event.preventDefault()}
        /> : <div className="writing-editor-wrap">{(ghostSuffix || writingEdit) && <div className="writing-editor-mirror" aria-hidden="true">
          <span>{writingEdit ? <>{props.value.slice(0, writingEdit.start)}<span data-writing-aid-source="">{props.value.slice(writingEdit.start, writingEdit.end)}</span>{props.value.slice(writingEdit.end)}</> : props.value}</span>{ghostSuffix}
        </div>}<textarea ref={field} aria-label="Your answer" placeholder={props.pending ? 'Draft your next answer…' : 'Write your answer…'}
          inputMode="none" rows={1} maxLength={MAX_ANSWER_LENGTH} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          value={compositionText ?? props.value} readOnly={readOnly} onSelect={remember} onClick={remember} onFocus={focusAnswer}
          onPointerDown={() => {
            if (!shown && !readOnly) {
              setShown(true);
            }
          }}
          onCompositionStart={event=>beginComposition(event.currentTarget)}
          onCompositionEnd={event => {
            composition.current = false;
            commit(changePadText(history.current, fieldSelection(event.currentTarget)), false, false, false, true);
            setCompositionText(null);
          }}
          onChange={event => {
            const edit = fieldSelection(event.currentTarget);
            if (composition.current) setCompositionText(edit.text);
            else commit(changePadText(history.current, edit), false, false, false, (event.nativeEvent as InputEvent).inputType === 'insertText');
          }}
          onScroll={event => {const mirror = event.currentTarget.previousElementSibling; if (mirror) mirror.scrollTop = event.currentTarget.scrollTop;}}
          onPaste={event => {
            event.preventDefault();
            if (editingDisabled) return;
            remember();
            const text = clipboardPlain(event.clipboardData.getData('text/plain')).replace(/\r\n?/g, '\n');
            if (text) change(insertNotation(history.current.present, text));
          }}
          onDrop={event => event.preventDefault()}
          onKeyDown={keyDown}/></div>}
        <IconButton label="Edit answer" type="button" aria-haspopup="dialog" onPointerDown={keepSelection} onClick={()=>{assist.pause();setMenuRefreshable(refreshable);setEditMenu(true);}}><Ellipsis aria-hidden="true"/></IconButton>
        <IconButton label={queue?'Queue answer':'Send'} data-tutor-send="" type="submit" disabled={blocked || !props.value.trim()&&!hasImage}
          onPointerDown={keepSelection}><ArrowUp aria-hidden="true"/></IconButton>
      </div>
      </div>
    </form>
    <Sheet open={editMenu} onClose={()=>setEditMenu(false)} title="Answer actions">
      <div className="tutor-session-actions">
        {isFlagOn('writingAidSettings') && <Button onClick={() => {setEditMenu(false); setAidSettings(true);}}><SlidersHorizontal aria-hidden="true"/>Writing assistance</Button>}
        {menuRefreshable && <Button disabled={editingDisabled} onClick={() => {
          setEditMenu(false);
          if (refreshAfterMenu.current) clearTimeout(refreshAfterMenu.current);
          refreshAfterMenu.current = setTimeout(() => {refreshAfterMenu.current = null;}, 2000);
        }}>
          <RefreshCw aria-hidden="true"/>Refresh suggestions</Button>}
        <Button disabled={!props.canSend||editingDisabled} onClick={()=>{setEditMenu(false);props.onAsk('hint');}}>
          <HelpCircle aria-hidden="true"/>Hint {Math.max(1,Math.min(4,props.hintLevel??1))}/4
        </Button>
        <Button disabled={!props.canSend||editingDisabled} onClick={()=>{setEditMenu(false);props.onAsk('stuck');}}><ArrowDown aria-hidden="true"/>Stuck</Button>
        {!props.pending&&<Button disabled={!props.canSend||editingDisabled} onClick={()=>{setEditMenu(false);props.onAsk('notation');}}>
          <HelpCircle aria-hidden="true"/>Ask about notation
        </Button>}
        {props.ink&&<Button disabled={editingDisabled || props.ink.draft.queuedText!==undefined} onClick={()=>{assist.stop();drawingSelection.current=history.current.present;setEditMenu(false);setPhoto(true);}}><Camera aria-hidden="true"/>Photo</Button>}
        <Button disabled={inkDraft?.queuedText!==undefined} onClick={()=>{setEditMenu(false);props.onContext();}}><Paperclip aria-hidden="true"/>Context</Button>
        <Button disabled={!history.current.past.length||editingDisabled} onClick={()=>{setEditMenu(false);undo();}}><Undo2 aria-hidden="true"/>Undo typing</Button>
        <Button disabled={!history.current.future.length||editingDisabled} onClick={()=>{setEditMenu(false);undo(true);}}><Redo2 aria-hidden="true"/>Redo typing</Button>
      </div>
    </Sheet>
    {/* N221 (Owner): an equation in the answer is edited here: its rendering updates as the LaTeX changes. */}
    <Sheet open={Boolean(equationEdit)} onClose={closeEquation} title="Equation">
      {equationEdit && <div className="tutor-equation-edit">
        <div className="tutor-equation-preview" aria-label="Preview"><MathText source={equationEdit.tex.trim() ? '$' + equationEdit.tex + '$' : ''}/></div>
        <label className="tutor-equation-latex">LaTeX
          <textarea rows={2} value={equationEdit.tex} spellCheck={false} autoCapitalize="off" autoCorrect="off"
            onChange={event => setEquationEdit({...equationEdit, tex: event.target.value})}/>
        </label>
        <div className="tutor-session-actions">
          <Button variant="primary" onClick={() => saveEquation(equationEdit.tex)}>Done</Button>
          <Button onClick={() => {
            const target = equationEdit;
            setEquationEdit(null);
            selectSurface('equation');
            setWriteReplace({source: target.source, offset: target.offset});
          }}><Signature aria-hidden="true"/>Write by hand</Button>
          <Button onClick={() => saveEquation('')}><X aria-hidden="true"/>Remove</Button>
        </div>
      </div>}
    </Sheet>
    <Sheet open={aidSettings} onClose={() => setAidSettings(false)} title="Writing assistance"><WritingAidSettings showTitle={false}/></Sheet>
    {props.ink&&<TutorInkTray ink={props.ink} shown={scratch} photoOpen={photo} onClosePhoto={()=>setPhoto(false)}
      editingImageId={editingImageId} canMigrate={!readOnly} onInsertEquation={insertEquation}
      leading={<IconButton label="Keys" type="button" onPointerDown={keepSelection} onClick={()=>{haptic('snap');selectSurface('keys');}}><Keyboard aria-hidden="true"/></IconButton>} answerLength={props.value.length} canInsertImage={canInsertImage} referencedImageIds={refs} onInsertImage={insertImage} onMigrateImages={migrateImages} onCloseDrawing={closeDrawing}/>}
    {shown ? <div className="kb" data-v7-keyboard="" role="group" aria-label="Answer keyboard" data-decoder={decoderReady ? 'ready' : undefined}
      data-surface={surface}>
      {surface === 'equation' ? <>
        <TutorEquationPanel disabled={editingDisabled} replacing={writeReplace?.source} leading={keysButton} trailing={equationButton}
          symbols={{enabled: inputPrefs.recognition, ids: [...new Set([...assist.recognized, ...assist.completions])], actionable: assist.actionable,
            onInk: readSymbol}}
          onInsert={insertEquation} onInsertSymbol={insertSymbolChip}/>
        {hideButton('sbtn kb-band-hide')}</>
      : assist.drawing ? <><TutorInkPad enabled={inputPrefs.recognition} strokes={assist.snapshot?.strokes??[]}
        readiness={assist.readiness} recognized={assist.recognized} completions={assist.completions} actionable={assist.actionable}
        keepDrawing={assist.keepDrawing} overBudget={assist.snapshot?.overBudget??false} error={assist.error} onBegin={assist.onBegin} onMove={assist.onMove} onEnd={assist.onEnd}
        onInterrupt={assist.onInterrupt} onUndo={assist.onUndo} onClear={assist.onClear} onClose={()=>{
          assist.stop();fieldElement()?.focus({preventScroll:true});selectField(history.current.present);
        }}
        onBrowse={assist.openPicker} onKeepDrawing={assist.onKeepDrawing} onLockAutomatic={assist.lockAutomatic} onPressCandidate={assist.pressCandidate} onReleaseCandidate={assist.releaseCandidate}
        onAccept={assist.onAccept}/>{hideButton('sbtn kb-band-hide')}</>
      : <><div className="strip" data-words="" data-slots={slots} data-review={reviewChoice || undefined}>
        {/* N220 (Owner report): the one-tap maths symbols and Next □ sit in the suggestion strip, so the bottom row keeps
            Gboard's wide space bar. N223 (Owner: the pencil at the left edge, "the symbols suggested should live inside
            the suggestion strip", no useless symbols beside the next words): Gboard's frame in every state, Draw symbol
            at the left and Equation mode at the right, the slots between them for one kind of suggestion at a time. */}
        {/* N227 (Owner): with the scratch pad, the strip's pencil opens it (Draw symbol lives on in equation mode). */}
        {props.ink ? scratchButton : incomplete ? nextSlotButton : drawButton}
        {slots === 'equation' && <div className="sugg equation-words" role="group" aria-label="Equation suggestions">
          {/* Best in the middle, as the words and symbols (and Gboard). */}
          {[equationReadings[1], equationReadings[0], equationReadings[2]].map((reading, index) => reading
            ? <button key={reading.latex} type="button" className={index === 1 ? 'preferred' : undefined}
              aria-label={'Insert equation ' + reading.latex} title={reading.label} disabled={editingDisabled} onPointerDown={keepSelection}
              onClick={() => acceptTypedEquation(reading.latex)}><MathText source={'$' + reading.latex + '$'}/></button>
            : <button key={'empty' + index} type="button" disabled aria-label="No suggestion"><span aria-hidden="true" className="writing-aid-empty">·</span></button>)}
        </div>}
        {symbolSlots.length > 0 && <SymbolWords options={symbolSlots} disabled={editingDisabled} onAccept={acceptSymbol}/>}
        <WritingAidWords words={writingWords} disabled={editingDisabled} onAccept={acceptWriting} hidden={slots !== 'words'}/>
        {slots === 'quick' && <div className="sugg tutor-quick-math" role="group" aria-label="Quick math symbols">
          {['∀', '∈', ...(props.ink && incomplete ? [] : ['⇒'])].map(symbol => <button key={symbol} type="button" className="qsym" aria-label={symbol}
            disabled={editingDisabled} onPointerDown={keepSelection} onClick={() => {haptic('key'); insert(symbol);}}>{symbol}</button>)}
          {props.ink && incomplete && nextSlotButton}
        </div>}
        {equationButton}
        {hideButton('sbtn')}
        {!scratch && <WritingAidBar words={writingWords} edit={shownEdit} ghost={writingGhost}
          disabled={editingDisabled} undoable={suggestionUndoable} swipeProgress={swipeProgress} exhausted={aidExhausted}
          onAccept={acceptWriting} onUndo={undoWriting} onDismiss={dismissWriting}
          onRefresh={(surface, displayed) => {writing.refresh(surface, displayed); haptic('snap');}}/>}
      </div>
      <TutorKeyboard view={view} lastMath={lastMath} onView={changeView} disabled={editingDisabled} onInsert={insert}
        wordBefore={() => {const present = history.current.present; return /[A-Za-z]+$/.exec(present.text.slice(0, present.start))?.[0] ?? '';}}
        onBrowse={()=>{remember();assist.openPicker();}}
        onDelete={deleteBackward}
        onMove={(direction, count) => {
          remember();
          let edit = history.current.present;
          const ranges = imageRanges(edit.text);
          for (let step = 0; step < count; step++) {
            edit = movePadCaret(edit, direction);
            const image = ranges.find(item => item.start < edit.start && edit.start < item.end);
            if (image) edit = padEdit(edit.text, direction === 'left' ? image.start : image.end);
          }
          change(edit, true);
        }}/>{hideButton('sbtn kb-band-hide')}</>}
    </div> : null}
    {assist.picker && <TutorSymbolPicker recent={assist.recent} onPick={assist.onPick} onClose={assist.closePicker} error={assist.error}/>}
  </div>;
}
