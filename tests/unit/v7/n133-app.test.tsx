import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {STUDY_MODE_INTENT_MS, studyModeOnReturn} from '../../../src/platform/studyMode';
import {DRIFT_CHANGED, askDrift, clearDrift, pendingDrift} from '../../../src/platform/drift';
import {prePaintPaper} from '../../../src/app/paper';

// N133 · v7 UX audit r3: the rest of AN1 (AW5, AW9, AW13) and G0, for the Android app.
const recordEvent = vi.hoisted(() => vi.fn());
vi.mock('../../../src/data/study-events', () => ({getStudyEventApi: () => ({recordEvent})}));
import {DriftCard} from '../../../src/features/focus/v7/DriftCard';
import NativeWelcome, {WELCOME_ROWS} from '../../../src/platform/NativeWelcome';

async function mount(node: React.ReactNode) {
  Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(node));
  return {host, done: async () => {await act(async () => root.unmount()); host.remove();}};
}
afterEach(() => {sessionStorage.clear(); localStorage.clear(); recordEvent.mockReset();});

describe('AW9 · Study mode in one trip', () => {
  const now = 1_000_000_000;
  it('finishes the request on return once access is granted', () => {
    expect(studyModeOnReturn(now - 60_000, {access: true, enabled: false}, now)).toBe('enable');
  });
  it('waits while access is still missing or the status is unknown', () => {
    expect(studyModeOnReturn(now - 60_000, {access: false, enabled: false}, now)).toBe('wait');
    expect(studyModeOnReturn(now - 60_000, null, now)).toBe('wait');
  });
  it('forgets a request that is done or older than ten minutes, and does nothing without one', () => {
    expect(studyModeOnReturn(now - 60_000, {access: true, enabled: true}, now)).toBe('forget');
    expect(studyModeOnReturn(now - STUDY_MODE_INTENT_MS - 1, {access: true, enabled: false}, now)).toBe('forget');
    expect(studyModeOnReturn(null, {access: true, enabled: false}, now)).toBeNull();
  });
  it('Planning remembers the request when it sends the learner to system settings', () => {
    const source = readFileSync('src/features/settings/v7/PhoneSettings.tsx', 'utf8');
    expect(source).toContain("writeDevicePref('studyModeRequestedAt',Date.now())");
    expect(source).toContain("studyModeOnReturn(readDevicePref<number|null>('studyModeRequestedAt',null),mode,Date.now())");
  });
});

describe('AW13 · "Were you drifting?" is a card that stays until answered', () => {
  it('a question is kept for its own session only', () => {
    const changed = vi.fn();
    window.addEventListener(DRIFT_CHANGED, changed);
    askDrift({entryId: 'e1', minutes: 6, at: 1});
    expect(pendingDrift('e1')).toEqual({entryId: 'e1', minutes: 6, at: 1});
    expect(pendingDrift('e2')).toBeNull();
    clearDrift();
    expect(pendingDrift('e1')).toBeNull();
    expect(changed).toHaveBeenCalledTimes(2);
    window.removeEventListener(DRIFT_CHANGED, changed);
  });
  it('the app asks through Focus, not a 10-second toast', () => {
    const start = readFileSync('src/platform/start.ts', 'utf8');
    expect(start).toContain('askDrift({entryId, minutes, at: Date.now()})');
    expect(start).not.toContain('Were you drifting?');
    expect(readFileSync('src/features/focus/v7/FocusV7.tsx', 'utf8')).toContain('<DriftCard entryId={entry.id}/>');
  });
  it('"No" clears it; "Yes, note it" records the drift and clears it', async () => {
    askDrift({entryId: 'e1', minutes: 6, at: 1});
    const {host, done} = await mount(<DriftCard entryId="e1" />);
    expect(host.textContent).toContain('You were away for 6 min.');
    // Its own class: .v7-focus-drift is the Drifted button's.
    expect(host.querySelector('.v7-focus-away')).not.toBeNull();
    expect(host.querySelector('.v7-focus-drift')).toBeNull();
    const button = (name: string) => [...host.querySelectorAll('button')].find(node => node.textContent === name)!;
    await act(async () => button('No').click());
    expect(host.textContent).toBe('');
    expect(recordEvent).not.toHaveBeenCalled();
    await act(async () => askDrift({entryId: 'e1', minutes: 4, at: 2}));
    recordEvent.mockResolvedValue({status: 'ok'});
    await act(async () => {button('Yes, note it').click(); for (let i = 0; i < 5; i++) await Promise.resolve();});
    expect(recordEvent).toHaveBeenCalledWith({entryId: 'e1', kind: 'drift', durationMinutes: 4});
    expect(pendingDrift('e1')).toBeNull();
    await done();
  });
  it('a question about another session does not show', async () => {
    askDrift({entryId: 'old', minutes: 6, at: 1});
    const {host, done} = await mount(<DriftCard entryId="e1" />);
    expect(host.textContent).toBe('');
    await done();
  });
});

describe('AW5 · the welcome sheet', () => {
  it('three rows, each with a glyph, and the notification line', async () => {
    // jsdom has no modal dialogs.
    const proto = HTMLDialogElement.prototype as unknown as {showModal?: () => void; close?: () => void};
    proto.showModal ??= function (this: HTMLDialogElement) {this.setAttribute('open', '');};
    proto.close ??= function (this: HTMLDialogElement) {this.removeAttribute('open');};
    const {done} = await mount(<NativeWelcome />);
    const sheet = document.querySelector('dialog')!;
    expect(sheet.querySelectorAll('.v7-native-welcome-list > li')).toHaveLength(3);
    expect(sheet.querySelectorAll('.v7-native-welcome-icon svg')).toHaveLength(3);
    expect(WELCOME_ROWS.map(row => row.title)).toEqual(['Focus on the lock screen', 'Share to Lemma', 'Study mode and calendar']);
    expect(sheet.textContent).toContain('Lemma asks about notifications after your first focus session.');
    // The note for people who used Lemma before comes after the rows, not first.
    expect(sheet.textContent!.indexOf('If you used Lemma before')).toBeGreaterThan(sheet.textContent!.indexOf('Study mode and calendar'));
    await done();
  });
  it('opens with focus on its text, so no button shows a ring by itself', () => {
    const source = readFileSync('src/platform/NativeWelcome.tsx', 'utf8');
    expect(source).toMatch(/<p tabIndex=\{-1\} data-v7-autofocus="true"/);
    expect(source).toContain("import './native-welcome.css';");
    expect(readFileSync('src/platform/native-welcome.css', 'utf8')).toContain('.v7-native-welcome-list');
  });
});

describe('G0 · the pre-paint papers follow the build', () => {
  it('v7 builds paint the v7 page colours; others keep the legacy ones', () => {
    expect(prePaintPaper(true)).toEqual({day: '#F8F5F0', night: '#091023'});
    expect(prePaintPaper(false)).toEqual({day: '#FAFAF6', night: '#13171D'});
    const tokens = readFileSync('src/ui/v7/tokens.css', 'utf8');
    expect(tokens).toMatch(/\[data-theme="graph"\] \{\n {2}--v7-role-surface-page: #F8F5F0;/);
    expect(tokens).toMatch(/\[data-theme="graph-night"\] \{\n {2}--v7-role-surface-page: #091023;/);
  });
  it('index.html takes them from the build, not a fixed hex', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).not.toMatch(/#FAFAF6|#13171D/);
    expect(html.match(/__PAPER_DAY__/g)!.length).toBe(2);
    expect(html.match(/__PAPER_NIGHT__/g)!.length).toBe(2);
    expect(readFileSync('vite.config.ts', 'utf8')).toContain("transformIndexHtml:(html:string)=>html.replaceAll('__PAPER_DAY__',paper.day)");
  });
});
