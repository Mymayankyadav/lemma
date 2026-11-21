import {act, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {TutorComposer} from '../../../src/features/tutor/TutorComposer';
import type {TutorInkState} from '../../../src/features/tutor/TutorInk';
import {imageReference} from '../../../supabase/functions/_shared/tutor-answer';
import {setHapticsEnabled} from '../../../src/ui/v7/haptics';
import * as autoCorrect from '../../../src/features/tutor/writingAid/autoCorrect';

let host: HTMLDivElement;
let root: Root;
const dialogMethods = ['showModal', 'close'] as const;
const originalMethods = dialogMethods.map(method => Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, method));
beforeEach(() => {
  sessionStorage.setItem('lemma.demo', '1');
  localStorage.removeItem('lemma.demo-tutor.writing-aid.v1:default');
  localStorage.removeItem('lemma.demo-tutor.writing-aid-model.v1:default');
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  dialogMethods.forEach(method => {
    Object.defineProperty(HTMLDialogElement.prototype, method, {configurable: true,
      value(this: HTMLDialogElement) {this.open = method === 'showModal';}});
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  dialogMethods.forEach((method, index) => {
    const original = originalMethods[index];
    if (original) Object.defineProperty(HTMLDialogElement.prototype, method, original);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, method);
  });
  sessionStorage.removeItem('lemma.demo');
  localStorage.removeItem('lemma.demo-tutor.writing-aid.v1:default');
  localStorage.removeItem('lemma.demo-tutor.writing-aid-model.v1:default');
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  setHapticsEnabled(true);
});
function Harness({initial = '', onSend = () => {}, onAsk = () => {}, onChange = () => {},
  hintLevel, pending = false, ink}: {
  initial?: string; onSend?: (text: string) => void; onAsk?: (kind: 'hint' | 'stuck' | 'notation') => void;
  onChange?: (value: string) => void; hintLevel?: number; pending?: boolean; ink?: TutorInkState;
}) {
  const [value, setValue] = useState(initial);
  return <TutorComposer value={value} onChange={text => {setValue(text); onChange(text);}} onSend={onSend} onAsk={onAsk}
    canSend={!pending} ink={ink} readOnly={false} pending={pending} hasContext={false} hintLevel={hintLevel}
    onContext={() => {}}
    notationContext={['What is the preimage f⁻¹(B)?']}/>;
}
const button = (name: string, group: ParentNode = host) => [...group.querySelectorAll('button')]
  .find(node => (node.getAttribute('aria-label') ?? node.textContent) === name)!;
const field = () => host.querySelector('textarea')!;
const click = (name: string, group?: ParentNode) => act(async () => button(name, group).click());
const answerAction = async (name: string) => {
  await click('Edit answer');
  await click(name, host.querySelector('dialog[open]')!);
};
const keyboard = () => host.querySelector('.rows')!;
const suggestion = () => host.querySelector('.sugg')!;
const key = (name: string, modifiers: KeyboardEventInit = {}) => act(async () => {
  field().dispatchEvent(new KeyboardEvent('keydown', {key: name, bubbles: true, cancelable: true, ...modifiers}));
});
const input = async (value: string) => {
  await act(async () => {
    const node = field();
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(node, value);
    node.setSelectionRange(value.length, value.length);
    node.dispatchEvent(new InputEvent('input', {bubbles: true, data: value, inputType: 'insertText'}));
  });
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 35));});
};

// Exercise the UI's qualified-decision boundary independently of whether the
// current empirical certificate authorizes a rule for a particular population.
function qualifiedAutoFixture() {
  vi.spyOn(autoCorrect,'detectWritingAutoCorrection').mockImplementation(request=>
    autoCorrect.evaluateWritingAutoCorrection(request,[{ruleId:'teh-to-the',sampleSize:1000,correct:1000,
      artifact:'unit-fixture',population:'synthetic'}]));
}

test('a qualified automatic correction needs no accept tap and Undo restores the exact typed token',async()=>{
  qualifiedAutoFixture();
  await act(async()=>root.render(<Harness/>));
  await click('Keys');
  await input('I read teh');
  await input('I read teh ');
  expect(field().value).toBe('I read the ');
  expect(host.querySelector('.writing-aid-auto-summary')?.textContent).toContain('Corrected teh');
  await click('Undo suggestion');
  expect(field().value).toBe('I read teh ');
  await key('Backspace');
  // Native deletion is delivered by input, then retyping the separator must
  // respect this occurrence's rejection rather than correcting it again.
  await input('I read teh');
  await input('I read teh ');
  expect(field().value).toBe('I read teh ');
});

test('Backspace reverses a qualified automatic correction before deleting learner text',async()=>{
  qualifiedAutoFixture();
  await act(async()=>root.render(<Harness/>));
  await click('Keys');
  await input('I read teh');
  await click('Space',keyboard());
  expect(field().value).toBe('I read the ');
  await key('Backspace');
  expect(field().value).toBe('I read teh ');
});
const awaitAid = async (name: string) => {
  await vi.waitFor(async () => {
    await act(async () => {await new Promise(resolve => setTimeout(resolve, 20));});
    expect(button(name)).toBeDefined();
  });
};

test('uses the native caret for math templates, offers each slot and restores selections with undo', async () => {
  const onSend = vi.fn();
  await act(async () => root.render(<Harness initial="Let a." onSend={onSend}/>));
  await act(async () => {field().focus(); field().setSelectionRange(4, 5);});
  await click('Maths symbols', keyboard());
  await click('Sets', keyboard());
  await click('{ | }', keyboard());
  expect(field().value).toBe('Let {□ | □}.');
  expect([field().selectionStart, field().selectionEnd]).toEqual([5, 6]);
  expect(button('Send').disabled).toBe(true);
  await key('Tab');
  expect([field().selectionStart, field().selectionEnd]).toEqual([9, 10]);
  await click('ABC', keyboard());
  await click('y', keyboard());
  await click('Next □');
  await click('x', keyboard());
  expect(field().value).toBe('Let {x | y}.');
  await key('z', {ctrlKey: true});
  expect(field().value).toBe('Let {□ | y}.');
  await key('z', {ctrlKey: true, shiftKey: true});
  await key('Enter', {metaKey: true});
  expect(onSend).toHaveBeenCalledWith('Let {x | y}.');
  await click('Maths symbols', keyboard());
  expect(button('Sets', keyboard()).getAttribute('aria-pressed')).toBe('true');
});

test('completes proof notation and asks for help without consuming a draft', async () => {
  const onSend = vi.fn();
  const onAsk = vi.fn();
  await act(async () => root.render(<Harness onAsk={onAsk} onSend={onSend}/>));
  await act(async () => field().focus());
  expect(button('f⁻¹(B)', suggestion())).toBeUndefined();
  await input('nota');
  await awaitAid('Insert notation');
  await click('Insert notation', suggestion());
  expect(field().value).toBe('notation ');
  await input('');
  await input('Let eps');
  expect(field().value).toBe('Let eps');
  await awaitAid('Replace eps with ε');
  await click('Replace eps with ε');
  expect(field().value).toBe('Let ε');
  await answerAction('Undo typing');
  expect(field().value).toBe('Let eps');
  await answerAction('Hint 1/4');
  await answerAction('Stuck');
  await answerAction('Ask about notation');
  expect(onAsk.mock.calls).toEqual([['hint'], ['stuck'], ['notation']]);
  expect(onSend).not.toHaveBeenCalled();
  expect(field().value).toBe('Let eps');
});

test('shows both numeric layouts and keeps physical IME composition atomic', async () => {
  const onChange = vi.fn();
  await act(async () => root.render(<Harness onChange={onChange}/>));
  await click('Keys');
  await click('?123', keyboard());
  await click('=\\<', keyboard());
  await click('²', keyboard());
  await click('Hide keyboard');
  expect(host.querySelector('.rows')).toBeNull();
  await click('Keys');
  expect(button('Use device keyboard')).toBeUndefined();
  expect(field().inputMode).toBe('none');
  await act(async () => field().focus());
  onChange.mockClear();
  const compose = (type: 'compositionstart' | 'compositionend') => act(async () =>
    field().dispatchEvent(new CompositionEvent(type, {bubbles: true})));
  await compose('compositionstart');
  await input('²証');
  await input('²証明');
  expect(onChange).not.toHaveBeenCalled();
  expect(field().value).toBe('²証明');
  await compose('compositionend');
  expect(onChange.mock.calls).toEqual([['²証明']]);
  await key('z', {ctrlKey: true});
  expect(field().value).toBe('²');
});

test('touch holds choose the small digit and repeat Delete without a trailing duplicate', async () => {
  vi.useFakeTimers();
  await act(async () => root.render(<Harness initial="abc"/>));
  await click('Keys');
  const press = (name: string, type: 'pointerdown' | 'pointerup' | 'pointercancel') => act(async () =>
    button(name, keyboard()).dispatchEvent(new PointerEvent(type, {pointerId: 1, isPrimary: true, button: 0, bubbles: true, pointerType: 'touch'})));
  const trailingClick = (name: string) => act(async () =>
    button(name, keyboard()).dispatchEvent(new MouseEvent('click', {detail: 1, bubbles: true})));
  await press('q', 'pointerdown');
  await act(async () => vi.advanceTimersByTime(390));
  await press('q', 'pointerup');
  await trailingClick('q');
  expect(field().value).toBe('abc1');
  await press('Delete', 'pointerdown');
  expect(field().value).toBe('abc');
  await act(async () => vi.advanceTimersByTime(430));
  await press('Delete', 'pointerup');
  await trailingClick('Delete');
  expect(field().value).toBe('ab');
});

test('keeps the draft and suspends help requests while the tutor is responding', async () => {
  const onAsk = vi.fn();
  await act(async () => root.render(<Harness initial="Unfinished □" onAsk={onAsk} hintLevel={3}/>));
  await click('Keys');
  await click('Edit answer');
  expect(button('Hint 3/4').disabled).toBe(false);
  await click('Ask about notation');
  expect(onAsk.mock.calls).toEqual([['notation']]);
  expect(field().value).toBe('Unfinished □');
  await act(async () => root.render(<Harness onAsk={onAsk} hintLevel={3} pending/>));
  expect(host.querySelector('[aria-label="Answer keyboard"]')).not.toBeNull();
  await click('Edit answer');
  expect(button('Ask about notation')).toBeUndefined();
  expect(button('Hint 3/4').disabled).toBe(true);
  expect(onAsk).toHaveBeenCalledTimes(1);
  expect(field().value).toBe('Unfinished □');
});

test('keeps the conversation open on a compact phone and reveals the math keyboard on demand', async () => {
  vi.stubGlobal('innerWidth', 360);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 360, 510));
  await act(async () => root.render(<div className="lemma-tutor"><Harness/></div>));
  expect(host.querySelector('.keyboard-composer')?.getAttribute('data-keyboard')).toBe('hidden');
  await click('Keys');
  expect(host.querySelector('.keyboard-composer')?.getAttribute('data-keyboard')).toBe('math');
  await click('q', keyboard());
  expect(field().value).toBe('q');
  await click('Hide keyboard');
  await act(async () => field().dispatchEvent(new PointerEvent('pointerdown', {bubbles: true})));
  expect(host.querySelector('.keyboard-composer')?.getAttribute('data-keyboard')).toBe('math');
});

test('keeps focus and the selected text through the alphabet and symbol layouts', async () => {
  await act(async () => root.render(<Harness initial="Draft x."/>));
  await act(async () => {field().focus(); field().setSelectionRange(6, 7);});
  await click('Maths symbols', keyboard());
  expect(document.activeElement).toBe(field());
  expect(field().inputMode).toBe('none');
  await click('Sets', keyboard());
  await click('∅', keyboard());
  expect(field().value).toBe('Draft ∅.');
  await click('ABC', keyboard());
  await click('Hide keyboard');
  expect(field().inputMode).toBe('none');
  expect(document.activeElement).toBe(field());
  expect(host.querySelector('.keyboard-composer')?.getAttribute('data-keyboard')).toBe('hidden');
});

test('keeps the tutor header anchored when opening the keyboard on short screens', async () => {
  vi.stubGlobal('innerWidth', 360);
  vi.stubGlobal('innerHeight', 510);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(510);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function(this: HTMLElement) {
    if (this.classList.contains('kb')) return new DOMRect(0, 310 - (this.closest('.lemma-tutor')?.scrollTop ?? 0), 360, 212);
    return new DOMRect(0, 0, 360, 510);
  });
  await act(async () => root.render(<div className="lemma-tutor"><div className="chat"/><Harness/></div>));
  const page = host.querySelector<HTMLElement>('.lemma-tutor')!;
  const chat = host.querySelector<HTMLElement>('.chat')!;
  chat.scrollTop = 23;
  expect(page.scrollTop).toBe(0);
  await click('Keys');
  // The responsive layout makes room for the keyboard; scrolling this ancestor
  // would push the persistent header out of view. Rendered geometry is covered
  // by the phone and landscape keyboard browser regressions.
  expect(page.scrollTop).toBe(0);
  expect(host.querySelector('.keyboard-composer')?.getAttribute('data-keyboard')).toBe('math');
  expect(chat.scrollTop).toBe(23);
  expect(host.querySelector<HTMLElement>('.kb')!.scrollTop).toBe(0);
});

test('suppresses mid-draft completion while leaving strategy choices and mathematical identifiers intact', async () => {
  await act(async () => root.render(<Harness/>));
  await act(async () => field().focus());
  await input('PREI suffix');
  await act(async () => field().setSelectionRange(4, 4));
  // Selection updates from a native event before accepting a suggestion.
  await key('ArrowRight');
  expect([...suggestion().querySelectorAll('button')].every(item => item.disabled)).toBe(true);
  expect(field().value).toBe('PREI suffix');
  await input('by ');
  for(const strategy of ['definition','induction','contradiction'])
    expect(button(strategy, suggestion())).toBeUndefined();
  await input('x_teh');
  await click('Space', keyboard());
  expect(field().value).toBe('x_teh ');
});

test('offers local typo corrections and can immediately restore what the learner typed', async () => {
  await act(async () => root.render(<Harness/>));
  await act(async () => field().focus());
  await input('teh');
  await awaitAid('Replace teh with the');
  expect(host.querySelector('[data-writing-aid-edit] del')?.textContent).toBe('teh');
  await click('Replace teh with the');
  expect(field().value).toBe('the');
  await click('Undo suggestion');
  expect(field().value).toBe('teh');
  await click('Space', keyboard());
  expect(field().value).toBe('teh ');
});

test('punctuation replaces a suggestion-supplied space and preserves learner-authored spaces', async () => {
  await act(async () => root.render(<Harness/>));
  await act(async () => field().focus());
  await input('nota');
  await awaitAid('Insert notation');
  await click('Insert notation');
  expect(field().value).toBe('notation ');
  await click('.', keyboard());
  expect(field().value).toBe('notation.');
  await answerAction('Undo typing');
  expect(field().value).toBe('notation ');
  await input('notation  ');
  await click('.', keyboard());
  expect(field().value).toBe('notation  .');
});

test('uses the existing haptics switch for virtual keys, suggestions and mode changes', async () => {
  const originalVibrate = Object.getOwnPropertyDescriptor(navigator, 'vibrate');
  const vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, 'vibrate', {configurable: true, value: vibrate});
  try {
    await act(async () => root.render(<Harness/>));
    await act(async () => field().focus());
    vibrate.mockClear();
    await click('p', keyboard());
    await click('Maths symbols', keyboard());
    await input('');
    await input('Let eps');
    await awaitAid('Replace eps with ε');
    await click('Replace eps with ε');
    expect(vibrate.mock.calls.length).toBe(3);
    setHapticsEnabled(false);
    await click('ABC', keyboard());
    await click('q', keyboard());
    expect(vibrate.mock.calls.length).toBe(3);
  } finally {
    if (originalVibrate) Object.defineProperty(navigator, 'vibrate', originalVibrate);
    else Reflect.deleteProperty(navigator, 'vibrate');
  }
});

test('undoing an explicit correction leaves the previous learner edit at the top of Undo', async () => {
  await act(async () => root.render(<Harness/>));
  await click('Keys');
  await click('t', keyboard());
  await click('e', keyboard());
  await click('h', keyboard());
  await awaitAid('Replace teh with the');
  await click('Replace teh with the');
  expect(field().value).toBe('the');
  await click('Undo suggestion');
  expect(field().value).toBe('teh');
  await answerAction('Undo typing');
  expect(field().value).toBe('te');
});

test('accepts a correction before punctuation and skips prefixes inside identifiers', async () => {
  await act(async () => root.render(<Harness/>));
  await act(async () => field().focus());
  await input('teh, therefore');
  await awaitAid('Replace teh with the');
  await click('Replace teh with the');
  expect(field().value).toBe('the, therefore');
  await input('teh_2');
  await act(async () => field().setSelectionRange(3, 3));
  await key('ArrowRight');
  expect(button('the', suggestion())).toBeUndefined();
});

test('previews a correction with a strike-through and keeps the original without creating an edit', async () => {
  await act(async () => root.render(<Harness/>));
  await act(async () => field().focus());
  await input('teh');
  await awaitAid('Replace teh with the');
  expect(suggestion().querySelectorAll('button')).toHaveLength(3);
  expect(host.querySelector('[data-writing-aid-edit] del')?.textContent).toBe('teh');
  expect(host.querySelector('[data-writing-aid-source]')?.textContent).toBe('teh');
  await click('Dismiss suggestion');
  expect(field().value).toBe('teh');
  expect(button('Replace teh with the')).toBeUndefined();
  await click('Space', keyboard());
  expect(field().value).toBe('teh ');
  expect(button('Replace teh with the')).toBeUndefined();
  await input('');
  await input('teh');
  await awaitAid('Replace teh with the');
});

test.each(['Teh', 'Cacuhy', 'x=teh', 'f(teh', 'f( teh', 'f.teh', '$teh', 'Let teh', 'for all'])(
  'does not change %s when a learner types a separator', async original => {
    await act(async () => root.render(<Harness initial={original}/>));
    await act(async () => field().focus());
    await click('Space', keyboard());
    expect(field().value).toBe(original + ' ');
  },
);

test('quick math keys insert at the caret without changing the alphabet layout', async () => {
  await act(async () => root.render(<Harness initial="x y"/>));
  await act(async () => {field().focus(); field().setSelectionRange(1, 2);});
  await click('∈', keyboard());
  expect(field().value).toBe('x∈y');
  expect(button('q', keyboard())).toBeDefined();
  expect([field().selectionStart, field().selectionEnd]).toEqual([2, 2]);
});

test('does not use restored draft names as newly authored completion evidence', async () => {
  await act(async () => root.render(<Harness initial="Čech says Če"/>));
  await act(async () => field().focus());
  expect(button('Insert Čech', suggestion())).toBeUndefined();
  expect(field().value).toBe('Čech says Če');
  await input('Čech says Čec');
  expect(button('Insert Čech', suggestion())).toBeUndefined();
});

const localImageId = '12345678-0123-4123-8123-123456789abc';
const localImage = {id:localImageId, kind:'drawing' as const, mimeType:'image/png' as const, blob:new Blob(['image'])};
const inkFixture = (draft: Partial<TutorInkState['draft']> = {}): TutorInkState => ({
  ready:true,status:'ready',error:'',snapshot:vi.fn(),retry:vi.fn(),continueWithText:vi.fn(),update:vi.fn(async()=>{}),
  draft:{strokes:[],photos:[localImage],width:3,accent:false,inlineImages:true,...draft},
});
const richField = () => host.querySelector<HTMLElement>('.tutor-answer-editor')!;

test('holds a queued rich answer against keyboard, paste and transcript actions until kept as a draft', async () => {
  const queuedText = 'Draft '+imageReference(localImageId);
  const onChange = vi.fn(), onSend = vi.fn();
  await act(async () => root.render(<Harness initial={queuedText} ink={inkFixture()} onChange={onChange} onSend={onSend}/>));
  await act(async () => richField().focus());
  await act(async () => root.render(<Harness initial={queuedText} ink={inkFixture({queuedText})} onChange={onChange} onSend={onSend}/>));
  expect(richField().getAttribute('contenteditable')).toBe('false');
  expect(button('Delete', keyboard()).disabled).toBe(true);
  expect(button('Remove drawing')).toHaveProperty('disabled', true);
  await act(async () => {
    const editor = richField();
    editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true}));
    editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}));
    const paste = new Event('paste',{bubbles:true,cancelable:true});
    Object.defineProperty(paste,'clipboardData',{value:{getData:()=> 'unwanted'}});
    editor.dispatchEvent(paste);
  });
  expect(onChange).not.toHaveBeenCalled();
  expect(onSend).not.toHaveBeenCalled();
  await act(async () => root.render(<Harness initial={queuedText} ink={inkFixture()} onChange={onChange} onSend={onSend}/>));
  expect(richField().getAttribute('contenteditable')).toBe('true');
  await click('Remove drawing');
  expect(onChange).toHaveBeenCalledWith('Draft ');
});

test('prunes image-dependent undo when cached bytes expire but keeps the latest valid text edits', async () => {
  const initial = 'Draft '+imageReference(localImageId);
  await act(async () => root.render(<Harness initial={initial} ink={inkFixture()}/>));
  await click('Remove drawing');
  await click('q',keyboard());
  await act(async () => root.render(<Harness initial={initial} ink={inkFixture({photos:[]})}/>));
  await answerAction('Undo typing');
  expect(richField().textContent).toBe('Draft ');
  await click('Edit answer');
  expect(button('Undo typing',host.querySelector('dialog[open]')!).disabled).toBe(true);
});
