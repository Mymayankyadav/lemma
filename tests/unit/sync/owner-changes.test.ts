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
