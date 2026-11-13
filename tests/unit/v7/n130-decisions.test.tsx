import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {LemmaNativePlugin} from '../../../src/platform/bridge';
import {setLemmaNativeForTests} from '../../../src/platform/bridge';
import {markNativeApp} from '../../../src/platform/native';
import {RELEASES_URL, releaseLinks} from '../../../src/platform/device';
import {PHONE_REMINDER_KINDS, planReminders} from '../../../src/platform/reminders';
import {backupFileName, shareFile} from '../../../src/platform/files';
import {REMINDER_KINDS, reminderKindRows} from '../../../src/features/settings/v7/reminderKinds';
import {roleColours, type Rgb} from '../../../src/ui/v7/lottie';

// N130 · the Owner's decisions of 12 Nov 2026 on the v7 UX audit r3 (E6, E8, E14, E15, E16, E18, E20).
const exportAll = vi.hoisted(() => vi.fn());
vi.mock('../../../src/data', () => ({getApi: () => ({exportAll})}));
import ExportSettings from '../../../src/features/settings/v6/Export';

const app = () => {(window as unknown as {Capacitor: unknown}).Capacitor = {isNativePlatform: () => true, getPlatform: () => 'android'};};
const hex = (value: string): Rgb => {const m = /^#([0-9a-f]{6})$/i.exec(value.trim())!; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255];};
const fakeNative = (patch: Partial<LemmaNativePlugin>) => patch as LemmaNativePlugin;

afterEach(() => {
  delete (window as unknown as {Capacitor?: unknown}).Capacitor;
  delete document.documentElement.dataset.nativeApp;
  setLemmaNativeForTests(null);
  vi.restoreAllMocks();
  exportAll.mockReset();
});

describe('E18 · P1 · Night keeps the Day tonal order', () => {
  it('the Lottie paper is the illustrations\' own object fill, not the raised surface', () => {
    const values: Record<string, string> = {'--v7-il-paper': ' #273045', '--v7-role-surface-raised': '#11192C', '--v7-role-surface-muted': '#1E263B'};
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({getPropertyValue: (name: string) => values[name] ?? ''} as CSSStyleDeclaration);
    expect(roleColours(document.body, hex).paper).toEqual([0x27, 0x30, 0x45]);
  });
  it('falls back to the raised surface where the role is not set', () => {
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({getPropertyValue: (name: string) => name === '--v7-role-surface-raised' ? '#FEFCF9' : ''} as CSSStyleDeclaration);
    expect(roleColours(document.body, hex).paper).toEqual([0xFE, 0xFC, 0xF9]);
  });
  it('the stylesheet gives Night objects the muted hover surface (lighter than the disc)', () => {
    const css = readFileSync('src/ui/v7/illustration.css', 'utf8');
    expect(css).toContain('.v7-il .page {fill:var(--v7-il-paper);}');
    expect(css).toMatch(/data-theme="graph-night"\]\) :is\(\.v7-il,\.v7-lottie\) \{--v7-il-paper:var\(--v7-role-surface-muted-hover\);\}/);
  });
});

describe('E6 · 48 px touch targets in the app', () => {
  it('marks the document only inside the Android app', () => {
    const root = document.createElement('html');
    expect(markNativeApp(root)).toBe(false);
    expect(root.hasAttribute('data-native-app')).toBe(false);
    app();
    expect(markNativeApp(root)).toBe(true);
    expect(root.hasAttribute('data-native-app')).toBe(true);
  });
  it('the app sets the touch token to 48 px, outside the layers so no width rule undoes it', () => {
    const css = readFileSync('src/ui/v7/components.css', 'utf8');
    const rule = css.indexOf('html[data-v7][data-native-app] {--v7-touch:48px;}');
    expect(rule).toBeGreaterThan(css.lastIndexOf('@layer'));
    expect(readFileSync('src/main.tsx', 'utf8')).toMatch(/const nativeApp=markNativeApp\(\)\nloadShellFonts/);
  });
});

describe('E14 · AW2 · the backup goes to the share sheet in the app', () => {
  it('hands the file\'s text, name and type to the plugin', async () => {
    const native = fakeNative({shareFile: vi.fn(async () => ({shared: true}))});
    setLemmaNativeForTests(native);
    const ok = await shareFile(new Blob(['{"v":1}'], {type: 'application/json'}), 'lemma-backup-2026-11-12.json');
    expect(ok).toBe(true);
    expect(native.shareFile).toHaveBeenCalledWith({name: 'lemma-backup-2026-11-12.json', mime: 'application/json', text: '{"v":1}', title: 'Save your Lemma backup'});
    expect(backupFileName(new Date('2026-11-12T08:00:00Z'))).toBe('lemma-backup-2026-11-12.json');
  });
  async function mountExport() {
    Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<ExportSettings />));
    return {host, done: async () => {await act(async () => root.unmount()); host.remove();}};
  }
  it('in the app, "Save a backup" opens the share sheet and never clicks a download link', async () => {
    app();
    const native = fakeNative({shareFile: vi.fn(async () => ({shared: true}))});
    setLemmaNativeForTests(native);
    exportAll.mockResolvedValue(new Blob(['{"cards":[]}'], {type: 'application/json'}));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    const {host, done} = await mountExport();
    const button = [...host.querySelectorAll('button')].find(node => node.textContent?.includes('Save a backup'))!;
    expect(button).toBeDefined();
    await act(async () => {button.click(); for (let i = 0; i < 20; i++) await Promise.resolve();});
    await vi.waitFor(() => expect(native.shareFile).toHaveBeenCalledOnce());
    expect(vi.mocked(native.shareFile).mock.calls[0][0]).toMatchObject({mime: 'application/json', text: '{"cards":[]}'});
    expect(vi.mocked(native.shareFile).mock.calls[0][0].name).toMatch(/^lemma-backup-\d{4}-\d\d-\d\d\.json$/);
    expect(click).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(host.querySelector('[role="status"]')?.textContent).toContain('share sheet'));
    await done();
  });
  it('on the web it is still a download', async () => {
    const {host, done} = await mountExport();
    expect(host.textContent).toContain('Download a backup');
    expect(host.textContent).not.toContain('Save a backup');
    await done();
  });
});

describe('E15 · AW3 · About this app links to the releases', () => {
  it('"Check for updates" opens the newest release; "What changed" this build\'s release', () => {
    expect(releaseLinks('2.0.592')).toEqual({latest: RELEASES_URL + '/latest', thisVersion: RELEASES_URL + '/tag/android-build-592'});
    expect(RELEASES_URL).toBe('https://github.com/Mymayankyadav/lemma/releases');
  });
  it('a local build (2.0.0) or an unknown version has no release of its own', () => {
    for (const version of ['2.0.0', '', null, undefined, '1.4.2', '2.0.12a', '2.0.-1']) expect(releaseLinks(version).thisVersion).toBeNull();
  });
});

describe('E16 · AW4 · reminder kinds the phone cannot deliver have no switch in the app', () => {
  it('on the web every kind keeps its switch', () => {
    const rows = reminderKindRows(false);
    expect(rows.switches.map(row => row.key)).toEqual(REMINDER_KINDS.map(([key]) => key));
    expect(rows.proposalsSwitch).toBe(true);
    expect(rows.inbox).toEqual([]);
  });
  it('in the app only cards due and study blocks are switches; the rest wait in the Inbox', () => {
    const rows = reminderKindRows(true);
    expect(rows.switches).toEqual([{key: 'due', label: 'Cards due'}, {key: 'plan', label: 'Time blocks'}]);
    expect(rows.proposalsSwitch).toBe(false);
    expect(rows.inbox).toEqual(['Checkpoint deadlines', 'Falling behind', 'Resuming a session', 'Tutor proposals', 'Weekly digest', 'Study rhythm', 'New card proposals']);
  });
  it('the switches are exactly what the phone schedules', () => {
    const prefs = {enabled: true, mode: 'live' as const, kinds: Object.fromEntries(REMINDER_KINDS.map(([key]) => [key, !(PHONE_REMINDER_KINDS as readonly string[]).includes(key)])), dueThreshold: 1 as const};
    const blocks = [{id: 'b1', kind: 'study' as const, title: 'Real analysis', startsAt: '2026-11-12T14:00:00Z', endsAt: '2026-11-12T15:00:00Z', timeZone: 'Asia/Kolkata', status: 'planned' as const, version: 1}];
    const input = {due: 30, blocks, now: Date.parse('2026-11-12T06:00:00Z'), zone: 'Asia/Kolkata', clock24h: true};
    // Every kind the app shows without a switch turned on, the two phone kinds off: the phone schedules nothing.
    expect(planReminders({...input, prefs})).toEqual([]);
    // Only the two phone kinds on: it schedules both.
    const phone = {...prefs, kinds: {due: true, plan: true}};
    expect(planReminders({...input, prefs: phone}).map(item => item.channel).sort()).toEqual(['calendar', 'review']);
  });
});

describe('E20 · LT3 · Day closed stays', () => {
  it('for 5 s or until Done, the same with or without motion', async () => {
    const source = readFileSync('src/features/ritual/v7/CloseDayV7.tsx', 'utf8');
    const {DAY_CLOSED_MS} = await import('../../../src/features/ritual/v7/CloseDayV7');
    expect(DAY_CLOSED_MS).toBe(5000);
    expect(source).toContain('window.setTimeout(()=>navigate(\'/\'),DAY_CLOSED_MS)');
    expect(source).not.toMatch(/reduced\?\d+:\d+/);
    expect(source).toMatch(/>Done<\/Button><\/main>/);
  });
});
