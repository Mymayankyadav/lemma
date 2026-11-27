import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, test, vi} from 'vitest';
import {keyboardLayoutFor} from '../../../src/features/tutor/keyboardLayout';
import {TutorKeyboard} from '../../../src/features/tutor/TutorKeyboard';
import {setHapticsEnabled} from '../../../src/ui/v7/haptics';
import type {KeyTouch} from '../../../src/features/tutor/writingAid/decoder/ngramSpatial';

// N252 (Owner: "keyboard layout should depend on the device. Keep the current layout for android devices").

const iPad = {platform: 'iPad', userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) Safari', maxTouchPoints: 5};
const desktopIPad = {platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari', maxTouchPoints: 5};
const android = {platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome Mobile', maxTouchPoints: 5};
const iPhone = {platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari', maxTouchPoints: 5};
const mac = {platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari', maxTouchPoints: 0};

test('the iPad keyboard is for an iPad in a wide window; Android, phones, desktops and the Android app keep Gboard', () => {
  expect(keyboardLayoutFor(iPad, true)).toBe('ipad');
  expect(keyboardLayoutFor(desktopIPad, true)).toBe('ipad');
  // iPadOS shows its phone keyboard in Slide Over and narrow Split View.
  expect(keyboardLayoutFor(iPad, false)).toBe('gboard');
  expect(keyboardLayoutFor(android, true)).toBe('gboard');
  expect(keyboardLayoutFor(iPhone, true)).toBe('gboard');
  expect(keyboardLayoutFor(mac, true)).toBe('gboard');
  expect(keyboardLayoutFor(iPad, true, true)).toBe('gboard');
});

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  setHapticsEnabled(false);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  vi.useRealTimers(); vi.restoreAllMocks(); setHapticsEnabled(true);
});

type Calls = {inserted: [string, KeyTouch | undefined][]; views: string[]; deleted: number; tabs: number; hidden: number};
async function mount(view = 'abc', layout: 'ipad' | 'gboard' = 'ipad', withTab = true) {
  const calls: Calls = {inserted: [], views: [], deleted: 0, tabs: 0, hidden: 0};
  const render = (current: string) => root.render(<TutorKeyboard view={current} lastMath="∀∃" disabled={false} layout={layout}
    onView={next => {calls.views.push(next); queueMicrotask(() => render(next));}}
    onInsert={(text, _typed, touch) => {calls.inserted.push([text, touch]);}} onDelete={() => {calls.deleted++;}} onMove={() => {}}
    onBrowse={() => {}} onTab={withTab ? () => {calls.tabs++;} : undefined} onHide={() => {calls.hidden++;}}/>);
  await act(async () => render(view));
  return calls;
}
const rowLabels = () => [...host.querySelectorAll('.rows > .row')].map(row =>
  [...row.querySelectorAll('button')].map(button => button.getAttribute('aria-label')));
const keys = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('.rows button')].filter(button => button.getAttribute('aria-label') === label);
const key = (label: string) => keys(label)[0]!;
function tap(button: Element) {
  const down = new MouseEvent('pointerdown', {bubbles: true, cancelable: true, button: 0, clientX: 0, clientY: 0});
  Object.defineProperties(down, {pointerId: {value: 1}, isPrimary: {value: true}});
  button.dispatchEvent(down);
  const up = new MouseEvent('pointerup', {bubbles: true, cancelable: true, button: 0});
  Object.defineProperty(up, 'pointerId', {value: 1});
  button.dispatchEvent(up);
  button.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, detail: 1}));
}

test('the iPad rows follow iPadOS with a pin beside the space bar', async () => {
  await mount();
  expect(host.querySelector('.rows')!.getAttribute('data-layout')).toBe('ipad');
  expect(rowLabels()).toEqual([
    ['Tab', ...'qwertyuiop', 'Delete'],
    ['Caps lock', ...'asdfghjkl', 'Return'],
    ['Shift', ...'zxcvbnm', ',', '.', 'Shift'],
    ['Maths symbols', '.?123', 'Keep keyboard open', 'Space', '.?123', 'Hide keyboard'],
  ]);
  // Each row is 12.5 letter keys across, so the letters line up as on the iPad.
  const width = (button: HTMLButtonElement) => Number(button.style.flexGrow || 1);
  for (const row of host.querySelectorAll('.rows > .row')) {
    expect([...row.querySelectorAll('button')].reduce((sum, button) => sum + width(button), 0)).toBeCloseTo(12.5, 5);
  }
  // Modifier keys carry iPadOS's symbols, not words; the secondary characters stand above their letters.
  for (const label of ['Tab', 'Delete', 'Caps lock', 'Return', 'Shift', 'Hide keyboard']) {
    expect(key(label).querySelector('svg')).not.toBeNull();
    expect(key(label).textContent).toBe('');
  }
  expect(keys('.?123').map(button => button.textContent)).toEqual(['.?123', '.?123']);
  expect(key('q').querySelector('sup')!.textContent).toBe('1');
  expect(key('a').querySelector('sup')!.textContent).toBe('@');
  expect(key('m').querySelector('sup')!.textContent).toBe(':');
  expect(key(',').querySelector('sup')!.textContent).toBe('!');
  expect(key('.').querySelector('sup')!.textContent).toBe('?');
  // No enlarged preview: iPadOS shows none.
  tap(key('h'));
  expect(host.querySelector<HTMLElement>('.tutor-key-preview')!.style.visibility).toBe('hidden');
});

test('the iPad keys type, hold for their grey characters, shift, lock caps, tab, return, delete and hide', async () => {
  const calls = await mount();
  await act(async () => {tap(key('h')); tap(key('i'));});
  await act(async () => {tap(key('Return')); tap(key('Delete')); tap(key('Tab')); tap(key('Hide keyboard'));});
  expect(calls.inserted.map(([text]) => text)).toEqual(['h', 'i', '\n']);
  expect([calls.deleted, calls.tabs, calls.hidden]).toEqual([1, 1, 1]);

  vi.useFakeTimers();
  const down = new MouseEvent('pointerdown', {bubbles: true, cancelable: true, button: 0});
  Object.defineProperties(down, {pointerId: {value: 2}, isPrimary: {value: true}});
  await act(async () => {key('a').dispatchEvent(down); vi.advanceTimersByTime(400);});
  const up = new MouseEvent('pointerup', {bubbles: true, cancelable: true, button: 0});
  Object.defineProperty(up, 'pointerId', {value: 2});
  await act(async () => {key('a').dispatchEvent(up); key('a').dispatchEvent(new MouseEvent('click', {bubbles: true, detail: 1}));});
  vi.useRealTimers();
  expect(calls.inserted.at(-1)![0]).toBe('@');
  expect(calls.inserted.filter(([text]) => text === 'a')).toEqual([]);

  // Shift: one capital, from either shift key.
  await act(async () => {tap(keys('Shift')[1]!);});
  expect(keys('Shift').map(button => button.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
  await act(async () => {tap(key('B'));});
  await act(async () => {tap(key('c'));});
  // Caps lock: capitals until it is pressed again.
  await act(async () => {tap(key('Caps lock'));});
  expect(key('Caps lock').getAttribute('aria-pressed')).toBe('true');
  await act(async () => {tap(key('D')); tap(key('E')); tap(key('Caps lock'));});
  await act(async () => {tap(key('f'));});
  expect(calls.inserted.slice(-5).map(([text]) => text)).toEqual(['B', 'c', 'D', 'E', 'f']);
});

test('without a tab handler the iPad tab key types a tab', async () => {
  const calls = await mount('abc', 'ipad', false);
  await act(async () => {tap(key('Tab'));});
  expect(calls.inserted.map(([text]) => text)).toEqual(['\t']);
});

test('the iPad number pages keep the maths symbols in the same frame and switch with #+= and 123', async () => {
  const calls = await mount('num');
  expect(rowLabels()).toEqual([
    ['Tab', ...'1234567890', 'Delete'],
    ['+', '−', '×', '÷', '=', '<', '>', '(', ')', '/', 'Return'],
    ['#+=', '^', '_', "'", ':', ';', '!', '?', ',', '.', '#+='],
    ['Maths symbols', 'ABC', 'Keep keyboard open', 'Space', 'ABC', 'Hide keyboard'],
  ]);
  await act(async () => {tap(keys('#+=')[1]!);});
  expect(rowLabels()[2]).toEqual(['123', '·', '…', '∘', '≈', '±', '∞', '~', '*', '$', '123']);
  await act(async () => {tap(key('123'));});
  await act(async () => {tap(keys('ABC')[1]!);});
  expect(calls.views).toEqual(['num2', 'num', 'abc']);
  // The maths pages keep their layout, with the hide key beside Delete.
  await mount('∀∃');
  expect(key('Hide keyboard')).toBeTruthy();
  expect(key('Tab')).toBeUndefined();
});

test('an iPad tap reaches the decoder in Gboard\'s frame, so its key centres hold on the iPad\'s stagger', async () => {
  const calls = await mount();
  // iPad geometry: 50 px keys, Q 1.25 keys in, A 1.55 and Z 2 (Gboard puts A half a key and Z a key and a half past Q).
  const start: Record<string, number> = {q: 1.25, a: 1.55, z: 2};
  const rowOf = (letter: string) => ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].findIndex(row => row.includes(letter));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const letter = this.dataset.letter;
    if (!letter) return new DOMRect(0, 0, 0, 0);
    const row = rowOf(letter), line = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'][row]!;
    return new DOMRect((start['qaz'[row]!]! + line.indexOf(letter)) * 50, row * 60, 50, 60);
  });
  const touchAt = async (letter: string) => {
    const box = key(letter).getBoundingClientRect();
    const down = new MouseEvent('pointerdown', {bubbles: true, cancelable: true, button: 0, clientX: box.left + 25, clientY: box.top + 30});
    Object.defineProperties(down, {pointerId: {value: 3}, isPrimary: {value: true}});
    await act(async () => {
      key(letter).dispatchEvent(down);
      key(letter).dispatchEvent(new MouseEvent('click', {bubbles: true, detail: 1}));
    });
    return calls.inserted.at(-1)![1]!;
  };
  // The decoder's centres: Q 0.5, A 1.0, Z 2.0 (ngramSpatial's KEY map); rows 0.5, 1.5, 2.5.
  const q = await touchAt('q');
  expect(q.x).toBeCloseTo(.5, 5); expect(q.y).toBeCloseTo(.5, 5);
  const a = await touchAt('a'), z = await touchAt('z'), m = await touchAt('m');
  expect(a.x).toBeCloseTo(1, 5); expect(a.y).toBeCloseTo(1.5, 5);
  expect(z.x).toBeCloseTo(2, 5); expect(z.y).toBeCloseTo(2.5, 5);
  expect(m.x).toBeCloseTo(8, 5);
});

test('Gboard\'s layout is unchanged when the layout is not the iPad\'s', async () => {
  await mount('abc', 'gboard');
  expect(host.querySelector('.rows')!.hasAttribute('data-layout')).toBe(false);
  expect(rowLabels()).toEqual([
    [...'qwertyuiop'],
    [...'asdfghjkl'],
    ['Shift', ...'zxcvbnm', 'Delete'],
    ['?123', ',', 'Maths symbols', 'Space', '.', 'New line'],
  ]);
  expect(key('a').querySelector('sup')).toBeNull();
  expect(key('Hide keyboard')).toBeUndefined();
});

test('the document is marked as an iPad before the first paint, and only on an iPad', async () => {
  const {markIPad} = await import('../../../src/platform/ipad');
  for (const [device, expected] of [[iPad, true], [desktopIPad, true], [android, false], [iPhone, false], [mac, false]] as const) {
    const root = document.createElement('html');
    expect(markIPad(root, device)).toBe(expected);
    expect(root.hasAttribute('data-ipad')).toBe(expected);
  }
});
