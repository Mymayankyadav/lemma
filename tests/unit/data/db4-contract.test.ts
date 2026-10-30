import {describe,expect,it} from 'vitest'
import {DemoAdapter} from '../../../src/data/demo/adapter'
import {LiveAdapter} from '../../../src/data/live/adapter'
import type {LemmaApi} from '../../../src/data/api'

describe('DB-4 additive contract compatibility',()=>{
 it('keeps demo stubs explicit until DEMO-2 implements the new operations',async()=>{
  const demo:LemmaApi=new DemoAdapter()
  for(const operation of [
   ()=>demo.createProjectDraft({title:'New study'}),
   ()=>demo.updateSubject('subject-1',{name:'Algebra'}),
   ()=>demo.mergeSubjects('subject-1','subject-2'),
   ()=>demo.updateSource('source-1',{kind:'notes'}),
   ()=>demo.listPlanRevisions('algebra'),
  ])await expect(operation()).rejects.toMatchObject({code:'not_implemented'})
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
