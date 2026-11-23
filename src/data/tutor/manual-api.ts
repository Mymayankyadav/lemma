import type {TutorComposerDraft,TutorContextSelection,TutorTurn} from './turn-model'
import type {QuestionnaireAnswers,TutorQuestionnaire} from '../../../supabase/functions/_shared/tutor-questionnaire'

type PendingTurn=Extract<TutorTurn,{status:'awaiting-tutor'}>
type CompletedTurn=Extract<TutorTurn,{status:'completed'}>
type SavedReply=Omit<CompletedTurn['finalReply'],'suggestions'> & {nextQuestion?:string;suggestions:readonly {
  intentId:string;summary:string;status:string;proposalId?:string;kind?:string
}[]}

export type SavedTutorTurn=
 | (PendingTurn & {claimExpiresAt?:string})
 | (Omit<PendingTurn,'status'> & {status:'cancelled'})
 | (Omit<CompletedTurn,'finalReply'> & {finalReply:SavedReply})

export type ConnectorDelivery={turnId:string;grantId:string;expiresAt:string;reference:string}

export type ConnectorSubmission=
 | {kind:'submitted';turnId:string;delivery?:ConnectorDelivery}
 | {kind:'turn-pending'}

export type TutorThreadView={
 head:{threadId:string|null;lastSequence:number;pendingTurnId:string|null}
 turns:readonly SavedTutorTurn[]
 recoveredDrafts:readonly {turnId:string;messageId:string;body:string;draftId?:string}[]
 offline?:boolean
 listenerSeenAt?:string | null
 confirmedAt?:string
 readAt?:string
 before?:number|null
 canSubmit?:boolean
 canConnect?:boolean
 connectorDelivery?:ConnectorDelivery
 reconciled?:readonly {operation:string;status:string;text:string;turnId?:string;localExcerpt?:string;source?:TutorContextSelection}[]
 outbox?:readonly {operationId:string;operation:string;text:string;turnId?:string;localExcerpt?:string;source?:TutorContextSelection}[]
}
export type ManualTutor={
 close:()=>void
 resume:(before?:number,reconcile?:boolean,connectorUrl?:string)=>Promise<TutorThreadView>
 submit:(id:string,draft:TutorComposerDraft,sequence:number)=>Promise<{kind:string}>
 submitToConnector?:(id:string,draft:TutorComposerDraft,sequence:number,connectorUrl:string)=>Promise<ConnectorSubmission>
 connectTurn?:(turnId:string,version:number,connectorUrl:string)=>Promise<ConnectorDelivery>
 confirmImport:(turnId:string,version:number,messageId:string,body:string)=>Promise<{kind:string}>
 previewSource?:(page:number)=>Promise<TutorContextSelection>
 retry?:(operationId:string)=>Promise<string>
 issueGrant?:(turnId:string,version:number)=>Promise<{token:string;endpoint:string;grantId:string}>
 revokeGrant?:(turnId:string,version:number,grantId:string)=>Promise<void>
 stopGrants?:(turnId:string,version:number)=>Promise<void>
 cancel?:(turnId:string,version:number)=>Promise<void>
 proposeCard?:(turnId:string,version:number,front:string,back:string)=>Promise<void>
 /** N228: the tutor's quick questionnaires on this thread, and the learner's answers to them. */
 questionnaires?:TutorQuestionnaireApi
 /** N228: more messages on the turn that is waiting for the tutor. */
 followups?:TutorFollowUpApi
}
export type TutorFollowUp={id:string;turnId:string;body:string;createdAt:string;seen:boolean}
export type TutorFollowUpApi={
 list:()=>Promise<readonly TutorFollowUp[]>
 /** messageId is the message's own id: a retry is the same message. */
 add:(turnId:string,messageId:string,body:string)=>Promise<TutorFollowUp>
}
export type QuestionnaireSave={status:'saved'|'submitted'|'conflict';questionnaire:TutorQuestionnaire}
export type TutorQuestionnaireApi={
 list:()=>Promise<readonly TutorQuestionnaire[]>
 /** answers null only marks it opened. expectedVersion is the version the answers were based on (0 before any save). */
 save:(id:string,expectedVersion:number,answers:QuestionnaireAnswers|null,submit:boolean)=>Promise<QuestionnaireSave>
}
