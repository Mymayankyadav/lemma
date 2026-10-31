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
