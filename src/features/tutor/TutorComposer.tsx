import {useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type PointerEvent} from 'react';
import {ArrowDown, ArrowUp, ChevronDown, Ellipsis, HelpCircle, Keyboard, Paperclip, Camera, Pencil, PenLine, Undo2, Redo2} from 'lucide-react';
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
import {applyNotationSuggestion, findNotationSlot, insertNotation, notation, notationSuggestions, typedNotation} from './notation';
import {TUTOR_ATTACHMENT_COUNT} from '../../data/tutor/attachment-types';
import {imageReference, referencedImageIds, tutorAnswerParts} from '../../../supabase/functions/_shared/tutor-answer';
import {readTutorAnswer, renderTutorAnswer, setTutorAnswerSelection, TutorAnswerEditor} from './TutorAnswerEditor';
import {TutorKeyboard} from './TutorKeyboard';
import {TutorInkPad} from './input/TutorInkPad';
import {TutorSymbolPicker} from './input/TutorSymbolPicker';
import {insertTutorSymbol, tutorMathContext} from './input/symbolEdit';
import {symbolByGlyph} from './input/symbolCatalog';
import {useTutorInputAssist} from './input/useTutorInputAssist';
import {useTutorInputPreferences} from './input/inputPreferences';
import {sameEditTarget} from './input/recognitionPolicy';
import type {EditTarget} from './input/types';
import './keyboard.css';
import './input/input.css';

const keepSelection = (event: PointerEvent) => event.preventDefault();
const ANSWER_CLIPBOARD = 'application/x-lemma-tutor-answer';
const MAX_ANSWER_LENGTH = 2000;
const IMAGE_REFERENCE_LENGTH = imageReference('00000000-0000-0000-0000-000000000000').length;
const EMPTY_CONTEXT: readonly string[] = [];

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
  const [recent, setRecent] = useState<string[]>([]);
  const [keptWords, setKeptWords] = useState<readonly string[]>([]);
  const automatic = useRef<{before: PadTextHistory; after: PadEdit} | null>(null);
  const context = props.notationContext ?? EMPTY_CONTEXT;
  const suggestions = useMemo(() => notationSuggestions(cursor, context, recent, keptWords, revision.current), [cursor, context, recent, keptWords]);
  const incomplete = props.value.includes('□');
  const images = props.ink?.draft.photos;
  const availableIds = useMemo(() => new Set(images?.map(image => image.id.toLowerCase())), [images]);
  const previousIds = useRef(availableIds);
  const refs = useMemo(() => referencedImageIds(props.value).filter(id => availableIds.has(id)), [props.value, availableIds]);
  const hasImage = refs.length > 0;
  const imageTarget = drawingSelection.current?.text === props.value ? drawingSelection.current : cursor;
  const canInsertImage = props.value.length - (imageTarget.end - imageTarget.start) + IMAGE_REFERENCE_LENGTH <= MAX_ANSWER_LENGTH;
  const inkDraft = props.ink?.draft;
  const readOnly = props.readOnly || inkDraft?.queuedText !== undefined;
  const uncommitted = inkDraft?.inlineImages && Boolean(inkDraft.strokes.length ||
    (inkDraft.editingDrawing && refs.includes(inkDraft.editingDrawing.id)));
  const queue=props.canQueueImage&&hasImage;
  const blocked = readOnly || !queue&&!props.canSend || incomplete || composing || scratch || uncommitted;
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


  useLayoutEffect(() => {
    const input = fieldElement();
    if (!input) return;
    if (input instanceof HTMLTextAreaElement) {
      input.style.height = '44px';
      input.style.height = Math.min(120, Math.max(44, input.scrollHeight)) + 'px';
    }
    if (history.current.present.text !== props.value) {
      revision.current.editorRevision++;
      revision.current.selectionRevision++;
      assist.stop();
      automatic.current = null;
      history.current = createPadTextHistory(padEdit(props.value));
      setCursor(history.current.present);
      pendingSelection.current = history.current.present;
    }
    if(focusAfterSymbol.current&&!assist.picker) {
      focusAfterSymbol.current=false;
      input.focus({preventScroll:true});
    }
    const edit = pendingSelection.current;
    if (edit && (input instanceof HTMLTextAreaElement || document.activeElement === input)) {
      selectField(edit);
      pendingSelection.current = null;
    }
  }, [props.value, compositionText, assist.picker, assist.drawing]);

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
    automatic.current = null;
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
    const input = fieldElement();
    if (!input || composition.current || (input === richField.current && document.activeElement !== input)) return;
    const edit = fieldSelection(input);
    const present = history.current.present;
    if (edit.text !== present.text || (edit.start === present.start && edit.end === present.end && edit.direction === present.direction)) return;
    revision.current.selectionRevision++;
    assist.pause();
    history.current = {...history.current, present: edit};
    setCursor(edit);
  }
  function tooManyImages(text: string) {
    return referencedImageIds(text).filter(id => availableIds.has(id)).length > TUTOR_ATTACHMENT_COUNT;
  }
  function commit(next: PadTextHistory, focus = false, restore = true, fromAssist = false) {
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
    history.current = next;
    setCursor(edit);
    if (changed) {
      automatic.current = null;
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
  function noteRecent(text: string) {
    const symbol = text.trim();
    if (!symbol || symbol.includes('□') || /^[\w\s]+$/u.test(symbol) || symbol.length > 12) return;
    setRecent(old => [symbol, ...old.filter(item => item !== symbol)].slice(0, 6));
  }
  function typeText(edit: PadEdit, text: string, focus: boolean, onlyAutomatic = false) {
    const plain = insertNotation(edit, text);
    const replacement = typedNotation(edit, text, context, new Set(keptWords));
    const corrected = replacement.text !== plain.text;
    if (onlyAutomatic && !corrected) return false;
    if (replacement.text.length > MAX_ANSWER_LENGTH) return false;
    const before = history.current;
    change(replacement, focus);
    if (corrected) automatic.current = {before, after: replacement};
    return true;
  }
  function insert(text: string, typed = false) {
    remember();
    const edit = history.current.present;
    const symbol=symbolByGlyph(text.trim());
    if(symbol && tutorMathContext(edit)!=='prose') {
      const converted=insertTutorSymbol(edit,symbol.id);
      if(converted)change(converted,true);
      else setAnswerError('Choose a selection within one math or text region.');
      return;
    }
    if (typed) typeText(edit, text, true);
    else change(insertNotation(edit, text), true);
    if (!typed || /[^\w\s]/u.test(text)) noteRecent(text);
  }
  function keepWord(word: string) {
    const lower = word.toLowerCase();
    setKeptWords(old => [lower, ...old.filter(item => item !== lower)].slice(0, 32));
  }
  function undoAutomatic(focus: boolean) {
    const fix = automatic.current;
    const edit = history.current.present;
    if (!fix || edit.text !== fix.after.text || edit.start !== fix.after.start || edit.end !== fix.after.end) return false;
    const {text, start} = fix.before.present;
    const word = text.slice(0, start).match(/[a-z]{3,24}$/i)?.[0]?.toLowerCase();
    if (word) keepWord(word);
    commit(fix.before, focus);
    return true;
  }
  function nextSlot(backward = false) {
    remember();
    const slot = findNotationSlot(history.current.present, backward);
    if (slot) change(slot, true);
  }
  function undo(redo = false) {
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

  function keys() {
    setScratch(false);
    setShown(true);
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
      if(assist.drawing)assist.stop();
      else setShown(false);
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
    if (!modified && !event.altKey && event.key === 'Tab' && edit.text.slice(edit.start, edit.end) === '□') {
      const slot = findNotationSlot(edit, event.shiftKey);
      if (slot && (event.shiftKey ? slot.start < edit.start : slot.start > edit.start)) {
        event.preventDefault();
        change(slot);
      }
    }
    if (modified || event.altKey) return;
    if (event.key === 'Backspace' && undoAutomatic(false)) {event.preventDefault(); return;}
    if (richField.current && event.key === 'Enter') {
      event.preventDefault();
      change(insertNotation(edit, '\n'));
      return;
    }
    if (richField.current && (event.key === 'Backspace' || event.key === 'Delete')) {
      const range = imageDeletion(edit, event.key === 'Backspace');
      if (range) {event.preventDefault(); change(insertNotation(range, '')); return;}
    }
    if (/^[ ,.;]$/.test(event.key) && typeText(edit, event.key, false, true)) event.preventDefault();
  }
  function beginComposition(input: HTMLElement) {
    remember();
    composition.current=true;
    revision.current.selectionRevision++;
    assist.pause();
    setCursor({...history.current.present});
    setCompositionText(fieldSelection(input).text);
  }
  function inputChanged(input: HTMLElement) {
    if (readOnly) {
      if (input === richField.current) renderTutorAnswer(input, props.value, images ?? [], true);
      return;
    }
    const edit = fieldSelection(input);
    if (composition.current) setCompositionText(edit.text);
    else if (edit.text.length <= MAX_ANSWER_LENGTH && !tooManyImages(edit.text)) commit(changePadText(history.current, edit), false, false);
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
  function focusAnswer() {
    const pending=pendingSelection.current;
    if(pending && pending.text===props.value) {
      selectField(pending);
      pendingSelection.current=null;
    }
    remember();
    if (!readOnly) {setShown(true); setScratch(false);}
  }
  return <div className="keyboard-composer" data-keyboard={shown ? 'math' : 'hidden'} data-symbols={shown && Boolean(notation[view]) || undefined}>
    {props.value.includes('$') && <div className="composer-preview"><MathText source={tutorAnswerParts(props.value).map(part=>part.type==='text'?part.text:' ').join('')}/></div>}
    {answerError && <p className="composer-status" role="alert">{answerError}</p>}
    {!scratch && uncommitted && <p className="composer-status" role="status">Insert or discard your unfinished drawing before sending.</p>}
    {incomplete && <p className="composer-status" role="status">Fill each □ before sending.</p>}
    <form className="composer" onSubmit={event => {event.preventDefault(); send();}}>
      <div className="field">
        {props.ink&&!scratch
          ? <IconButton label="Scratch" type="button" disabled={editingDisabled || props.ink.draft.queuedText!==undefined}
              onPointerDown={keepSelection} onClick={()=>openDrawing()}><Pencil aria-hidden="true"/></IconButton>
          : <IconButton label="Keys" type="button" aria-pressed={shown} disabled={editingDisabled} onPointerDown={keepSelection}
              onClick={()=>{if(shown){assist.pause();setShown(false);}else keys();}}><Keyboard aria-hidden="true"/></IconButton>}
        {props.ink ? <TutorAnswerEditor editor={richField} value={props.value} images={props.ink.draft.photos}
          placeholder={props.pending ? 'Draft your next answer…' : 'Write your answer…'} readOnly={readOnly}
          composing={composing} onSelection={remember} onChip={chipAction} onFocus={event=>{
            if (event.target === event.currentTarget) focusAnswer();
          }} onKeyDown={keyDown}
          onPointerDown={event=>{if (event.target === event.currentTarget && !readOnly) setShown(true);}}
          onCompositionStart={event=>beginComposition(event.currentTarget)}
          onCompositionEnd={event=>{
            composition.current = false;
            inputChanged(event.currentTarget);
            setCompositionText(null);
          }}
          onInput={event=>inputChanged(event.currentTarget)}
          onCopy={event=>copyAnswer(event)}
          onCut={event=>copyAnswer(event, true)}
          onPaste={pasteAnswer}
          onDrop={event=>event.preventDefault()}
        /> : <textarea ref={field} aria-label="Your answer" placeholder={props.pending ? 'Draft your next answer…' : 'Write your answer…'}
          inputMode="none" rows={1} maxLength={MAX_ANSWER_LENGTH} autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          value={compositionText ?? props.value} readOnly={readOnly} onSelect={remember} onClick={remember} onFocus={()=>{
            remember();
            if(!readOnly){setShown(true);setScratch(false);}
          }}
          onPointerDown={() => {
            if (!shown && !readOnly) {
              setShown(true);
            }
          }}
          onCompositionStart={event=>beginComposition(event.currentTarget)}
          onCompositionEnd={event => {
            composition.current = false;
            commit(changePadText(history.current, fieldSelection(event.currentTarget)), false, false);
            setCompositionText(null);
          }}
          onChange={event => {
            const edit = fieldSelection(event.currentTarget);
            if (composition.current) setCompositionText(edit.text);
            else commit(changePadText(history.current, edit), false, false);
          }}
          onKeyDown={keyDown}/>}
        <IconButton label="Edit answer" type="button" aria-haspopup="dialog" onPointerDown={keepSelection} onClick={()=>{assist.pause();setEditMenu(true);}}><Ellipsis aria-hidden="true"/></IconButton>
        <IconButton label={queue?'Queue answer':'Send'} data-tutor-send="" type="submit" disabled={blocked || !props.value.trim()&&!hasImage}
          onPointerDown={keepSelection}><ArrowUp aria-hidden="true"/></IconButton>
      </div>
    </form>
    <Sheet open={editMenu} onClose={()=>setEditMenu(false)} title="Answer actions">
      <div className="tutor-session-actions">
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
    {props.ink&&<TutorInkTray ink={props.ink} shown={scratch} photoOpen={photo} onClosePhoto={()=>setPhoto(false)}
      editingImageId={editingImageId} canMigrate={!readOnly} answerLength={props.value.length} canInsertImage={canInsertImage} referencedImageIds={refs} onInsertImage={insertImage} onMigrateImages={migrateImages} onCloseDrawing={closeDrawing}/>}
    {shown ? <div className="kb" data-v7-keyboard="" role="group" aria-label="Answer keyboard">
      {assist.drawing ? <TutorInkPad enabled={inputPrefs.recognition} strokes={assist.snapshot?.strokes??[]}
        readiness={assist.readiness} recognized={assist.recognized} completions={assist.completions} actionable={assist.actionable}
        keepDrawing={assist.keepDrawing} overBudget={assist.snapshot?.overBudget??false} error={assist.error} onBegin={assist.onBegin} onMove={assist.onMove} onEnd={assist.onEnd}
        onInterrupt={assist.onInterrupt} onUndo={assist.onUndo} onClear={assist.onClear} onClose={()=>{
          assist.stop();fieldElement()?.focus({preventScroll:true});selectField(history.current.present);
        }}
        onBrowse={assist.openPicker} onKeepDrawing={assist.onKeepDrawing} onLockAutomatic={assist.lockAutomatic} onPressCandidate={assist.pressCandidate} onReleaseCandidate={assist.releaseCandidate}
        onAccept={assist.onAccept}/>
      : <><div className="strip">
        <div className="sugg" role="group" aria-label="Suggestions">
          {suggestions.map(item => <button className={item.kind} type="button" key={item.id}
            disabled={editingDisabled} title={item.text} onPointerDown={keepSelection} onClick={() => {
              remember();
              const edit = history.current.present;
              const next = notationSuggestions(edit, context, recent, keptWords, revision.current).find(suggestion=>suggestion.id===item.id
                && suggestion.editorRevision===item.editorRevision && suggestion.selectionRevision===item.selectionRevision);
              if (!next) return;
              haptic('snap');
              if (item.kind === 'keep') keepWord(item.text);
              change(applyNotationSuggestion(edit, next, revision.current), true);
              noteRecent(item.text);
            }} aria-description={item.kind === 'fix' ? 'Spelling correction' : item.kind === 'keep' ? 'Keep what you typed' : undefined}>{item.text}</button>)}
        </div>
        <button className="sbtn" type="button" aria-label="Draw symbol" disabled={editingDisabled} onPointerDown={keepSelection}
          onClick={()=>{remember();revision.current.modeRevision++;haptic('snap');assist.openDraw();}}><PenLine aria-hidden="true"/></button>
        <button className="sbtn" type="button" aria-label="Hide keyboard" onPointerDown={keepSelection} onClick={() => {haptic('snap'); setShown(false);}}><ChevronDown aria-hidden="true"/></button>
      </div>
      <TutorKeyboard view={view} lastMath={lastMath} onView={changeView} disabled={editingDisabled} onInsert={insert}
        onBrowse={()=>{remember();assist.openPicker();}}
        onNextSlot={incomplete ? () => nextSlot() : undefined}
        onDelete={() => {
          remember();
          if (!undoAutomatic(true)) {
            const edit = history.current.present;
            const image = imageDeletion(edit, true);
            change(image ? insertNotation(image, '') : deletePadBackward(edit), true);
          }
        }}
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
        }}/></>}
    </div> : null}
    {assist.picker && <TutorSymbolPicker recent={assist.recent} onPick={assist.onPick} onClose={assist.closePicker} error={assist.error}/>}
  </div>;
}
