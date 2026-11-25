import type {ProjectSummary} from '../types'
import type {ExamHomeSitting} from './contract'
import {getExamApi} from './queries'
import {planExam} from '../../../supabase/functions/_shared/exam/plan'
import {modeOf,projectTime,studyDay} from '../../../supabase/functions/_shared/adaptive/time'
import {improvedExamRows,recentExamReturn} from '../../../supabase/functions/_shared/exam/return'

export async function demoExamHome(projects:ProjectSummary[]):Promise<{sittings:ExamHomeSitting[]}>{
 const now=Date.now(),api=getExamApi()
 const rows=await Promise.all(projects.map(async project=>{
  const snapshot=await api.read(project.id,project.slug)
  const visible=snapshot.sittings.filter(sitting=>
   ['planned','active','paused'].includes(sitting.status)&&sitting.starts_at&&Date.parse(sitting.starts_at)<=now+7*86400000||
   recentExamReturn(sitting,now))
  if(!visible.length)return []
  const ideas=await api.readIdeas(project.id)
  return Promise.all(visible.map(async sitting=>{
   const input={sitting,...await api.readEvidence(sitting),now:new Date(now).toISOString()}
   const plan=planExam(input)
   const change=improvedExamRows(input,sitting.activated_at)[0]
   return {
    ...sitting,slug:project.slug,coverage:plan.coverage,
    coursePastDeadline:sitting.status==='finished'&&modeOf(studyDay({time_zone:sitting.time_zone},now),
     projectTime({last_study_on:project.lastStudyOn,deadline_at:project.deadlineAt,target_date:project.targetDate},sitting.time_zone))==='post_deadline',ideaCount:ideas.filter(idea=>idea.status==='saved'||idea.status==='drafted').length,
    topRows:plan.rows.slice().sort((a,b)=>b.exposure-a.exposure).slice(0,5).map(({row,exposure})=>({row,exposure})),
    ...(change?{whatChanged:'Exam prep improved your latest evidence on '+change.row.title+'.'}:{}),
   }
  }))
 }))
 return {sittings:rows.flat().slice(0,8)}
}
