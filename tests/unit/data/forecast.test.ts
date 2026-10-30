// @vitest-environment node
import {describe,expect,it,vi} from 'vitest'
vi.mock('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url',()=>({default:'unused-worker'}))
import {DemoAdapter} from '../../../src/data/demo/adapter'
import fixtureText from '../../../src/data/demo/fixture.json?raw'
import type {DemoStore} from '../../../src/data/demo/model'
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
