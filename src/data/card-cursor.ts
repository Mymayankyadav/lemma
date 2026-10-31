import { LemmaError } from './api'

export type CardPageKind = 'reviews' | 'comments'
export interface CardPageKey { at: string; id: string }

const invalid = () => new LemmaError('invalid', 'Invalid Card detail page cursor')
const keyPattern = /^(?:[0-9]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i

/** Opaque, note-bound keyset cursor; never an offset or a client-supplied SQL fragment. */
export function encodeCardPageCursor(kind: CardPageKind, noteNo: number, key: CardPageKey): string {
  if (!Number.isSafeInteger(noteNo) || noteNo < 1 || !Number.isFinite(Date.parse(key.at)) || !keyPattern.test(key.id))
    throw invalid()
  return btoa(JSON.stringify({v: 1, kind, noteNo, at: key.at, id: key.id}))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeCardPageCursor(cursor: string | undefined, kind: CardPageKind, noteNo: number): CardPageKey | null {
  if (cursor === undefined) return null
  if (cursor.length === 0 || cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw invalid()
  try {
    const data: unknown = JSON.parse(atob(cursor.replace(/-/g, '+').replace(/_/g, '/')))
    if (!data || typeof data !== 'object') throw invalid()
    const value = data as Record<string, unknown>
    if (value.v !== 1 || value.kind !== kind || value.noteNo !== noteNo ||
      typeof value.at !== 'string' || typeof value.id !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value.at) ||
      !Number.isFinite(Date.parse(value.at)) || !keyPattern.test(value.id))
      throw invalid()
    return {at: value.at, id: value.id}
  } catch {
    throw invalid()
  }
}

/** Keyset order: timestamp DESC, unique id DESC. */
export function olderThanKey(row: CardPageKey, key: CardPageKey): boolean {
  return row.at < key.at || (row.at === key.at &&
    (/[a-f-]/i.test(row.id) ? row.id.localeCompare(key.id) < 0 : BigInt(row.id) < BigInt(key.id)))
}
