import type {TutorComposerDraft,TutorContextSelection,TutorTurn} from './turn-model'

type PendingTurn=Extract<TutorTurn,{status:'awaiting-tutor'}>
type CompletedTurn=Extract<TutorTurn,{status:'completed'}>
type SavedReply=Omit<CompletedTurn['finalReply'],'suggestions'> & {suggestions:readonly {
  intentId:string;summary:string;status:string;proposalId?:string;kind?:string
}[]}

export type SavedTutorTurn=
 | (PendingTurn & {claimExpiresAt?:string})
 | (Omit<PendingTurn,'status'> & {status:'cancelled'})
 | (Omit<CompletedTurn,'finalReply'> & {finalReply:SavedReply})

export type TutorThreadView={
 head:{threadId:string|null;lastSequence:number;pendingTurnId:string|null}
 turns:readonly SavedTutorTurn[]
 recoveredDrafts:readonly {turnId:string;messageId:string;body:string;draftId?:string}[]
 offline?:boolean
 confirmedAt?:string
 readAt?:string
 before?:number|null
 canSubmit?:boolean
 canConnect?:boolean
 reconciled?:readonly {operation:string;status:string;text:string;turnId?:string;localExcerpt?:string;source?:TutorContextSelection}[]
 outbox?:readonly {operationId:string;operation:string;text:string;turnId?:string;localExcerpt?:string;source?:TutorContextSelection}[]
}
export type ManualTutor={
 close:()=>void
 resume:(before?:number,reconcile?:boolean)=>Promise<TutorThreadView>
 submit:(id:string,draft:TutorComposerDraft,sequence:number)=>Promise<{kind:string}>
 confirmImport:(turnId:string,version:number,messageId:string,body:string)=>Promise<{kind:string}>
 previewSource?:(page:number)=>Promise<TutorContextSelection>
 retry?:(operationId:string)=>Promise<string>
 issueGrant?:(turnId:string,version:number)=>Promise<{token:string;endpoint:string;grantId:string}>
 revokeGrant?:(turnId:string,version:number,grantId:string)=>Promise<void>
 stopGrants?:(turnId:string,version:number)=>Promise<void>
 cancel?:(turnId:string,version:number)=>Promise<void>
 proposeCard?:(turnId:string,version:number,front:string,back:string)=>Promise<void>
}
