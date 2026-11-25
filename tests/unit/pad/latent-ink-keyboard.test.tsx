import {act, useState} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, expect, test} from 'vitest';
import {LocalPadEditor} from '../../../src/features/pad/LocalPadEditor';
import {padEdit} from '../../../src/features/pad/padEdit';
import {FLAG_DEFAULTS} from '../../../src/flags';

// N249 (Owner): drawing a symbol belongs to the tutor's keyboard, not the Pad's. N248's Pad version was removed, so a
// stroke over the Pad's math keys is an ordinary key press again, with no drawing surface and no flag.
let host: HTMLDivElement, root: Root, text = '';
beforeEach(() => {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  history.replaceState(null, '', '/?flags=padLatentInk');
  localStorage.clear(); text = '';
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {await act(async () => root.unmount()); host.remove(); history.replaceState(null, '', '/');});

function Harness() {
  const [value, setValue] = useState(padEdit(''));
  return <LocalPadEditor value={value} onEdit={edit => {text = edit.text; setValue(edit);}}/>;
}
const button = (name: string) => [...host.querySelectorAll('button')]
  .find(node => (node.getAttribute('aria-label') ?? node.textContent) === name)!;

test('the Pad has no drawing flag, and its keys are plain keys even when the old flag name is asked for', async () => {
  expect('padLatentInk' in FLAG_DEFAULTS).toBe(false);
  await act(async () => root.render(<Harness/>));
  const key = button('Plus');
  await act(async () => {
    key.dispatchEvent(new MouseEvent('pointerdown', {bubbles: true, clientX: 10, clientY: 10, button: 0}));
    key.dispatchEvent(new MouseEvent('pointermove', {bubbles: true, clientX: 60, clientY: 60, button: 0}));
    key.dispatchEvent(new MouseEvent('pointerup', {bubbles: true, clientX: 60, clientY: 60, button: 0}));
    key.click();
  });
  expect(text).toBe('+');
  expect(host.querySelector('canvas.pad-latent-ink, .pad-latent-strip, .pad-keyboard-body--ink')).toBeNull();
});
