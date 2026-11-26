import {Link} from 'react-router'
import type {SittingRecord} from '../../data/exam/contract'
import {tutorHref} from '../tutor/tutorHref'

export function ReturnCard({sitting,slug,projectTitle,next,whatChanged,ideaCount,deferredCount}:{
 sitting:SittingRecord;slug:string;projectTitle:string;next?:{code?:string;step?:number;label:string};whatChanged?:string;ideaCount:number;deferredCount?:number;
}){
 const bookmark=sitting.bookmark
 const sameCheckpoint=!next?.code||bookmark?.checkpoint===next.code&&(!next.step||!bookmark.step||next.step===bookmark.step)
 const code=next?.code??bookmark?.checkpoint
 const question=sameCheckpoint?bookmark?.question:null
 const href=tutorHref(slug,code)+(question?'?'+new URLSearchParams({question}).toString():'')
 const path='/p/'+encodeURIComponent(slug)
 const deferred=deferredCount??Object.values(sitting.ledger??{}).filter(entry=>entry?.disposition==='defer').length
 return <section className="v7-exam-panel" aria-label="Return to study">
  <h2 className="v7-subhead">Back to {projectTitle}</h2>
  {bookmark?.checkpoint&&<p>You were at {bookmark.checkpoint}{bookmark.step?' step '+bookmark.step:''}{bookmark.question?' · '+bookmark.question:''}</p>}
  {next&&<p><strong>Study next</strong> · {next.label}</p>}
  <p>{whatChanged??'Exam prep evidence is in your history.'}</p>
  <div className="v7-exam-actions">
   <Link className="v7-button v7-secondary" to={href}><span>Continue studying</span></Link>
   {deferred>0&&<Link className="v7-button v7-secondary" to={path+'?tab=exam&examSitting='+encodeURIComponent(sitting.id)}><span>Deferred topics ({deferred})</span></Link>}
   {ideaCount>0&&<Link className="v7-button v7-secondary" to={path+'?tab=cards&cards=ideas'}><span>Card ideas ({ideaCount})</span></Link>}
  </div>
 </section>
}
