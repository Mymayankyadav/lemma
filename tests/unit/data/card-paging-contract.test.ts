import {describe,expect,it} from 'vitest'
import {DemoAdapter} from '../../../src/data/demo/adapter'
import {LiveAdapter} from '../../../src/data/live/adapter'
import type {DemoStore} from '../../../src/data/demo/model'
import fixtureText from '../../../src/data/demo/fixture.json?raw'

describe('FIX-546b bounded Card detail pagination contract',()=>{
 it('exposes implemented read methods on both adapters',()=>{
  expect(typeof new DemoAdapter().getCardHistoryPage).toBe('function')
  expect(typeof new LiveAdapter().getCardHistoryPage).toBe('function')
  expect(typeof new DemoAdapter().getCardCommentsPage).toBe('function')
  expect(typeof new LiveAdapter().getCardCommentsPage).toBe('function')
 })
 it('demo adapter pages tied timestamps with no duplicate or skipped rows',async()=>{
  const fixture=JSON.parse(fixtureText) as DemoStore
  const note=fixture.notes[0],card=note.cards[0]
  fixture.reviews=Array.from({length:42},(_,i)=>({
   id:i+10000,cardId:card.id,projectId:note.projectId,
   reviewedAt:new Date(Date.UTC(2026,9,30)-Math.floor(i/2)*3600000).toISOString(),
   rating:3 as const,stateBefore:2 as const,confidence:'sure' as const,durationMs:1000,
   prev:structuredClone(card.state),undoneAt:null,
  }))
  note.comments=Array.from({length:42},(_,i)=>({
   no:i+10000,body:'Note '+i,status:'open' as const,
   createdAt:new Date(Date.UTC(2026,9,30)-Math.floor(i/2)*3600000).toISOString(),
   resolvedAt:null,resolvedByOrigin:null,
  }))
  const api=new DemoAdapter({fixture,now:()=>Date.UTC(2026,9,31)})
  const no=note.note.noteNo
  const detail=await api.getCard(no)
  expect(detail.history).toHaveLength(20)
  expect(detail.comments).toHaveLength(20)
  expect(detail.historyNextCursor).toBeTruthy()
  expect(detail.commentsNextCursor).toBeTruthy()
  for(const [method,key] of [['getCardHistoryPage','reviewedAt'],['getCardCommentsPage','no']] as const){
   const pages=[]
   let cursor: string|undefined
   for(let i=0;i<4;i++){
    const page=method==='getCardHistoryPage'
     ?await api.getCardHistoryPage(no,cursor):await api.getCardCommentsPage(no,cursor)
    expect(page.rows.length).toBeLessThanOrEqual(20)
    pages.push(page)
    if(!page.nextCursor)break
    cursor=page.nextCursor
   }
   expect(pages.map(p=>p.rows.length)).toEqual([20,20,2])
   if(key==='no'){
    const nos=pages.flatMap(p=>p.rows.map(r=>('no' in r?r.no:0)))
    expect(new Set(nos).size).toBe(42)
   }
  }
  const cursor=(await api.getCardHistoryPage(no)).nextCursor!
  // 19, 20, 21: only the 21-row probe may advertise a continuation.
  for(const count of [19,20,21]){
   const limited=structuredClone(fixture)
   limited.reviews=limited.reviews.slice(0,count)
   limited.notes[0].comments=limited.notes[0].comments.slice(0,count)
   const bounded=new DemoAdapter({fixture:limited,now:()=>Date.UTC(2026,9,31)})
   const first=await bounded.getCard(no)
   expect(first.history).toHaveLength(Math.min(count,20))
   expect(first.comments).toHaveLength(Math.min(count,20))
   expect(Boolean(first.historyNextCursor)).toBe(count>20)
   expect(Boolean(first.commentsNextCursor)).toBe(count>20)
  }
  // Reviews and comments must not share the continuation decision.
  for(const [reviews,comments] of [[20,21],[21,20]] as const){
   const mixed=structuredClone(fixture)
   mixed.reviews=mixed.reviews.slice(0,reviews)
   mixed.notes[0].comments=mixed.notes[0].comments.slice(0,comments)
   const result=await new DemoAdapter({fixture:mixed,now:()=>Date.UTC(2026,9,31)}).getCard(no)
   expect(Boolean(result.historyNextCursor)).toBe(reviews>20)
   expect(Boolean(result.commentsNextCursor)).toBe(comments>20)
  }
  await expect(api.getCardHistoryPage(999999,cursor)).rejects.toMatchObject({code:'not_found'})
  await expect(api.getCardHistoryPage(no,'forged')).rejects.toMatchObject({code:'invalid'})
 })
})
