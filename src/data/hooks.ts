import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LemmaApi } from './api'
import { getApi } from './index'
const queryDefaults = { staleTime: 30_000, refetchOnWindowFocus: true }
export function useHome(...args: Parameters<LemmaApi['getHome']>) {
 return useQuery({ ...queryDefaults, queryKey: ['home'], queryFn: () => getApi().getHome() })
}
export function useProjects(...args: Parameters<LemmaApi['listProjects']>) {
 return useQuery({ ...queryDefaults, queryKey: ['projects'], queryFn: () => getApi().listProjects() })
}
export function usePlanRevisions(...args: Parameters<LemmaApi['listPlanRevisions']>) {
 return useQuery({ ...queryDefaults, queryKey: ['plan-revisions', args[0]], queryFn: () => getApi().listPlanRevisions(args[0]) })
}
export function useProject(...args: Parameters<LemmaApi['getProject']>) {
 return useQuery({ ...queryDefaults, queryKey: ['project', args[0]], queryFn: () => getApi().getProject(args[0]) })
}
export function useCheckpoint(...args: Parameters<LemmaApi['getCheckpoint']>) {
 return useQuery({ ...queryDefaults, queryKey: ['checkpoint', args[0], args[1]], queryFn: () => getApi().getCheckpoint(args[0], args[1]) })
}
export function useSessions(...args: Parameters<LemmaApi['listSessions']>) {
 return useQuery({ ...queryDefaults, queryKey: ['sessions', args[0] ?? 'all'], queryFn: () => getApi().listSessions(args[0]) })
}
export function useSession(...args: Parameters<LemmaApi['getSession']>) {
 return useQuery({ ...queryDefaults, queryKey: ['session', args[0], args[1]], queryFn: () => getApi().getSession(args[0], args[1]) })
}
export function useProposals(...args: Parameters<LemmaApi['listProposals']>) {
 return useQuery({ ...queryDefaults, queryKey: ['proposals'], queryFn: () => getApi().listProposals() })
}
export function useProposal(...args: Parameters<LemmaApi['getProposal']>) {
 return useQuery({ ...queryDefaults, queryKey: ['proposal', args[0]], queryFn: () => getApi().getProposal(args[0]) })
}
export function useDeckTree(...args: Parameters<LemmaApi['getDeckTree']>) {
 return useQuery({ ...queryDefaults, queryKey: ['decks'], queryFn: () => getApi().getDeckTree() })
}
export function useReviewItems(...args: Parameters<LemmaApi['getReviewItems']>) {
 return useQuery({ ...queryDefaults, queryKey: ['review-items', args[0]], queryFn: () => getApi().getReviewItems(args[0]) })
}
export function useSearchCards(...args: Parameters<LemmaApi['searchCards']>) {
 return useQuery({ ...queryDefaults, queryKey: ['cards', args[0], args[1]], queryFn: () => getApi().searchCards(args[0], args[1]) })
}
export function useSearchCardsPage(...args: Parameters<LemmaApi['searchCardsPage']>) {
 return useQuery({ ...queryDefaults, queryKey: ['cards-page', args[0]], queryFn: () => getApi().searchCardsPage(args[0]) })
}
export function useCard(...args: Parameters<LemmaApi['getCard']>) {
 return useQuery({ ...queryDefaults, queryKey: ['card', args[0]], queryFn: () => getApi().getCard(args[0]) })
}
export function useCardHistoryPage(...args: Parameters<LemmaApi['getCardHistoryPage']>) {
 return useQuery({ ...queryDefaults, queryKey: ['card-history-page', args[0], args[1] ?? null], queryFn: () => getApi().getCardHistoryPage(args[0], args[1]) })
}
export function useCardCommentsPage(...args: Parameters<LemmaApi['getCardCommentsPage']>) {
 return useQuery({ ...queryDefaults, queryKey: ['card-comments-page', args[0], args[1] ?? null], queryFn: () => getApi().getCardCommentsPage(args[0], args[1]) })
}
export function useAtlas(...args: Parameters<LemmaApi['getAtlas']>) {
 return useQuery({ ...queryDefaults, queryKey: ['atlas'], queryFn: () => getApi().getAtlas() })
}
export function useInsightData(...args: Parameters<LemmaApi['getInsightData']>) {
 return useQuery({ ...queryDefaults, queryKey: ['insights', args[0]], queryFn: () => getApi().getInsightData(args[0]) })
}
export function useSettings(...args: Parameters<LemmaApi['getSettings']>) {
 return useQuery({ ...queryDefaults, queryKey: ['settings'], queryFn: () => getApi().getSettings() })
}
export function useStyles(...args: Parameters<LemmaApi['listStyles']>) {
 return useQuery({ ...queryDefaults, queryKey: ['styles'], queryFn: () => getApi().listStyles() })
}
export function useSubjects(...args: Parameters<LemmaApi['listSubjects']>) {
 return useQuery({ ...queryDefaults, queryKey: ['subjects'], queryFn: () => getApi().listSubjects() })
}
export function useAuth(...args: Parameters<LemmaApi['getAuth']>) {
 return useQuery({ ...queryDefaults, queryKey: ['auth'], queryFn: () => getApi().getAuth() })
}
export function useReviewLog(...args: Parameters<LemmaApi['getReviewLog']>) {
 return useQuery({ ...queryDefaults, queryKey: ['review-log'], queryFn: () => getApi().getReviewLog() })
}

export function usePushDevices() {
 return useQuery({ ...queryDefaults, queryKey:['push-devices'], queryFn:()=>getApi().listPushDevices() })
}
export function useRecentNotifications() {
 return useQuery({ ...queryDefaults, queryKey:['notifications-recent'], queryFn:()=>getApi().listRecentNotifications() })
}
export function useNotifyHolds() {
 return useQuery({ ...queryDefaults, queryKey:['notify-holds'], queryFn:()=>getApi().listNotifyHolds() })
}
export function useNotifyPreview() {
 return useQuery({ ...queryDefaults, queryKey:['notify-preview'], queryFn:()=>getApi().previewNotifications() })
}
/** Never invalidate review-items: the review runner owns its in-progress queue. */
function useWrite<TVariables, TResult>(write: (api: LemmaApi, variables: TVariables) => Promise<TResult>, prefixes: string[]) {
 const client = useQueryClient()
 return useMutation({
  mutationFn: (variables: TVariables) => write(getApi(), variables),
  onSuccess: async () => {
   if (prefixes.includes('*')) { client.clear(); return }
   await Promise.all(prefixes.map(prefix => client.invalidateQueries({queryKey: [prefix]})))
  },
 })
}
export function useSignIn() {
 return useWrite((api, _value: void) => api.signIn(), ['auth'])
}
export function useSignOut() {
 return useWrite((api, _value: void) => api.signOut(), ['*'])
}
export function useBootstrap() {
 return useWrite((api, _value: void) => api.bootstrap(), ['settings', 'styles', 'auth'])
}
export function useUpdateSettings() {
 return useWrite((api, value: Parameters<LemmaApi['updateSettings']>[0]) => api.updateSettings(value), ['settings','notify-preview'])
}
export function useRotateConnectorSecret() {
 return useWrite((api, _value: void) => api.rotateConnectorSecret(), ['settings'])
}
export function useUpdateStyle() {
 return useWrite((api, value: { key: Parameters<LemmaApi['updateStyle']>[0]; patch: Parameters<LemmaApi['updateStyle']>[1] }) => api.updateStyle(value.key, value.patch), ['styles'])
}
export function useCreateSubject() {
 return useWrite((api, value: Parameters<LemmaApi['createSubject']>[0]) => api.createSubject(value), ['subjects'])
}
export function useUpdateSubject() {
 return useWrite((api, value: {id: string; patch: Parameters<LemmaApi['updateSubject']>[1]}) => api.updateSubject(value.id,value.patch), ['subjects','projects','atlas'])
}
export function useMergeSubjects() {
 return useWrite((api, value: {sourceId:string; targetId:string}) => api.mergeSubjects(value.sourceId,value.targetId), ['subjects','projects','project','home','atlas'])
}
export function useCreateProjectDraft() {
 return useWrite((api, value: Parameters<LemmaApi['createProjectDraft']>[0]) => api.createProjectDraft(value), ['projects','home'])
}
export function useUpdateSource() {
 return useWrite((api, value: {id:string; patch: Parameters<LemmaApi['updateSource']>[1]}) => api.updateSource(value.id,value.patch), ['project','projects','home','plan-revisions'])
}
export function useCreateProject() {
 return useWrite((api, value: Parameters<LemmaApi['createProject']>[0]) => api.createProject(value), ['projects', 'home'])
}
export function useUpdateProject() {
 return useWrite((api, value: { id: Parameters<LemmaApi['updateProject']>[0]; patch: Parameters<LemmaApi['updateProject']>[1] }) => api.updateProject(value.id, value.patch), ['projects', 'home', 'project'])
}
export function useAddSource() {
 return useWrite((api, value: { projectId: Parameters<LemmaApi['addSource']>[0]; file: Parameters<LemmaApi['addSource']>[1]; onProgress: Parameters<LemmaApi['addSource']>[2] }) => api.addSource(value.projectId, value.file, value.onProgress), ['project', 'projects', 'home'])
}
export function useDeleteSource() {
 return useWrite((api, value: Parameters<LemmaApi['deleteSource']>[0]) => api.deleteSource(value), ['project', 'projects', 'home'])
}
export function useApproveProposal() {
 return useWrite((api, value: { id: Parameters<LemmaApi['approveProposal']>[0]; edit?: Parameters<LemmaApi['approveProposal']>[1] }) => api.approveProposal(value.id, value.edit), ['proposals', 'proposal', 'home', 'decks', 'project', 'projects', 'session', 'sessions', 'atlas', 'cards', 'card'])
}
export function useRejectProposal() {
 return useWrite((api, value: Parameters<LemmaApi['rejectProposal']>[0]) => api.rejectProposal(value), ['proposals', 'proposal', 'home', 'project', 'session'])
}
export function useApproveAllCards() {
 return useWrite((api, _value: void) => api.approveAllCards(), ['proposals', 'proposal', 'home', 'decks', 'project', 'projects', 'session', 'sessions', 'atlas', 'cards', 'card'])
}
export function useRecordReview() {
 return useWrite((api, value: Parameters<LemmaApi['recordReview']>[0]) => api.recordReview(value), ['card', 'cards', 'card-history-page', 'decks', 'home', 'insights', 'review-log'])
}
export function useUndoReview() {
 return useWrite((api, value: Parameters<LemmaApi['undoReview']>[0]) => api.undoReview(value), ['card', 'cards', 'card-history-page', 'decks', 'home', 'insights', 'review-log'])
}
export function useCreateNote() {
 return useWrite((api, value: Parameters<LemmaApi['createNote']>[0]) => api.createNote(value), ['card', 'cards', 'decks', 'home', 'projects', 'project'])
}
export function useUpdateNote() {
 return useWrite((api, value: { noteNo: Parameters<LemmaApi['updateNote']>[0]; patch: Parameters<LemmaApi['updateNote']>[1] }) => api.updateNote(value.noteNo, value.patch), ['card', 'cards', 'decks', 'home'])
}
export function useSetNoteStatus() {
 return useWrite((api, value: { noteNo: Parameters<LemmaApi['setNoteStatus']>[0]; status: Parameters<LemmaApi['setNoteStatus']>[1] }) => api.setNoteStatus(value.noteNo, value.status), ['card', 'cards', 'decks', 'home'])
}
export function useAddComment() {
 return useWrite((api, value: { noteNo: Parameters<LemmaApi['addComment']>[0]; body: Parameters<LemmaApi['addComment']>[1] }) => api.addComment(value.noteNo, value.body), ['card', 'cards', 'card-comments-page'])
}
export function useDismissComment() {
 return useWrite((api, value: Parameters<LemmaApi['dismissComment']>[0]) => api.dismissComment(value), ['card', 'cards', 'card-comments-page'])
}
export function useResolveMisconception() {
 return useWrite((api, value: Parameters<LemmaApi['resolveMisconception']>[0]) => api.resolveMisconception(value), ['atlas', 'session', 'project'])
}
export function usePinConcept() {
 return useWrite((api, value: { id: Parameters<LemmaApi['pinConcept']>[0]; x: Parameters<LemmaApi['pinConcept']>[1]; y: Parameters<LemmaApi['pinConcept']>[2] }) => api.pinConcept(value.id, value.x, value.y), ['atlas'])
}


export function useSourceTranscriptionStats(projectId:string){
 return useQuery({...queryDefaults,queryKey:['source-transcript-stats',projectId],
  queryFn:()=>getApi().getSourceTranscriptionStats(projectId),enabled:!!projectId})
}
export function useSourcePage(sourceId:string,page:number){
 return useQuery({...queryDefaults,queryKey:['source-transcript-page',sourceId,page],
  queryFn:()=>getApi().getSourcePage(sourceId,page),enabled:!!sourceId&&page>=1})
}
export function useSourcePdfUrl(sourceId:string){
 return useQuery({...queryDefaults,queryKey:['source-pdf-url',sourceId],
  queryFn:()=>getApi().getSourcePdfUrl(sourceId),enabled:!!sourceId,
  staleTime:240_000})
}
export function useUpdateSourcePage(){
 return useWrite((api,value:{sourceId:string;page:number;patch:{body?:string;confidence?:'high'|'check'}})=>
  api.updateSourcePage(value.sourceId,value.page,value.patch),
  ['source-transcript-page','source-transcript-stats'])
}

export function useAddPushDevice() {
 return useWrite((api,value:Parameters<LemmaApi['addPushDevice']>[0])=>api.addPushDevice(value),['push-devices','notify-preview'])
}
export function useRenamePushDevice() {
 return useWrite((api,value:{id:string;label:string})=>api.renamePushDevice(value.id,value.label),['push-devices'])
}
export function useRemovePushDevice() {
 return useWrite((api,id:string)=>api.removePushDevice(id),['push-devices','notify-preview'])
}
export function useRestorePushDevice() {
 return useWrite((api,id:string)=>api.restorePushDevice(id),['push-devices','notify-preview'])
}
export function useTouchPushDevice() {
 return useWrite((api,endpoint:string)=>api.touchPushDevice(endpoint),['push-devices'])
}
export function useClearNotifyHold() {
 return useWrite((api,scope:string)=>api.clearNotifyHold(scope),['notify-holds','notify-preview'])
}
export function useSendTestNotification() {
 return useWrite((api,deviceId:string)=>api.sendTestNotification(deviceId),['notifications-recent'])
}
