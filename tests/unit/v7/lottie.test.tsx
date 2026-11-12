import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {themeLottie, type LottieRole, type Rgb} from '../../../src/ui/v7/lottie';
import {applyReduceEffects} from '../../../src/ui/v7/effects';

// N129 · A3 the Lottie moments: three code-drawn animations, themed from the page, played once by a player that loads
// only on demand, with the A2 still shown first and kept under reduced motion or on any failure.
const play = vi.hoisted(() => vi.fn());
vi.mock('../../../src/ui/v7/lottiePlayer', () => ({playLottie: play}));
import {LottieMoment, PLAY_WITHIN} from '../../../src/ui/v7/LottieMoment';

const NAMES = ['inbox-zero', 'round-complete', 'day-closed'] as const;
const ROLES: LottieRole[] = ['bg', 'ink', 'muted', 'paper', 'accent', 'onAccent'];
type Node = Record<string, unknown>;
const load = (name: string) => JSON.parse(readFileSync(`src/ui/v7/lottie/${name}.json`, 'utf8')) as Node;
function paints(node: unknown, found: Node[] = []): Node[] {
  if (Array.isArray(node)) node.forEach(child => paints(child, found));
  else if (node && typeof node === 'object') {
    const object = node as Node;
    if (object.ty === 'fl' || object.ty === 'st') found.push(object);
    Object.values(object).forEach(child => paints(child, found));
  }
  return found;
}
const colours = Object.fromEntries(ROLES.map((role, index) => [role, [index * 40, 255 - index * 40, 17] as Rgb])) as Record<LottieRole, Rgb>;

describe('N129 Lottie files', () => {
  it('each is small, plays once in at most 1.6 s, and paints only in named theme roles', () => {
    for (const name of NAMES) {
      const text = readFileSync(`src/ui/v7/lottie/${name}.json`, 'utf8');
      expect(text.length).toBeLessThan(60 * 1024);
      const data = load(name);
      expect(data.fr).toBe(60);
      expect((data.op as number) - (data.ip as number)).toBeLessThanOrEqual(96);
      expect([data.w, data.h]).toEqual([240, 180]);
      expect(data.assets).toEqual([]);
      const found = paints(data);
      expect(found.length).toBeGreaterThan(3);
      for (const paint of found) expect(ROLES).toContain(paint.nm);
      expect(found.some(paint => paint.nm === 'accent')).toBe(true);
    }
  });
  it('frame 1 is a calm still: the backdrop is there from the start, not faded in', () => {
    for (const name of NAMES) {
      const backdrop = (load(name).layers as Node[]).find(layer => layer.nm === 'backdrop')!;
      expect(JSON.stringify(backdrop)).not.toContain('"a":1');
    }
  });
  it('nothing overshoots: every keyframe eases out with handles inside 0…1', () => {
    for (const name of NAMES) {
      const text = readFileSync(`src/ui/v7/lottie/${name}.json`, 'utf8');
      for (const match of text.matchAll(/"[io]":\{"x":\[([^\]]+)\],"y":\[([^\]]+)\]\}/g))
        for (const value of [...match[1].split(','), ...match[2].split(',')].map(Number)) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
    }
  });
  it('themeLottie colours every role from the page and leaves the file untouched', () => {
    for (const name of NAMES) {
      const data = load(name), before = JSON.stringify(data);
      const themed = themeLottie(data, colours);
      expect(JSON.stringify(data)).toBe(before);
      for (const paint of paints(themed)) {
        const [r, g, b] = colours[paint.nm as LottieRole];
        expect((paint.c as {k: number[]}).k).toEqual([r / 255, g / 255, b / 255, 1]);
      }
    }
  });
  it('the player is self-hosted and loaded only on demand', () => {
    const player = readFileSync('src/ui/v7/lottiePlayer.ts', 'utf8');
    expect(player).toContain('DotLottie.setWasmUrl(wasmUrl)');
    expect(player).toMatch(/dotlottie-player\.wasm\?url/);
    const moment = readFileSync('src/ui/v7/LottieMoment.tsx', 'utf8');
    expect(moment).not.toMatch(/^import .*(dotlottie|lottiePlayer)/m);
    expect(moment).toContain("import('./lottiePlayer')");
  });
  it('the three moments use it, each over its A2 still', () => {
    expect(readFileSync('src/features/proposals/v7/InboxV7.tsx', 'utf8')).toContain('<LottieMoment name="inbox" animation="inbox-zero"');
    expect(readFileSync('src/features/review-done/v7/RoundCompleteV7.tsx', 'utf8')).toContain('<LottieMoment name="review" animation="round-complete"');
    expect(readFileSync('src/features/ritual/v7/CloseDayV7.tsx', 'utf8')).toContain('<LottieMoment name="closed" animation="day-closed"');
  });
});

describe('N129 LottieMoment', () => {
  const motion = (reduce: boolean) => vi.stubGlobal('matchMedia', (query: string) =>
    ({matches: reduce && query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {}}));
  async function mount() {
    Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<LottieMoment name="inbox" animation="inbox-zero" />));
    await act(async () => {for (let i = 0; i < 5; i++) await Promise.resolve();});
    const moment = host.querySelector('[data-lottie="inbox-zero"]')!;
    return {moment, done: async () => {await act(async () => root.unmount()); host.remove();}};
  }
  afterEach(() => {applyReduceEffects(false); vi.unstubAllGlobals(); play.mockReset();});

  it('under reduced motion shows the still and never loads the player', async () => {
    motion(true);
    const {moment, done} = await mount();
    expect(moment.getAttribute('data-lottie-state')).toBe('still');
    expect(moment.querySelector('[data-illustration="inbox"]')).not.toBeNull();
    expect(moment.querySelector('canvas')).toBeNull();
    expect(play).not.toHaveBeenCalled();
    await done();
  });
  it('under Settings › Reduce effects does the same', async () => {
    motion(false);
    applyReduceEffects(true);
    const {moment, done} = await mount();
    expect(moment.getAttribute('data-lottie-state')).toBe('still');
    expect(play).not.toHaveBeenCalled();
    await done();
  });
  it('with motion plays over the still, then frees the player when it leaves', async () => {
    motion(false);
    const stop = vi.fn();
    play.mockResolvedValue(stop);
    const {moment, done} = await mount();
    expect(play).toHaveBeenCalledWith('inbox-zero', expect.any(HTMLCanvasElement), moment);
    expect(moment.getAttribute('data-lottie-state')).toBe('playing');
    expect(moment.querySelector('[data-illustration]')).toBeNull();
    expect(moment.querySelector('canvas')!.hidden).toBe(false);
    await done();
    expect(stop).toHaveBeenCalledOnce();
  });
  it('keeps the still when the player is ready too late to start the moment', async () => {
    motion(false);
    const stop = vi.fn();
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    play.mockImplementation(async () => {clock += PLAY_WITHIN + 1; return stop;});
    const {moment, done} = await mount();
    expect(play).toHaveBeenCalled();
    expect(stop).toHaveBeenCalledOnce();
    expect(moment.getAttribute('data-lottie-state')).toBe('still');
    await done();
    vi.mocked(performance.now).mockRestore();
  });
  it('keeps the still when the player cannot load (offline, no WebAssembly)', async () => {
    motion(false);
    play.mockRejectedValue(new Error('offline'));
    const {moment, done} = await mount();
    expect(play).toHaveBeenCalled();
    expect(moment.getAttribute('data-lottie-state')).toBe('still');
    expect(moment.querySelector('[data-illustration="inbox"]')).not.toBeNull();
    expect(moment.querySelector('canvas')!.hidden).toBe(true);
    await done();
  });
});
