import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyOwnerChangePage, parseOwnerChangePage } from '../../../src/data/sync/feed'
import { clearOwnerChangesCursor, subscribeOwnerChanges } from '../../../src/data/sync'
import { invalidateOwnerChanges } from '../../../src/data/sync/keys'

const delta = (resource: string, cursor = 1) => ({
 cursor, resource, record_id: 'record', version: 1, op: 'insert' as const, tombstone: false,
})
const page = (changes = [delta('tasks')], nextCursor = 1, reset = false) =>
 ({ changes, nextCursor, reset })
const queryClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } })

beforeEach(() => {
 clearOwnerChangesCursor()
 sessionStorage.removeItem('lemma.demo')
 window.history.replaceState(null, '', '/?flags=v6Shell')
 vi.useFakeTimers()
})
afterEach(() => {
 clearOwnerChangesCursor()
 vi.useRealTimers()
 vi.restoreAllMocks()
})

describe('N54.1 owner changes and targeted invalidation', () => {
 it('does not add polling traffic to legacy live screens with the v6 shell off', async () => {
  window.history.replaceState(null, '', '/?demo=0&flags=-v6Shell')
  const read = vi.fn(async () => page([], 0))
  const stop = subscribeOwnerChanges('live-account', queryClient(), read)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(read).not.toHaveBeenCalled()
  stop()
 });

 it('invalidates only the registered prefixes for a known resource', async () => {
  const client = queryClient()
  for (const key of ['tasks', 'calendar', 'atlas']) client.setQueryData([key], 1)
  await invalidateOwnerChanges(client, ['tasks'])
  expect(client.getQueryState(['tasks'])?.isInvalidated).toBe(true)
  expect(client.getQueryState(['calendar'])?.isInvalidated).toBe(true)
  expect(client.getQueryState(['atlas'])?.isInvalidated).toBe(false)
 })
 it('invalidates all owner queries on reset or a future unregistered resource', async () => {
  const client = queryClient()
  client.setQueryData(['atlas'], 1)
  client.setQueryData(['focus'], 2)
  await invalidateOwnerChanges(client, ['future_domain_table'])
  expect(client.getQueryState(['atlas'])?.isInvalidated).toBe(true)
  expect(client.getQueryState(['focus'])?.isInvalidated).toBe(true)
  client.setQueryData(['atlas'], 2)
  await applyOwnerChangePage(client, page([], 0, true), false)
  expect(client.getQueryState(['atlas'])?.isInvalidated).toBe(true)
 })
 it('rejects malformed or out-of-order pages instead of advancing the cursor', () => {
  expect(() => parseOwnerChangePage({ changes: [], nextCursor: 7, reset: false }, 8)).toThrow()
  expect(() => parseOwnerChangePage(page([delta('tasks', 2), delta('tasks', 1)], 1), 0)).toThrow()
  expect(() => parseOwnerChangePage(page([delta('tasks', 1)], 2), 0)).toThrow()
  expect(() => parseOwnerChangePage(page([delta('tasks', 1)], Number.MAX_SAFE_INTEGER + 1), 0)).toThrow()
  expect(parseOwnerChangePage(page(), 0).nextCursor).toBe(1)
 })
 it('shares a single active poll and continues at the last cursor', async () => {
  const client = queryClient()
  client.setQueryData(['tasks'], 1)
  const read = vi.fn(async (cursor: number) =>
   cursor === 0 ? page([delta('tasks')], 1) : page([], 1))
  const a = subscribeOwnerChanges('account-a', client, read)
  const b = subscribeOwnerChanges('account-a', client, read)
  await vi.advanceTimersByTimeAsync(0)
  expect(read).toHaveBeenCalledTimes(1)
  expect(client.getQueryState(['tasks'])?.isInvalidated).toBe(true)
  await vi.advanceTimersByTimeAsync(15_000)
  expect(read).toHaveBeenLastCalledWith(1)
  a(); b()
  await vi.advanceTimersByTimeAsync(60_000)
  expect(read).toHaveBeenCalledTimes(2)
 })
 it('drains a cold-start backlog with one invalidation, not one per page', async () => {
  const client = queryClient()
  client.setQueryData(['decks'], 1)
  client.setQueryData(['settings'], 1)
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  // Three full pages of journal history, then a short tail: 160 rows from cursor 0.
  const full = (from: number, resource: string) =>
   page(Array.from({ length: 50 }, (_, i) => delta(resource, from + i + 1)), from + 50)
  const read = vi.fn(async (cursor: number) =>
   cursor === 0 ? full(0, 'cards') : cursor === 50 ? full(50, 'settings') :
   cursor === 100 ? full(100, 'cards') :
   cursor === 150 ? page(Array.from({ length: 10 }, (_, i) => delta('tasks', 151 + i)), 160) :
   page([], 160))
  const stop = subscribeOwnerChanges('account-a', client, read)
  await vi.advanceTimersByTimeAsync(0)
  expect(read.mock.calls.map(call => call[0])).toEqual([0])
  expect(invalidate).not.toHaveBeenCalled()
  // Nested zero-delay timers run on later ticks, not in the initial timer advance.
  await vi.advanceTimersByTimeAsync(10)
  expect(read.mock.calls.map(call => call[0])).toEqual([0, 50, 100, 150])
  // Every resource from the backlog is still invalidated, once per prefix.
  const keys = invalidate.mock.calls.map(call => (call[0] as { queryKey: string[] }).queryKey[0])
  expect(keys.filter(key => key === 'decks')).toHaveLength(1)
  expect(keys.filter(key => key === 'settings')).toHaveLength(1)
  expect(keys).toContain('tasks')
  expect(client.getQueryState(['decks'])?.isInvalidated).toBe(true)
  expect(client.getQueryState(['settings'])?.isInvalidated).toBe(true)
  stop()
 })
 it.each([false, true])('discards a previous owner\'s deferred changes (reset %s)', async reset => {
  const client = queryClient()
  for (const key of ['decks', 'settings', 'atlas', 'tasks']) client.setQueryData([key], 1)
  const stopA = subscribeOwnerChanges('account-a', client, async () =>
   page(Array.from({ length: 50 }, (_, i) => delta('cards', i + 1)), 50, reset))
  await vi.advanceTimersByTimeAsync(0)
  expect(client.getQueryState(['decks'])?.isInvalidated).toBe(false)
  stopA()
  const readB = vi.fn(async () => page([delta('tasks')], 1))
  const stopB = subscribeOwnerChanges('account-b', client, readB)
  await vi.advanceTimersByTimeAsync(0)
  expect(readB).toHaveBeenCalledExactlyOnceWith(0)
  expect(client.getQueryState(['tasks'])?.isInvalidated).toBe(true)
  for (const key of ['decks', 'settings', 'atlas'])
   expect(client.getQueryState([key])?.isInvalidated).toBe(false)
  stopB()
 })
 it('retains deferred changes when the same owner resumes an interrupted drain', async () => {
  const client = queryClient()
  client.setQueryData(['atlas'], 1)
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const stop = subscribeOwnerChanges('account-a', client, async () =>
   page(Array.from({ length: 50 }, (_, i) => delta('cards', i + 1)), 50, true))
  await vi.advanceTimersByTimeAsync(0)
  expect(invalidate).not.toHaveBeenCalled()
  stop()
  const tail = vi.fn(async () => page([], 50))
  const resumed = subscribeOwnerChanges('account-a', client, tail)
  await vi.advanceTimersByTimeAsync(0)
  expect(tail).toHaveBeenCalledExactlyOnceWith(50)
  expect(invalidate).toHaveBeenCalledTimes(1)
  expect(client.getQueryState(['atlas'])?.isInvalidated).toBe(true)
  resumed()
 })
 it('never reuses a cursor from another signed-in owner', async () => {
  const client = queryClient()
  const read = vi.fn(async (cursor: number) => cursor === 0 ?
   page([delta('tasks', 4)], 4) : page([], 4))
  const stopA = subscribeOwnerChanges('account-a', client, read)
  // A page with first cursor 4 is valid: global cursors have gaps across owners.
  await vi.advanceTimersByTimeAsync(0)
  stopA()
  const stopB = subscribeOwnerChanges('account-b', client, read)
  await vi.advanceTimersByTimeAsync(0)
  expect(read.mock.calls.map(call => call[0])).toEqual([0, 0])
  stopB()
 })
 it('pauses while hidden and retries on visibility; demo makes no request', async () => {
  const client = queryClient()
  const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
  const read = vi.fn(async () => page([], 0))
  const stop = subscribeOwnerChanges('account-a', client, read)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(read).not.toHaveBeenCalled()
  visible.mockReturnValue('visible')
  document.dispatchEvent(new Event('visibilitychange'))
  await vi.advanceTimersByTimeAsync(0)
  expect(read).toHaveBeenCalledTimes(1)
  stop()
  clearOwnerChangesCursor()
  sessionStorage.setItem('lemma.demo', '1')
  const noop = subscribeOwnerChanges('demo-account', client, read)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(read).toHaveBeenCalledTimes(1)
  noop()
 })
})
