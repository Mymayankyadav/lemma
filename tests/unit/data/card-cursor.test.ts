import {describe,expect,it} from 'vitest'
import {decodeCardPageCursor,encodeCardPageCursor,olderThanKey} from '../../../src/data/card-cursor'

describe('FIX-546b Card detail cursor security and keyset ordering',()=>{
 const at='2026-10-31T10:00:00.000Z'
 it('round trips and binds to note and resource',()=>{
  const cursor=encodeCardPageCursor('reviews',37,{at,id:'9007199254740993'})
  expect(decodeCardPageCursor(cursor,'reviews',37)).toEqual({at,id:'9007199254740993'})
  expect(()=>decodeCardPageCursor(cursor,'comments',37)).toThrowError(/Invalid Card detail/)
  expect(()=>decodeCardPageCursor(cursor,'reviews',38)).toThrowError(/Invalid Card detail/)
 })
 it('rejects malformed and forged cursors',()=>{
  for(const cursor of ['','abc%','e30','!!!!','a'.repeat(513)]){
   expect(()=>decodeCardPageCursor(cursor,'reviews',1)).toThrowError(/Invalid Card detail/)
  }
  const forged=btoa(JSON.stringify({v:1,kind:'reviews',noteNo:1,at, id:'1);delete.from.notes'}))
  expect(()=>decodeCardPageCursor(forged,'reviews',1)).toThrowError(/Invalid Card detail/)
 })
 it('sorts tied bigint identities without JS precision loss',()=>{
  const key={at,id:'9007199254740993'}
  expect(olderThanKey({at,id:'9007199254740992'},key)).toBe(true)
  expect(olderThanKey({at,id:'9007199254740994'},key)).toBe(false)
  expect(olderThanKey({at:'2026-10-30T10:00:00.000Z',id:'999'},key)).toBe(true)
 })
})
