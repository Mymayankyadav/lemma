import {describe,expect,it} from 'vitest'
import type {CardState,ReviewItem} from '../../src/data/types'
import type {ReviewQueue} from '../../src/lib/queue'
import {nextCard} from '../../src/lib/queue'
import {afterRoundGrade} from '../../src/features/review-run/retry'

const now=Date.parse('2026-10-30T12:00:00Z')
const state=(due=now,stateNumber=2)=>({state:stateNumber,due:new Date(due).toISOString()}) as CardState
const card=(id:string,s=state())=>({cardId:id,noteId:id,projectSlug:'algebra',checkpointCode:'CP1',state:s}) as ReviewItem
const settings={newPerDay:20,reviewsPerDay:100,rolloverHour:4,timeZone:'UTC',learnAheadMinutes:20,mixDecks:false}
const queue=(reviews:ReviewItem[],learning:ReviewItem[]=[]):ReviewQueue=>({
 learning,reviews,fresh:[],sinceNew:0,reviewsPerNew:5,lastCheckpoint:null,total:reviews.length+learning.length,answered:0,settings
})
describe('Again in-round requeue',()=>{
 it('deals two other cards before the missed card, preserving FSRS due in the receipt',()=>{
  const a=card('a'),b=card('b'),c=card('c'),d=card('d')
  const persisted=state(now+10*60000,3)
  const first=afterRoundGrade(queue([b,c,d],[card('a',persisted)]),[],a,persisted,1,now)
  expect(first.queue.learning).toHaveLength(0)
  expect(first.pending).toHaveLength(1)
  expect(persisted.due).toBe(new Date(now+10*60000).toISOString())
  const dealtB=nextCard(first.queue,now)
  expect(dealtB.item?.cardId).toBe('b')
  const second=afterRoundGrade(dealtB.queue,first.pending,b,state(now+DAY),3,now)
  const dealtC=nextCard(second.queue,now)
  expect(dealtC.item?.cardId).toBe('c')
  const third=afterRoundGrade(dealtC.queue,second.pending,c,state(now+DAY),3,now)
  const dealtA=nextCard(third.queue,now)
  expect(dealtA.item?.cardId).toBe('a')
  expect(dealtA.item?.state.due).toBe(new Date(now).toISOString())
  expect(third.pending).toHaveLength(0)
 })
 it('retries immediately if no other cards remain',()=>{
  const a=card('a'),persisted=state(now+600000,3)
  const result=afterRoundGrade(queue([], [card('a',persisted)]),[],a,persisted,1,now)
  expect(result.pending).toHaveLength(0)
  expect(nextCard(result.queue,now).item?.cardId).toBe('a')
 })
})
const DAY=86400000
