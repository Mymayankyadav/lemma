// @vitest-environment node
import {describe,expect,it,vi} from 'vitest'
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url',()=>({default:'unused-worker'}))
import {DemoAdapter} from '../../../src/data/demo/adapter'
import fixtureText from '../../../src/data/demo/fixture.json?raw'
import type {DemoStore} from '../../../src/data/demo/model'
import {reviewForecast} from '../../../src/lib/review-forecast'
it('forecasts every sibling beyond the search cap and excludes suspended and archived notes',async()=>{
 const fixture=JSON.parse(fixtureText) as DemoStore,template=structuredClone(fixture.notes[0])
 const activeProject=fixture.projects[0]
 fixture.projects.push({...activeProject,id:'archived-project',slug:'archived',status:'archived' as typeof activeProject.status})
 fixture.reviews=[]
 fixture.notes=Array.from({length:137},(_,i)=>{
  const note=structuredClone(template)
  note.projectId=i===136?'archived-project':activeProject.id
  note.note={...note.note,noteId:'note-'+i,noteNo:i+1,status:i===135?'suspended':'active'}
  note.cards=[1,2].map(ord=>({...template.cards[0],id:`card-${i}-${ord}`,ord,state:{...template.cards[0].state,state:2,due:'@due:1'}}))
  return note
 })
 const api=new DemoAdapter({fixture,now:()=>Date.parse('2026-10-30T12:00:00Z'),timeZone:'UTC'})
 expect(await api.searchCards('')).toHaveLength(100)
 expect((await api.getReviewForecast())[1]).toEqual({day:'2026-10-31',due:270})
})

it('counts 30,000 repeated due dates without 30,000 civil-time formatter calls',()=>{
 const now=Date.parse('2026-10-31T12:00:00Z');
 const cards=Array.from({length:30_000},()=>({state:2,due:'2026-10-31T12:00:00Z'}));
 const formatter=vi.spyOn(Intl.DateTimeFormat.prototype,'formatToParts');
 try{
  const forecast=reviewForecast(cards,{timeZone:'UTC',rolloverHour:4},now);
  expect(forecast[0].due).toBe(30_000);
  expect(formatter.mock.calls.length).toBeLessThan(20);
 }finally{formatter.mockRestore()}
});

// FIX #507: the 30k-card Today forecast must be able to stream states
// instead of allocating another complete card-state array before first paint.
it('forecasts from a one-pass iterable without requiring a materialized array',()=>{
 const now=Date.parse('2026-10-31T12:00:00Z');
 function* cards(){
  yield {state:2,due:'2026-10-31T12:00:00Z'};
  yield {state:2,due:'2026-10-31T12:00:00Z'};
  yield {state:0,due:'2026-10-31T12:00:00Z'};
 }
 expect(reviewForecast(cards(),{timeZone:'UTC',rolloverHour:4},now)[0].due).toBe(2);
});


it('reuses the Home due scan for forecast and refreshes day buckets at rollover',async()=>{
 const fixture=JSON.parse(fixtureText) as DemoStore
 fixture.reviews=[]
 const template=structuredClone(fixture.notes[0])
 fixture.notes=[1,4].map((days,i)=>({
  ...structuredClone(template),
  projectId:fixture.projects[0].id,
  note:{...template.note,noteId:'forecast-'+i,noteNo:i+1,status:'active' as const},
  cards:[{...template.cards[0],id:'forecast-card-'+i,state:{
   ...template.cards[0].state,state:2 as const,due:'@due:'+days,
  }}],
 }))
 const now={value:Date.parse('2026-10-31T12:00:00Z')}
 const api=new DemoAdapter({fixture,now:()=>now.value,timeZone:'UTC'})
 await api.getHome() // already computed all due/card counts for Today
 const store=(api as unknown as {store:DemoStore}).store
 let redundantScans=0
 store.notes=new Proxy(store.notes,{
  get(target,key,receiver){
   if(key===Symbol.iterator)redundantScans++
   return Reflect.get(target,key,receiver)
  },
 })
 const expected=()=>reviewForecast(store.notes.flatMap(note=>note.cards.map(c=>c.state)),store.settings,now.value)
 expect(await api.getReviewForecast()).toEqual(expected())
 expect(redundantScans).toBe(0) // must reuse Home's pass, not re-walk every card
 now.value+=86_400_000
 expect(await api.getReviewForecast()).toEqual(expected()) // day boundary invalidates cache
 expect((await api.getReviewForecast())[0].due).toBe(1)
})
