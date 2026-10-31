import {describe,expect,it} from 'vitest'
import type {CheckpointView} from '../../../src/data/types'
import {buildSchedule} from '../../../src/lib/schedule'
import {estimateFinish,groupCheckpointStages,worstStageSchedule} from '../../../src/ui/timeline/progress'

function checkpoints(count:number,stages=0):CheckpointView[]{
 return Array.from({length:count},(_,i)=>({
  id:'id-'+i,code:'CP'+(i+1),title:'Checkpoint '+(i+1),position:i+1,
  ui:i<3?'done':i===3?'now':'locked',stage:stages?'Stage '+(Math.floor(i*stages/count)+1):null,
  currentStep:0,stepsTotal:1,recheckDue:null,dueCards:0
 }))
}
describe('ST-1 stage progress at scale',()=>{
 it('groups the actual 36-checkpoint no-stage case into groups of eight',()=>{
  const stages=groupCheckpointStages(checkpoints(36))
  expect(stages.map(stage=>[stage.name,stage.checkpoints.length])).toEqual([
   ['CP1–8',8],['CP9–16',8],['CP17–24',8],['CP25–32',8],['CP33–36',4]
  ])
  expect(stages.flatMap(stage=>stage.checkpoints.map(cp=>cp.code))).toHaveLength(36)
 })
 it('preserves 100 checkpoints across 15 named stages',()=>{
  const groups=groupCheckpointStages(checkpoints(100,15))
  expect(groups).toHaveLength(15)
  expect(groups.reduce((sum,stage)=>sum+stage.checkpoints.length,0)).toBe(100)
  expect(groups[0].name).toBe('Stage 1')
  expect(groups[14].name).toBe('Stage 15')
 })
 it('falls back to neutral groups for missing stage spans in a mixed plan',()=>{
  const cps=checkpoints(24,3)
  cps.slice(8,19).forEach(cp=>{cp.stage=null})
  const stages=groupCheckpointStages(cps)
  expect(stages.some(stage=>stage.name==='CP9–16')).toBe(true)
  expect(stages.some(stage=>stage.name==='CP17–19')).toBe(true)
  expect(stages.reduce((sum,stage)=>sum+stage.checkpoints.length,0)).toBe(24)
 })
 it('reports the least favourable checkpoint schedule for a stage',()=>{
  const cps=checkpoints(8)
  cps[7].dueOn='2026-09-01'
  const rows=buildSchedule(cps,{now:new Date('2026-10-31T12:00:00Z')})
  expect(worstStageSchedule(rows)).toBe('late')
 })
})
describe('ST-1 finish estimate',()=>{
 const now=Date.parse('2026-10-31T12:00:00Z')
 it('uses January plan dates rather than 0.25 checkpoints/week',()=>{
  const result=estimateFinish({projectId:'p',done:3,total:36,targetDate:'2027-01-25',now,events:[]})
  expect(result.source).toBe('plan')
  expect(result.finish?.toISOString().slice(0,10)).toBe('2027-01-25')
  expect(result.pace).toBeGreaterThan(1)
 })
 it('uses dated checkpoints when the overall target is absent',()=>{
  const result=estimateFinish({projectId:'p',done:3,total:36,dueDates:['2027-01-04','2027-01-21'],now})
  expect(result.source).toBe('plan')
  expect(result.finish?.toISOString().slice(0,10)).toBe('2027-01-21')
 })
 it('keeps plan pace with fewer than 28 days of demonstrations',()=>{
  const result=estimateFinish({projectId:'p',done:3,total:36,targetDate:'2027-01-25',now,
   events:[{projectId:'p',checkpointCode:'CP3',kind:'demonstrated',at:'2026-10-18'}]})
  expect(result.source).toBe('plan')
 })
 it('switches to measured evidence after four weeks and never invents missing dates',()=>{
  const events=[
   {projectId:'p',checkpointCode:'CP1',kind:'demonstrated',at:'2026-09-28'},
   {projectId:'p',checkpointCode:'CP2',kind:'demonstrated',at:'2026-10-20'}]
  expect(estimateFinish({projectId:'p',done:2,total:36,targetDate:'2027-01-25',now,events}).source).toBe('measured')
  expect(estimateFinish({projectId:'p',done:2,total:36,now,events:[]}).finish).toBeNull()
 })
})
