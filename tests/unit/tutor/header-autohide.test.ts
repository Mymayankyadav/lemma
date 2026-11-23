import {describe, expect, it} from 'vitest';
import {keepsKeyboardOpenFor} from '../../../src/features/tutor/TutorComposer';

describe('the Tutor header actions', () => {
  it('keeps suggestions available when opening or using the header menu', () => {
    const header = document.createElement('header');
    header.innerHTML = '<button data-tutor-session-actions><svg></svg></button><button aria-label="Back"></button>';
    expect(keepsKeyboardOpenFor(header.querySelector('svg')!)).toBe(true);
    expect(keepsKeyboardOpenFor(header.querySelector('[aria-label="Back"]')!)).toBe(false);
    const sheet = document.createElement('dialog');
    expect(keepsKeyboardOpenFor(sheet.appendChild(document.createElement('button')))).toBe(true);
    const menu = document.createElement('div');
    menu.setAttribute('role', 'dialog');
    const action = menu.appendChild(document.createElement('button'));
    expect(keepsKeyboardOpenFor(action)).toBe(true);
  });
});
