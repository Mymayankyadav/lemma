import {describe,expect,it} from 'vitest'
import {projectRow,sourceRow} from '../../../src/data/live/helpers'

describe('v3 live row mapping',()=>{
 it('keeps name-only drafts readable until the tutor fills project fields',()=>{
  const project=projectRow({id:'p1',slug:'analysis',title:'Analysis',goal:null,subject_id:null,style:'socratic',status:'planning',created_at:'2026-10-30T00:00:00Z'})
  expect(project).toMatchObject({title:'Analysis',goal:'',subjectId:'',status:'planning',system:false,pinned:false})
 })
 it('preserves source kind, fingerprint, order and plan review date',()=>{
  const source=sourceRow({id:'s1',project_id:'p1',title:'Week 7',short:'notes-w7',filename:'notes.pdf',
   page_count:3,status:'ready',has_text:true,outline:[],created_at:'2026-10-29T00:00:00Z',
   kind:'notes',sha256:'a'.repeat(64),position:2,added_at:'2026-10-30T00:00:00Z',plan_checked_at:null})
  expect(source).toMatchObject({kind:'notes',sha256:'a'.repeat(64),position:2,planCheckedAt:null,addedAt:'2026-10-30T00:00:00Z'})
 })
 it('provides safe defaults for legacy source rows without new metadata',()=>{
  const source=sourceRow({id:'s1',project_id:'p1',title:'Rudin',short:'rudin',filename:'rudin.pdf',
   page_count:2,status:'ready',has_text:true,outline:[],created_at:'2026-10-29T00:00:00Z'})
  expect(source).toMatchObject({kind:'other',sha256:null,position:0,addedAt:'2026-10-29T00:00:00Z'})
 })
})
