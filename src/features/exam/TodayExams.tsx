import {Link} from 'react-router'
import type {HomeSummary} from '../../data/types'
import {useRefreshExam,getExamApi} from '../../data/exam/queries'
import {authOwner} from '../../data/authBoundary'
import {getMode} from '../../data/mode'
import {useOnline} from '../../ui/v7/savedCopy'
import {recentExamReturn} from '../../../supabase/functions/_shared/exam/return'
import {CountdownCard} from './CountdownCard'
import {PassedExamBanner} from './PassedExamBanner'
import {ReturnCard} from './ReturnCard'
import './exam.css'

export function TodayExams({home,now}:{home:HomeSummary;now:number}){
 const online=useOnline(),refresh=useRefreshExam()
 const owner=getMode()==='demo'?'demo':authOwner()??''
 return <>{home.exam?.sittings.map(sitting=>{
  const project=home.projects.find(item=>item.id===sitting.project_id)
  const starts=sitting.starts_at?Date.parse(sitting.starts_at):NaN
  const pathNext=home.resume?.projectSlug===sitting.slug?home.resume:undefined
  const next=sitting.nextStudy??(pathNext?.checkpointCode?{
   code:pathNext.checkpointCode,label:pathNext.checkpointCode+' · '+(pathNext.checkpointTitle??'Continue the course'),
  }:undefined)
  return <div className="v7-exam-ledger" key={sitting.id}>
   {Number.isFinite(starts)&&starts>now&&starts-now<=7*86400000&&sitting.status!=='finished'&&<CountdownCard sitting={sitting} now={now} online={online}/>}
   <PassedExamBanner key={sitting.starts_at} sitting={sitting} owner={owner} now={now} disabled={!online} onChange={async change=>{
    try{await getExamApi().change(sitting,change)}finally{await refresh()}
   }}/>
   {recentExamReturn(sitting,now)&&<ReturnCard sitting={sitting} slug={sitting.slug} projectTitle={project?.title??sitting.title}
    next={next} whatChanged={sitting.whatChanged} ideaCount={sitting.ideaCount??0} deferredCount={sitting.deferredCount}/>}
   {sitting.status==='finished'&&sitting.coursePastDeadline&&<div className="v7-exam-actions">
    <Link className="v7-button v7-secondary" to={'/p/'+encodeURIComponent(sitting.slug)+'?examSitting='+encodeURIComponent(sitting.id)}>
     <span>Choose the course’s next date</span>
    </Link>
   </div>}
  </div>
 })}</>
}
