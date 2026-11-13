import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';

// N154 · v7 UX audit r3: the Owner's decisions E17 and E22 (13 Nov 2026) built: the haptic vocabulary (AW6), the
// Lottie guard rails (LT7), the ending felt where it lands (LT8) and nothing growing from nothing (LT9).
const play = vi.hoisted(() => vi.fn());
const warm = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('../../../src/ui/v7/lottiePlayer', () => ({playLottie: play, warmLottie: warm, LOTTIE_LAND_EVENT: 'lottieland'}));
import {HAPTIC_PATTERNS, haptic, hapticsEnabled, setHapticsEnabled} from '../../../src/ui/v7/haptics';
import {hapticsSetting} from '../../../src/ui/v7/useHapticsSetting';
import {LOTTIE_LANDS, lottieAllowed} from '../../../src/ui/v7/lottie';
import {LottieMoment, warmMoment} from '../../../src/ui/v7/LottieMoment';
import {REDUCE_EFFECTS_ATTR} from '../../../src/ui/v7/effects';

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
const transformOf = (group: Node) => items(group).find(item => item.ty === 'tr')! as Record<string, {a: number; k: Key[]}>;
const source = (path: string) => readFileSync(path, 'utf8');

afterEach(() => {setHapticsEnabled(true); vi.unstubAllGlobals(); vi.useRealTimers(); play.mockReset(); warm.mockClear(); document.documentElement.removeAttribute(REDUCE_EFFECTS_ATTR);});

describe('AW6 · the haptic vocabulary follows Lemma\'s Haptics switch', () => {
  it('haptic() uses the switch unless told otherwise', () => {
    const vibrate = vi.fn(() => true);
    expect(hapticsEnabled()).toBe(true);
    expect(haptic('grade', undefined, {vibrate})).toBe(true);
    setHapticsEnabled(false);
    expect(haptic('grade', undefined, {vibrate})).toBe(false);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
  it('the switch is read from settings.ui (on by default)', () => {
    expect(hapticsSetting(undefined)).toBe(true);
    expect(hapticsSetting({})).toBe(true);
    expect(hapticsSetting({haptics: false})).toBe(false);
  });
  it('reveal is a soft tick and a pomodoro\'s end is rise, pause, rise', () => {
    expect(HAPTIC_PATTERNS.reveal).toBe(5);
    expect(HAPTIC_PATTERNS.pomodoro).toEqual([8, 120, 16]);
  });
  it('each meaning is wired where it happens', () => {
    const inbox = source('src/features/proposals/v7/InboxV7.tsx');
    expect(inbox).toContain('const haptics=useHapticsSetting();');
    expect(inbox).not.toContain('(settings.data as {haptics?:boolean}');
    const round = source('src/features/review-run/v7/ReviewRoundV7.tsx');
    expect(round).toContain("haptic(rating===1?'gradeAgain':'grade');");
    expect(round).toContain("const reveal=()=>{if(!revealed)haptic('reveal');setRevealed(true);};");
    expect(round).not.toMatch(/onClick=\{\(\)=>setRevealed\(true\)\}|if\(!revealed\)setRevealed\(true\)/);
    expect(source('src/features/tasks/v7/TasksV7.tsx')).toContain("haptic('check');save();");
    expect(source('src/features/home/v7/V7Today.tsx')).toContain("haptic('check');");
    expect(source('src/features/focus/v7/FocusV7.tsx')).toContain("haptic('pomodoro');void playPhaseChime(chime);");
    expect(source('src/features/calendar/v7/DayGrid.tsx')).not.toContain("haptic('snap',true)");
    expect(source('src/ui/v7/sheetDrag.ts')).toContain("haptic('sheetThreshold')");
    expect(source('src/app/v7/V7Shell.tsx')).toContain('useHapticsSetting();');
    expect(source('src/features/settings/v7/SettingsV7.tsx')).toContain("if(key==='haptics')setHapticsEnabled(value);");
  });
});

describe('LT7 · Lottie guard rails', () => {
  it('skips the player on Save-Data and on 2G', () => {
    expect(lottieAllowed(undefined)).toBe(true);
    expect(lottieAllowed({effectiveType: '4g'})).toBe(true);
    expect(lottieAllowed({effectiveType: '3g'})).toBe(true);
    expect(lottieAllowed({saveData: true, effectiveType: '4g'})).toBe(false);
    expect(lottieAllowed({effectiveType: '2g'})).toBe(false);
    expect(lottieAllowed({effectiveType: 'slow-2g'})).toBe(false);
  });
  it('warms a moment once, in idle time, only when motion and the connection allow it', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({matches: false, media: query, addEventListener() {}, removeEventListener() {}}));
    const idle = vi.fn((run: () => void) => {run(); return 1;});
    vi.stubGlobal('requestIdleCallback', idle);
    warmMoment('round-complete');
    warmMoment('round-complete');
    await vi.waitFor(() => expect(warm).toHaveBeenCalledWith('round-complete'));
    expect(warm).toHaveBeenCalledTimes(1);
    expect(idle).toHaveBeenCalledTimes(1);
    document.documentElement.setAttribute(REDUCE_EFFECTS_ATTR, '');
    warmMoment('day-closed');
    expect(idle).toHaveBeenCalledTimes(1);
    document.documentElement.removeAttribute(REDUCE_EFFECTS_ATTR);
    vi.stubGlobal('navigator', {...navigator, connection: {saveData: true}});
    warmMoment('day-closed');
    expect(idle).toHaveBeenCalledTimes(1);
  });
  it('the three screens warm their ending when it is one step away', () => {
    expect(source('src/features/proposals/v7/InboxV7.tsx')).toContain("if(tab==='cards'&&queue.length===1)warmMoment('inbox-zero');");
    expect(source('src/features/review-run/v7/ReviewRoundV7.tsx')).toContain("if(left===1)warmMoment('round-complete');");
    expect(source('src/features/ritual/v7/CloseDayV7.tsx')).toContain("warmMoment('day-closed');");
  });
});

describe('LT7 · LT8 · the moment on screen', () => {
  const motion = () => vi.stubGlobal('matchMedia', (query: string) => ({matches: false, media: query, addEventListener() {}, removeEventListener() {}}));
  async function mount(props: {feel?: boolean} = {}) {
    Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<LottieMoment name="inbox" animation="inbox-zero" {...props} />));
    await act(async () => {for (let i = 0; i < 5; i++) await Promise.resolve();});
    const moment = host.querySelector('[data-lottie="inbox-zero"]')!;
    return {moment, done: async () => {await act(async () => root.unmount()); host.remove();}};
  }
  it('on Save-Data shows the still and never loads the player', async () => {
    motion();
    vi.stubGlobal('navigator', {...navigator, connection: {saveData: true}});
    const {moment, done} = await mount();
    expect(moment.getAttribute('data-lottie-state')).toBe('still');
    expect(play).not.toHaveBeenCalled();
    await done();
  });
  it('with feel, the ending is felt once, on the frame it lands', async () => {
    motion();
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', {...navigator, vibrate});
    play.mockResolvedValue(() => undefined);
    const {moment, done} = await mount({feel: true});
    expect(moment.getAttribute('data-lottie-state')).toBe('playing');
    expect(vibrate).not.toHaveBeenCalled();
    await act(async () => {moment.dispatchEvent(new Event('lottieland')); moment.dispatchEvent(new Event('lottieland'));});
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(HAPTIC_PATTERNS.complete);
    await done();
  });
  it('without the animation (reduced motion) it is felt when the still shows; without feel it is not felt at all', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({matches: query.includes('reduce'), media: query, addEventListener() {}, removeEventListener() {}}));
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', {...navigator, vibrate});
    const first = await mount({feel: true});
    expect(vibrate).toHaveBeenCalledTimes(1);
    await first.done();
    const second = await mount();
    expect(vibrate).toHaveBeenCalledTimes(1);
    await second.done();
  });
  it('the Inbox feels its ending only when the last card was decided here', () => {
    const inbox = source('src/features/proposals/v7/InboxV7.tsx');
    expect(inbox).toContain('if(queue.length>0)hadCards.current=true;');
    expect(inbox.match(/feel=\{hadCards\.current\}/g)).toHaveLength(2);
    expect(source('src/features/review-done/v7/RoundCompleteV7.tsx')).toMatch(/animation="round-complete"[^>]*feel\/>/);
    expect(source('src/features/ritual/v7/CloseDayV7.tsx')).toMatch(/animation="day-closed"[^>]*feel\/>/);
  });
});

describe('LT8 · LT9 · the animation files', () => {
  it('the ✓ and ∎ land on the frames where the ending is felt', () => {
    expect(trimOf(named('inbox-zero', 'tick')).at(-1)!.t).toBe(LOTTIE_LANDS['inbox-zero']);
    expect(trimOf(named('round-complete', 'tick')).at(-1)!.t).toBe(LOTTIE_LANDS['round-complete']);
    expect(transformOf(named('day-closed', 'qed')).s.k.at(-1)!.t).toBe(LOTTIE_LANDS['day-closed']);
  });
  it('stars fade in from 70% of their size, not from nothing', () => {
    for (const star of ['star-1', 'star-2']) {
      const {s, o} = transformOf(named('day-closed', star));
      expect(s.k[0].s).toEqual([70, 70]);
      expect(s.k.at(-1)!.s).toEqual([100, 100]);
      expect(o.k[0].s).toEqual([0]);
      expect(o.k.at(-1)!.s).toEqual([100]);
      expect(o.k[0].t).toBe(s.k[0].t);
    }
  });
  it('a badge draws its ring before its disc fills, and the disc comes from 70%', () => {
    for (const name of ['inbox-zero', 'round-complete']) {
      const ring = named(name, 'ring'), disc = transformOf(named(name, 'disc'));
      expect(items(ring).some(item => item.ty === 'st' && item.nm === 'accent'), name).toBe(true);
      const [ringFrom, ringTo] = trimOf(ring).map(key => key.t);
      expect(disc.s.k[0].s).toEqual([70, 70]);
      expect(disc.o.k[0].t, name).toBeGreaterThan(ringFrom);
      expect(disc.o.k[0].t, name).toBeLessThan(ringTo);
      // The ring lies inside the disc's edge, so the last frame is the still's plain disc.
      const ellipse = items(ring).find(item => item.ty === 'el') as {s: {k: number[]}};
      const width = (items(ring).find(item => item.ty === 'st') as {w: {k: number}}).w.k;
      const discEllipse = items(named(name, 'disc')).find(item => item.ty === 'el') as {s: {k: number[]}};
      expect(ellipse.s.k[0] / 2 + width / 2).toBeLessThanOrEqual(discEllipse.s.k[0] / 2);
    }
  });
});
