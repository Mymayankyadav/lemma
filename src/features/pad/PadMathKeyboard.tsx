import {useId, useRef, useState, type KeyboardEvent, type PointerEvent} from 'react';
import {PAD_SYMBOLS, type PadSymbol, type PadTemplate} from './padEdit';
import {LatentInkStrip} from './latentInk/LatentInkStrip';
import {useLatentInk, type LatentInkHandlers} from './latentInk/useLatentInk';
import './pad-math-keyboard.css';

export type PadKeyboardAction = 'backspace' | 'left' | 'right' | 'home' | 'end' | 'enter' | 'space' | 'undo' | 'redo' | 'slot';
const symbol = (label: string, glyph: string, tex: string): PadSymbol => ({label, glyph, tex});
const groups: Readonly<Record<string, readonly PadSymbol[]>> = {
  Symbols: [...PAD_SYMBOLS, symbol('Plus', '+', '+'), symbol('Minus', '−', '-'), symbol('Times', '×', '\\times'),
    symbol('Divide', '÷', '\\div'), symbol('Equals', '=', '='), symbol('Plus or minus', '±', '\\pm')],
  Numbers: [...'7894561230'.split('').map(glyph => symbol(glyph, glyph, glyph)), symbol('Decimal point', '.', '.'),
    symbol('Variable x', 'x', 'x'), symbol('Variable y', 'y', 'y')],
  Algebra: [symbol('Alpha', 'α', '\\alpha'), symbol('Beta', 'β', '\\beta'), symbol('Gamma', 'γ', '\\gamma'),
    symbol('Delta', 'δ', '\\delta'), symbol('Lambda', 'λ', '\\lambda'), symbol('Real numbers', 'ℝ', '\\mathbb{R}'),
    symbol('Natural numbers', 'ℕ', '\\mathbb{N}'), symbol('Integers', 'ℤ', '\\mathbb{Z}'), symbol('Subset', '⊆', '\\subseteq'),
    symbol('Union', '∪', '\\cup'), symbol('Intersection', '∩', '\\cap'), symbol('Empty set', '∅', '\\varnothing')],
  Calculus: [symbol('Integral', '∫', '\\int'), symbol('Sum', '∑', '\\sum'), symbol('Product', '∏', '\\prod'),
    symbol('Partial derivative', '∂', '\\partial'), symbol('Nabla', '∇', '\\nabla'), symbol('Limit', 'lim', '\\lim'),
    symbol('Sine', 'sin', '\\sin'), symbol('Cosine', 'cos', '\\cos'), symbol('Logarithm', 'ln', '\\ln')],
  Geometry: [symbol('Pi', 'π', '\\pi'), symbol('Theta', 'θ', '\\theta'), symbol('Angle', '∠', '\\angle'),
    symbol('Perpendicular', '⊥', '\\perp'), symbol('Parallel', '∥', '\\parallel'), symbol('Triangle', '△', '\\triangle'),
    symbol('Congruent', '≅', '\\cong'), symbol('Approximately equal', '≈', '\\approx'), symbol('Degrees', '°', '{}^{\\circ}')],
};
const templates: Readonly<Record<string, readonly PadTemplate[]>> = {
  Symbols: ['Fraction', 'Square root', '2 × 2 matrix'],
  Numbers: ['Fraction', 'Exponent', 'Parentheses'],
  Algebra: ['Exponent', 'Subscript', 'Brackets', 'Absolute value', '2 × 2 matrix'],
  Calculus: ['Definite integral', 'Summation', 'Fraction'],
  Geometry: ['Square root', 'Exponent', 'Parentheses'],
};
const actions: readonly {action: PadKeyboardAction; label: string; glyph: string}[] = [
  {action:'left',label:'Cursor left',glyph:'←'}, {action:'right',label:'Cursor right',glyph:'→'},
  {action:'home',label:'Line start',glyph:'⇤'}, {action:'end',label:'Line end',glyph:'⇥'},
  {action:'backspace',label:'Backspace',glyph:'⌫'}, {action:'enter',label:'Enter',glyph:'↵'},
  {action:'space',label:'Space',glyph:'Space'}, {action:'slot',label:'Next slot',glyph:'Next slot'},
  {action:'undo',label:'Undo text',glyph:'Undo'}, {action:'redo',label:'Redo text',glyph:'Redo'},
];

interface Props {
  shown: boolean; nativeKeyboardOpen: boolean; mode: 'device' | 'math'; composing: boolean;
  canUndo: boolean; canRedo: boolean; hasSlot: boolean;
  onShown: (shown: boolean) => void; onMode: (mode: 'device' | 'math') => void;
  onSymbol: (symbol: PadSymbol) => void; onTemplate: (template: PadTemplate) => void;
  onAction: (action: PadKeyboardAction) => void; keepSelection: (event: PointerEvent<HTMLButtonElement>) => void;
  /** N248 (flag padLatentInk): draw one symbol at a time over the keys. */
  latentInk?: LatentInkHandlers;
}
const noInk: LatentInkHandlers = {onInsert: () => false, onRetract: () => false};

/** Ordinary labeled buttons, in document flow: neither the editor nor the native
 * keyboard is covered by a fixed overlay. The key area has its own bounded scroll. */
export function PadMathKeyboard(props: Props) {
  const [group, setGroup] = useState('Symbols'), id = useId();
  const tabs = useRef<HTMLDivElement>(null);
  const expanded = props.shown && !props.nativeKeyboardOpen;
  const inkOn = !!props.latentInk && expanded && !props.composing;
  const ink = useLatentInk(inkOn, props.latentInk ?? noInk);
  function tabKey(event: KeyboardEvent<HTMLButtonElement>) {
    const names = Object.keys(groups), index = names.indexOf(group);
    const next = event.key === 'ArrowRight' ? (index + 1) % names.length
      : event.key === 'ArrowLeft' ? (index + names.length - 1) % names.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? names.length - 1 : -1;
    if (next < 0) return;
    event.preventDefault(); setGroup(names[next]);
    const tab = tabs.current?.querySelectorAll<HTMLButtonElement>('button')[next];
    tab?.focus(); tab?.scrollIntoView?.({block:'nearest', inline:'nearest'});
  }
  return <section aria-label="Math keyboard" className="pad-math-keyboard" data-mode={props.mode}>
    <div className="pad-keyboard-bar">
      <strong>Math keyboard</strong>
      <button type="button" aria-expanded={expanded} aria-controls={id + '-keys'} disabled={props.composing}
        onPointerDown={props.keepSelection} onClick={() => props.onShown(!props.shown)}>
        {props.shown ? 'Hide math keyboard' : 'Show math keyboard'}
      </button>
      {props.shown && <button type="button" onPointerDown={props.keepSelection} disabled={props.composing}
        onClick={() => props.onMode(props.mode === 'math' ? 'device' : 'math')}>
        {props.mode === 'math' ? 'Use device keyboard' : 'Use math keyboard'}
      </button>}
    </div>
    <p className="pad-keyboard-mode" role="status">{props.composing ? 'Finish composing before using math keys.'
      : props.nativeKeyboardOpen && props.shown ? 'Device keyboard open. Choose Use math keyboard to switch.'
      : !props.shown ? 'Math keyboard hidden. Native typing is available.'
      : props.mode === 'math' && inkOn ? 'Math keyboard selected. Tap a key, or draw one symbol over the keys.'
      : props.mode === 'math' ? 'Math keyboard selected. Hardware typing still works.'
      : 'Native typing is available. Math keys insert at your selection.'}</p>
    {inkOn && <LatentInkStrip view={ink.view} keepSelection={props.keepSelection} onChoose={ink.choose} onClear={ink.clear}/>}
    <div id={id + '-keys'} hidden={!expanded} ref={ink.body} {...ink.bind}
      className={inkOn ? 'pad-keyboard-body pad-keyboard-body--ink' : 'pad-keyboard-body'}>
      {inkOn && <canvas ref={ink.canvas} className="pad-latent-ink" aria-hidden="true"/>}
      <div ref={tabs} role="tablist" aria-label="Math key groups" className="pad-keyboard-tabs">
        {Object.keys(groups).map(name => <button key={name} type="button" role="tab" id={id + '-' + name}
          aria-selected={name === group} aria-controls={id + '-panel'} tabIndex={name === group ? 0 : -1}
          onPointerDown={props.keepSelection} onKeyDown={tabKey} onClick={() => setGroup(name)}>{name}</button>)}
      </div>
      <div id={id + '-panel'} role="tabpanel" aria-labelledby={id + '-' + group}>
        <div role="group" aria-label="Math symbols" className="pad-keyboard-grid">
          {groups[group].map(entry => <button key={entry.label} type="button" aria-label={entry.label}
            disabled={props.composing} onPointerDown={props.keepSelection} onClick={() => props.onSymbol(entry)}>{entry.glyph}</button>)}
        </div>
        <div role="group" aria-label="Math templates" className="pad-keyboard-templates">
          {templates[group].map(template => <button key={template} type="button" disabled={props.composing}
            onPointerDown={props.keepSelection} onClick={() => props.onTemplate(template)}>{template}</button>)}
        </div>
      </div>
      <div role="group" aria-label="Text editing keys" className="pad-keyboard-grid pad-keyboard-actions">
        {actions.map(({action, label, glyph}) => <button key={action} type="button" aria-label={label}
          disabled={props.composing || (action === 'undo' && !props.canUndo) || (action === 'redo' && !props.canRedo)
            || (action === 'slot' && !props.hasSlot)}
          onPointerDown={props.keepSelection} onClick={() => {
            if (action === 'undo') ink.noteUndo();
            props.onAction(action);
          }}>{glyph}</button>)}
      </div>
    </div>
  </section>;
}
