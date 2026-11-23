import {useEffect, useState, type RefObject} from 'react';

/** How far the learner scrolls down before the header steps aside (px). */
export const HIDE_AFTER = 24;
/** How fast an upward fling must be to bring the header back (px per ms; about 600 px a second). */
export const REVEAL_SPEED = 0.6;
/** An upward fling must also travel this far (px), so a twitch does not count. */
export const REVEAL_DISTANCE = 40;
/** Wheel scrolling up this far within REVEAL_WINDOW ms (two notches in quick succession) counts as a fast scroll. */
export const WHEEL_REVEAL = 160;
export const REVEAL_WINDOW = 200;
/** With no input for this long, the header steps aside. */
export const IDLE_HIDE = 6000;

type Sample = {y: number; t: number};

/** The finger's speed over the last REVEAL_WINDOW ms, positive when the finger moves down (the chat scrolls up). */
export function flingSpeed(samples: readonly Sample[]): number {
  const last = samples.at(-1);
  if (!last) return 0;
  const first = samples.find(sample => last.t - sample.t <= REVEAL_WINDOW) ?? last;
  return last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0;
}

/**
 * N227 (Owner: "the header can disappear after few down scroll or inactivity and reappear only after upward scroll …
 * only after scroll speed"): the tutor's title bar, session progress and On the table step aside so more of the chat
 * shows. They hide after a short scroll down, or after IDLE_HIDE of no input, but only when the chat is long enough to
 * scroll. They come back only for a fast scroll up, at the top of the chat, or on Home or Page Up. Only the learner's
 * own input counts: the chat following a new reply does not hide them.
 */
export function useAutoHideHeader(chat: RefObject<HTMLElement | null>, active: boolean) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const element = chat.current;
    if (!active || !element) {
      setHidden(false);
      return;
    }
    const page = element.closest<HTMLElement>('.lemma-tutor') ?? element;
    let down = 0, idle = 0, lastInput = 0;
    let wheel = {up: 0, at: -Infinity};
    let touch: {startY: number; samples: Sample[]} | null = null;
    const scrollable = () => element.scrollHeight - element.clientHeight > 8;
    const show = () => {down = 0; setHidden(false);};
    const hide = () => {if (scrollable()) setHidden(true);};
    const arm = () => {
      lastInput = performance.now();
      window.clearTimeout(idle);
      idle = window.setTimeout(hide, IDLE_HIDE);
    };
    const scrolledDown = (amount: number) => {
      down += amount;
      if (down > HIDE_AFTER) hide();
    };
    const onWheel = (event: WheelEvent) => {
      arm();
      if (event.deltaY > 0) {
        wheel = {up: 0, at: -Infinity};
        scrolledDown(event.deltaY);
      } else if (event.deltaY < 0) {
        down = 0;
        if (event.timeStamp - wheel.at > REVEAL_WINDOW) wheel = {up: 0, at: event.timeStamp};
        wheel.up -= event.deltaY;
        if (wheel.up >= WHEEL_REVEAL) show();
      }
    };
    const onTouchStart = (event: TouchEvent) => {
      arm();
      const point = event.touches[0];
      touch = event.touches.length === 1 && point ? {startY: point.clientY, samples: [{y: point.clientY, t: event.timeStamp}]} : null;
      down = 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      arm();
      const point = event.touches[0];
      if (!touch || event.touches.length !== 1 || !point) return;
      touch.samples.push({y: point.clientY, t: event.timeStamp});
      touch.samples = touch.samples.filter(sample => event.timeStamp - sample.t <= REVEAL_WINDOW);
      const moved = point.clientY - touch.startY;
      if (moved < -HIDE_AFTER) hide();
      else if (moved >= REVEAL_DISTANCE && flingSpeed(touch.samples) >= REVEAL_SPEED) show();
    };
    const onTouchEnd = () => {touch = null;};
    const onKey = (event: KeyboardEvent) => {
      arm();
      if (event.target !== element) return;
      if (event.key === 'Home' || event.key === 'PageUp') show();
      else if (event.key === 'End' || event.key === 'PageDown') hide();
    };
    const onScroll = () => {
      // Reaching the top by the learner's own scrolling brings the header back.
      if (element.scrollTop <= 0 && performance.now() - lastInput < 800) show();
    };
    element.addEventListener('wheel', onWheel, {passive: true});
    element.addEventListener('touchstart', onTouchStart, {passive: true});
    element.addEventListener('touchmove', onTouchMove, {passive: true});
    element.addEventListener('touchend', onTouchEnd);
    element.addEventListener('touchcancel', onTouchEnd);
    element.addEventListener('scroll', onScroll, {passive: true});
    page.addEventListener('keydown', onKey);
    page.addEventListener('pointerdown', arm);
    page.addEventListener('input', arm);
    arm();
    return () => {
      window.clearTimeout(idle);
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchEnd);
      element.removeEventListener('scroll', onScroll);
      page.removeEventListener('keydown', onKey);
      page.removeEventListener('pointerdown', arm);
      page.removeEventListener('input', arm);
    };
  }, [chat, active]);
  return hidden;
}
