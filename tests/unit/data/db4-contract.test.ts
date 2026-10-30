import {describe,expect,it} from 'vitest'
import {DemoAdapter} from '../../../src/data/demo/adapter'
import {LiveAdapter} from '../../../src/data/live/adapter'
import type {LemmaApi} from '../../../src/data/api'

describe('DB-4 additive contract compatibility',()=>{
 it('exercises implemented demo v3 operations without touching live data',async()=>{
  const demo:LemmaApi=new DemoAdapter()
  const subjects=await demo.listSubjects()
  const draft=await demo.createProjectDraft({title:'New study'})
  expect(draft).toMatchObject({slug:'new-study',goal:'',subjectId:''})
  expect((await demo.getProject(draft.slug)).subject.name).toBe('Unassigned')
  const source=(await demo.getProject('real-analysis')).sources[0]
  expect(await demo.updateSource(source.id,{kind:'notes'})).toMatchObject({id:source.id,kind:'notes'})
  const updated=await demo.updateSubject(subjects[0].id,{glyph:'R'})
  expect(updated.glyph).toBe('R')
  const extra=await demo.createSubject({name:'Extra subject',glyph:'E',hue:'violet'})
  await demo.mergeSubjects(extra.id,subjects[0].id)
  expect((await demo.listSubjects()).some(s=>s.id===extra.id)).toBe(false)
  expect(await demo.listPlanRevisions('real-analysis')).toEqual([
   expect.objectContaining({revision:1,summary:'Initial study plan'}),
  ])
 })
 it('never executes live source writes without configured owner access',async()=>{
  const live:LemmaApi=new LiveAdapter()
  for(const operation of [
   ()=>live.createProjectDraft({title:'New study'}),
   ()=>live.updateSource('source-1',{kind:'notes'}),
   ()=>live.listPlanRevisions('algebra'),
  ])await expect(operation()).rejects.toMatchObject({code:'server'})
 })
})
