import type {BlueprintRow} from '../../data/exam/contract'
import {tutorHref} from '../tutor/tutorHref'
import {reviewHref} from '../../data/review-target'
import type {ProjectDetail} from '../../data/types'

export function examTutorHref(project:ProjectDetail,sittingId:string,action:'next'|'draft',row?:BlueprintRow){
 const context='Help me prepare for the exam on '+project.project.title+
  '. Read the exam ledger for sitting '+sittingId+' in Lemma first. '
 const question=action==='draft'
  ? context+'Draft a scored-task blueprint from my selected exam sources. Label any provisional weights and ask me to confirm the blueprint.'
  : context+(row?'Start the recommended action for '+row.title+'.':'Start the recommended next action.')
 const params=new URLSearchParams({question,exam:sittingId})
 return tutorHref(project.project.slug)+'?'+params.toString()
}

export function topicReviewHref(row:BlueprintRow|undefined,projectId:string,checkpoints:{code:string;id:string}[]){
 const checkpoint=checkpoints.find(cp=>row?.checkpoints?.includes(cp.code))
 if(checkpoint)return reviewHref({kind:'checkpoint',id:checkpoint.id})
 if(row?.concepts?.[0])return '/review/run?concept='+encodeURIComponent(row.concepts[0])
 return reviewHref({kind:'path',id:projectId})
}

export const marks=(value:number)=>new Intl.NumberFormat(undefined,{maximumFractionDigits:1}).format(value)
export const titleCase=(value:string)=>value.charAt(0).toUpperCase()+value.slice(1).replaceAll('_',' ')
export function remainingTime(startsAt:string|null,now=Date.now()){
 if(!startsAt)return null
 const hours=Math.max(0,Math.floor((Date.parse(startsAt)-now)/3600000))
 if(!hours)return Date.parse(startsAt)>now?'Less than an hour to exam':'Exam time passed'
 const days=Math.floor(hours/24)
 return [days?days+' d':null,hours%24?hours%24+' h':null].filter(Boolean).join(' ')+' to exam'
}
