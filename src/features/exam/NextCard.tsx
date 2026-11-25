import {Link} from 'react-router'
import type {ExamAction,ExamPlan} from '../../../supabase/functions/_shared/exam/plan'
import type {ProjectDetail} from '../../data/types'
import {examTutorHref,titleCase,topicReviewHref} from './model'

const actionLabels:Partial<Record<ExamAction['kind'],string>>={
 map:'Build the blueprint',rest:'Recap or rest',confirm:'Confirm the exam',resume:'Resume the course',
}
export function actionTitle(action:ExamAction,plan:ExamPlan){
 const topics=action.keys.flatMap(key=>{
  const title=plan.rows.find(item=>item.row.key===key)?.row.title
  return title?[title]:[]
 })
 return (actionLabels[action.kind]??titleCase(action.kind))+(topics.length?' · '+topics.join(' / '):'')+
  (action.minutes?' ('+action.minutes+' min)':'')
}
export function NextCard({plan,project,sittingId,disabled}:{
 plan:ExamPlan;project:ProjectDetail;sittingId:string;disabled:boolean
}){
 const row=plan.rows.find(item=>item.row.key===plan.next.keys[0])?.row
 const reason=plan.next.why.replace(/\b(teach|practise|work on) ([a-z0-9_-]+)\./g,(phrase,verb:string,key:string)=>{
  const title=plan.rows.find(item=>item.row.key===key)?.row.title
  return title?verb+' “'+title+'”.':phrase
 })
 return <section className="v7-exam-panel" aria-label="Next exam action">
  <h2 className="v7-eyebrow">Next</h2>
  <p className="v7-subhead">{actionTitle(plan.next,plan)}</p>
  <p>{reason}</p>
  {plan.runnerUp&&<p><strong>Runner-up</strong> · {actionTitle(plan.runnerUp,plan)}</p>}
  {!disabled&&plan.next.kind!=='confirm'&&plan.next.kind!=='resume'&&<div className="v7-exam-actions">
   <Link className="v7-button v7-primary" to={examTutorHref(project,sittingId,plan.next.kind==='map'?'draft':'next',row)}><span>Start in tutor</span></Link>
   {row&&<Link className="v7-button v7-secondary" to={topicReviewHref(row,project.project.id,project.checkpoints)}><span>Review this topic</span></Link>}
  </div>}
 </section>
}
