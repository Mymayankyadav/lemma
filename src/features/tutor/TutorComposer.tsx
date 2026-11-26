import {actionFeatures, actionMenuScore, menuFeatures, menuScore, type MenuSource, type WordTrace} from './writingAid/menuRanking';
import {currentMenuTrial} from './writingAid/menuTrial';
import {applyMenuEdit, learnerAuthored, type MenuEdit} from './writingAid/menuEdit';
import {startTransition, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type ComponentProps, type KeyboardEvent, type PointerEvent} from 'react';
import {createPortal} from 'react-dom';
import {ArrowDown, ArrowUp, ChevronDown, Eye, EyeOff, HelpCircle, Keyboard, MoveRight, Paperclip, PenLine, Radical, Undo2, Redo2, SlidersHorizontal, RefreshCw, Signature, X} from 'lucide-react';
import {isFlagOn} from '../../flags';
import {needsTutorInkMigration,TutorInkTray,type TutorInkState} from './TutorInk';
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
import {imageReference, readTutorAcceptedSpans, referencedImageIds, tutorAnswerParts, type TutorAcceptedSpan} from '../../../supabase/functions/_shared/tutor-answer';
import {readTutorAnswer, renderTutorAnswer, setTutorAnswerSelection, TutorAnswerEditor} from './TutorAnswerEditor';
import {TutorKeyboard, type KeyboardInk} from './TutorKeyboard';
import {useKeyboardLayout} from './keyboardLayout';
import {KeyInkWords} from './input/latentInk/KeyInkWords';
import {useKeyInk, type FlushResult, type KeyEdit} from './input/latentInk/useKeyInk';
import {editBetween, mapSpan, type TextEdit} from './input/latentInk/rebase';
import type {SymbolDefinition} from './input/symbolCatalog';
import {TutorInkPad} from './input/TutorInkPad';
import {TutorSymbolPicker} from './input/TutorSymbolPicker';
import {insertTutorSymbol, symbolLatex, tutorMathContext} from './input/symbolEdit';
import {symbolByGlyph} from './input/symbolCatalog';
import {useTutorInputAssist} from './input/useTutorInputAssist';
import {useTutorInputPreferences} from './input/inputPreferences';
import {sameEditTarget} from './input/recognitionPolicy';
import type {EditTarget} from './input/types';
import {useWritingAid, useWritingAidPreferences, WritingAidSettings, advanceWritingAidAnchor, continueWritingAidAnchor, applyWritingAidProposal, type WritingAidAnchor, type WritingAidProposal} from './writingAid';
import {LatexWords, SymbolWords, WritingAidBar, WritingAidWords} from './WritingAidBar';
import {unfinishedMath} from './writingAid/latexGrammar';
import {useLatexSuggestions} from './writingAid/useLatexSuggestions';
import {currentTypeaheadArm, typeaheadGraphTrial, typeaheadPhraseGhostMode, typeaheadReplayEnabled, usesTutorBias} from './writingAid/replayArm';
import {tutorHint} from './writingAid/answerAids';
import {ACCEPTED_SPAN_LIMIT, addAuthoredSpan, moveAcceptedSpans} from './writingAid/authorship';
import {insertionEligible} from './writingAid/eligibility';
import {offerFamilies} from './writingAid/offerFamilies';
import {canSuggestWritingAid, eligibleGhostContext, eligibleNeuralContext, proposalEdit, writingAidProposalKey} from './writingAid/policy';
import {effectiveAidLevel, type AidRole, type TutorAnswerAid} from '../../../supabase/functions/_shared/tutor-answer-aids';
import {typedEquationAt} from './input/typedEquation';
import {useAutoeqReadings} from './input/useAutoeqReadings';
import {latexSymbolOptions} from './input/latexShortcuts';
import {latexCommandInsertion} from './input/latexCommand';
import {applyEquationOrigins, equationFences, equationOrigins, equationSurroundings} from './writingAid/equationAuthorship';
import {EquationLatexField} from './input/EquationLatexField';
import {TutorEquationPanel} from './input/TutorEquationPanel';
import {INK_VIEWPORT} from './input/TutorInkPad';
import {resampleInkPath} from './input/inkGeometry';
import {PAD_PAPER, type PadStrokes} from '../../ui/v7/ink/ink';
import {clearKeyTouches, decoderSymbols, prepareTypeahead, prepareWritingDecoder, recordKeyTouch, writingDecoderReady, type KeyTouch} from './writingAid/decoder/ngramSpatial';
import './keyboard.css';
import './input/input.css';
import './writing-aid.css';

const keepSelection = (event: PointerEvent) => event.preventDefault();
const ANSWER_CLIPBOARD = 'application/x-lemma-tutor-answer';
const MAX_ANSWER_LENGTH = 2000;
const EMPTY_WRITING_WORDS: readonly WritingAidProposal[] = Object.freeze([]);
const EMPTY_IMAGE_IDS: readonly string[] = Object.freeze([]);
const IMAGE_REFERENCE_LENGTH = imageReference('00000000-0000-0000-0000-000000000000').length;

export function keepsKeyboardOpenFor(target: Element) {
  return target.closest('dialog,[role="dialog"],[data-tutor-session-actions]') !== null;
}

interface Props {
  value: string;
  onChange: (text: string, acceptedSpans?: readonly TutorAcceptedSpan[], persistImmediately?: boolean) => void;
  acceptedSpans?: readonly TutorAcceptedSpan[];
  onSend: (text: string, acceptedSpans?: readonly TutorAcceptedSpan[]) => void;
  onAsk: (kind: 'hint' | 'stuck' | 'notation') => void;
  hintLevel?: number;
  canSend: boolean;
  readOnly: boolean;
  pending: boolean;
  onContext: () => void;
  hasContext: boolean;
  headerHidden?: boolean;
  onToggleHeader?: () => void;
  sessionActionsOpen: boolean;
  onCloseActions: () => void;
  answerActions: HTMLElement | null;
  notationContext?: readonly string[];
  aidSubject?: string;
  aidStep?: string;
  aidTurnId?: string;
  /** N234: the tutor's answer aids for this answer (behind tutorAnswerAids), and how well the learner knows the concept (0 to 1). */
  answerAid?: TutorAnswerAid;
  mastery?: number;
  ink?: TutorInkState;
  canQueueImage?: boolean;
  inputScopeKey?: string;
  suspended?: boolean;
}

/** N221: where the learner writes: the keys, Draw symbol, equation mode or the scratch pad. */
type Surface = 'keys' | 'symbol' | 'equation' | 'scratch';

export function TutorComposer(props: Props) {
  const editMenu = props.sessionActionsOpen;
  const field = useRef<HTMLTextAreaElement>(null);
  const richField = useRef<HTMLDivElement>(null);
  const fieldElement = () => richField.current ?? field.current;
  const drawingSelection = useRef<PadEdit | null>(null);
  const drawingOccurrence = useRef<number | null>(null);
  const focusAfterSymbol = useRef(false);
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [scratch,setScratch]=useState(false);
  const [answerError,setAnswerError]=useState('');
  const [photoActions, setPhotoActions] = useState<HTMLDivElement | null>(null);
  const pendingDrawingTap = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(pendingDrawingTap.current), []);
  const [shown, setShown] = useState(false);
  /** N227 (Owner): the keyboard icon in the answer box keeps the keys up and the answer selected while the chat scrolls. */
  const [pinned, setPinned] = useState(false);
  // N252: iPadOS's keyboard on an iPad, Gboard's everywhere else.
  const keyboardLayout = useKeyboardLayout();
  const composerRoot = useRef<HTMLDivElement>(null);
  const [view, setView] = useState('abc');
  const [lastMath, setLastMath] = useState('∀∃');
  const composition = useRef(false);
  const [compositionText, setCompositionText] = useState<string | null>(null);
  const composing = compositionText !== null;
  const history = useRef(createPadTextHistory(padEdit(props.value)));
  const [initialSpans] = useState(() => new WeakMap<PadEdit, readonly TutorAcceptedSpan[]>([
    [history.current.present, readTutorAcceptedSpans(props.value, props.acceptedSpans)],
  ]));
  const acceptedSpans = useRef(initialSpans);
  const [cursor, setCursor] = useState(history.current.present);
  /**
   * N232: the composer owns the text being typed. `cursor.text` is the live draft, painted at once; the page above is told in a
   * transition (below), so a tap never waits for the transcript to re-render. `emitted` remembers what the page has been
   * told but may not have rendered yet, so a late render of an older value is not mistaken for an outside change.
   */
  const value = cursor.text;
  const provenanceFull = (acceptedSpans.current.get(history.current.present)?.length ?? 0) >= ACCEPTED_SPAN_LIMIT;
  const emitted = useRef<string[]>([]);
  const lastProp = useRef(props.value);
  const [mountId] = useState(()=>crypto.randomUUID());
  const revision = useRef({editorRevision:0,selectionRevision:0,modeRevision:0});
  const phraseEdit = useRef<{at: number; editor: number; selection: number; mode: number} | undefined>(undefined);
  const pressedPhrase = useRef<WritingAidProposal | null>(null);
  const pendingSelection = useRef<PadEdit | null>(history.current.present);
  const authoredAnchor = useRef<WritingAidAnchor | null>(null);
  const acceptedSuggestion = useRef<{before: PadTextHistory; after: PadEdit; proposal: WritingAidProposal} | null>(null);
  const [hideSuggestionUndo, setHideSuggestionUndo] = useState(false);
  const decoderSeen = useRef(false);
  const [decoderReady, setDecoderReady] = useState(writingDecoderReady);
  const shownSuggestions = useRef(0);
  const writingReview = useRef<HTMLDivElement>(null);
  const swipe = useRef<{pointer: number; x: number; y: number; time: number; proposal: WritingAidProposal; cursor: PadEdit} | null>(null);
  const scopeKey = props.inputScopeKey ?? 'tutor-preview';
  const sheetScope = scopeKey + '|' + authGeneration();
  const [settingsScope, setSettingsScope] = useState<string | null>(null);
  /** N221: the equation chip being edited: its $…$ source at `offset`, and the LaTeX in the sheet. */
  const [equationDraft, setEquationEdit] = useState<{scope: string; source: string; offset: number; tex: string; acceptedSpans: readonly TutorAcceptedSpan[]; remainingSlots: number; error?: string} | null>(null);
  const aidSettings = !props.suspended && settingsScope === sheetScope;
  const equationEdit = !props.suspended && equationDraft?.scope === sheetScope ? equationDraft : null;
  useLayoutEffect(() => {
    setSettingsScope(scope => !props.suspended && scope === sheetScope ? scope : null);
    setEquationEdit(draft => !props.suspended && draft?.scope === sheetScope ? draft : null);
  }, [props.suspended, sheetScope]);
  /** N221 (Owner): equation mode, where the keys give way to paper; `writeReplace` is the equation it will replace, if any. */
  const [equationMode, setEquationMode] = useState(false);
  const [writeReplace, setWriteReplace] = useState<{source: string; offset: number} | null>(null);
  /** Where the caret was when equation mode or Draw symbol opened: insertions go there, not where focus happens to land. */
  const surfaceSelection = useRef<PadEdit | null>(null);
  const [dismissedAid, setDismissedAid] = useState<string | null>(null);
  const rejectedEdits = useRef(new Set<string>());
  const writingPrefs = useWritingAidPreferences();
  const [phraseGhostTrial] = useState(typeaheadPhraseGhostMode);
  const incomplete = value.includes('□');
  const images = props.ink?.draft.photos;
  const availableIds = useMemo(() => new Set(images?.map(image => image.id.toLowerCase())), [images]);
  const previousIds = useRef(availableIds);
  const imageReferences = useMemo(() => referencedImageIds(value), [value]);
  const refs = useMemo(() => imageReferences.length ? imageReferences.filter(id => availableIds.has(id)) : EMPTY_IMAGE_IDS,
    [imageReferences, availableIds]);
  const hasImage = refs.length > 0;
  const imageTarget = drawingSelection.current?.text === value ? drawingSelection.current : cursor;
  const canInsertImage = value.length - (imageTarget.end - imageTarget.start) + IMAGE_REFERENCE_LENGTH <= MAX_ANSWER_LENGTH;
  const inkDraft = props.ink?.draft;
  // Legacy recovery retries after the draft is shortened. Other ink controls only need insertion capacity.
  const migrationAnswerLength = needsTutorInkMigration(inkDraft) ? value.length : 0;
  const readOnly = props.readOnly || inkDraft?.queuedText !== undefined;
  const imageIssue = tutorInkIssue(value, props.ink);
  const recoveryIssue = imageIssue ?? (props.ink?.status === 'failed' ? 'failed' : undefined);
  const unfinishedId = inkDraft?.editingDrawing && refs.includes(inkDraft.editingDrawing.id) ? inkDraft.editingDrawing.id : null;
  const unfinished = props.ink?.ready && Boolean(inkDraft?.strokes.length || unfinishedId);
  const uncommitted = unfinished && (inkDraft?.inlineImages || hasImage);
  const queue=props.canQueueImage&&hasImage;
  // N228: while the tutor has not replied, a message joins the waiting question as text; pictures wait for the reply.
  const followUp = props.pending && props.canSend;
  const blocked = readOnly || !queue&&!props.canSend || incomplete || composing || scratch || uncommitted || Boolean(imageIssue);
  const editingDisabled = readOnly || composing;
  const inputPrefs = useTutorInputPreferences();
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
  /** N249 (Owner): one symbol drawn over the keys; its readings take the strip's slots (useKeyInk). */
  const inkInsert = useRef<{before: PadEdit; after: PadEdit} | null>(null);
  /** The answer and selection a drawing began on: its symbol goes in only while they are unchanged. */
  const inkTarget = useRef<EditTarget | null>(null);
  /** The ranges the last settled drawing and its queued keys replaced, in order. */
  const flushedEdits = useRef<TextEdit[]>([]);
  const keyInkEnabled = isFlagOn('tutorKeyInk');
  const keyInk = useKeyInk(keyInkEnabled && shown && !props.suspended && !scratch && !equationMode && !assist.drawing && !editingDisabled,
    {onBegin: beginInk, onFlush: flushInk, onKeyEdit: applyKeyEdit, onReplace: replaceInkSymbol, onRetract: retractInkSymbol});
  const inkSlots = keyInk.view.kind !== 'idle';
  const forgetInkInsert = keyInk.forgetInsert, invalidateInk = keyInk.invalidate;
  // Any other change to the answer ends the one-tap replace of the symbol drawn last, and a change to the answer or
  // its selection under a drawing being read drops that drawing (it cannot go in where it began).
  useEffect(() => {
    const last = inkInsert.current;
    if (last && (cursor.text !== last.after.text || cursor.start !== last.after.start || cursor.end !== last.after.end)) {
      inkInsert.current = null; forgetInkInsert();
    }
    if (inkTarget.current && !sameInkTarget(inkTarget.current, editTarget())) {inkTarget.current = null; invalidateInk();}
  // eslint-disable-next-line react-hooks/exhaustive-deps -- editTarget reads refs; the cursor is what changes with them
  }, [cursor, forgetInkInsert, invalidateInk]);


  const enhancedMenu = isFlagOn('typeaheadV2') || writingPrefs.fasterTyping;
  const menuTrial = currentMenuTrial(enhancedMenu, writingPrefs.fasterTyping);
  const arm = currentTypeaheadArm();
  const replayDiagnostics = typeaheadReplayEnabled();
  const tracePool = replayDiagnostics && new URLSearchParams(window.location.search).get('typeahead-trace') !== '0';
  const activeAid = isFlagOn('tutorAnswerAids') ? props.answerAid : undefined;
  const aid = useMemo(() => !activeAid?.ranking || usesTutorBias(arm) ? activeAid :
    {...activeAid, ranking: {...activeAid.ranking, hints: activeAid.ranking.hints?.map(hint => ({...hint, priority: 'neutral' as const}))}},
  [activeAid, arm]);
  const aidLevel = aid ? effectiveAidLevel(aid.level, props.mastery) : undefined;
  const notationKey = useMemo(() => JSON.stringify(props.notationContext ?? []), [props.notationContext]);
  const aidContextKey = [props.aidTurnId, aid?.turnId, aid?.id, aid?.version, aid?.grantId, aidLevel, props.aidSubject, props.aidStep, arm,
    enhancedMenu, writingPrefs.fasterTyping, notationKey, ...(menuTrial ? [menuTrial] : [])].join('|');
  const aidSignature = JSON.stringify([scopeKey, writingPrefs.scopeKey, writingPrefs.mode, aidContextKey, revision.current, cursor]);
  const question = useMemo(() => JSON.parse(notationKey) as string[], [notationKey]);
  const phraseGhost = writingPrefs.phraseGhostAllowed ? phraseGhostTrial : undefined;
  const editClock = phraseEdit.current;
  const phraseGhostStartedAt = phraseGhost && editClock?.editor === revision.current.editorRevision &&
    editClock.selection === revision.current.selectionRevision && editClock.mode === revision.current.modeRevision ? editClock.at : undefined;
  const phraseUncovered = !inkSlots && !editMenu && !equationMode && !equationEdit && !assist.picker && view === 'abc' && dismissedAid !== aidSignature;
  const writingRequest = {cursor, acceptedSpans: acceptedSpans.current.get(cursor), arm, replayDiagnostics, tracePool, contextKey: aidContextKey, aid, mastery: props.mastery,
    phraseGhost, phraseGhostStartedAt,
    menuTrial,
    expanded: enhancedMenu, fasterTyping: writingPrefs.fasterTyping, middleEdits: enhancedMenu,
    subject: props.aidSubject, step: props.aidStep, question, anchor: authoredAnchor.current, target: editTarget(), mode: writingPrefs.mode,
    surfaces: phraseGhost ? {...writingPrefs.surfaces, ghost: phraseUncovered} : writingPrefs.surfaces,
    composing, readOnly: readOnly || scratch || assist.drawing || aidSettings || !shown || props.suspended || provenanceFull};
  const writing = useWritingAid(writingRequest);
  const aidVisible = dismissedAid !== aidSignature && !editingDisabled && !inkSlots;
  const writingWords = aidVisible ? writing.words : EMPTY_WRITING_WORDS;
  const rankedWritingWords = aidVisible && enhancedMenu ? writing.rankedWords : EMPTY_WRITING_WORDS;
  const rejectionKey = (proposal: WritingAidProposal) => JSON.stringify([proposal.start, proposal.end, proposal.before, proposal.insert]);
  const writingEdit = aidVisible && writing.edit && !rejectedEdits.current.has(rejectionKey(writing.edit)) ? writing.edit : null;
  const writingGhost = aidVisible ? writing.ghost : null;
  const phrasePreview = writingGhost?.source === 'phrase' ? writingGhost : null;
  const stripGhost = phrasePreview ? null : writingGhost;
  const ghostSuffix = writingGhost?.insert;
  const suggestionUndoable = !hideSuggestionUndo && Boolean(acceptedSuggestion.current && acceptedSuggestion.current.after.text === cursor.text);
  const refreshable = writingWords.length > 0 || Boolean(writingEdit || writingGhost);
  /** With a word in progress, a review of an earlier word yields to current completions. */
  const wordInProgress = cursor.start === cursor.end && /[A-Za-z]$/.test(cursor.text.slice(0, cursor.start)) && writingWords.length > 0;
  shownSuggestions.current = writingWords.length + Number(Boolean(writingEdit || writingGhost || suggestionUndoable));
  // N221 (Owner): the writing aid's replacement or continuation takes the strip as Gboard shows a correction: for the
  // word at the caret, for a continuation, or at a word boundary. While a new word is typed with its own suggestions,
  // a fix for an earlier word steps aside (the answer still marks it) and returns at the next space. It leaves when
  // tapped, dismissed with ✕, or when the text no longer has it. Undo is a small key at the strip's left edge.
  const aidExhausted = aidVisible && (writing.exhausted.edit || writing.exhausted.ghost);
  const shownEdit = writingEdit && (writingEdit.end === cursor.end || !wordInProgress) ? writingEdit : null;
  const reviewChoice = Boolean(shownEdit || stripGhost || aidExhausted) && !suggestionUndoable;
  const review = reviewChoice || suggestionUndoable;
  const mathContext = useMemo(() => tutorMathContext(cursor), [cursor]);
  const mathKeys = view !== 'abc' || mathContext === 'tex';
  const symbolOptions = useMemo(() => writingPrefs.mode === 'off' || !shown ? [] : latexSymbolOptions(cursor, 3, mathKeys),
    [cursor, writingPrefs.mode, shown, mathKeys]);
  // N223 (Owner: "integrate all this in one hood"): an equation just typed in prose (x1 + x2 = 4) is read by N222's
  // autoeq, its rules and then its on-device model, ordered by the words before it.
  const typedEquation = useMemo(() => shown && !scratch && writingPrefs.mode !== 'off' ? typedEquationAt(cursor) : null,
    [cursor, shown, scratch, writingPrefs.mode]);
  const equationReadings = useAutoeqReadings(typedEquation?.text ?? '', typedEquation?.context ?? '').readings.slice(0, 3);
  /**
   * One strip, one frame: Draw symbol (or Next □) at the left edge, Equation mode at the right, and three slots between
   * them that show the first of: autoeq's readings of a typed equation; the symbols for a LaTeX command, short form or
   * name (\al, ->, eps); or word suggestions. Quick symbols belong on the math or number layouts and inside LaTeX.
   */
  const mathSpan = useMemo(() => shown && !scratch && !equationEdit && writingPrefs.mode !== 'off' &&
    !editingDisabled && enhancedMenu ? unfinishedMath(cursor) : null,
  [cursor, shown, scratch, equationEdit, writingPrefs.mode, editingDisabled, enhancedMenu]);
  const latexBefore = mathSpan ? cursor.text.slice(0, mathSpan.start) : '';
  const {items: latexOptions, assetSha256: latexAssetSha256} = useLatexSuggestions(mathSpan ? {math: mathSpan.math, typed: mathSpan.typed, before: latexBefore,
    after: cursor.text.slice(mathSpan.end), knownSymbols: decoderSymbols(latexBefore, question)} : undefined, 64,
  {declarations: aidLevel === 'none' ? undefined : aid?.ranking?.declaredSymbols});
  type MenuEntry = {key: string; slotKey: string; score: number; base: number; features: number[]; label: string; title?: string; display?: string; math?: string; word?: WritingAidProposal;
    trialFeatures?: number[]; neutralScore?: number; tutorAdjustment?: number;
    edit: MenuEdit; replacement?: {start: number; end: number; insert: string; equation: boolean; role?: AidRole}};
  const entries: MenuEntry[] = [];
  const notationTrace: WordTrace[] | undefined = tracePool ? [] : undefined;
  const offeredTarget = writingRequest.target;
  const liveMenu = useRef<{key: string; target: EditTarget; entries: readonly MenuEntry[]}>({key: '', target: offeredTarget, entries: []});
  const pressedOffer = useRef<{key: string; epoch: string} | null>(null);
  const slotHistory = useRef<{epoch: string; entries: readonly MenuEntry[]}>({epoch: '', entries: []});
  const mode = mathContext === 'prose' ? 'prose' : 'equation';
  const stableScope = [scopeKey, mountId, aidContextKey, writingPrefs.mode, shown, editingDisabled].join('|');
  const prior = slotHistory.current.epoch === stableScope ? slotHistory.current.entries : [];
  const priorKeys = menuTrial ? new Set(prior.map(entry => entry.slotKey)) : undefined;
  const tutorGroup = menuTrial ? JSON.stringify([props.aidSubject ?? '', props.aidStep ?? '', mode]) : '';
  function scoring(source: MenuSource, base: number, adjustment: number, edit: MenuEdit, slotKey: string,
    word?: WritingAidProposal) {
    const features = menuFeatures(source, base, edit.end - edit.start, edit.insert.length);
    if (!menuTrial) return {base, features, score: menuScore(base, adjustment, features, writing.assetHashes.ngram)};
    const trialFeatures = actionFeatures({source, base, edit, previous: priorKeys?.has(slotKey) ?? false,
      draft: cursor.text, recurrence: word?.contextRecurrence, rightGain: word?.rightContextGain, mode});
    const neutralScore = menuScore(base, 0, features, writing.assetHashes.ngram);
    return {base, features, trialFeatures, neutralScore, tutorAdjustment: adjustment,
      score: actionMenuScore(neutralScore, adjustment, trialFeatures, menuTrial, writing.assetHashes.ngram, tutorGroup)};
  }
  const allowed = (replacement: NonNullable<MenuEntry['replacement']>, edit = cursor) =>
    insertionEligible({text: edit.text, start: replacement.start, end: replacement.end, insert: replacement.insert,
      mode: replacement.equation ? 'equation' : mode, notation: true, role: replacement.role, aid,
      authoredPrefix: learnerAuthored(acceptedSpans.current.get(edit), replacement.start, replacement.end) ? edit.text.slice(replacement.start, replacement.end) : ''});
  function addNotation(key: string, score: number, label: string, replacement: NonNullable<MenuEntry['replacement']>, next: PadEdit,
    display?: string, math?: string, title?: string) {
    const tutorContext = {aid, mastery: props.mastery, subject: props.aidSubject, step: props.aidStep,
      mode: (replacement.equation ? 'equation' : mode) as 'equation' | 'prose',
      before: cursor.text.slice(0, replacement.start), prefix: cursor.text.slice(replacement.start, replacement.end)};
    const explicit = tutorHint(tutorContext, replacement.insert.trim().replace(/^\$|\$$/gu, ''));
    const hint = explicit.role !== undefined || explicit.adjustment !== 0 ? explicit : tutorHint(tutorContext, display ?? math ?? replacement.insert);
    const scoped = {...replacement, role: hint.role};
    const eligible = scoped.insert.trimEnd().length <= 240 && !/[\uD800-\uDFFF]/u.test(scoped.insert) && allowed(scoped);
    const edit = {start: scoped.start, end: scoped.end, insert: scoped.insert, caret: next.start, selectionEnd: next.end, direction: next.direction};
    const source = key.startsWith('equation:') ? 'equation' : 'notation';
    notationTrace?.push({...edit, source, eligible});
    if (!eligible) return;
    const slotKey = JSON.stringify([replacement.start, key, next.start, next.end]);
    entries.push({key, slotKey, ...scoring(source, score, hint.adjustment, edit, slotKey),
      label, display, math, title, edit, replacement: scoped});
  }
  if (!writingRequest.readOnly && !editingDisabled && aidVisible && writingPrefs.mode !== 'off') {
    if (typedEquation) equationReadings.forEach((reading, index) => {
      const insert = '$' + reading.latex + '$', {start, end} = typedEquation;
      addNotation('equation:' + reading.latex, Math.log(.65 / (index + 1)), 'Insert equation ' + reading.latex,
        {start, end, insert, equation: true}, insertNotation(padEdit(cursor.text, start, end), insert), undefined, insert, reading.label);
    });
    symbolOptions.forEach((option, index) => {
      const base = padEdit(cursor.text.slice(0, option.start) + cursor.text.slice(option.end), option.start);
      const next = insertTutorSymbol(base, option.symbol.id) ?? insertNotation(base, option.symbol.glyph);
      const {insert, caret} = latexCommandInsertion(next.text.slice(option.start, next.start), next.start - option.start, option.end > cursor.end);
      const result = padEdit(cursor.text.slice(0, option.start) + insert + cursor.text.slice(option.end), option.start + caret);
      addNotation('symbol:' + option.symbol.id, Math.log(.4 / (index + 1)), 'Insert ' + option.symbol.name,
        {start: option.start, end: option.end, insert, equation: mode === 'equation'}, result, option.symbol.glyph);
    });
    const span = mathSpan;
    if (span) latexOptions.forEach((option, index) => {
      const {insert, caret} = latexCommandInsertion(option.insert, option.caret, span.end > cursor.end);
      const next = padEdit(cursor.text.slice(0, span.start) + insert + cursor.text.slice(span.end), span.start + caret);
      addNotation('latex:' + option.insert, option.score ?? Math.log(.35 / (index + 1)), 'Insert ' + option.label,
        {start: span.start, end: span.end, insert, equation: true}, next, option.label);
    });
    if (enhancedMenu) rankedWritingWords.forEach(word => {
      const identity = word.source === 'symbol' || word.source === 'declared' ? 'symbol:' + word.insert : 'word:' + word.insert.toLowerCase();
      const source: MenuSource = word.source === 'decoder' ? 'word' : word.source ?? 'word';
      const adjustment = word.tutorAdjustment ?? 0;
      const base = word.menuBase ?? (word.score ?? -10) - adjustment;
      const slotKey = word.start + ':' + identity;
      const edit = proposalEdit(word);
      entries.push({...scoring(source, base, adjustment, edit, slotKey, word), key: 'word:' + writingAidProposalKey(word), slotKey,
        label: 'Insert ' + word.label, display: word.label, word, edit});
    });
  }
  const dedupedEntries = new Map<string, MenuEntry>();
  const oldScore = (entry: MenuEntry) => entry.neutralScore ?? entry.score;
  for (const entry of entries) {
    const {start, end, insert, caret} = entry.edit;
    const key = JSON.stringify([start, end, insert, caret, entry.edit.selectionEnd ?? caret]);
    const previous = dedupedEntries.get(key);
    if (!previous || oldScore(previous) < oldScore(entry)) dedupedEntries.set(key, entry);
  }
  const shortlist = [...dedupedEntries.values()].sort((left, right) => oldScore(right) - oldScore(left)).slice(0, 64);
  const rankedEntries = menuTrial === undefined ? shortlist :
    shortlist.sort((left, right) => right.score - left.score);
  const menuEpoch = aidSignature + '|' + offeredTarget.mountId + '|' + offeredTarget.scopeKey;
  const eligibleByKey = new Map(rankedEntries.map(entry => [entry.slotKey, entry]));
  const wordFamily = useMemo(() => offerFamilies(rankedWritingWords), [rankedWritingWords]);
  const familyOf = (entry: MenuEntry) => entry.word ? wordFamily(entry.word) : entry.slotKey;
  const menuEntries: MenuEntry[] = [];
  const families = new Set<string>();
  for (const entry of rankedEntries) {
    const family = familyOf(entry);
    if (families.has(family)) continue;
    menuEntries.push(entry);
    families.add(family);
    if (menuEntries.length === 3) break;
  }
  for (const [index, previous] of prior.entries()) {
    const retained = eligibleByKey.get(previous.slotKey);
    if (!retained || !menuEntries[index] || menuEntries[index].score > retained.score + .5) continue;
    const other = menuEntries.findIndex(entry => entry.slotKey === retained.slotKey);
    if (menuEntries.some((entry, slot) => slot !== index && slot !== other && familyOf(entry) === familyOf(retained))) continue;
    if (other >= 0) menuEntries[other] = menuEntries[index];
    menuEntries[index] = retained;
  }
  function observedEntry(entry: MenuEntry, position: number): WritingAidProposal {
    if (entry.word) return {...entry.word, menuPosition: position};
    const replacement = entry.replacement!;
    return {kind: 'word', start: replacement.start, end: replacement.end,
      before: cursor.text.slice(replacement.start, replacement.end), insert: replacement.insert, caret: entry.edit.caret,
      label: entry.label, snapshot: writingRequest, score: entry.score,
      source: replacement.equation ? 'equation' : 'notation', menuPosition: position};
  }
  const displayedWordMenu = useMemo(() => [menuEntries[1], menuEntries[0], menuEntries[2]].flatMap((entry, position) =>
    entry ? [observedEntry(entry, position)] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [menuEntries.map(entry => entry.key).join('|'), rankedWritingWords, aidSignature]);
  useLayoutEffect(() => {
    liveMenu.current = {key: menuEpoch, target: offeredTarget, entries: enhancedMenu ? menuEntries : entries};
    if (inkSlots) pressedOffer.current = null;
    else slotHistory.current = {epoch: stableScope, entries: menuEntries};
  });
  const traceRef = useRef<() => unknown>(() => null);
  useLayoutEffect(() => {
    if (!tracePool) return;
    const publishedAt = performance.now();
    const mark = performance.getEntriesByName('lemma.typeahead.ngram', 'mark').at(-1) as PerformanceMark | undefined;
    const matched = mark?.detail?.mountId === offeredTarget.mountId && mark?.detail?.editorRevision === offeredTarget.editorRevision &&
      mark?.detail?.selectionRevision === offeredTarget.selectionRevision;
    traceRef.current = () => ({revision: offeredTarget.editorRevision, selectionRevision: offeredTarget.selectionRevision, publishedAt, mode,
      menuTrial, tutorGroup: menuTrial ? tutorGroup : undefined,
      worker: matched ? {at: mark!.startTime, ...mark!.detail} : null,
      currentCountModel: writing.assetHashes.ngram ?? null, ghost: writingGhost ? proposalEdit(writingGhost) : null,
      correction: shownEdit ? proposalEdit(shownEdit) : null, raw: [...writing.rawTrace ?? [], ...notationTrace ?? []],
      eligible: rankedEntries.map(e => ({...e.edit, base: e.base, features: e.features, score: e.score, family: familyOf(e),
        trialFeatures: e.trialFeatures, neutralScore: e.neutralScore, tutorAdjustment: e.tutorAdjustment})),
      displayed: [menuEntries[1], menuEntries[0], menuEntries[2]].flatMap(e => e ? [e.edit] : [])});
  });
  useEffect(() => {
    if (!replayDiagnostics) return;
    const get = (event: Event) => (event as CustomEvent<(value: unknown) => void>).detail(traceRef.current());
    window.addEventListener('lemma-typeahead-read-menu', get);
    return () => window.removeEventListener('lemma-typeahead-read-menu', get);
  }, [replayDiagnostics]);
  const equationOptions = equationReadings.filter(reading => entries.some(entry => entry.key === 'equation:' + reading.latex)).slice(0, 3);
  const symbolSlots = symbolOptions.filter(option => entries.some(entry => entry.key === 'symbol:' + option.symbol.id));
  const eligibleLatex = latexOptions.filter(option => entries.some(entry => entry.key === 'latex:' + option.insert)).slice(0, 3);
  const fallback = mathKeys ? 'quick' : 'idle';
  const preferSymbols = symbolSlots.length && (mathKeys || symbolSlots[0].kind !== 'name');
  const slots = inkSlots ? 'ink' : enhancedMenu ? menuEntries.length ? 'unified' : fallback
    : equationOptions.length ? 'equation' : preferSymbols ? 'symbols' : eligibleLatex.length ? 'latex'
      : writingWords.length ? 'words' : symbolSlots.length ? 'symbols' : fallback;

  useEffect(() => {
    const reportVisibility = () => {
      const visible = shown && !editingDisabled && !scratch && !assist.drawing && !aidSettings && !editMenu && slots !== 'ink' && document.visibilityState !== 'hidden';
      writing.shown('words', visible ? slots === 'unified' ? displayedWordMenu : slots === 'words'
        ? [writingWords[1], writingWords[0], writingWords[2]].filter(Boolean) : [] : [], editMenu);
      writing.shown('edit', visible && shownEdit && !suggestionUndoable ? [shownEdit] : [], editMenu);
      writing.shown('ghost', visible && writingGhost ? [writingGhost] : [], editMenu);
    };
    reportVisibility();
    document.addEventListener('visibilitychange', reportVisibility);
    return () => document.removeEventListener('visibilitychange', reportVisibility);
  }, [writing.shown, writingWords, displayedWordMenu, slots, shownEdit, writingGhost, shown, editingDisabled, scratch, assist.drawing, aidSettings, editMenu, suggestionUndoable]);

  // N221: load N219's lexicon for the n-gram and touch decoder when the keyboard opens, and let the tutor's question
  // (with the checkpoint's title and step) favour its own words while the learner answers it.
  // Once it is ready, an empty strip is worked out again; a suggestion already shown never changes under the finger.
  useEffect(() => {
    if (!shown) return;
    let live = true;
    // N233: the Kneser-Ney model loads beside the lexicon (only with typeaheadV2); both must be ready before the strip is re-worked.
    const workerProse = enhancedMenu && typeof Worker !== 'undefined';
    void Promise.all([workerProse ? undefined : prepareWritingDecoder(), prepareTypeahead()]).then(() => {
      if (!live || !workerProse && !writingDecoderReady()) return;
      setDecoderReady(true);
      if (decoderSeen.current || shownSuggestions.current) return;
      decoderSeen.current = true;
      // A new cursor object recomputes; the edit target's revisions stay, so a picker or drawing in progress stays valid.
      setCursor(current => ({...current}));
    });
    return () => {live = false;};
  }, [shown, enhancedMenu]);


  useEffect(() => {
    swipe.current = null;
    setSwipeProgress(0);
  }, [shown, editingDisabled, scratch, assist.drawing, aidSettings, editMenu, scopeKey, writingPrefs.mode]);

  useLayoutEffect(() => {
    const hadEvidence = authoredAnchor.current !== null || acceptedSuggestion.current !== null;
    authoredAnchor.current = null;
    clearKeyTouches();
    acceptedSuggestion.current = null;
    rejectedEdits.current.clear();
    setDismissedAid(null);
    if (hadEvidence) setCursor({...history.current.present});
  }, [scopeKey, writingPrefs.scopeKey, writingPrefs.mode, aidContextKey]);

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
    if (inkSlots || provenanceFull || !writing.isCurrent(proposal)) return;
    const before = history.current, anchor = authoredAnchor.current;
    const next = applyWritingAidProposal({...writingRequest, cursor: before.present, anchor, target: editTarget(),
      composing: composition.current, readOnly: readOnly || scratch || assist.drawing || editMenu || aidSettings || !shown}, proposal);
    if (!next) return;
    const source = proposal.source === 'decoder' ? 'ngram' : proposal.source === 'bank' || proposal.source === 'literal' ? 'tutor' :
      proposal.source === 'notation' || proposal.source === 'declared' ? 'symbol' :
        proposal.source === 'question' || proposal.source === 'paragraph' ? 'word' :
          proposal.source ?? (proposal.kind === 'ghost' ? 'phrase' : 'word');
    let authored = 0;
    while (authored < proposal.before.length && proposal.before[authored] === proposal.insert[authored] &&
      proposal.start + authored < (anchor?.text.length ?? 0)) authored++;
    if (!commit(changePadText(before, next), true, true, false, false,
      edit => addAcceptedSpan(edit, proposal.start + authored, proposal.insert.slice(authored), source), proposalEdit(proposal))) return;
    authoredAnchor.current = continueWritingAidAnchor(anchor, proposal, next);
    acceptedSuggestion.current = {before, after: next, proposal};
    setHideSuggestionUndo(false);
    writing.feedback('accept', proposal);
    haptic('snap');
  }
  function acceptMenu(entry: MenuEntry) {
    remember();
    const live = liveMenu.current, edit = history.current.present;
    if (live.key !== menuEpoch || !sameEditTarget(live.target, editTarget()) || !live.entries.includes(entry) ||
        editingDisabled || editMenu || writingRequest.readOnly || composition.current) return;
    if (entry.word) {acceptWriting(entry.word); return;}
    if (!entry.replacement || !allowed(entry.replacement, edit) || provenanceFull) return;
    const next = applyMenuEdit(edit.text, entry.edit);
    if (!next) return;
    const replacement = entry.replacement;
    const observed = enhancedMenu
      ? displayedWordMenu.find(item => item.start === replacement.start && item.end === replacement.end && item.insert === replacement.insert)
      : undefined;
    const before = history.current;
    if (commit(changePadText(before, next), true, true, false, false,
      edit => edit.text === before.present.text || addAcceptedSpan(edit, replacement.start, replacement.insert, replacement.equation ? 'equation' : 'symbol'), entry.edit)) {
      if (observed) {
        acceptedSuggestion.current = {before, after: next, proposal: observed};
        setHideSuggestionUndo(false);
        writing.feedback('accept', observed);
      }
      haptic('snap');
    }
  }
  function acceptLegacyNotation(key: string) {
    const entry = entries.find(item => item.key === key);
    if (entry) acceptMenu(entry);
  }
  function addAcceptedSpan(edit: PadEdit, start: number, inserted: string, source: TutorAcceptedSpan['source']): boolean {
    if (!enhancedMenu && !aid) return true;
    const text = inserted.trimEnd();
    if (!text || edit.text.slice(start, start + text.length) !== text) return false;
    const end = start + text.length;
    const span: TutorAcceptedSpan = {start, end, text, source, ...(source === 'tutor' && aid ? {aidId: aid.id, aidVersion: aid.version} : {})};
    const updated = addAuthoredSpan(edit.text, acceptedSpans.current.get(edit) ?? [], span);
    if (updated) acceptedSpans.current.set(edit, updated);
    return updated !== null;
  }
  /** N249: a symbol drawn over the keys goes in as a strip symbol does: its glyph in prose, its command in maths. With
   *  `replace`, it takes the place of the symbol drawn just before, while nothing else has changed. */
  function beginInk() {
    remember();
    inkTarget.current = editTarget();
  }
  /** A drawing's answer and selection are unchanged: switching the keys' layout (?123, ABC, a maths category) is not
   *  a change to either, so only the editor and selection revisions count. */
  function sameInkTarget(left: EditTarget, right: EditTarget) {
    return left.scopeKey === right.scopeKey && left.mountId === right.mountId
      && left.editorRevision === right.editorRevision && left.selectionRevision === right.selectionRevision;
  }
  /**
   * N249: in one step, where the drawing began, its symbol (as a strip symbol goes in: glyph in prose, command in
   * maths) and then the keyboard edits made while it was read. If the answer or its selection changed since, or it
   * can no longer be edited, nothing is applied: a queued key never edits a selection it was not tapped for.
   */
  function flushInk(symbol: SymbolDefinition | null, edits: readonly KeyEdit[]): FlushResult {
    remember();
    const target = inkTarget.current;
    inkTarget.current = null;
    if (editingDisabled || !target || !sameInkTarget(target, editTarget())) return 'refused';
    // The range each step replaces is kept, so a chip opened behind them can be followed through the edits.
    const record = (step: () => void, removes?: () => {start: number; end: number} | null) => {
      const before = history.current.present;
      // Delete says which range it removes (backward from a caret, or a whole image reference): text comparison
      // cannot tell which of two identical occurrences went.
      const range = removes?.();
      step();
      const after = history.current.present;
      if (range && after.text.length - before.text.length === range.start - range.end) {
        flushedEdits.current.push({start: range.start, end: range.end, delta: range.start - range.end});
        return;
      }
      const applied = editBetween(before, after);
      if (applied) flushedEdits.current.push(applied);
    };
    let inserted = false;
    if (symbol) record(() => {
      const base = history.current.present;
      const next = insertTutorSymbol(base, symbol.id) ?? insertNotation(base, symbol.glyph);
      if (commit(changePadText(history.current, next), true)) {
        inkInsert.current = {before: base, after: next};
        inserted = true;
        haptic('snap');
      }
    });
    for (const edit of edits) record(() => applyKeyEdit(edit), edit.kind === 'delete' ? () => {remember(); return deletionRange(history.current.present);} : undefined);
    return inserted ? 'inserted' : 'skipped';
  }
  /** Settle a drawing over the keys, then follow a span of the answer through what went in; null if it went. */
  function settleAround(start: number, length: number) {
    flushedEdits.current = [];
    keyInk.settle();
    const edits = flushedEdits.current;
    flushedEdits.current = [];
    return mapSpan(edits, start, length);
  }
  function applyKeyEdit(edit: KeyEdit) {
    if (edit.kind === 'insert') insert(edit.text, edit.typed, edit.touch);
    else if (edit.kind === 'delete') deleteBackward();
    else moveCaret(edit.direction, edit.count);
  }
  function moveCaret(direction: 'left' | 'right', count: number) {
    remember();
    let edit = history.current.present;
    const ranges = imageRanges(edit.text);
    for (let step = 0; step < count; step++) {
      edit = movePadCaret(edit, direction);
      const image = ranges.find(item => item.start < edit.start && edit.start < item.end);
      if (image) edit = padEdit(edit.text, direction === 'left' ? image.start : image.end);
    }
    change(edit, true);
  }
  /** Replace the symbol drawn just before with another reading, while nothing else has changed. */
  function replaceInkSymbol(symbol: SymbolDefinition) {
    remember();
    const present = history.current.present, last = inkInsert.current;
    if (editingDisabled || !last || last.after.text !== present.text || last.after.start !== present.start || last.after.end !== present.end) return false;
    const next = insertTutorSymbol(last.before, symbol.id) ?? insertNotation(last.before, symbol.glyph);
    if (!commit(changePadText(history.current, next), true)) return false;
    inkInsert.current = {before: last.before, after: next};
    haptic('snap');
    return true;
  }
  function retractInkSymbol() {
    const present = history.current.present, last = inkInsert.current;
    inkInsert.current = null;
    if (editingDisabled || !last || last.after.text !== present.text || last.after.start !== present.start || last.after.end !== present.end) return false;
    return commit(changePadText(history.current, last.before), true);
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
    // N232: with field-sizing the browser grows the box itself (see tutor.css); measuring scrollHeight on every tap forced a layout.
    const nativeSizing = typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content');
    if (input instanceof HTMLTextAreaElement && nativeSizing && !ghostSuffix) {
      input.style.paddingBottom = '';
      input.style.height = '';
    } else if (input instanceof HTMLTextAreaElement) {
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
    const propChanged = lastProp.current !== props.value;
    lastProp.current = props.value;
    if (history.current.present.text === props.value) emitted.current = [];
    if (propChanged && history.current.present.text !== props.value && !emitted.current.includes(props.value)) {
      emitted.current = [];
      revision.current.editorRevision++;
      revision.current.selectionRevision++;
      assist.stop();
      acceptedSuggestion.current = null;
      authoredAnchor.current = null;
      rejectedEdits.current.clear();
      history.current = createPadTextHistory(padEdit(props.value));
      acceptedSpans.current.set(history.current.present, readTutorAcceptedSpans(props.value, props.acceptedSpans));
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
  }, [props.value, props.acceptedSpans, value, compositionText, assist.picker, assist.drawing, ghostSuffix]);

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
    const provenance = acceptedSpans.current.get(history.current.present);
    if (provenance) acceptedSpans.current.set(edit, provenance);
    history.current = {...history.current, present: edit};
    setCursor(edit);
  }
  function tooManyImages(text: string) {
    return referencedImageIds(text).filter(id => availableIds.has(id)).length > TUTOR_ATTACHMENT_COUNT;
  }
  function commit(next: PadTextHistory, focus = false, restore = true, fromAssist = false, manuallyTyped = false,
    decorate?: (edit: PadEdit) => boolean | void, exact?: MenuEdit) {
    const phraseAt = phraseGhost && manuallyTyped && !composing && !composition.current ? performance.timeOrigin + performance.now() : undefined;
    const edit = next.present;
    if (readOnly || edit.text.length > MAX_ANSWER_LENGTH) return false;
    if (tooManyImages(edit.text)) {
      setAnswerError('An answer can have up to three images.');
      return false;
    }
    const previous=history.current.present;
    const changed = edit.text !== previous.text;
    const moved = edit.start!==previous.start||edit.end!==previous.end||edit.direction!==previous.direction;
    const provenance = acceptedSpans.current.get(previous);
    const nextAnchor = manuallyTyped ? advanceWritingAidAnchor(previous, edit, authoredAnchor.current, enhancedMenu, provenance ?? []) : null;
    if (provenance && !acceptedSpans.current.has(edit)) {
      acceptedSpans.current.set(edit, moveAcceptedSpans(previous.text, edit.text, provenance, exact ? {start: exact.start, end: exact.end, nextEnd: exact.start + exact.insert.length} : {
        start: Math.min(previous.start, edit.start), end: previous.end, nextEnd: edit.end,
      }));
    }
    if (decorate?.(edit) === false) return false;
    if(changed)revision.current.editorRevision++;
    if(moved)revision.current.selectionRevision++;
    if (changed && phraseGhost) phraseEdit.current = phraseAt === undefined ? undefined : {
      at: phraseAt, editor: revision.current.editorRevision, selection: revision.current.selectionRevision, mode: revision.current.modeRevision,
    };
    if(!fromAssist&&(changed||moved))assist.pause();
    if (focus && !(document.activeElement instanceof HTMLButtonElement)) fieldElement()?.focus({preventScroll: true});
    history.current = next;
    if (exact && replayDiagnostics) window.dispatchEvent(new CustomEvent('lemma-typeahead-applied', {
      detail: {revision: offeredTarget.editorRevision, selectionRevision: offeredTarget.selectionRevision, edit: exact, after: edit.text, selection: [edit.start, edit.end], at: performance.now()},
    }));
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
      emitted.current.push(edit.text);
      if (emitted.current.length > 64) emitted.current.shift();
      // The same edit transaction adds any accepted range before the parent
      // persists the full draft and its provenance together.
      // Image references are recovery data. Save the text at the same user
      // action that adds or removes a saved image.
      const imagesChanged = (/\[\[lemma-image:/iu.test(previous.text) || /\[\[lemma-image:/iu.test(edit.text)) &&
        imageRanges(previous.text).map(image => image.id).join('|') !== imageRanges(edit.text).map(image => image.id).join('|');
      startTransition(() => {
        const spans = acceptedSpans.current.get(edit);
        if (imagesChanged) props.onChange(edit.text, spans, true);
        else if (spans?.length) props.onChange(edit.text, spans);
        else props.onChange(edit.text);
      });
    } else if (restore) {
      // A queued caret move can follow a drawing's text edit before React has patched the field.
      if (fromAssist || pendingSelection.current?.text === edit.text) pendingSelection.current = edit;
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
    if (editingDisabled) return;
    // N249: a drawing over the keys settles first, and the chip the learner tapped is followed through what went in
    // (a removed or overwritten occurrence does not open, and another equal one is not taken for it).
    const moved = settleAround(offset, source.length);
    if (moved === null) return;
    offset = moved;
    const current = history.current.present;
    if (current.text.slice(offset, offset + source.length) !== source) return;
    const {tex} = equationFences(source);
    const {inside, outsideCount} = equationOrigins(current.text, acceptedSpans.current.get(current) ?? [], source, offset);
    setEquationEdit({scope: sheetScope, source, offset, tex, acceptedSpans: inside, remainingSlots: Math.max(inside.length, ACCEPTED_SPAN_LIMIT - outsideCount)});
  }
  /** Closing the equation sheet puts the caret just after the equation, not where the focus lands. */
  function closeEquation() {
    const target = equationEdit;
    setEquationEdit(null);
    const {text} = history.current.present;
    if (target && text.slice(target.offset, target.offset + target.source.length) === target.source) {
      const after = padEdit(text, target.offset + target.source.length);
      const spans = acceptedSpans.current.get(history.current.present);
      if (spans) acceptedSpans.current.set(after, spans);
      history.current = {...history.current, present: after};
      pendingSelection.current = after;
      setCursor(after);
    }
  }
  /** Keep the saved equation's delimiters and atomically move any retained origins. */
  function saveEquation(tex: string) {
    const target = equationEdit;
    if (!target || readOnly || target.scope !== scopeKey + '|' + authGeneration()) return;
    const current = history.current.present;
    const {text} = current;
    if (text.slice(target.offset, target.offset + target.source.length) !== target.source) {setEquationEdit(null); return;}
    const fence = equationFences(target.source);
    const body = tex.trim();
    const replacement = body ? fence.opening + body + fence.closing : '';
    const range = padEdit(text, target.offset, target.offset + target.source.length);
    const next = insertNotation(range, replacement);
    if (next.text === text) {closeEquation(); return;}
    const spans = applyEquationOrigins(text, next.text, acceptedSpans.current.get(current) ?? [],
      target.source, target.offset, tex, target.acceptedSpans);
    if (!spans) {
      setEquationEdit({...target, error: 'This edit exceeds the saved suggestion limit.'});
      return;
    }
    if (!commit(changePadText(history.current, next), true, true, false, false, edit => {acceptedSpans.current.set(edit, spans);})) return;
    setEquationEdit(null);
    haptic('snap');
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
    // A drawing and its queued keys can change both the answer and whether it is ready to send.
    keyInk.settle();
    const answer = history.current.present;
    const text = answer.text;
    const current = text === value;
    const imageIds = current ? refs : referencedImageIds(text).filter(id => availableIds.has(id));
    const withImage = imageIds.length > 0;
    const stillUnfinished = props.ink?.ready && Boolean(inkDraft?.strokes.length
      || inkDraft?.editingDrawing && imageIds.includes(inkDraft.editingDrawing.id));
    const stillBlocked = current ? blocked : readOnly || !(props.canQueueImage && withImage) && !props.canSend
      || text.includes('□') || composing || scratch || stillUnfinished && (inkDraft?.inlineImages || withImage)
      || Boolean(tutorInkIssue(text, props.ink));
    if (!stillBlocked && (text.trim()||withImage)) {
      revision.current.modeRevision++;
      assist.stop();
      emitted.current = [];
      const spans = acceptedSpans.current.get(answer);
      if (spans?.length) props.onSend(answer.text, spans);
      else props.onSend(answer.text);
    }
  }
  /** Every intentional way of closing the keys settles a drawing over them first, while its answer is unchanged. */
  function closeKeys() {
    keyInk.settle();
    setShown(false);
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
      if (!target || root.contains(target) || keepsKeyboardOpenFor(target)) return;
      if (pinned) {
        // Keep the answer selected; controls in the chat (Copy, links, Make a card) still work.
        if (!target.closest('button,a[href],input,textarea,select,summary,[contenteditable="true"]')) event.preventDefault();
        return;
      }
      if (scratch || equationMode || assist.drawing) return;
      assist.pause();
      closeKeys();
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
    // N249: a drawing over the keys is settled (with the keys tapped meanwhile) before the keys give way.
    keyInk.settle();
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
      else {setPinned(false); closeKeys();}
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
    if (!modified && !event.altKey && !event.shiftKey && event.key === 'Tab' && writingGhost &&
        (writingGhost.source !== 'phrase' || writing.isCurrent(writingGhost) && sameEditTarget(writingGhost.snapshot.target, editTarget()))) {
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
      if (input === richField.current) renderTutorAnswer(input, value, images ?? [], true);
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
  /** The range deleteBackward removes from `edit`: a whole image reference before the caret, or the graphemes it takes. */
  function deletionRange(edit: PadEdit) {
    const image = imageDeletion(edit, true);
    if (image) return {start: image.start, end: image.end};
    const after = deletePadBackward(edit);
    return {start: after.start, end: after.start + edit.text.length - after.text.length};
  }
  function imageDeletion(edit: PadEdit, backward: boolean) {
    if (edit.start !== edit.end) return;
    const image = imageRanges(edit.text).find(item => backward ? edit.start === item.end : edit.start === item.start);
    if (image) return padEdit(edit.text, image.start, image.end);
  }
  function openDrawing(id: string | null = null, offset: number | null = null) {
    if (editingDisabled) return;
    // N249: a drawing over the keys settles first, and the image occurrence being edited is followed through what
    // went in; an existing image with no occurrence left does not open (the stale-target check on update is unchanged).
    const span = offset === null ? undefined : imageRanges(history.current.present.text).find(range => range.start === offset);
    if (offset !== null) {
      const moved = settleAround(offset, span ? span.end - span.start : 1);
      if (moved === null) return;
      offset = moved;
    } else keyInk.settle();
    if (id && !imageRanges(history.current.present.text).some(range => range.id === id && (offset === null || range.start === offset))) return;
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
  function resumeDrawing() {
    // N249: this runs after the tap's double-tap window, when keys queued behind a drawing may have changed the
    // answer; the image is looked up after they settle, and one no longer in the answer is not reopened.
    keyInk.settle();
    if (!unfinishedId) {openDrawing(null, null); return;}
    const position = imageRanges(history.current.present.text).find(image => image.id === unfinishedId)?.start;
    if (position === undefined) return;
    openDrawing(unfinishedId, position);
  }
  function discardUnfinishedDrawing() {
    const ink = props.ink;
    if (editingDisabled || !ink) return;
    setAnswerError('');
    void ink.update(current => unfinishedId
      ? {...current, editingDrawing: undefined}
      : {...current, strokes: [], drawingId: undefined}).catch(() => setAnswerError('Could not save the drawing removal on this device.'));
  }
  function tapUnfinishedDrawing(event: React.MouseEvent<HTMLButtonElement>) {
    if (event.detail === 0) {resumeDrawing(); return;}
    if (pendingDrawingTap.current !== undefined) {
      window.clearTimeout(pendingDrawingTap.current);
      pendingDrawingTap.current = undefined;
      discardUnfinishedDrawing();
      return;
    }
    pendingDrawingTap.current = window.setTimeout(() => {
      pendingDrawingTap.current = undefined;
      resumeDrawing();
    }, 280);
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
    if (writingWords.length) writing.refresh('words', enhancedMenu ? displayedWordMenu.filter(item => item.source !== 'notation' && item.source !== 'equation') : writingWords);
    if (writingEdit) writing.refresh('edit', [writingEdit]);
    if (writingGhost) writing.refresh('ghost', [writingGhost]);
    haptic('snap');
  }
  function stopSwipe() {
    swipe.current = null;
    setSwipeProgress(0);
    remember();
  }
  function setSwipeProgress(progress: number) {
    const review = writingReview.current;
    if (!review) return;
    review.style.setProperty('--writing-swipe', String(progress));
    if (progress > 0) review.setAttribute('data-swiping', 'true');
    else review.removeAttribute('data-swiping');
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
    if(pending && pending.text===value) {
      selectField(pending);
      pendingSelection.current=null;
    }
    remember();
    if (!readOnly) {setShown(true); setScratch(false);}
  }
  // N221: in the Android app Hide keyboard sits in the band under the keys, where Gboard's ⌄ is; browsers keep it in the strip.
  const hideButton = (className: string) => <button className={className} type="button" aria-label="Hide keyboard"
    onPointerDown={keepSelection} onClick={() => {haptic('snap'); setPinned(false); closeKeys();}}><ChevronDown aria-hidden="true"/></button>;
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
  type KeyboardActions = Required<Pick<ComponentProps<typeof TutorKeyboard>, 'onView' | 'onInsert' | 'wordBefore' | 'onBrowse' | 'onDelete'
    | 'onMove' | 'onTab' | 'onHide'>>;
  const keyboardActions = useRef<KeyboardActions | null>(null);
  useLayoutEffect(() => {
    const onInsert: KeyboardActions['onInsert'] = keyInkEnabled
      ? (text, typed, touch) => keyInk.beforeKeyEdit({kind: 'insert', text, typed, touch}) : insert;
    keyboardActions.current = {
      onView: changeView,
      onInsert,
      // N252: the iPad's tab key does what Tab does on a hardware keyboard here (take the shown continuation, or go to
      // the next □), and otherwise types a tab, as iPadOS's own key does.
      onTab: () => {
        if (writingGhost) {keyInk.settle(); remember(); acceptWriting(writingGhost);}
        else if (findNotationSlot(history.current.present)) {keyInk.settle(); nextSlot();}
        else onInsert('\t', true);
      },
      onHide: () => {haptic('snap'); setPinned(false); closeKeys();},
      onDelete: keyInkEnabled ? () => keyInk.beforeKeyEdit({kind: 'delete'}) : deleteBackward,
      wordBefore: () => {const present = history.current.present; return /[A-Za-z]+$/.exec(present.text.slice(0, present.start))?.[0] ?? '';},
      onBrowse: () => {keyInk.settle(); remember(); assist.openPicker();},
      onMove: keyInkEnabled ? (direction, count) => keyInk.beforeKeyEdit({kind: 'move', direction, count}) : moveCaret,
    };
  });
  const keyboardListeners = useMemo<KeyboardActions>(() => ({
    onView: view => keyboardActions.current?.onView(view),
    onInsert: (text, typed, touch) => keyboardActions.current?.onInsert(text, typed, touch),
    onDelete: () => keyboardActions.current?.onDelete(),
    onBrowse: () => keyboardActions.current?.onBrowse(),
    onMove: (direction, count) => keyboardActions.current?.onMove(direction, count),
    wordBefore: () => keyboardActions.current?.wordBefore?.() ?? '',
    onTab: () => keyboardActions.current?.onTab(),
    onHide: () => keyboardActions.current?.onHide(),
  }), []);

  const inkCapture = useRef(keyInk.bind);
  useLayoutEffect(() => {inkCapture.current = keyInk.bind;});
  const keyboardInkListeners = useMemo<NonNullable<KeyboardInk['bind']>>(() => ({
    onPointerDownCapture: event => inkCapture.current?.onPointerDownCapture?.(event),
    onPointerMoveCapture: event => inkCapture.current?.onPointerMoveCapture?.(event),
    onPointerUpCapture: event => inkCapture.current?.onPointerUpCapture?.(event),
    onPointerCancelCapture: event => inkCapture.current?.onPointerCancelCapture?.(event),
    onClickCapture: event => inkCapture.current?.onClickCapture?.(event),
  }), []);
  const inkBind = keyInk.bind ? keyboardInkListeners : undefined;
  const inkStatus = keyInk.view.kind === 'idle' ? keyInk.view.message ?? ''
    : keyInk.view.kind === 'inserted' ? 'Inserted ' + keyInk.view.symbol.name : '';
  const keyboardInk = useMemo<KeyboardInk | undefined>(() => keyInkEnabled
    ? {bind: inkBind, attach: keyInk.attach, canvas: keyInk.canvas, status: inkStatus} : undefined,
  [keyInkEnabled, inkBind, keyInk.attach, keyInk.canvas, inkStatus]);

  type InkActions = Pick<ComponentProps<typeof TutorInkTray>, 'onPickPhoto' | 'onInsertImage' | 'onCloseDrawing' | 'onMigrateImages'> & {
    onInsertEquation: (latex: string) => boolean; showKeys: () => void;
  };
  const inkBinding = props.ink?.update;
  const inkGeneration = authGeneration();
  const inkActions = useRef<{binding: typeof inkBinding; scope: string; generation: number; actions: InkActions} | null>(null);
  // Pending photo and migration actions must use the latest committed edit within their original owner and source.
  useLayoutEffect(() => {
    inkActions.current = {binding: inkBinding, scope: scopeKey, generation: inkGeneration, actions: {
      onPickPhoto: () => {remember(); assist.stop(); drawingSelection.current = history.current.present;},
      onInsertImage: insertImage, onCloseDrawing: closeDrawing, onMigrateImages: migrateImages,
      onInsertEquation: insertEquation, showKeys: () => {haptic('snap'); selectSurface('keys');},
    }};
    return () => {inkActions.current = null;};
  });
  const inkListeners = useMemo(() => {
    const current = () => {
      const bound = inkActions.current;
      return bound?.binding === inkBinding && bound?.scope === scopeKey && bound.generation === inkGeneration &&
        authGeneration() === inkGeneration ? bound.actions : undefined;
    };
    return {
      onPickPhoto: () => current()?.onPickPhoto(),
      onInsertImage: (id: string, replacesId?: string) => current()?.onInsertImage(id, replacesId) ?? false,
      onCloseDrawing: () => current()?.onCloseDrawing(),
      onMigrateImages: (ids: string[]) => current()?.onMigrateImages(ids) ?? false,
      onInsertEquation: (latex: string) => current()?.onInsertEquation(latex) ?? false,
      leading: <IconButton label="Keys" type="button" onPointerDown={keepSelection}
        onClick={() => current()?.showKeys()}><Keyboard aria-hidden="true"/></IconButton>,
    };
  }, [inkBinding, inkGeneration, scopeKey]);

  const keyboardVisible = shown && !props.suspended;
  const symbolKeysVisible = keyboardVisible && Boolean(notation[view]);
  useLayoutEffect(() => {
    const page = composerRoot.current?.closest('.lemma-tutor');
    if (!page) return;
    page.toggleAttribute('data-tutor-composer', true);
    page.toggleAttribute('data-tutor-keyboard', keyboardVisible);
    page.toggleAttribute('data-tutor-symbol-keys', symbolKeysVisible);
    return () => {
      page.removeAttribute('data-tutor-composer');
      page.removeAttribute('data-tutor-keyboard');
      page.removeAttribute('data-tutor-symbol-keys');
    };
  }, [keyboardVisible, symbolKeysVisible]);

  return <div ref={composerRoot} className="keyboard-composer" hidden={props.suspended} data-keyboard={keyboardVisible ? 'math' : 'hidden'} data-symbols={symbolKeysVisible || undefined}>
    {value.includes('$') && !props.ink && <div className="composer-preview"><MathText source={tutorAnswerParts(value).map(part=>part.type==='text'?part.text:' ').join('')}/></div>}
    {answerError && <p className="composer-status" role="alert">{answerError}</p>}
    {recoveryIssue && <div className="composer-status" role={recoveryIssue==='loading'?'status':'alert'}>
      {inkIssueText[recoveryIssue]}
      {props.ink && (recoveryIssue==='failed'||recoveryIssue==='missing') &&
        <Button small type="button" onClick={props.ink.retry}>Retry restoring images</Button>}
      {props.ink && imageIssue==='failed' && !imageReferences.length && !editingDisabled && value.trim() &&
        <Button small type="button" onClick={()=>{props.ink?.continueWithText();setScratch(false);}}>Continue with text</Button>}
      {!props.ink && imageIssue==='unavailable' && !editingDisabled &&
        <Button small type="button" onClick={()=>change(padEdit(removeTutorImageReferences(value)))}>Remove image references</Button>}
    </div>}
    {incomplete && <p className="composer-status" role="status">Fill each □ before sending.</p>}
    <form className="composer"
      data-typeahead-neural-eligible={replayDiagnostics ? Number(eligibleNeuralContext(writingRequest)) : undefined}
      data-typeahead-ghost-eligible={replayDiagnostics ? Number(isFlagOn('proofAssistGhost') && eligibleGhostContext(writingRequest)) : undefined}
      data-typeahead-ngram-sha={replayDiagnostics ? writing.assetHashes.ngram : undefined}
      data-typeahead-ngram-eligible={replayDiagnostics ? Number(canSuggestWritingAid(writingRequest)) : undefined}
      data-typeahead-subject={replayDiagnostics ? props.aidSubject : undefined}
      data-typeahead-subject-sha={replayDiagnostics ? writing.assetHashes.subject : undefined}
      data-typeahead-latex-sha={replayDiagnostics ? latexAssetSha256 : undefined}
      data-typeahead-neural-sha={replayDiagnostics ? writing.assetHashes.neural : undefined}
      data-typeahead-graph-trial={typeaheadGraphTrial() ? 'unqualified' : undefined} onSubmit={event => {event.preventDefault(); send();}}>
      <div className="writing-composer-card" data-can-swipe={Boolean(writingGhost) || undefined}
        onPointerDownCapture={beginSwipe} onPointerMove={moveSwipe} onPointerUp={endSwipe} onPointerCancel={stopSwipe}
        onLostPointerCapture={event => {if (event.target === event.currentTarget && swipe.current) stopSwipe();}}>
      <div className="field">
        {props.ink ? <TutorAnswerEditor editor={richField} restoreSelection={!pendingSelection.current} value={value} images={props.ink.draft.photos}
          placeholder={followUp ? 'Add to your question…' : props.pending ? 'Draft your next answer…' : 'Write your answer…'} readOnly={readOnly}
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
          <span>{writingEdit ? <>{value.slice(0, writingEdit.start)}<span data-writing-aid-source="">{value.slice(writingEdit.start, writingEdit.end)}</span>{value.slice(writingEdit.end)}</> : value}</span>{ghostSuffix}
        </div>}<textarea ref={field} aria-label="Your answer" placeholder={followUp ? 'Add to your question…' : props.pending ? 'Draft your next answer…' : 'Write your answer…'}
          inputMode="none" rows={1} maxLength={MAX_ANSWER_LENGTH} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          value={compositionText ?? value} readOnly={readOnly} onSelect={remember} onClick={remember} onFocus={focusAnswer}
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
        <div className="tutor-composer-tools">
          {props.ink ? <IconButton label="Keep keyboard open" aria-pressed={pinned} disabled={editingDisabled}
            onPointerDown={keepSelection} onClick={pinKeys}><Keyboard aria-hidden="true"/></IconButton>
            : <IconButton label="Keys" aria-pressed={shown} disabled={editingDisabled} onPointerDown={keepSelection}
              onClick={()=>{if(shown){assist.pause();closeKeys();}else keys();}}><Keyboard aria-hidden="true"/></IconButton>}
          {props.ink && <div className="tutor-composer-photos" ref={setPhotoActions}/>}
          <IconButton label="Attach context" aria-haspopup="dialog" aria-pressed={props.hasContext} disabled={inkDraft?.queuedText!==undefined}
            onPointerDown={keepSelection} onClick={props.onContext}><Paperclip aria-hidden="true"/></IconButton>
          {!scratch && unfinished && <IconButton label="Unfinished drawing" title="Open unfinished drawing. Double-tap to discard."
            data-unfinished-drawing="" disabled={editingDisabled} onPointerDown={keepSelection} onClick={tapUnfinishedDrawing}><PenLine aria-hidden="true"/></IconButton>}
          {props.onToggleHeader && <IconButton label={props.headerHidden?'Show header':'Hide header'} data-tutor-header-toggle=""
            aria-pressed={props.headerHidden} onPointerDown={keepSelection} onClick={props.onToggleHeader}>
            {props.headerHidden?<EyeOff aria-hidden="true"/>:<Eye aria-hidden="true"/>}
          </IconButton>}
          {phrasePreview && <IconButton label={'Accept continuation ' + phrasePreview.label} data-writing-aid-ghost=""
            data-typeahead-insert={phrasePreview.insert} data-typeahead-start={phrasePreview.start} data-typeahead-end={phrasePreview.end}
            data-typeahead-caret={proposalEdit(phrasePreview).caret} disabled={editingDisabled}
            onPointerDown={event => {keepSelection(event); pressedPhrase.current = phrasePreview;}}
            onPointerCancel={() => {pressedPhrase.current = null;}} onClick={event => {
              const chosen = event.detail ? pressedPhrase.current : phrasePreview;
              pressedPhrase.current = null;
              if (chosen) acceptWriting(chosen);
            }}><MoveRight aria-hidden="true"/></IconButton>}
          <IconButton label={queue?'Queue answer':'Send'} data-tutor-send="" type="submit" disabled={blocked || !value.trim()&&!hasImage}
            onPointerDown={keepSelection}><ArrowUp aria-hidden="true"/></IconButton>
        </div>
      </div>
      </div>
    </form>
    {editMenu && props.answerActions && createPortal(<>
        {isFlagOn('writingAidSettings') && <Button onClick={() => {props.onCloseActions(); setSettingsScope(sheetScope);}}><SlidersHorizontal aria-hidden="true"/>Writing assistance</Button>}
        {refreshable && <Button disabled={editingDisabled} onClick={() => {
          refreshWriting();
          const caret = history.current.present;
          props.onCloseActions();
          requestAnimationFrame(() => {
            // A modal round trip can leave a contenteditable caret at the start of the draft.
            pendingSelection.current = caret;
            fieldElement()?.focus({preventScroll:true});
          });
        }}>
          <RefreshCw aria-hidden="true"/>Refresh suggestions</Button>}
        <Button disabled={!props.canSend||editingDisabled} onClick={()=>{props.onCloseActions();props.onAsk('hint');}}>
          <HelpCircle aria-hidden="true"/>Hint {Math.max(1,Math.min(4,props.hintLevel??1))}/4
        </Button>
        <Button disabled={!props.canSend||editingDisabled} onClick={()=>{props.onCloseActions();props.onAsk('stuck');}}><ArrowDown aria-hidden="true"/>Stuck</Button>
        {!props.pending&&<Button disabled={!props.canSend||editingDisabled} onClick={()=>{props.onCloseActions();props.onAsk('notation');}}>
          <HelpCircle aria-hidden="true"/>Ask about notation
        </Button>}
        <Button disabled={!history.current.past.length||editingDisabled} onClick={()=>{props.onCloseActions();undo();}}><Undo2 aria-hidden="true"/>Undo typing</Button>
        <Button disabled={!history.current.future.length||editingDisabled} onClick={()=>{props.onCloseActions();undo(true);}}><Redo2 aria-hidden="true"/>Redo typing</Button>
      </>, props.answerActions)}
    {/* N221 (Owner): an equation in the answer is edited here: its rendering updates as the LaTeX changes. */}
    {equationEdit && <Sheet open onClose={closeEquation} title="Equation">
      <div className="tutor-equation-edit">
        <div className="tutor-equation-preview" aria-label="Preview"><MathText source={equationEdit.tex.trim() ? '$' + equationEdit.tex + '$' : ''}/></div>
        <EquationLatexField value={equationEdit.tex} acceptedSpans={equationEdit.acceptedSpans}
          remainingSlots={equationEdit.remainingSlots}
          onChange={(tex, spans) => setEquationEdit({...equationEdit, tex, acceptedSpans: spans, error: undefined})}
          before={value.slice(0, equationEdit.offset)} notationContext={props.notationContext}
          surroundings={equationSurroundings(value, equationEdit.source, equationEdit.offset)}
          readSurroundings={() => equationEdit.scope === scopeKey + '|' + authGeneration()
            ? equationSurroundings(history.current.present.text, equationEdit.source, equationEdit.offset) : undefined}
          aid={aid} mastery={props.mastery} subject={props.aidSubject} step={props.aidStep}
          suggestions={enhancedMenu && writingPrefs.mode !== 'off' && !editingDisabled}/>
        {equationEdit.error && <p role="alert">{equationEdit.error}</p>}
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
      </div>
    </Sheet>}
    {aidSettings && <Sheet open onClose={() => setSettingsScope(null)} title="Writing assistance"><WritingAidSettings showTitle={false}/></Sheet>}
    {props.ink&&<TutorInkTray {...inkListeners} ink={props.ink} shown={scratch} photoActions={photoActions} photoDisabled={editingDisabled}
      editingImageId={editingImageId} canMigrate={!readOnly} answerLength={migrationAnswerLength}
      canInsertImage={canInsertImage} referencedImageIds={refs}/>}
    {shown ? <div className="kb" data-v7-keyboard="" role="group" aria-label="Answer keyboard" data-decoder={decoderReady ? 'ready' : undefined}
      data-surface={surface} data-keyboard-layout={keyboardLayout === 'ipad' ? 'ipad' : undefined}>
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
        {slots === 'unified' && <div className="sugg equation-words" role="group" aria-label="Answer suggestions">
          {[menuEntries[1], menuEntries[0], menuEntries[2]].map((entry, index) => entry
            ? <button key={entry.slotKey} type="button" className={index === 1 ? 'preferred' : undefined} title={entry.title}
              aria-label={entry.label} disabled={editingDisabled}
              data-typeahead-insert={entry.edit.insert}
              data-typeahead-kind={entry.word?.source === 'symbol' || !entry.word ? 'symbol' : 'word'}
              data-typeahead-family={familyOf(entry)}
              data-typeahead-start={entry.edit.start}
              data-typeahead-end={entry.edit.end}
              data-typeahead-caret={entry.edit.caret} data-typeahead-selection-end={entry.edit.selectionEnd ?? entry.edit.caret}
              onPointerDown={event => {
                keepSelection(event);
                pressedOffer.current = {key: entry.key, epoch: menuEpoch};
              }} onPointerCancel={() => {pressedOffer.current = null;}} onClick={event => {
                const pressed = pressedOffer.current;
                pressedOffer.current = null;
                if (event.detail && (pressed?.key !== entry.key || pressed.epoch !== menuEpoch)) return;
                acceptMenu(entry);
              }}>{entry.math ? <MathText source={entry.math}/> : entry.display}</button>
            : <button key={'empty' + index} type="button" disabled aria-label="No suggestion"><span aria-hidden="true" className="writing-aid-empty">·</span></button>)}
        </div>}
        {slots === 'ink' && <KeyInkWords view={keyInk.view} disabled={editingDisabled} onChoose={keyInk.choose}/>}
        {slots === 'equation' && <div className="sugg equation-words" role="group" aria-label="Equation suggestions">
          {/* Best in the middle, as the words and symbols (and Gboard). */}
          {[equationOptions[1], equationOptions[0], equationOptions[2]].map((reading, index) => reading
            ? <button key={reading.latex} type="button" className={index === 1 ? 'preferred' : undefined}
              aria-label={'Insert equation ' + reading.latex} title={reading.label} disabled={editingDisabled} onPointerDown={keepSelection}
              data-typeahead-insert={typedEquation ? '$' + reading.latex + '$' : undefined} data-typeahead-kind="symbol"
              data-typeahead-start={typedEquation?.start} data-typeahead-end={typedEquation?.end}
              onClick={() => acceptLegacyNotation('equation:' + reading.latex)}><MathText source={'$' + reading.latex + '$'}/></button>
            : <button key={'empty' + index} type="button" disabled aria-label="No suggestion"><span aria-hidden="true" className="writing-aid-empty">·</span></button>)}
        </div>}
        {slots === 'symbols' && <SymbolWords options={symbolSlots} disabled={editingDisabled}
          onAccept={option => acceptLegacyNotation('symbol:' + option.symbol.id)}/>}
        {slots === 'latex' && <LatexWords options={eligibleLatex} disabled={editingDisabled} onAccept={option => acceptLegacyNotation('latex:' + option.insert)}/>}
        <WritingAidWords words={writingWords} disabled={editingDisabled} onAccept={acceptWriting} hidden={slots !== 'words'} replayDiagnostics={replayDiagnostics}/>
        {slots === 'quick' && <div className="sugg tutor-quick-math" role="group" aria-label="Quick math symbols">
          {['∀', '∈', ...(props.ink && incomplete ? [] : ['⇒'])].map(symbol => <button key={symbol} type="button" className="qsym" aria-label={symbol}
            disabled={editingDisabled} onPointerDown={keepSelection} onClick={() => {haptic('key'); insert(symbol);}}>{symbol}</button>)}
          {props.ink && incomplete && nextSlotButton}
        </div>}
        {slots === 'idle' && <div className="sugg">{props.ink && incomplete && nextSlotButton}</div>}
        {equationButton}
        {/* N252: the iPad's keyboard has its own hide key at the bottom right, as iPadOS's. */}
        {keyboardLayout !== 'ipad' && hideButton('sbtn')}
        {/* N249: the drawn symbol's readings have the strip to themselves; the correction overlay waits. */}
        {!scratch && slots !== 'ink' && <WritingAidBar words={writingWords} edit={shownEdit} ghost={stripGhost}
          disabled={editingDisabled} undoable={suggestionUndoable} reviewRef={writingReview} exhausted={aidExhausted}
          onAccept={acceptWriting} onUndo={undoWriting} onDismiss={dismissWriting}
          onRefresh={(surface, displayed) => {writing.refresh(surface, displayed); haptic('snap');}}/>}
      </div>
      <TutorKeyboard view={view} lastMath={lastMath} disabled={editingDisabled} ink={keyboardInk} layout={keyboardLayout} {...keyboardListeners}/>{hideButton('sbtn kb-band-hide')}</>}
    </div> : null}
    {assist.picker && <TutorSymbolPicker recent={assist.recent} onPick={assist.onPick} onClose={assist.closePicker} error={assist.error}/>}
  </div>;
}
