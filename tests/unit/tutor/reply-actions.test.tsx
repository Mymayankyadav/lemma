// @vitest-environment jsdom
import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {ReplyActions, replyRating} from '../../../src/features/tutor/ReplyActions';

// N227 (Owner: "keep the option of copy and like and dislike and make a card from conversation icon").
(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root, host: HTMLDivElement;
const button = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`);
beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.replaceChildren(host);
  root = createRoot(host);
});
afterEach(() => {act(() => root.unmount());});

describe('the actions under a tutor reply', () => {
  it('shows Copy, Good and Bad reply, then the chat\'s own actions, in that order', () => {
    act(() => root.render(<ReplyActions id="t1" body="Use a finite subcover."><button aria-label="Make a card"/></ReplyActions>));
    expect([...host.querySelectorAll('button')].map(node => node.getAttribute('aria-label')))
      .toEqual(['Copy reply', 'Good reply', 'Bad reply', 'Make a card']);
  });
  it('keeps one thumb per reply on this device; a second tap takes it back', () => {
    act(() => root.render(<ReplyActions id="t1" body="x"/>));
    act(() => button('Good reply')!.click());
    expect(button('Good reply')!.getAttribute('aria-pressed')).toBe('true');
    expect(replyRating('t1')).toBe('up');
    act(() => button('Bad reply')!.click());
    expect(button('Good reply')!.getAttribute('aria-pressed')).toBe('false');
    expect(replyRating('t1')).toBe('down');
    act(() => root.unmount());
    root = createRoot(host);
    act(() => root.render(<ReplyActions id="t1" body="x"/>));
    expect(button('Bad reply')!.getAttribute('aria-pressed')).toBe('true');
    act(() => button('Bad reply')!.click());
    expect(replyRating('t1')).toBeUndefined();
    expect(replyRating('other')).toBeUndefined();
  });
  it('copies the reply\'s text and says so, or says it could not', async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', {value: {writeText}, configurable: true});
    act(() => root.render(<ReplyActions id="t1" body="Use a finite subcover."/>));
    await act(async () => {button('Copy reply')!.click();});
    expect(writeText).toHaveBeenCalledWith('Use a finite subcover.');
    expect(button('Copied')).not.toBeNull();
    await act(async () => {button('Copied')!.click();});
    expect(host.textContent).toContain('Could not copy');
  });
});
