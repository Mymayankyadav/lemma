import {act, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {LocalPadEditor} from '../../../src/features/pad/LocalPadEditor';
import {LocalPadPreview} from '../../../src/features/pad/LocalPadPreview';
import {PAD_PREVIEW_LIMIT, PAD_SLOT, padEdit, type PadEdit} from '../../../src/features/pad/padEdit';

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function Harness({initial, onEdit}: {initial: PadEdit; onEdit: (value: PadEdit) => void}) {
  const [value, setValue] = useState(initial);
  return <LocalPadEditor value={value} onEdit={next => {onEdit(next); setValue(next);}}/>;
}
function button(label: string): HTMLButtonElement {
  return [...host.querySelectorAll('button')].find(node => (node.getAttribute('aria-label') ?? node.textContent) === label)!;
}
function input(node: HTMLTextAreaElement, text: string) {
  // Set the native property without using React's installed value tracker.
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(node, text);
  node.setSelectionRange(text.length, text.length);
  node.dispatchEvent(new InputEvent('input', {bubbles: true, data: text}));
}

test('restores caret/selection and performs native typing, symbols, templates and preview without a request', async () => {
  const fetch = vi.fn(), edits = vi.fn();
  vi.stubGlobal('fetch', fetch);
  await act(async () => root.render(<Harness initial={padEdit('x = y', 4, 5, 'backward')} onEdit={edits}/>));
  const text = host.querySelector('textarea')!;
  expect([text.selectionStart, text.selectionEnd, text.selectionDirection]).toEqual([4, 5, 'backward']);
  await act(async () => button('Fraction').click());
  expect(text.value).toBe('x = \\(\\frac{y}{' + PAD_SLOT + '}\\)');
  expect(text.value.slice(text.selectionStart, text.selectionEnd)).toBe(PAD_SLOT);
  expect(document.activeElement).toBe(text);
  expect(host.querySelector('math')).not.toBeNull();
  await act(async () => button('Infinity').click());
  expect(text.value).toContain('\\infty ');
  await act(async () => input(text, 'π = $\\sq'));
  expect(edits).toHaveBeenLastCalledWith(padEdit('π = $\\sq'));
  await act(async () => button('\\sqrt').click());
  expect(text.value).toBe('π = $\\sqrt ');
  expect(host.querySelector('.local-pad-unrendered')?.textContent).toBe('$\\sqrt ');
  expect(fetch).not.toHaveBeenCalled();
});

test('does not intercept editing or apply toolbar actions during composition', async () => {
  const edits = vi.fn();
  await act(async () => root.render(<Harness initial={padEdit('')} onEdit={edits}/>));
  const text = host.querySelector('textarea')!;
  await act(async () => {
    text.focus();
    text.dispatchEvent(new CompositionEvent('compositionstart', {bubbles: true}));
  });
  expect(button('Fraction').disabled).toBe(true);
  await act(async () => {input(text, '証明'); button('Fraction').click();});
  expect(text.value).toBe('証明');
  await act(async () => text.dispatchEvent(new CompositionEvent('compositionend', {bubbles: true, data: '証明'})));
  expect(button('Fraction').disabled).toBe(false);
  expect(host.querySelector('[aria-label="Local math preview"]')?.textContent).toBe('証明');
});

test('renders local MathML without interpreting prose as markup or allowing remote embeds', async () => {
  const source = '<img src="https://example.test/image"> [link](https://example.test) $x^2$ '
    + '$\\href{https://example.test}{x}$ $\\includegraphics{https://example.test/image}$';
  await act(async () => root.render(<LocalPadPreview source={source}/>));
  expect(host.querySelector('math')).not.toBeNull();
  expect(host.querySelector('img, a, script, iframe')).toBeNull();
  expect(host.textContent).toContain('<img src="https://example.test/image">');
});

test('preserves literal text for invalid or over-budget TeX and isolates formula macros', async () => {
  const source = '$\\gdef\\newpadcmd{x}\\newpadcmd$ $\\newpadcmd$ $\\frac{$ $\\hspace{-10000em}x$ '
    + '$\\def\\next{\\next}\\next$ $' + 'x'.repeat(1201) + '$';
  await act(async () => root.render(<LocalPadPreview source={source}/>));
  expect(host.querySelectorAll('math')).toHaveLength(1);
  expect([...host.querySelectorAll('.local-pad-unrendered')].map(node => node.textContent)).toEqual([
    '$\\newpadcmd$', '$\\frac{$', '$\\hspace{-10000em}x$', '$\\def\\next{\\next}\\next$', '$' + 'x'.repeat(1201) + '$',
  ]);
  await act(async () => root.render(<LocalPadPreview source={'$x$ '.repeat(25)}/>));
  expect(host.querySelectorAll('math')).toHaveLength(24);
  expect(host.querySelector('.local-pad-unrendered')?.textContent).toBe('$x$');
  await act(async () => root.render(<LocalPadPreview source={'x'.repeat(PAD_PREVIEW_LIMIT + 1)}/>));
  expect(host.textContent).toContain('Your text is unchanged.');
});

test('offers only the explicitly selected bounded text to the tutor, and freezes that value on click', async () => {
  const send = vi.fn(), fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const full = 'Private before |  ∀ x ∈ ℝ  | private after';
  const snippet = '  ∀ x ∈ ℝ  ', start = full.indexOf(snippet);
  const render = (value: PadEdit) => act(async () =>
    root.render(<LocalPadEditor value={value} onEdit={() => {}} onSendSelection={send}/>));
  await render(padEdit(full, start, start + snippet.length));
  const action = button('Send selection to tutor');
  expect(send).not.toHaveBeenCalled();
  await act(async () => action.click());
  expect(send.mock.calls).toEqual([[snippet]]);
  await render(padEdit('later edits'));
  expect(action.disabled).toBe(true);
  await render(padEdit('x'.repeat(1201), 0, 1201));
  expect(action.disabled).toBe(true);
  expect(host.textContent).toContain('Select up to 1200 characters.');
  expect(fetch).not.toHaveBeenCalled();
  expect(send.mock.calls).toEqual([[snippet]]);
});
