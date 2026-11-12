import {afterEach, describe, expect, it, vi} from 'vitest'
import type {CalendarBlockRecord, StudyApi, StudyEntryRecord} from '../../../src/data/study/contract'
import type {PendingTimerAction} from '../../../src/platform/bridge'
import {isNative} from '../../../src/platform/native'
import {nativeTimerState, replayTimerActions} from '../../../src/platform/timer'
import {inQuietHours, planReminders, zonedInstant, zonedParts} from '../../../src/platform/reminders'
import {authCallback, backStep, closeTopLayer, hasOpenLayer, routeFromUrl} from '../../../src/platform/links'
import {holdCaptureText, holdSharedSources, routeShare, takeCaptureText, takeSharedSources} from '../../../src/platform/share'
import {busyBlocks, calendarEvents} from '../../../src/platform/calendar'

const T0 = Date.parse('2026-11-12T10:00:00Z')
function entry(patch: Partial<StudyEntryRecord> = {}): StudyEntryRecord {
  return {id: 'e1', intent: 'Rudin ch 4', source: 'timer', status: 'running', reflection: null, rating: null, version: 3,
    createdAt: '2026-11-12T09:00:00Z', updatedAt: '2026-11-12T09:00:00Z', savedAt: null,
    intervals: [{id: 'i1', kind: 'focus', start: '2026-11-12T09:30:00Z', end: null}], ...patch}
}
function block(patch: Partial<CalendarBlockRecord> = {}): CalendarBlockRecord {
  return {id: 'b1', kind: 'study', title: 'Real analysis', startsAt: '2026-11-12T14:00:00Z', endsAt: '2026-11-12T15:30:00Z',
    timeZone: 'Asia/Kolkata', status: 'planned', version: 1, ...patch}
}

describe('N123 native detection', () => {
  afterEach(() => {delete (window as unknown as {Capacitor?: unknown}).Capacitor})
  it('is false in a browser and true only inside the Android app', () => {
    expect(isNative()).toBe(false);
    (window as unknown as {Capacitor: unknown}).Capacitor = {isNativePlatform: () => true, getPlatform: () => 'ios'}
    expect(isNative()).toBe(false);
    (window as unknown as {Capacitor: unknown}).Capacitor = {isNativePlatform: () => true, getPlatform: () => 'android'}
    expect(isNative()).toBe(true)
  })
})

describe('N123 · N2 native timer state', () => {
  it('maps a running open session to a count-up with focused time from timestamps', () => {
    const state = nativeTimerState(entry(), T0, 'Real analysis', false)!
    expect(state).toMatchObject({entryId: 'e1', version: 3, status: 'running', mode: 'open', phaseEndsAt: 0, context: 'Real analysis', clock24h: false})
    expect(state.focusedMs).toBe(30 * 60_000)
  })
  it('maps a pomodoro phase to a countdown with its length, cycle and break', () => {
    const state = nativeTimerState(entry({mode: 'pomodoro', phase: 'focus', cycle: 2, phaseEndsAt: '2026-11-12T10:10:00Z',
      config: {focus_minutes: 25, break_minutes: 5, cycles: 4}}), T0)!
    expect(state).toMatchObject({mode: 'pomodoro', phaseEndsAt: Date.parse('2026-11-12T10:10:00Z'), phaseMs: 25 * 60_000, cycle: 2, cycles: 4, breakMinutes: 5})
  })
  it('shows a break (paused with an open break interval) and a pause', () => {
    const onBreak = entry({status: 'paused', intervals: [{id: 'i1', kind: 'focus', start: '2026-11-12T09:30:00Z', end: '2026-11-12T09:55:00Z'},
      {id: 'i2', kind: 'break', start: '2026-11-12T09:55:00Z', end: null}]})
    expect(nativeTimerState(onBreak, T0)!.status).toBe('break')
    expect(nativeTimerState(onBreak, T0)!.focusedMs).toBe(25 * 60_000)
    const paused = entry({status: 'paused', intervals: [{id: 'i1', kind: 'focus', start: '2026-11-12T09:30:00Z', end: '2026-11-12T09:40:00Z'}]})
    expect(nativeTimerState(paused, T0)).toMatchObject({status: 'paused', phaseEndsAt: 0, focusedMs: 10 * 60_000})
  })
  it('shows nothing for no session or a finished one', () => {
    expect(nativeTimerState(null, T0)).toBeNull()
    expect(nativeTimerState(entry({status: 'saved'}), T0)).toBeNull()
    expect(nativeTimerState(entry({status: 'draft'}), T0)).toBeNull()
  })
  it('names an empty intention', () => {
    expect(nativeTimerState(entry({intent: '  '}), T0)!.intention).toBe('Focused study')
  })
})

describe('N123 · N2 replaying lock-screen actions', () => {
  function setup(current: StudyEntryRecord | null, actions: PendingTimerAction[]) {
    const acked: string[] = []
    const native = {
      timerPendingActions: vi.fn(async () => ({actions})),
      timerAckActions: vi.fn(async ({ids}: {ids: string[]}) => {acked.push(...ids)}),
    }
    const api = {
      activeStudyEntry: vi.fn(async () => current),
      pauseStudyEntry: vi.fn(async () => ({record: current!, actionNo: 1})),
      resumeStudyEntry: vi.fn(async () => ({record: current!, actionNo: 1})),
      breakStudyEntry: vi.fn(async () => ({record: current!, actionNo: 1})),
      saveStudyEntry: vi.fn(async () => ({record: current!, actionNo: 1})),
    } as unknown as StudyApi
    const thoughts: string[] = []
    return {native, api, acked, thoughts, createThought: async (text: string) => {thoughts.push(text)}}
  }
  const action = (patch: Partial<PendingTimerAction>): PendingTimerAction => ({id: 'a1', action: 'pause', entryId: 'e1', version: 3, at: T0, ...patch})

  it('applies an action taken against the current version, then acknowledges it', async () => {
    const s = setup(entry(), [action({})])
    expect(await replayTimerActions(s.native, s.api, s.createThought)).toEqual(['applied'])
    expect(s.api.pauseStudyEntry).toHaveBeenCalledWith('e1', 3)
    expect(s.acked).toEqual(['a1'])
  })
  it('never applies an action twice: a newer server version means it already happened', async () => {
    const s = setup(entry({version: 4}), [action({})])
    expect(await replayTimerActions(s.native, s.api, s.createThought)).toEqual(['skipped'])
    expect(s.api.pauseStudyEntry).not.toHaveBeenCalled()
    expect(s.acked).toEqual(['a1'])
  })
  it('drops actions for another session or no session', async () => {
    const s = setup(entry({id: 'other'}), [action({})])
    expect(await replayTimerActions(s.native, s.api, s.createThought)).toEqual(['skipped'])
    const none = setup(null, [action({action: 'resume'})])
    expect(await replayTimerActions(none.native, none.api, none.createThought)).toEqual(['skipped'])
  })
  it('parks thoughts and turns Finish into "open the log sheet", in the order they were taken', async () => {
    const s = setup(entry(), [action({id: 'b', action: 'finish', at: T0 + 2}), action({id: 'a', action: 'thought', text: ' Check uniform continuity ', at: T0 + 1})])
    expect(await replayTimerActions(s.native, s.api, s.createThought)).toEqual(['applied', 'finish'])
    expect(s.thoughts).toEqual(['Check uniform continuity'])
    expect(s.api.pauseStudyEntry).toHaveBeenCalledTimes(1)
    expect(s.acked).toEqual(['a', 'b'])
  })
  it('does not pause twice or resume a running session', async () => {
    const paused = setup(entry({status: 'paused'}), [action({})])
    expect(await replayTimerActions(paused.native, paused.api, paused.createThought)).toEqual(['skipped'])
    const running = setup(entry(), [action({action: 'resume'})])
    expect(await replayTimerActions(running.native, running.api, running.createThought)).toEqual(['skipped'])
  })
  it('acknowledges an action even when the server refuses it, so it cannot loop', async () => {
    const s = setup(entry(), [action({})])
    ;(s.api.pauseStudyEntry as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('conflict'))
    expect(await replayTimerActions(s.native, s.api, s.createThought)).toEqual(['skipped'])
    expect(s.acked).toEqual(['a1'])
  })
})

describe('N123 · N1 reminders the phone computes', () => {
  const prefs = {enabled: true, mode: 'daily' as const, studyTime: '18:00', kinds: {due: true, plan: true}, dueThreshold: 10 as const, maxPerDay: 5}
  const zone = 'Asia/Kolkata'
  it('converts local times in a zone both ways, across DST', () => {
    expect(new Date(zonedInstant('2026-11-12', '18:00', zone)).toISOString()).toBe('2026-11-12T12:30:00.000Z')
    expect(new Date(zonedInstant('2026-03-08', '09:00', 'America/New_York')).toISOString()).toBe('2026-03-08T13:00:00.000Z')
    expect(new Date(zonedInstant('2026-03-07', '09:00', 'America/New_York')).toISOString()).toBe('2026-03-07T14:00:00.000Z')
    expect(zonedParts(Date.parse('2026-11-12T12:30:00Z'), zone)).toMatchObject({date: '2026-11-12', time: '18:00'})
  })
  it('handles quiet hours that wrap midnight', () => {
    expect(inQuietHours(Date.parse('2026-11-12T17:00:00Z'), zone, {start: '22:00', end: '07:00'})).toBe(true)
    expect(inQuietHours(Date.parse('2026-11-12T12:30:00Z'), zone, {start: '22:00', end: '07:00'})).toBe(false)
    expect(inQuietHours(Date.parse('2026-11-12T12:30:00Z'), zone, {start: '09:00', end: '09:00'})).toBe(false)
  })
  it('schedules nothing when reminders are off', () => {
    expect(planReminders({prefs: {...prefs, enabled: false}, due: 40, blocks: [block()], now: T0, zone, clock24h: true})).toEqual([])
    expect(planReminders({prefs: {...prefs, mode: 'off'}, due: 40, blocks: [block()], now: T0, zone, clock24h: true})).toEqual([])
    expect(planReminders({prefs: null, due: 40, blocks: [], now: T0, zone, clock24h: true})).toEqual([])
  })
  it('reminds about due cards at the study time, today or tomorrow, above the threshold', () => {
    const [due] = planReminders({prefs, due: 12, blocks: [], now: T0, zone, clock24h: true})
    expect(due).toMatchObject({id: 'due', channel: 'review', route: '/review', title: '12 cards due', at: Date.parse('2026-11-12T12:30:00Z')})
    expect(due.actions.map(a => a.id)).toEqual(['open', 'later', 'not_today'])
    const late = planReminders({prefs, due: 12, blocks: [], now: Date.parse('2026-11-12T13:00:00Z'), zone, clock24h: true})
    expect(late[0].at).toBe(Date.parse('2026-11-13T12:30:00Z'))
    expect(planReminders({prefs, due: 9, blocks: [], now: T0, zone, clock24h: true})).toEqual([])
    expect(planReminders({prefs: {...prefs, kinds: {due: false}}, due: 50, blocks: [], now: T0, zone, clock24h: true})).toEqual([])
  })
  it('reminds when a planned study block starts, with Start now and Snooze', () => {
    const items = planReminders({prefs, due: 0, blocks: [block(), block({id: 'b2', status: 'cancelled'}), block({id: 'b3', kind: 'busy'}),
      block({id: 'b4', startsAt: '2026-11-12T09:00:00Z'}), block({id: 'b5', startsAt: '2026-11-20T09:00:00Z', endsAt: '2026-11-20T10:00:00Z'})], now: T0, zone, clock24h: true})
    expect(items.map(item => item.id)).toEqual(['block:b1'])
    expect(items[0]).toMatchObject({channel: 'calendar', body: 'Starts 19:30 · 90 min', route: '/?startBlock=b1'})
    expect(items[0].actions.map(a => a.id)).toEqual(['start_block', 'snooze10'])
    expect(items[0].publicTitle).not.toContain('Real analysis')
  })
  it('respects quiet hours and "at most N a day"', () => {
    const quiet = planReminders({prefs: {...prefs, quiet: {start: '17:00', end: '23:00'}}, due: 20, blocks: [block()], now: T0, zone, clock24h: true})
    expect(quiet).toEqual([])
    const many = Array.from({length: 8}, (_, i) => block({id: 'm' + i, startsAt: new Date(T0 + (i + 1) * 3600_000).toISOString(), endsAt: new Date(T0 + (i + 1) * 3600_000 + 1800_000).toISOString()}))
    expect(planReminders({prefs: {...prefs, maxPerDay: 3}, due: 0, blocks: many, now: T0, zone, clock24h: true})).toHaveLength(3)
  })
})

describe('N123 · N0 links and the back button', () => {
  it('routes App Links, shortcuts and notification taps, and nothing else', () => {
    expect(routeFromUrl('https://mymayankyadav.github.io/lemma/#/review')).toBe('/review')
    expect(routeFromUrl('https://mymayankyadav.github.io/lemma/#/focus?finish=1')).toBe('/focus?finish=1')
    expect(routeFromUrl('https://mymayankyadav.github.io/lemma/')).toBe('/')
    expect(routeFromUrl('https://localhost/lemma/#/proposals')).toBe('/proposals')
    expect(routeFromUrl('https://evil.example/lemma/#/review')).toBeNull()
    expect(routeFromUrl('https://mymayankyadav.github.io/other/#/review')).toBeNull()
    expect(routeFromUrl('https://user:pw@mymayankyadav.github.io/lemma/#/review')).toBeNull()
    expect(routeFromUrl('javascript:alert(1)')).toBeNull()
    expect(routeFromUrl('')).toBeNull()
  })
  it('reads the sign-in callback', () => {
    expect(authCallback('io.github.mymayankyadav.lemma://auth/callback?code=abcdef12-3456')).toEqual({code: 'abcdef12-3456'})
    expect(authCallback('io.github.mymayankyadav.lemma://auth/callback?error=access_denied&error_description=Cancelled')).toEqual({error: 'Cancelled'})
    expect(authCallback('io.github.mymayankyadav.lemma://auth/callback?code=<script>')).toBeNull()
    expect(authCallback('https://mymayankyadav.github.io/lemma/?code=abcdef12')).toBeNull()
  })
  it('closes the top layer first, then goes back, and leaves only from Today', () => {
    expect(backStep({layerOpen: true, route: '/', canGoBack: false})).toBe('close-layer')
    expect(backStep({layerOpen: false, route: '/cards?deck=x', canGoBack: true})).toBe('history-back')
    expect(backStep({layerOpen: false, route: '/review', canGoBack: false})).toBe('home')
    expect(backStep({layerOpen: false, route: '/', canGoBack: true})).toBe('minimise')
    expect(backStep({layerOpen: false, route: '/?quick=1', canGoBack: true})).toBe('minimise')
  })
  it('closes an open <dialog> with cancel, the way Escape does', () => {
    document.body.innerHTML = '<dialog open id="a"></dialog><dialog open id="b"></dialog>'
    const cancelled: string[] = []
    for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('cancel', () => cancelled.push(dialog.id))
    expect(hasOpenLayer()).toBe(true)
    expect(closeTopLayer()).toBe(true)
    expect(cancelled).toEqual(['b'])
    document.body.innerHTML = '<div role="dialog" aria-modal="true" id="p"></div>'
    const keys: string[] = []
    document.getElementById('p')!.addEventListener('keydown', event => keys.push(event.key))
    expect(closeTopLayer()).toBe(true)
    expect(keys).toEqual(['Escape'])
    document.body.innerHTML = ''
    expect(hasOpenLayer()).toBe(false)
    expect(closeTopLayer()).toBe(false)
  })
})

describe('N123 · N4 share to Lemma', () => {
  it('sends text and links to Capture and sources to a new path', () => {
    expect(routeShare({kind: 'text', text: 'https://arxiv.org/abs/1', subject: 'A paper'})).toEqual({kind: 'capture', text: 'A paper — https://arxiv.org/abs/1'})
    const files = [{path: '/c/a.pdf', name: 'Rudin.pdf', mime: 'application/pdf', size: 10}, {path: '/c/b.jpg', name: 'b.jpg', mime: 'image/jpeg', size: 10}]
    expect(routeShare({kind: 'file', files})).toEqual({kind: 'new-path', files: [files[0]]})
    expect(routeShare({kind: 'file', files: [files[1]]}).kind).toBe('unsupported')
    expect(routeShare({kind: 'text', text: '   '}).kind).toBe('unsupported')
    expect((routeShare({kind: 'text', text: 'x'.repeat(900)}) as {text: string}).text).toHaveLength(500)
  })
  it('hands shared text and files over exactly once', () => {
    holdCaptureText('review Rudin tomorrow 2h #real')
    expect(takeCaptureText()).toBe('review Rudin tomorrow 2h #real')
    expect(takeCaptureText()).toBeNull()
    const file = new File(['%PDF'], 'a.pdf', {type: 'application/pdf'})
    holdSharedSources([file])
    expect(takeSharedSources()).toEqual([file])
    expect(takeSharedSources()).toEqual([])
  })
})

describe('N123 · N5 device calendar', () => {
  it('writes planned and done study blocks, never cancelled or busy ones', () => {
    const events = calendarEvents([block({id: 'b2', startsAt: '2026-11-13T09:00:00Z', endsAt: '2026-11-13T10:00:00Z', status: 'done'}), block(),
      block({id: 'b3', status: 'cancelled'}), block({id: 'b4', kind: 'busy'}), block({id: 'b5', endsAt: '2026-11-12T14:00:00Z'})])
    expect(events.map(event => event.key)).toEqual(['b1', 'b2'])
    expect(events[0]).toMatchObject({title: 'Real analysis', start: Date.parse('2026-11-12T14:00:00Z'), end: Date.parse('2026-11-12T15:30:00Z'), timeZone: 'Asia/Kolkata'})
    expect(events[1].title).toBe('Real analysis ✓')
  })
  it('turns busy times into planner busy blocks', () => {
    const blocks = busyBlocks([{start: T0, end: T0 + 3600_000}, {start: T0, end: T0}], 'UTC')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({kind: 'busy', status: 'planned', startsAt: '2026-11-12T10:00:00.000Z', endsAt: '2026-11-12T11:00:00.000Z'})
  })
})
