import {Link} from 'react-router'
import type {ExamHomeSitting} from '../../data/exam/contract'
import {marks,remainingTime} from './model'
import {tutorHref} from '../tutor/tutorHref'

export function CountdownCard({sitting,now,online}:{sitting:ExamHomeSitting;now:number;online:boolean}){
 const path='/p/'+encodeURIComponent(sitting.slug)
 const date=sitting.starts_at?new Intl.DateTimeFormat(undefined,{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:sitting.time_zone}).format(new Date(sitting.starts_at)):null
 return <section className="v7-exam-panel" aria-label="Upcoming exam">
  <h2 className="v7-subhead">{sitting.title}</h2>
  {date&&<p>{date} · {remainingTime(sitting.starts_at,now)}</p>}
  {sitting.coverage&&<p>{marks(sitting.coverage.secure)}{sitting.total_marks?'/'+marks(sitting.total_marks):''} marks independently covered</p>}
  <div className="v7-exam-actions">
   {online&&<Link className="v7-button v7-primary" to={tutorHref(sitting.slug)+'?'+new URLSearchParams({exam:sitting.id,question:'Use the exam planner for sitting '+sitting.id+' and help me with its next task.'})}><span>Prep now</span></Link>}
   <Link className="v7-button v7-secondary" to={path+'?tab=exam&examSitting='+encodeURIComponent(sitting.id)}><span>Ledger</span></Link>
  </div>
 </section>
}
