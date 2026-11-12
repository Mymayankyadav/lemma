import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';

// N130 · v7 UX audit r3, P4 and P5: the Lottie endings (docs/v7/ux-audit-2026-11-12/06_ILLUSTRATION_ANIMATION_ICON_AUDIT.md).
const play = vi.hoisted(() => vi.fn());
vi.mock('../../../src/ui/v7/lottiePlayer', () => ({playLottie: play}));
import {LottieMoment, PLAY_WITHIN, canvasScale} from '../../../src/ui/v7/LottieMoment';

type Node = Record<string, unknown>;
type Key = {t: number; s: number[]};
const load = (name: string) => JSON.parse(readFileSync(`src/ui/v7/lottie/${name}.json`, 'utf8')) as Node;
function groups(node: unknown, found: Node[] = []): Node[] {
  if (Array.isArray(node)) node.forEach(child => groups(child, found));
  else if (node && typeof node === 'object') {
    const object = node as Node;
    if (object.ty === 'gr') found.push(object);
    Object.values(object).forEach(child => groups(child, found));
  }
  return found;
}
const named = (name: string, group: string) => groups(load(name)).find(node => node.nm === group)!;
const items = (group: Node) => group.it as Node[];
const trimOf = (group: Node) => (items(group).find(item => item.ty === 'tm')!.e as {k: Key[]}).k;
const transformOf = (group: Node) => items(group).find(item => item.ty === 'tr')!;
const keys = (property: unknown) => (property as {k: Key[]}).k;

describe('P4 · the animation files', () => {
  it('LT6 · a shape with both a line and a paper lists its stroke first, so the paper never covers the line', () => {
    for (const name of ['inbox-zero', 'round-complete', 'day-closed']) for (const group of groups(load(name))) {
      const kinds = items(group).map(item => item.ty);
      if (kinds.includes('st') && kinds.includes('fl')) expect(kinds.indexOf('st'), name + ' · ' + group.nm).toBeLessThan(kinds.indexOf('fl'));
    }
  });
  it('LT4 · a fill fades in only once most of its outline is drawn (ink before paint)', () => {
    for (const [name, outline, paint] of [['inbox-zero', 'tray-outline', 'tray-fill'], ['day-closed', 'moon-outline', 'moon-fill']]) {
      const [drawFrom, drawTo] = trimOf(named(name, outline)).map(key => key.t);
      const fadeFrom = keys(transformOf(named(name, paint)).o)[0].t;
      expect(fadeFrom, name).toBeGreaterThanOrEqual(drawFrom + 0.7 * (drawTo - drawFrom));
    }
  });
  it('LT5 · a badge\'s tick starts drawing while its disc grows, so the disc never shows as a bare dot', () => {
    for (const name of ['inbox-zero', 'round-complete']) {
      const [growFrom, growTo] = keys(transformOf(named(name, 'disc')).s).map(key => key.t);
      const [tickFrom] = trimOf(named(name, 'tick')).map(key => key.t);
      expect(tickFrom, name).toBeGreaterThan(growFrom);
      expect(tickFrom, name).toBeLessThanOrEqual(growFrom + (growTo - growFrom) / 2);
    }
  });
});

describe('P5 · LottieMoment', () => {
  const motion = () => vi.stubGlobal('matchMedia', (query: string) =>
    ({matches: false, media: query, addEventListener() {}, removeEventListener() {}}));
  async function mount(width?: number) {
    Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<LottieMoment name="inbox" animation="inbox-zero" width={width} />));
    await act(async () => {for (let i = 0; i < 5; i++) await Promise.resolve();});
    const moment = host.querySelector('[data-lottie="inbox-zero"]')!;
    return {moment, done: async () => {await act(async () => root.unmount()); host.remove();}};
  }
  afterEach(() => {vi.useRealTimers(); vi.unstubAllGlobals(); play.mockReset(); delete document.documentElement.dataset.theme;});

  it('LT1 · while the player loads only the backdrop shows, never the finished still', async () => {
    motion();
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    play.mockReturnValue(new Promise(() => undefined));
    const {moment, done} = await mount();
    expect(moment.getAttribute('data-lottie-state')).toBe('loading');
    expect(moment.querySelector('[data-illustration-backdrop]')).not.toBeNull();
    expect(moment.querySelector('[data-illustration]')).toBeNull();
    await done();
  });
  it('LT1 · when the player misses its window the still fades in over the backdrop and stays', async () => {
    motion();
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    play.mockReturnValue(new Promise(() => undefined));
    const {moment, done} = await mount();
    await act(async () => {vi.advanceTimersByTime(PLAY_WITHIN + 1);});
    expect(moment.getAttribute('data-lottie-state')).toBe('still');
    expect(moment.hasAttribute('data-lottie-late')).toBe(true);
    expect(moment.querySelector('[data-illustration="inbox"]')).not.toBeNull();
    expect(moment.querySelector('[data-illustration-backdrop]')).toBeNull();
    await done();
  });
  it('LT2 · the canvas matches the screen\'s density, up to 3×', async () => {
    expect([canvasScale(1), canvasScale(2), canvasScale(2.625), canvasScale(3.5), canvasScale(0.5), canvasScale(Number.NaN)]).toEqual([1, 2, 2.625, 3, 1, 1]);
    motion();
    play.mockReturnValue(new Promise(() => undefined));
    vi.stubGlobal('devicePixelRatio', 3);
    const {moment, done} = await mount(160);
    const canvas = moment.querySelector('canvas')!;
    expect([canvas.width, canvas.height]).toEqual([480, 360]);
    await done();
  });
  it('LT10 · if the theme changes after it played, the still (in the new colours) replaces the canvas', async () => {
    motion();
    const stop = vi.fn();
    play.mockResolvedValue(stop);
    const {moment, done} = await mount();
    expect(moment.getAttribute('data-lottie-state')).toBe('playing');
    await act(async () => {document.documentElement.dataset.theme = 'graph-night'; await Promise.resolve();});
    expect(stop).toHaveBeenCalledOnce();
    expect(moment.getAttribute('data-lottie-state')).toBe('still');
    expect(moment.querySelector('[data-illustration="inbox"]')).not.toBeNull();
    expect(moment.querySelector('canvas')!.hidden).toBe(true);
    await done();
    expect(stop).toHaveBeenCalledOnce();
  });
});
