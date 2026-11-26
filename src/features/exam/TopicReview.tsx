import {Link} from 'react-router'
import type {BlueprintRow} from '../../data/exam/contract'
import {tutorHref} from '../tutor/tutorHref'

export function topicRequest(row:BlueprintRow,recap:boolean){
 return 'Review row '+row.key+': '+(recap?'read a recap. Give a concise explanation and example, record reading exposure, then offer a fresh item.':'try from memory. Ask one short gradable question and wait for my answer.')
}
/** `quiet` (N251): secondary buttons only, for lists such as Practice that keep one primary per view (PR2). */
export function TopicReview({slug,sittingId,row,exposure,onRequest,quiet=false}:{slug:string;sittingId:string;row:BlueprintRow;exposure?:number;onRequest?:(text:string)=>void;quiet?:boolean}){
 const first='v7-button '+(quiet?'v7-secondary v7-small':'v7-primary'),second='v7-button v7-secondary'+(quiet?' v7-small':'')
 const href=(recap:boolean)=>tutorHref(slug)+'?'+new URLSearchParams({exam:sittingId,question:topicRequest(row,recap)})
 return <section className="v7-exam-panel" aria-label={'Review '+row.title}>
  <h3 className="v7-subhead">{row.title}</h3>
  <p>About 2 min{row.level?' · '+row.level:''}{exposure!==undefined?' · '+Math.round(exposure*10)/10+' marks exposed':''}</p>
  <div className="v7-exam-actions">
   {onRequest?<><button type="button" className={first} onClick={()=>onRequest(topicRequest(row,false))}>Try from memory</button>
    <button type="button" className={second} onClick={()=>onRequest(topicRequest(row,true))}>Read a recap</button></>
    :<><Link className={first} to={href(false)}>Try from memory</Link><Link className={second} to={href(true)}>Read a recap</Link></>}
  </div>
 </section>
}
