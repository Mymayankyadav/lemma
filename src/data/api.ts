import type { Settings, Style, Subject, HomeSummary, ProjectSummary, ProjectDetail, Project, NewProjectInput, CheckpointDetail, IngestProgress, Source, TranscribedSourcePage, SourceTranscriptionStat, SessionSummary, SessionDetail, Proposal, DeckNode, QueueFilter, ReviewItem, RecordReviewInput, CardState, CardRow, CardSearchFilters, CardSearchPage, CardDetail, CardHistoryPage, CardCommentsPage, NoteType, NoteKind, NoteStatus, CardComment, AtlasGraph, InsightData, Rating, PlanRevision, NewProjectDraftInput, PushDevice, SentNotification, NotifyHold, NotifyPreviewRow } from './types'

export type LemmaErrorCode = 'not_found' | 'invalid' | 'conflict' | 'offline' | 'auth' | 'server' | 'not_implemented'
export class LemmaError extends Error {
 readonly code: LemmaErrorCode
 constructor(code: LemmaErrorCode, message: string) { super(message); this.name = 'LemmaError'; this.code = code }
}
export function notImplemented(name: string): LemmaError { return new LemmaError('not_implemented', `${name} is not implemented yet`) }
export type SettingsPatch = Partial<Omit<Settings, 'connectorUrl' | 'connectorLastSeenAt' | 'connectorLastClient'>>
export type StylePatch = Partial<Pick<Style, 'name' | 'instructions'>>
export type CreateSubjectInput = Pick<Subject, 'name' | 'glyph' | 'hue'>
export type ProjectPatch = Partial<Pick<Project, 'title' | 'goal' | 'style' | 'status' | 'subjectId' | 'pinned'>>
export type SubjectPatch = Partial<Pick<Subject, 'name' | 'glyph' | 'position'>>
export type SourcePatch = Partial<Pick<Source, 'title' | 'kind'>>
export interface ProposalEdit { front?: string; back?: string; type?: NoteType }
export interface CreateNoteInput { projectSlug: string; front: string; back: string; type: NoteType; kind: NoteKind; checkpointCode?: string }
export type NotePatch = Partial<Pick<CardDetail['note'], 'front' | 'back' | 'type' | 'kind' | 'tags'>>
export type InsightDays = 7 | 30 | 90
export interface ReviewLogEntry { cardId: string; reviewedAt: string; rating: Rating }
export interface LemmaApi {
 readonly mode: 'live' | 'demo'
 /** Read the signed-in owner, or null. */
 getAuth(): Promise<{ email: string } | null>
 /** Start Google OAuth. */
 signIn(): Promise<void>
 /** End the owner session. */
 signOut(): Promise<void>
 /** Initialize owner settings and styles idempotently. */
 bootstrap(): Promise<Settings>
 /** Read owner settings. */
 getSettings(): Promise<Settings>
 /** Update editable settings only. */
 updateSettings(patch: SettingsPatch): Promise<Settings>
 /** List the owner's registered and removed push devices. */
 listPushDevices(): Promise<PushDevice[]>
 /** Register or re-enable a subscription, preserving its row identity. */
 addPushDevice(input:{endpoint:string;p256dh:string;auth:string;label:string;platform:PushDevice['platform']}):Promise<PushDevice>
 /** Rename one registered device. */
 renamePushDevice(id:string,label:string):Promise<PushDevice>
 /** Soft-disable one registered device. */
 removePushDevice(id:string):Promise<PushDevice>
 /** Re-enable the same device row, subject to the 10-device cap. */
 restorePushDevice(id:string):Promise<PushDevice>
 /** Presence ping, at most once a minute from the UI. */
 touchPushDevice(endpoint:string):Promise<void>
 /** Read the 20 most recent notification records. */
 listRecentNotifications():Promise<SentNotification[]>
 /** Read active holds for the owner. */
 listNotifyHolds():Promise<NotifyHold[]>
 /** Clear a single reminder hold. */
 clearNotifyHold(scope:string):Promise<void>
 /** Send a test notification to an owner's device. */
 sendTestNotification(deviceId:string):Promise<void>
 /** Preview upcoming reminders without sending or writing. */
 previewNotifications():Promise<NotifyPreviewRow[]>
 /** Rotate the connector secret and invalidate its previous URL. */
 rotateConnectorSecret(): Promise<Settings>
 /** List teaching styles. */
 listStyles(): Promise<Style[]>
 /** Edit teaching style name or instructions. */
 updateStyle(key: string, patch: StylePatch): Promise<Style>
 /** Read the resume target, due counts and projects. */
 getHome(): Promise<HomeSummary>
 /** Count scheduled active cards by study day, today through six days ahead. */
 getReviewForecast(): Promise<{day: string; due: number}[]>
 /** List subjects in position order. */
 listSubjects(): Promise<Subject[]>
 /** Create a subject. */
 createSubject(input: CreateSubjectInput): Promise<Subject>
 /** v3: rename, change glyph, or reorder an owner's subject. */
 updateSubject(id: string, patch: SubjectPatch): Promise<Subject>
 /** v3: merge one owner subject into another, preserving references and audit. */
 mergeSubjects(sourceId: string, targetId: string): Promise<void>
 /** List projects by latest activity. */
 listProjects(): Promise<ProjectSummary[]>
 /** Read a project including proposed checkpoints. */
 getProject(slug: string): Promise<ProjectDetail>
 /** Create a project with a collision-safe slug. */
 createProject(input: NewProjectInput): Promise<Project>
 /** v3: create a project with only a title; sources may be appended afterward. */
 createProjectDraft(input: NewProjectDraftInput): Promise<Project>
 /** Edit a project. */
 updateProject(id: string, patch: ProjectPatch): Promise<Project>
 /** v3: list approved plan revisions newest-first. */
 listPlanRevisions(slug: string): Promise<PlanRevision[]>
 /** Read checkpoint details and recent events. */
 getCheckpoint(slug: string, code: string): Promise<CheckpointDetail>
 /** Extract and upload a PDF source with progress. */
 addSource(projectId: string, file: File, onProgress: (progress: IngestProgress) => void): Promise<Source>
 /** v3: rename or reclassify one source with owner-scoped auditing. */
 updateSource(id: string, patch: SourcePatch): Promise<Source>
 /** Delete a source, its extracted pages and stored PDF. */
 deleteSource(id: string): Promise<void>
 /** Get transcription counts without loading whole page text. */
 getSourceTranscriptionStats(projectId:string):Promise<SourceTranscriptionStat[]>
 /** Load exactly one PDF page rather than all pages of a long scan. */
 getSourcePage(sourceId:string,page:number):Promise<TranscribedSourcePage|null>
 /** Export reads all transcribed pages only when the owner explicitly requests a download. */
 getTranscribedPagesForExport(sourceId:string):Promise<TranscribedSourcePage[]>
 /** Owner edits or verifies a transcribed page (changes are logged for undo). */
 updateSourcePage(sourceId:string,page:number,patch:{body?:string;confidence?:'high'|'check'}):Promise<TranscribedSourcePage>
 /** Short-lived URL for the owner's original PDF, when present. */
 getSourcePdfUrl(sourceId:string):Promise<string|null>
 /** List sessions, optionally for one project. */
 listSessions(slug?: string): Promise<SessionSummary[]>
 /** Read a session record. */
 getSession(slug: string, number: number): Promise<SessionDetail>
 /** List pending proposals oldest first. */
 listProposals(): Promise<Proposal[]>
 /** Read a proposal of any status. */
 getProposal(id: string): Promise<Proposal>
 /** Apply a pending proposal atomically. */
 approveProposal(id: string, edit?: ProposalEdit): Promise<void>
 /** Reject a pending proposal. */
 rejectProposal(id: string): Promise<void>
 /** Approve pending card proposals in order. */
 approveAllCards(): Promise<number>
 /** Read the deck tree with daily-limit due counts. */
 getDeckTree(): Promise<DeckNode[]>
 /** Read the filtered due set with daily limits applied. */
 getReviewItems(filter: QueueFilter): Promise<ReviewItem[]>
 /** Record a review and its browser-computed next state. */
 recordReview(input: RecordReviewInput): Promise<{ reviewId: number }>
 /** Undo the newest answer for a card. */
 undoReview(reviewId: number): Promise<CardState>
 /** Search up to 100 cards by front or back. */
 searchCards(query: string, slug?: string): Promise<CardRow[]>
 /** Search a single 50-row page with server-side filters and a continuation offset. */
 searchCardsPage(filter: CardSearchFilters): Promise<CardSearchPage>
 /** Read note content, scheduling, history and comments. */
 getCard(noteNo: number): Promise<CardDetail>
 /** Read the next 20 owner-scoped reviews of one note, newest first. */
 getCardHistoryPage(noteNo: number, cursor?: string): Promise<CardHistoryPage>
 /** Read the next 20 owner-scoped comments of one note, newest first. */
 getCardCommentsPage(noteNo: number, cursor?: string): Promise<CardCommentsPage>
 /** Create an owner-authored note without approval. */
 createNote(input: CreateNoteInput): Promise<{ noteNo: number }>
 /** Edit note content and reconcile card ordinals. */
 updateNote(noteNo: number, patch: NotePatch): Promise<void>
 /** Activate, suspend or soft-delete a note. */
 setNoteStatus(noteNo: number, status: NoteStatus): Promise<void>
 /** Leave a note for the tutor. */
 addComment(noteNo: number, body: string): Promise<CardComment>
 /** Dismiss a tutor comment. */
 dismissComment(no: number): Promise<void>
 /** Mark a misconception resolved. */
 resolveMisconception(id: string): Promise<void>
 /** Read concepts and their knowledge links. */
 getAtlas(): Promise<AtlasGraph>
 /** Save a concept position in the Atlas. */
 pinConcept(id: string, x: number | null, y: number | null): Promise<void>
 /** Read non-undone reviews for the FSRS optimizer. */
 getReviewLog(): Promise<ReviewLogEntry[]>
 /** Read raw insight rows for the selected period. */
 getInsightData(days: InsightDays): Promise<InsightData>
 /** Export all owner tables as JSON. */
 exportAll(): Promise<Blob>
}
