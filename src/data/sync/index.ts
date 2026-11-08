import type { QueryClient } from '@tanstack/react-query'
import { getMode } from '../mode'
import { applyOwnerChangePage, PAGE_SIZE, parseOwnerChangePage, readOwnerChanges } from './feed'

export type ReadOwnerChanges = (cursor: number) => Promise<unknown>
const POLL_INTERVAL_MS = 15_000
const MAX_BACKOFF_MS = 60_000

let activeOwner: string | null = null
let cursor = 0
let resetWasApplied = false
let shared: { owner: string; client: QueryClient; subscribers: number; stop: () => void } | null = null

/** Discard any account-specific cursor on sign-out or account switch. */
export function clearOwnerChangesCursor(): void {
 shared?.stop()
 shared = null
 activeOwner = null
 cursor = 0
 resetWasApplied = false
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
   await applyOwnerChangePage(client, page, resetWasApplied)
   if (disposed || activeOwner !== owner) return
   cursor = page.nextCursor
   resetWasApplied = page.reset
   retryCount = 0
   // Drain large backlogs page-by-page without waiting for the next interval.
   if (page.changes.length === PAGE_SIZE && cursor > requestedCursor) delay = 0
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
 if (!owner || getMode() !== 'live' || typeof window === 'undefined') return () => {}
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
