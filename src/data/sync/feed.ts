import { invalidateOwnerChanges } from './keys'
import type { QueryClient } from '@tanstack/react-query'

export const PAGE_SIZE = 50
export interface OwnerDelta {
 cursor: number
 resource: string
 record_id: string
 version: number
 op: 'insert' | 'update' | 'delete'
 tombstone: boolean
}
export interface OwnerChangePage {
 changes: OwnerDelta[]
 nextCursor: number
 reset: boolean
}
const isObject = (value: unknown): value is Record<string, unknown> =>
 typeof value === 'object' && value !== null && !Array.isArray(value)
const safeCursor = (value: unknown): value is number =>
 typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

/** Reject malformed/unsafe bigint cursors rather than silently skipping deltas. */
export function parseOwnerChangePage(value: unknown, cursor: number): OwnerChangePage {
 if (!isObject(value) || !Array.isArray(value.changes) || value.changes.length > 100 ||
  !safeCursor(value.nextCursor) || value.nextCursor < cursor || typeof value.reset !== 'boolean')
  throw new Error('Invalid changes_since page')
 const changes: OwnerDelta[] = []
 let previous = cursor
 for (const item of value.changes) {
  if (!isObject(item) || !safeCursor(item.cursor) || item.cursor <= previous ||
   typeof item.resource !== 'string' || !item.resource ||
   typeof item.record_id !== 'string' || typeof item.version !== 'number' ||
   !Number.isSafeInteger(item.version) || item.version < 1 ||
   !['insert', 'update', 'delete'].includes(String(item.op)) ||
   typeof item.tombstone !== 'boolean' || item.tombstone !== (item.op === 'delete'))
   throw new Error('Invalid owner change entry')
  previous = item.cursor
  changes.push(item as unknown as OwnerDelta)
 }
 if (changes.length && value.nextCursor !== previous)
  throw new Error('Cursor does not match last change')
 return { changes, nextCursor: value.nextCursor, reset: value.reset }
}

export async function readOwnerChanges(cursor: number): Promise<unknown> {
 // Keep Supabase out of the demo/cold-Today bundle.
 const { liveClient } = await import('../live/client')
 const { data, error } = await liveClient().rpc('changes_since', { p_cursor: cursor, p_limit: PAGE_SIZE })
 if (error) throw error
 return data
}

export async function applyOwnerChangePage(
 client: QueryClient, page: OwnerChangePage, priorReset: boolean,
): Promise<void> {
 await invalidateOwnerChanges(
  client, page.changes.map(change => change.resource),
  page.reset && !priorReset,
 )
}
