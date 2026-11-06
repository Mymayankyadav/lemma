import {ThoughtError,type NewThought,type ParkedThought,type ThoughtPatch} from './contract';
const invalid=(message:string):never=>{throw new ThoughtError('invalid',message)};
export function validateNewThought(input:NewThought):NewThought {
 if(!input||typeof input!=='object'||typeof input.text!=='string'||!input.text.trim()||
  input.text.trim().length>4000)invalid('Parked thought must contain 1–4000 characters');
 if(input.studyEntryId!==undefined&&input.studyEntryId!==null&&
  (typeof input.studyEntryId!=='string'||!input.studyEntryId.trim()))
  invalid('Invalid study entry ID');
 if(Object.keys(input).some(key=>!['text','studyEntryId'].includes(key)))invalid('Unexpected parked thought field');
 return{text:input.text.trim(),...(input.studyEntryId!==undefined?{studyEntryId:input.studyEntryId}:{})};
}
export function validateThoughtPatch(patch:ThoughtPatch):ThoughtPatch {
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||
  Object.keys(patch).some(key=>!['text','studyEntryId'].includes(key)))invalid('Unexpected thought patch field');
 if(patch.text!==undefined&&(typeof patch.text!=='string'||!patch.text.trim()||patch.text.trim().length>4000))
  invalid('Invalid parked thought text');
 if(patch.studyEntryId!==undefined&&patch.studyEntryId!==null&&
  (typeof patch.studyEntryId!=='string'||!patch.studyEntryId.trim()))
  invalid('Invalid study entry ID');
 return{...patch,...(patch.text!==undefined?{text:patch.text.trim()}:{})};
}
/** Only real resolved destinations may mark a thought converted. */
export function thoughtTransition(
 thought:Pick<ParkedThought,'status'|'destinationKind'|'destinationId'|'resolvedAt'>,
 action:'dismiss'|'reopen'|'convert',resolvedAt:string|null=null,taskId:string|null=null
):Pick<ParkedThought,'status'|'destinationKind'|'destinationId'|'resolvedAt'>{
 if(action==='reopen'){
  if(thought.status!=='dismissed')invalid('Only dismissed thoughts can reopen');
  return{status:'open',destinationKind:null,destinationId:null,resolvedAt:null};
 }
 if(thought.status!=='open')invalid('Only open thoughts may be resolved');
 if(!resolvedAt||!Number.isFinite(Date.parse(resolvedAt)))invalid('Resolution requires an actual instant');
 if(action==='dismiss')return{status:'dismissed',destinationKind:null,destinationId:null,
  resolvedAt:new Date(resolvedAt).toISOString()};
 if(!taskId||!taskId.trim())invalid('Conversion requires a newly created task ID');
 return{status:'converted',destinationKind:'task',destinationId:taskId,
  resolvedAt:new Date(resolvedAt).toISOString()};
}
