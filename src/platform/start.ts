/**
 * N123 · the Android app's start-up: loaded with a dynamic import from main.tsx only when `isNative()`, so none of
 * this (or any `@capacitor/*` module) is in the web bundle's first load.
 *
 * It connects Android's system surfaces to the existing app without changing any screen's behaviour:
 * App Links and notification taps → routes; the back button → close the top layer, go back, or leave from Today;
 * the native focus timer ← the server study entry (and lock-screen actions → the study API); reminders the phone can
 * compute; the opt-in device calendar; share-to-Lemma; drift on return; launcher shortcuts; system-bar colours.
 */
import {getApi} from '../data';
import {getMode} from '../data/mode';
import {getStudyApi} from '../data/study';
import {getThoughtApi} from '../data/parked-thoughts';
import {FOCUS_CHANGED, announceFocusChange} from '../app/v7/focus';
import {toast} from '../ui/Toast';
import type {LemmaNativePlugin} from './bridge';
import {lemmaNative} from './bridge';
import {DEVICE_PREFS_CHANGED, checkForUpdate, readDevicePref} from './device';
import {backStep, closeTopLayer, hasOpenLayer, routeFromUrl, wantsBackHandler} from './links';
import {nativeTimerState, replayTimerActions} from './timer';
import {whenRootPainted} from './splash';
import {planReminders} from './reminders';
import {calendarEvents, SYNC_AHEAD_MS, SYNC_BACK_MS} from './calendar';
import {holdCaptureText, holdSharedSources, routeShare, sharedItems} from './share';
import {offerNotificationsOnce} from './permissions';
import {askDrift} from './drift';

const DRIFT_MS = 2 * 60_000;
let native: LemmaNativePlugin;
let backgroundedAt: number | null = null;
let backgroundEntry: string | null = null;

const route = () => (window.location.hash.replace(/^#/, '') || '/');
function go(path: string): void {
  if (route() !== path) window.location.hash = '#' + path;
}
/** Open the Capture sheet once Today's shell is there to listen (it may still be loading after a cold start). */
function openCapture(): void {
  let tries = 0;
  const attempt = () => {
    if (document.querySelector('dialog[open]')) return;
    window.dispatchEvent(new Event('v7:capture'));
    if (++tries < 8) window.setTimeout(attempt, 250 * tries);
  };
  window.setTimeout(attempt, 50);
}

/** Context strings change rarely; cache them so a timer sync is one study read. */
let cached: {at: number; projects: Map<string, string>; clock24h: boolean; zone: string} | null = null;
async function context() {
  if (cached && Date.now() - cached.at < 5 * 60_000) return cached;
  const [home, settings] = await Promise.all([getApi().getHome().catch(() => null), getApi().getSettings().catch(() => null)]);
  cached = {
    at: Date.now(),
    projects: new Map((home?.projects ?? []).map(project => [project.id, project.title])),
    clock24h: settings?.clock24h ?? true,
    zone: settings?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
  };
  return cached;
}

async function syncTimer(): Promise<void> {
  try {
    const entry = await getStudyApi().activeStudyEntry();
    const ctx = await context();
    const state = nativeTimerState(entry, Date.now(), entry?.projectId ? ctx.projects.get(entry.projectId) ?? '' : '', ctx.clock24h);
    // The lock-screen timer is the payoff of notifications: a first running session is the moment to ask (once).
    if (state) {await native.timerUpdate({state}); void offerNotificationsOnce();}
    else await native.timerClear();
  } catch {/* offline: the notification keeps its last state, rebuilt on the next sync */}
}

let replaying = false;
async function replayActions(): Promise<void> {
  if (replaying) return;
  replaying = true;
  try {
    const outcomes = await replayTimerActions(native, getStudyApi(), (text, entryId) => getThoughtApi().createThought({text, studyEntryId: entryId}));
    if (outcomes.length) announceFocusChange();
    if (outcomes.includes('finish')) go('/focus?finish=1');
  } catch {/* kept natively; retried on the next resume */} finally {
    replaying = false;
    await syncTimer();
  }
}

async function scheduleReminders(): Promise<void> {
  try {
    const [settings, home] = await Promise.all([getApi().getSettings(), getApi().getHome()]);
    const zone = settings.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC', now = Date.now();
    const blocks = settings.notify?.kinds?.plan ? await getStudyApi().listCalendarBlocks({start: new Date(now).toISOString(), end: new Date(now + 49 * 3600_000).toISOString()}) : [];
    await native.remindersSet({items: planReminders({prefs: settings.notify, due: home.due, blocks, now, zone, clock24h: settings.clock24h ?? true})});
    const shortcuts: {id: string; label: string; route: string}[] = [];
    // N157 (P7): Review is always here (it replaced the static Review), with its count when cards are due.
    shortcuts.push({id: 'review-due', label: (home.due > 0 ? 'Review ' + home.due : 'Review').slice(0, 25), route: '/review'});
    if (home.resume) shortcuts.push({id: 'resume', label: ('Resume ' + home.resume.projectTitle).slice(0, 25), route: '/p/' + encodeURIComponent(home.resume.projectSlug)});
    await native.shortcutsSet({items: shortcuts});
  } catch {/* keep the previous schedule */}
}

export async function syncCalendar(): Promise<void> {
  if (!readDevicePref('calendarSync', false)) return;
  try {
    if ((await native.calendarStatus()).permission !== 'granted') return;
    const now = Date.now(), from = now - SYNC_BACK_MS, to = now + SYNC_AHEAD_MS;
    const blocks = await getStudyApi().listCalendarBlocks({start: new Date(from).toISOString(), end: new Date(to).toISOString()});
    await native.calendarSync({events: calendarEvents(blocks), from, to});
  } catch {/* retried on the next resume */}
}

async function takeShares(): Promise<void> {
  // N126: this runs on every return to the app; with nothing shared (or the list unreadable) it stays silent.
  // Only a share that was actually received and could not be opened is reported.
  const items = await sharedItems(native);
  for (const item of items) {
    try {
      const target = routeShare(item);
      if (target.kind === 'capture') {
        holdCaptureText(target.text);
        go('/');
        openCapture();
      } else if (target.kind === 'new-path') {
        const {Capacitor} = await import('@capacitor/core');
        const files = await Promise.all(target.files.map(async file => {
          const blob = await (await fetch(Capacitor.convertFileSrc(file.path))).blob();
          return new File([blob], file.name, {type: file.mime || blob.type});
        }));
        holdSharedSources(files);
        go('/projects/new');
      } else toast(target.reason, {tone: 'danger'});
    } catch {toast('Lemma could not open what was shared. Try again.', {tone: 'danger'});}
  }
}

async function startBlockNow(blockId: string): Promise<void> {
  try {
    const study = getStudyApi();
    if (await study.activeStudyEntry()) {go('/focus'); toast('A focus session is already running.'); return;}
    const now = Date.now();
    const blocks = await study.listCalendarBlocks({start: new Date(now - 24 * 3600_000).toISOString(), end: new Date(now + 24 * 3600_000).toISOString()});
    const block = blocks.find(item => item.id === blockId);
    if (!block || block.status !== 'planned') {go('/'); toast('This block changed. Check Today.'); return;}
    await study.startStudyEntry({source: 'timer', intent: block.title, calendarBlockId: block.id, subjectId: block.subjectId ?? null,
      projectId: block.projectId ?? null, checkpointId: block.checkpointId ?? null, sessionId: block.sessionId ?? null});
    announceFocusChange();
    go('/focus');
  } catch (reason) {
    go('/');
    toast(reason instanceof Error ? reason.message : 'That block could not start. Try again from Today.', {tone: 'danger'});
  }
}

/** A cold start can report the same launch link twice (launch URL and appUrlOpen): act on it once. */
let lastLink = {url: '', at: 0};
function openLink(url: string): void {
  const now = Date.now();
  if (url === lastLink.url && now - lastLink.at < 3000) return;
  lastLink = {url, at: now};
  const target = routeFromUrl(url);
  if (target) openRoute(target);
}

function openRoute(path: string): void {
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  const block = params.get('startBlock');
  if (base === '/' && block) {void startBlockNow(block); return;}
  // The Capture shortcut and Quick Settings tile open Today with the Capture sheet.
  if (base === '/' && params.get('capture') === '1') {go('/'); openCapture(); return;}
  go(path);
}

async function checkDrift(): Promise<void> {
  const since = backgroundedAt, entryId = backgroundEntry;
  backgroundedAt = null; backgroundEntry = null;
  if (!since || !entryId || Date.now() - since < DRIFT_MS) return;
  try {
    const settings = await getApi().getSettings();
    if (!settings.attention?.drift_prompt) return;
    const entry = await getStudyApi().activeStudyEntry();
    if (!entry || entry.id !== entryId || entry.status !== 'running') return;
    const minutes = Math.max(1, Math.round((Date.now() - since) / 60_000));
    // AW13: a card on Focus with Yes and No that stays until answered (it was a 10-second toast with no "No").
    askDrift({entryId, minutes, at: Date.now()});
  } catch {/* only a prompt */}
}

/** The system bars follow the page: light icons on a dark page and dark icons on a light one. */
async function followTheme(): Promise<void> {
  const {SystemBars, SystemBarsStyle} = await import('@capacitor/core');
  let last = '';
  const apply = () => {
    const colour = getComputedStyle(document.body).backgroundColor.match(/\d+(\.\d+)?/g)?.map(Number) ?? [255, 255, 255];
    const luminance = (0.2126 * colour[0] + 0.7152 * colour[1] + 0.0722 * colour[2]) / 255;
    const style = luminance < 0.5 ? SystemBarsStyle.Dark : SystemBarsStyle.Light;
    if (style === last) return;
    last = style;
    void SystemBars.setStyle({style}).catch(() => undefined);
  };
  apply();
  new MutationObserver(() => apply()).observe(document.documentElement, {attributes: true, subtree: false});
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', apply);
  window.setTimeout(apply, 500);
}

async function connectSession(): Promise<void> {
  if (getMode() !== 'live') return;
  try {
    const [{liveClient}, env] = await Promise.all([import('../data/live/client'), import('../data/env')]);
    const db = liveClient();
    db.auth.onAuthStateChange((event, session) => {
      if (session?.access_token && env.supabaseUrl && env.supabasePublishableKey) {
        void native.setSession({url: env.supabaseUrl, key: env.supabasePublishableKey, accessToken: session.access_token, expiresAt: (session.expires_at ?? 0) * 1000});
      } else if (event === 'SIGNED_OUT') {
        // Nothing of the account stays on the phone's system surfaces after sign-out.
        void native.clearSession();
        void native.timerClear();
        void native.remindersSet({items: []});
        void native.shortcutsSet({items: []});
        void native.calendarRemoveAll().catch(() => undefined);
        cached = null;
      }
    });
  } catch {/* demo or misconfigured: lock-screen actions fall back to opening the app */}
}

/** The one-time "Welcome to the new app" sheet, in its own small React root (nothing in the web app's tree). */
async function welcome(): Promise<void> {
  const [{createElement}, {createRoot}, {default: NativeWelcome}] = await Promise.all([import('react'), import('react-dom/client'), import('./NativeWelcome')]);
  const host = document.createElement('div');
  host.id = 'lemma-native-welcome';
  document.body.appendChild(host);
  createRoot(host).render(createElement(NativeWelcome));
}

export async function startNative(): Promise<void> {
  native = await lemmaNative();
  void welcome().catch(() => undefined);
  const {App} = await import('@capacitor/app');

  // AW7: the splash lifts on the first paint, not when the native layer starts; launchShowDuration (800 ms) is the cap.
  const splash = import('@capacitor/splash-screen').catch(() => null);
  whenRootPainted(document.getElementById('root'), () => void splash.then(plugin => plugin?.SplashScreen.hide()).catch(() => undefined));
  void followTheme().catch(() => undefined);
  void connectSession();
  // AW3 (E15): one quiet check a day for a newer APK; Settings shows a dot when there is one.
  void App.getInfo().then(info => checkForUpdate(info.version)).catch(() => undefined);

  await App.addListener('appUrlOpen', ({url}) => {
    void (async () => {
      const {finishNativeSignIn} = await import('./auth');
      const {liveClient} = await import('../data/live/client');
      if (await finishNativeSignIn(url, async () => liveClient(), message => toast(message, {tone: 'danger'}))) return;
      openLink(url);
    })();
  });
  const launch = await App.getLaunchUrl().catch(() => undefined);
  if (launch?.url) openLink(launch.url);

  await App.addListener('backButton', ({canGoBack}) => {
    const step = backStep({layerOpen: hasOpenLayer(), route: route(), canGoBack});
    if (step === 'close-layer') closeTopLayer();
    else if (step === 'history-back') window.history.back();
    else if (step === 'home') go('/');
    else void App.minimizeApp();
  });

  // AW8: release the back handler on Today with nothing open, so Android shows its back-to-home preview.
  let handling: boolean | null = null;
  const syncBack = () => {
    const wanted = wantsBackHandler({layerOpen: hasOpenLayer(), route: route()});
    if (wanted === handling) return;
    handling = wanted;
    void App.toggleBackButtonHandler({enabled: wanted}).catch(() => {handling = null;});
  };
  let queued = 0;
  const queueBack = () => {if (!queued) queued = window.requestAnimationFrame(() => {queued = 0; syncBack();});};
  window.addEventListener('hashchange', queueBack);
  new MutationObserver(queueBack).observe(document.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['open', 'aria-modal', 'role']});
  syncBack();

  await App.addListener('appStateChange', ({isActive}) => {
    if (!isActive) {
      void getStudyApi().activeStudyEntry().then(entry => {
        if (entry?.status === 'running' && !entry.intervals.some(i => i.kind === 'break' && i.end === null)) {
          backgroundedAt = Date.now(); backgroundEntry = entry.id;
        }
      }).catch(() => undefined);
      void scheduleReminders();
      return;
    }
    void replayActions();
    void takeShares();
    void syncCalendar();
    void checkDrift();
  });

  await native.addListener('timerAction', () => {void replayActions();});
  await native.addListener('shareReceived', () => {void takeShares();});
  window.addEventListener(FOCUS_CHANGED, () => {void syncTimer();});
  window.addEventListener(DEVICE_PREFS_CHANGED, () => {void syncCalendar();});
  window.setInterval(() => {if (document.visibilityState === 'visible') void syncTimer();}, 60_000);

  await takeShares();
  await replayActions();
  void scheduleReminders();
  void syncCalendar();
}
