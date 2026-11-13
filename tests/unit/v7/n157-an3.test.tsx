import {act} from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {readFileSync} from 'node:fs';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {EDGE_DP, fromEdge} from '../../../src/ui/v7/edges';
import {SyncMark, syncState} from '../../../src/ui/v7/SyncMark';
import {UPDATE_CHECK_MS, buildNumber, checkForUpdate, dueForUpdateCheck, newerBuild, readDevicePref} from '../../../src/platform/device';
import {SIGN_IN_DID_NOT_RETURN, signInClosedMessage} from '../../../src/platform/auth';

// N157 · AN3 (edges, the header ℓ as sync light), AW3 second stage (the daily update check), AW17 (sign-in failure).
const source = (path: string) => readFileSync(path, 'utf8');
afterEach(() => {localStorage.clear(); Object.defineProperty(navigator, 'onLine', {configurable: true, get: () => true});});

describe('AN3 · no gesture starts within 24 dp of a screen edge', () => {
  it('the edge test', () => {
    expect(EDGE_DP).toBe(24);
    expect(fromEdge(10, 390)).toBe(true);
    expect(fromEdge(23.9, 390)).toBe(true);
    expect(fromEdge(24, 390)).toBe(false);
    expect(fromEdge(200, 390)).toBe(false);
    expect(fromEdge(380, 390)).toBe(true);
  });
  it('the Inbox and review swipes, task swipes and calendar drags and swipes check it', () => {
    expect(source('src/features/proposals/v7/InboxV7.tsx')).toContain("closest('button,a')||fromEdge(event.clientX))return;");
    expect(source('src/features/review-run/v7/ReviewRoundV7.tsx')).toContain("closest('a,button')||fromEdge(event.clientX))return;");
    expect(source('src/features/tasks/v7/TasksV7.tsx')).toContain("closest('button,a,[role=menu]')||fromEdge(event.clientX))return;");
    const grid = source('src/features/calendar/v7/DayGrid.tsx');
    expect(grid).toContain('if(busy||event.button!==0||fromEdge(event.clientX))return;');
    expect(grid).toContain('swipe.current=fromEdge(t.clientX)?null:{x:t.clientX,y:t.clientY};');
  });
});

describe('AN3 · the header ℓ is the sync light', () => {
  it('steady, a ring while fetching or saving, hollow when offline', () => {
    expect(syncState(true, 0, 0)).toBe('synced');
    expect(syncState(true, 2, 0)).toBe('syncing');
    expect(syncState(true, 0, 1)).toBe('syncing');
    expect(syncState(false, 3, 1)).toBe('offline');
    expect(source('src/app/v7/V7Shell.tsx')).toContain('<SyncMark><span className="v7-hub-mark" aria-hidden="true"><EllMark size={18}/></span></SyncMark>');
    const css = source('src/app/v7/shell.css');
    expect(css).toContain('.v7-sync-mark[data-sync="syncing"]::after {opacity:1;transition-delay:300ms;}');
    expect(css).toContain('.v7-sync-mark[data-sync="offline"] svg path {fill:none;');
  });
  it('announces going offline, and only that', async () => {
    Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true});
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host), client = new QueryClient();
    await act(async () => root.render(<QueryClientProvider client={client}><SyncMark><span className="v7-hub-mark"/></SyncMark></QueryClientProvider>));
    const mark = () => host.querySelector('.v7-sync-mark')!;
    expect(mark().getAttribute('data-sync')).toBe('synced');
    expect(mark().querySelector('[role="status"]')!.textContent).toBe('');
    await act(async () => {Object.defineProperty(navigator, 'onLine', {configurable: true, get: () => false}); window.dispatchEvent(new Event('offline'));});
    expect(mark().getAttribute('data-sync')).toBe('offline');
    expect(mark().querySelector('[role="status"]')!.textContent).toBe('Offline: working from your notebook');
    await act(async () => root.unmount()); host.remove();
  });
});

describe('AW3 · one quiet check a day for a newer APK', () => {
  it('reads build numbers from versions and release tags', () => {
    expect(buildNumber('2.0.41')).toBe(41);
    expect(buildNumber('android-build-42')).toBe(42);
    expect(buildNumber('2.0.0')).toBeNull();
    expect(newerBuild('2.0.41', 'android-build-42')).toBe(42);
    expect(newerBuild('2.0.42', 'android-build-42')).toBeNull();
    expect(newerBuild('2.0.0', 'android-build-42')).toBeNull();
  });
  it('asks at most once a day, remembers the answer on the phone, and never throws', async () => {
    const now = Date.UTC(2026, 10, 13, 9);
    expect(dueForUpdateCheck(null, now)).toBe(true);
    expect(dueForUpdateCheck(now - UPDATE_CHECK_MS + 1, now)).toBe(false);
    const get = vi.fn(async () => new Response(JSON.stringify({tag_name: 'android-build-50'}), {status: 200}));
    expect(await checkForUpdate('2.0.48', now, get as unknown as typeof fetch)).toBe(50);
    expect(readDevicePref('updateAvailable', null)).toBe(50);
    expect(await checkForUpdate('2.0.48', now + 60_000, get as unknown as typeof fetch)).toBe(50);
    expect(get).toHaveBeenCalledTimes(1);
    const broken = vi.fn(async () => {throw new Error('offline');});
    expect(await checkForUpdate('2.0.48', now + UPDATE_CHECK_MS, broken as unknown as typeof fetch)).toBe(50);
  });
  it('runs from the app\'s start, puts a dot on Settings, names the version, and the privacy page says so', () => {
    expect(source('src/platform/start.ts')).toContain('void App.getInfo().then(info => checkForUpdate(info.version)).catch(() => undefined);');
    expect(source('src/app/v7/V7Shell.tsx')).toContain('{update!==null&&<span className="v7-update-dot" aria-hidden="true"/>}');
    expect(source('src/features/settings/v7/PhoneSettings.tsx')).toContain("hint={update?'Lemma 2.0.'+update+' is available':'Opens the newest release'}");
    expect(source('public/privacy.html')).toContain('Once a day the app asks GitHub’s public releases feed');
  });
});

describe('AW17 · a sign-in that does not come back says so', () => {
  it('only while a sign-in is still waiting for its callback', () => {
    expect(signInClosedMessage(true)).toBe(SIGN_IN_DID_NOT_RETURN);
    expect(signInClosedMessage(false)).toBeNull();
    const auth = source('src/platform/auth.ts');
    expect(auth).toContain("Browser.addListener('browserFinished'");
    expect(auth).toMatch(/if \(!result\) return href\.startsWith\(AUTH_CALLBACK\);\n  waiting = false;/);
  });
});
