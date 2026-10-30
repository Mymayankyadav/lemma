import {create} from 'zustand'
import type {Confidence,QueueFilter,Rating,ReviewItem,CardState} from '../../data/types'
import type {QueueSettings,ReviewQueue} from '../../lib/queue'
import {advanceQueue,buildQueue,nextCard} from '../../lib/queue'

export interface Answer {
 card:ReviewItem
 reviewId:number
 rating:Rating
 confidence:Confidence
 durationMs:number
 next:CardState
 answeredAt:number
 queueBefore:ReviewQueue
}
interface ReviewState {
 filter:QueueFilter
 queue:ReviewQueue|null
 current:ReviewItem|null
 confidence:Confidence
 revealed:boolean
 submitting:boolean
 startTime:number
 answers:Answer[]
 lastUndo:Answer|null
 total:number
 roundOrder:string[]
 initialize:(items:ReviewItem[],settings:QueueSettings,filter:QueueFilter)=>void
 reveal:(confidence:Confidence)=>void
 beginGrade:()=>void
 cancelGrade:()=>void
 committed:(receipt:Omit<Answer,'queueBefore'>)=>void
 undoCommitted:()=>Answer|null
 close:()=>void
}
const defaultFilter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false}
export const useReviewSession=create<ReviewState>((set,get)=>({
 filter:defaultFilter,queue:null,current:null,confidence:null,revealed:false,submitting:false,
 startTime:Date.now(),answers:[],lastUndo:null,total:0,roundOrder:[],
 initialize(items,settings,filter){
  const first=nextCard(buildQueue(items,settings),Date.now())
  set({filter,queue:first.queue,current:first.item,total:items.length,
   revealed:false,confidence:null,submitting:false,startTime:Date.now(),answers:[],lastUndo:null,
   roundOrder:first.item?[first.item.cardId]:[]})
 },
 reveal(confidence){if(get().current&&!get().submitting)set({revealed:true,confidence})},
 beginGrade(){set({submitting:true})},
 cancelGrade(){set({submitting:false})},
 committed(receipt){
  const {current,queue,answers}=get()
  if(!current||!queue||current.cardId!==receipt.card.cardId)return
  const advanced=advanceQueue(queue,current,receipt.next)
  const next=nextCard(advanced)
  const entry:Answer={...receipt,queueBefore:queue}
  const roundOrder=get().roundOrder
  set({current:next.item,queue:next.queue,answers:[...answers,entry],lastUndo:entry,
   roundOrder:next.item&&!roundOrder.includes(next.item.cardId)?[...roundOrder,next.item.cardId]:roundOrder,
   confidence:null,revealed:false,submitting:false,startTime:Date.now()})
 },
 undoCommitted(){
  const {lastUndo,answers}=get()
  if(!lastUndo || answers.at(-1)?.reviewId!==lastUndo.reviewId)return null
  set({current:lastUndo.card,queue:lastUndo.queueBefore,answers:answers.slice(0,-1),
   lastUndo:null,confidence:null,revealed:false,submitting:false,startTime:Date.now()})
  return lastUndo
 },
 close(){set({current:null,queue:null,roundOrder:[],confidence:null,revealed:false,submitting:false,startTime:Date.now()})},
}))
