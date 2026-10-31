import {describe,expect,it} from 'vitest'
import {ownerProjects,resumableProjects,summaryMetadata} from '../../../src/data/live/project-summary'
import type {Subject} from '../../../src/data/types'

const algebra:Subject={id:'algebra',name:'Algebra',glyph:'A',hue:'amber',position:1}
describe('v3 project summary and resume safety',()=>{
 it('exposes persisted pins, target dates and the existing subject',()=>{
  const value=summaryMetadata({subject_id:'algebra',pinned:true,system:false,target_date:'2026-11-12',target_label:'Qualifying exam'},new Map([['algebra',algebra]]))
  expect(value).toMatchObject({subject:algebra,pinned:true,system:false,targetDate:'2026-11-12',targetLabel:'Qualifying exam'})
 })
 it('keeps subjectless name-only drafts visible without inventing a real subject',()=>{
  const value=summaryMetadata({subject_id:null,pinned:null,system:false},new Map())
  expect(value.subject.name).toBe('Unassigned')
  expect(value.subject.glyph).toBe('∫')
  expect(value.pinned).toBe(false)
  expect(value.targetDate).toBeNull()
 })
 it('hides system projects but preserves archived projects for library discovery',()=>{
  const projects=[
   {id:'a',status:'active',system:false},
   {id:'b',status:'archived',system:false},
   {id:'c',status:'active',system:true},
  ]
  expect(ownerProjects(projects).map(p=>p.id)).toEqual(['a','b'])
  expect(resumableProjects(projects).map(p=>p.id)).toEqual(['a'])
 })
 it('does not resume an archived project even when it is the newest',()=>{
  const projects=[{id:'old',status:'archived'},{id:'next',status:'paused'}]
  expect(resumableProjects(projects)[0].id).toBe('next')
 })
})
