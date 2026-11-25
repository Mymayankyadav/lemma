import {expect,it} from 'vitest'
import {improvedExamRows,recentExamReturn} from '../../../supabase/functions/_shared/exam/return'
import {timedAnswer} from '../../../src/features/exam/timedAnswer'
import {sortExamIdeas} from '../../../src/features/exam/IdeasList'
import type {CardIdea,SittingRecord} from '../../../src/data/exam/contract'

it('uses independent evidence after activation when reporting a course improvement',()=>{
 const sitting:SittingRecord={
  id:'e',project_id:'p',title:'Exam',status:'finished',phase:'verify',card_mode:'later',time_zone:'UTC',
  starts_at:'2026-11-25T09:00:00Z',study_minutes:60,version:1,blueprint_version:1,ledger:{},
  finished_at:'2026-11-25T12:00:00Z',blueprint:[{key:'proof',title:'Prove it',marks:10,checkpoints:['CP2']}],
 }
 const independent={row_key:'proof',occurred_at:'2026-11-25T08:00:00Z',outcome:'correct',independence:'independent',hint_level:0,novelty:'novel'}
 const now='2026-11-26T08:00:00Z'
 expect(improvedExamRows({sitting,now,attempts:[independent],evidence:[]},'2026-11-24T12:00:00Z').map(item=>item.row.key)).toEqual(['proof'])
 expect(improvedExamRows({sitting,now,attempts:[{...independent,outcome:'exposure',independence:'reading'}],evidence:[]},'2026-11-24T12:00:00Z')).toEqual([])
 expect(recentExamReturn(sitting,Date.parse(now))).toBe(true)
 expect(recentExamReturn(sitting,Date.parse('2026-12-10T08:00:00Z'))).toBe(false)
})

it('sorts ideas by relevance, sightings and age without bringing back dismissals',()=>{
 const base:CardIdea={id:'base',project_id:'p',sitting_id:'e',target:'Retrieve something',reason:null,status:'saved',version:1,sightings:1}
 const ideas=[
  {...base,id:'d',status:'dismissed' as const,sightings:99,concept:'linear'},
  {...base,id:'x',sightings:12,concept:'topology'},
  {...base,id:'new',concept:'linear',created_at:'2026-11-25'},
  {...base,id:'repeat',concept:'linear',sightings:2},
  {...base,id:'old',concept:'linear',created_at:'2026-11-24'},
 ]
 expect(sortExamIdeas(ideas,['linear']).map(idea=>idea.id)).toEqual(['repeat','old','new','x'])
})

it('reports elapsed active seconds and overtime as metadata independently of an outcome',()=>{
 expect(timedAnswer(50150,60)).toEqual({seconds:50,overtime:false})
 expect(timedAnswer(60150,60)).toEqual({seconds:60,overtime:true})
 expect(timedAnswer(90000000,60)).toEqual({seconds:36000,overtime:true})
})

it('offers a continuation only once the course horizon has actually passed',async()=>{
 const {coursePastDeadline}=await import('../../../src/features/exam/CourseContinuation')
 const project={id:'p',slug:'proofs',title:'Proofs',goal:'',style:'socratic',status:'active' as const,subjectId:'s',createdAt:'2026-10-01'}
 const now=Date.parse('2026-11-25T12:00:00Z')
 expect(coursePastDeadline(project,'UTC',4,now)).toBe(false)
 expect(coursePastDeadline({...project,targetDate:'2026-11-23'},'UTC',4,now)).toBe(true)
 expect(coursePastDeadline({...project,targetDate:'2026-11-23',lastStudyOn:'2026-11-25'},'UTC',4,now)).toBe(false)
})
