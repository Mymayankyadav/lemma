import type {BlueprintRow, ConceptEvidence, ExamAttempt as PlannerAttempt, ExamSitting} from '../../../supabase/functions/_shared/exam/plan'

export type {BlueprintRow, ConceptEvidence, ExamSitting}
export type ExamAttempt=PlannerAttempt&{id?:string;delivery_ref?:string|null;learner_confirmed?:boolean}
export type CardMode = 'later' | 'now' | 'quiet'
export const cardModes: {value: CardMode; label: string}[] = [
 {value:'later',label:'After the exam'},
 {value:'now',label:'Draft now'},
 {value:'quiet',label:'Quiet capture'},
]
export function cardMode(value: unknown): CardMode {
 return value === 'now' || value === 'quiet' ? value : 'later'
}

export type SittingRecord = ExamSitting & {
 id:string
 project_id:string
 title:string
 status:'planned'|'active'|'paused'|'finished'|'cancelled'
 phase:'map'|'screen'|'teach'|'verify'
 time_zone:string
 starts_at:string|null
 version:number
 card_mode:CardMode
 activated_at?:string|null
 paused_at?:string|null
}
export interface CardIdea {
 id:string
 project_id:string
 sitting_id:string|null
 target:string
 reason:string|null
 status:'saved'|'drafted'|'linked'|'dismissed'
 sightings:number
 version:number
 concept?:string|null
 front?:string|null
 back?:string|null
 level?:string|null
 created_at?:string
 proposal_id?:string|null
 note_id?:string|null
 proposal_status?:string|null
 note_no?:number|null
 evidence?:{turn?:string;attempt?:string;note?:string}[]
}
export interface ExamHomeSitting extends SittingRecord {
 slug:string
 coverage?:{accounted:number;secure:number;deferred:number}
 ideaCount?:number
 deferredCount?:number
 coursePastDeadline?:boolean
 whatChanged?:string
 nextStudy?:{code?:string;step?:number;label:string}
 topRows?:{row:BlueprintRow;exposure:number}[]
}
export interface ExamSnapshot {
 sittings:SittingRecord[]
 pendingSetup?:boolean
 pendingCalendar?:string
}
export interface ExamEvidence {
 attempts:ExamAttempt[]
 evidence:ConceptEvidence[]
}
export interface ExamSetup {
 project_id:string
 title:string
 starts_at:string
 time_zone:string
 duration_minutes:number
 study_minutes:number
 total_marks:number
 pass_marks?:number
 objective:'expected_marks'|'pass_threshold'
 last_study_at?:string
 format?:string
 sources:{source:string; note?:string}[]
 blueprint:BlueprintRow[]
 card_mode:CardMode
 activate:boolean
}
export type Disposition = 'probe'|'teach'|'practice'|'skip'|'defer'|'pin'|'none'
export type SittingChange =
 | {operation:'activate'|'pause'|'cancel'; patch?:Record<string,never>}
 | {operation:'finish';patch:{happened:boolean}}
 | {operation:'reopen'|'update';patch:{starts_at?:string;time_zone?:string;blueprint?:BlueprintRow[];study_minutes?:number}}
 | {operation:'set_disposition';patch:{rows:{key:string;disposition:Disposition;reason?:string;reopen?:string}[]}}

export type ExamResource = 'exam_sittings'|'exam_attempts'|'card_ideas'
export interface ExamCommand {
 resource:ExamResource
 operation:string
 target?:{id:string}
 expectedVersion?:number
 patch?:object
}
export interface CommandReceipt {
 status:'ok'|'conflict'|'duplicate'
 operationId:string
 actionNo?:number|null
 id?:string
 version?:number
 changed?:{id:string;version:number}[]
 conflict?:{reason?:string;currentVersion?:number}
}

export interface ExamApi {
 mode:'demo'|'live'
 read(projectId:string, slug:string):Promise<ExamSnapshot>
 readEvidence(sitting:SittingRecord,asOf?:string):Promise<ExamEvidence>
 readIdeas(projectId:string):Promise<CardIdea[]>
 setup(input:ExamSetup):Promise<string>
 resumeSetup(projectId:string):Promise<string>
 resumeCalendar(projectId:string,sittingId:string):Promise<void>
 change(sitting:SittingRecord,change:SittingChange):Promise<void>
 command(command:ExamCommand):Promise<CommandReceipt>
 undo(actionNo:number):Promise<void>
}

export function selectSitting(snapshot:ExamSnapshot|undefined,preferredId?:string|null):SittingRecord|undefined {
 const rows=snapshot?.sittings
 const explicit=preferredId?rows?.find(row=>row.id===preferredId):undefined
 if(explicit)return explicit
 const statusOrder={active:0,paused:1,planned:2,finished:3,cancelled:4}
 return rows?.filter(row=>row.status!=='cancelled').slice().sort((a,b)=>
  statusOrder[a.status]-statusOrder[b.status]||
  (a.status==='finished'?(b.finished_at??'').localeCompare(a.finished_at??''):
   (a.starts_at??'~').localeCompare(b.starts_at??'~'))||
  a.id.localeCompare(b.id),
 )[0]
}
