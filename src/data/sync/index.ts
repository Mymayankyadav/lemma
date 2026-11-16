import type { QueryClient } from '@tanstack/react-query'
import { getMode } from '../mode'
import { isFlagOn } from '../../flags'
import { PAGE_SIZE, parseOwnerChangePage, readOwnerChanges } from './feed'
import { invalidateOwnerChanges } from './keys'

export type ReadOwnerChanges = (cursor: number) => Promise<unknown>
const POLL_INTERVAL_MS = 15_000
const MAX_BACKOFF_MS = 60_000

let activeOwner: string | null = null
let cursor = 0
let resetWasApplied = false
// Bug: a cold start replays the owner's whole retained journal (thousands of
// rows) from cursor 0. Invalidating per 50-row page refetched every screen
// hundreds of times in a row, and the Review forecast, keyed on the decks and
// settings fetch times, cycled "Loading the forecast…" for minutes. While a
// backlog drains, collect the touched resources and invalidate once at the end.
let pendingResources: string[] = []
let pendingReset = false
let shared: { owner: string; client: QueryClient; subscribers: number; stop: () => void } | null = null

/** Discard any account-specific cursor on sign-out or account switch. */
export function clearOwnerChangesCursor(): void {
 shared?.stop()
 shared = null
 activeOwner = null
 cursor = 0
 resetWasApplied = false
 pendingResources = []
 pendingReset = false
}

function beginPolling(owner: string, client: QueryClient, read: ReadOwnerChanges): () => void {
 let disposed = false
 let inFlight = false
 let retryImmediately = false
 let retryCount = 0
 let timer: ReturnType<typeof setTimeout> | null = null

 const isVisible = () => document.visibilityState !== 'hidden' && navigator.onLine !== false
 const schedule = (ms: number) => {
  if (timer !== null) clearTimeout(timer)
  timer = null
  if (disposed || activeOwner !== owner || !isVisible()) return
  timer = setTimeout(() => { timer = null; void poll() }, ms)
 }
 const poll = async () => {
  if (disposed || activeOwner !== owner || !isVisible()) return
  if (inFlight) { retryImmediately = true; return }
  inFlight = true
  let delay = POLL_INTERVAL_MS
  try {
   const requestedCursor = cursor
   const page = parseOwnerChangePage(await read(requestedCursor), requestedCursor)
   if (disposed || activeOwner !== owner) return
   const draining = page.changes.length === PAGE_SIZE && page.nextCursor > requestedCursor
   const resources = [...new Set([...pendingResources, ...page.changes.map(change => change.resource)])]
   const reset = pendingReset || (page.reset && !resetWasApplied)
   if (draining) {
    // More pages follow at once: defer invalidation until the backlog is drained.
    pendingResources = resources
    pendingReset = reset
   } else {
    await invalidateOwnerChanges(client, resources, reset)
    if (disposed || activeOwner !== owner) return
    pendingResources = []
    pendingReset = false
   }
   cursor = page.nextCursor
   resetWasApplied = page.reset
   retryCount = 0
   // Drain large backlogs page-by-page without waiting for the next interval.
   if (draining) delay = 0
  } catch {
   // Network and invalid response errors must not stop subsequent polling.
   retryCount = Math.min(retryCount + 1, 6)
   delay = Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** retryCount)
  } finally {
   inFlight = false
   if (!disposed && activeOwner === owner) {
    if (retryImmediately) { retryImmediately = false; delay = 0 }
    schedule(delay)
   }
  }
 }
 const wake = () => {
  if (disposed || activeOwner !== owner || !isVisible()) {
   if (timer !== null) clearTimeout(timer)
   timer = null
   return
  }
  if (inFlight) { retryImmediately = true; return }
  schedule(0)
 }
 const onVisibility = () => wake()
 window.addEventListener('focus', wake)
 window.addEventListener('online', wake)
 document.addEventListener('visibilitychange', onVisibility)
 wake()
 return () => {
  disposed = true
  if (timer !== null) clearTimeout(timer)
  window.removeEventListener('focus', wake)
  window.removeEventListener('online', wake)
  document.removeEventListener('visibilitychange', onVisibility)
 }
}

/** Share one poller among useAuth consumers. Mode and owner bound every cursor;
 * late results from an old account cannot mutate the new account's cache. */
export function subscribeOwnerChanges(
 owner: string, client: QueryClient, read: ReadOwnerChanges = readOwnerChanges,
): () => void {
 // The change feed owns v6 query invalidation. The legacy shell makes a
 // bounded set of HTTP calls and must remain unchanged with its flag off.
 if (!owner || getMode() !== 'live' || !isFlagOn('v6Shell') ||
  typeof window === 'undefined') return () => {}
 if (shared && (shared.owner !== owner || shared.client !== client)) {
  shared.stop()
  shared = null
 }
 if (activeOwner !== owner) {
  cursor = 0
  resetWasApplied = false
  activeOwner = owner
 }
 if (!shared) shared = { owner, client, subscribers: 0, stop: beginPolling(owner, client, read) }
 const current = shared
 current.subscribers += 1
 let released = false
 return () => {
  if (released) return
  released = true
  current.subscribers -= 1
  if (current.subscribers === 0) {
   current.stop()
   if (shared === current) shared = null
  }
 }
}
