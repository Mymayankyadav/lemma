/**
 * N123 · the TypeScript face of the app's own Kotlin-free native plugin (`LemmaNativePlugin.java`).
 * Every method exists only on Android; callers check `isNative()` first.
 */
export interface NativeSession {url: string; key: string; accessToken: string; expiresAt: number}

/** What the lock screen, notification and tile show. Built by `nativeTimerState` from the server study entry. */
export interface NativeTimerState {
  entryId: string;
  version: number;
  status: 'running' | 'paused' | 'break';
  intention: string;
  /** Path title or subject, the notification's sub-text. */
  context: string;
  mode: 'pomodoro' | 'flowtime' | 'open';
  /** Focused milliseconds up to `asOf`. */
  focusedMs: number;
  asOf: number;
  /** End of the current timed phase (epoch ms), or 0 for an open session. */
  phaseEndsAt: number;
  /** Length of the current timed phase in ms (for the progress bar), or 0. */
  phaseMs: number;
  cycle: number;
  cycles: number;
  breakMinutes: number;
  focusMinutes: number;
  clock24h: boolean;
}

export interface PendingTimerAction {
  id: string;
  action: 'pause' | 'resume' | 'break' | 'finish' | 'save' | 'thought';
  entryId: string;
  version: number;
  at: number;
  text?: string;
}

export interface NativeReminder {
  /** Stable id: re-sending the same id replaces the scheduled reminder. */
  id: string;
  channel: 'review' | 'calendar' | 'plan' | 'resume' | 'digest' | 'tutor';
  at: number;
  title: string;
  body: string;
  /** Route opened by a tap, e.g. `/review`. */
  route: string;
  actions: {id: 'open' | 'later' | 'not_today' | 'snooze10' | 'start_block'; label: string; route?: string}[];
  /** Lock-screen text when the content is private. */
  publicTitle: string;
}

export interface DeviceCalendarEvent {key: string; title: string; start: number; end: number; description: string; timeZone: string}
export interface DeviceCalendar {id: string; name: string; account: string; colour: number}
export interface SharedItem {kind: 'text' | 'file'; text?: string; subject?: string; files?: {path: string; name: string; mime: string; size: number}[]}

export type PermissionWord = 'granted' | 'denied' | 'prompt';

export interface LemmaNativePlugin {
  setSession(session: NativeSession): Promise<void>;
  clearSession(): Promise<void>;

  timerUpdate(options: {state: NativeTimerState}): Promise<void>;
  timerClear(): Promise<void>;
  timerPendingActions(): Promise<{actions: PendingTimerAction[]}>;
  timerAckActions(options: {ids: string[]}): Promise<void>;

  notificationStatus(): Promise<{permission: PermissionWord; exactAlarms: boolean; channelsBlocked: string[]}>;
  requestNotifications(): Promise<{permission: PermissionWord}>;
  openNotificationSettings(options: {channel?: string}): Promise<void>;
  openExactAlarmSettings(): Promise<void>;
  remindersSet(options: {items: NativeReminder[]}): Promise<{scheduled: number}>;

  studyModeStatus(): Promise<{access: boolean; enabled: boolean; active: boolean}>;
  studyModeSetEnabled(options: {enabled: boolean}): Promise<void>;
  openStudyModeSettings(): Promise<void>;

  calendarStatus(): Promise<{permission: PermissionWord}>;
  calendarRequest(): Promise<{permission: PermissionWord}>;
  calendarList(): Promise<{calendars: DeviceCalendar[]}>;
  calendarSync(options: {events: DeviceCalendarEvent[]; from: number; to: number}): Promise<{inserted: number; updated: number; deleted: number}>;
  calendarRemoveAll(): Promise<{deleted: number}>;
  calendarBusy(options: {from: number; to: number; calendarIds: string[]}): Promise<{busy: {start: number; end: number}[]}>;

  shareTake(): Promise<{items: SharedItem[]}>;
  voiceAvailable(): Promise<{available: boolean}>;
  voiceRecognise(options: {prompt: string}): Promise<{text: string | null}>;
  shortcutsSet(options: {items: {id: string; label: string; route: string}[]}): Promise<void>;
  /** AW2: write `text` to the app's cache as `name` and open Android's share sheet with it. */
  shareFile(options: {name: string; mime: string; text: string; title?: string}): Promise<{shared: boolean}>;

  addListener(event: 'timerAction' | 'shareReceived', handler: () => void): Promise<{remove: () => Promise<void>}>;
}

/**
 * Capacitor's plugin proxy answers every property with a native method, `then` included, so a promise that resolves
 * to it treats it as a thenable and calls a native `then()` that does not exist: every call silently failed on the
 * phone (Owner report, 12 Nov 2026). Hand out a view that has no `then`.
 */
export function notThenable<T extends object>(proxy: T): T {
  return new Proxy(proxy, {get: (target, property) => property === 'then' ? undefined : Reflect.get(target, property)});
}

let plugin: Promise<LemmaNativePlugin> | null = null;
/** The plugin, created on first use (the import never runs in a browser). Safe to `await`. */
export function lemmaNative(): Promise<LemmaNativePlugin> {
  return plugin ??= import('@capacitor/core').then(({registerPlugin}) => notThenable(registerPlugin<LemmaNativePlugin>('LemmaNative')));
}
export function setLemmaNativeForTests(fake: LemmaNativePlugin | null): void {
  plugin = fake ? Promise.resolve(fake) : null;
}
