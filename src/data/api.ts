import type { Settings, Style, Subject, HomeSummary, ProjectSummary, ProjectDetail, Project, NewProjectInput, CheckpointDetail, IngestProgress, Source, SessionSummary, SessionDetail, Proposal, DeckNode, QueueFilter, ReviewItem, RecordReviewInput, CardState, CardRow, CardDetail, NoteType, NoteKind, NoteStatus, CardComment, AtlasGraph, InsightData, Rating } from './types'

export type LemmaErrorCode = 'not_found' | 'invalid' | 'conflict' | 'offline' | 'auth' | 'server' | 'not_implemented'
export class LemmaError extends Error {
 readonly code: LemmaErrorCode
 constructor(code: LemmaErrorCode, message: string) { super(message); this.name = 'LemmaError'; this.code = code }
}
export function notImplemented(name: string): LemmaError { return new LemmaError('not_implemented', `${name} is not implemented yet`) }
export type SettingsPatch = Partial<Omit<Settings, 'connectorUrl' | 'connectorLastSeenAt' | 'connectorLastClient'>>
export type StylePatch = Partial<Pick<Style, 'name' | 'instructions'>>
export type CreateSubjectInput = Pick<Subject, 'name' | 'glyph' | 'hue'>
export type ProjectPatch = Partial<Pick<Project, 'title' | 'goal' | 'style' | 'status' | 'subjectId'>>
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
 /** Rotate the connector secret and invalidate its previous URL. */
 rotateConnectorSecret(): Promise<Settings>
 /** List teaching styles. */
 listStyles(): Promise<Style[]>
 /** Edit teaching style name or instructions. */
 updateStyle(key: string, patch: StylePatch): Promise<Style>
 /** Read the resume target, due counts and projects. */
 getHome(): Promise<HomeSummary>
 /** List subjects in position order. */
 listSubjects(): Promise<Subject[]>
 /** Create a subject. */
 createSubject(input: CreateSubjectInput): Promise<Subject>
 /** List projects by latest activity. */
 listProjects(): Promise<ProjectSummary[]>
 /** Read a project including proposed checkpoints. */
 getProject(slug: string): Promise<ProjectDetail>
 /** Create a project with a collision-safe slug. */
 createProject(input: NewProjectInput): Promise<Project>
 /** Edit a project. */
 updateProject(id: string, patch: ProjectPatch): Promise<Project>
 /** Read checkpoint details and recent events. */
 getCheckpoint(slug: string, code: string): Promise<CheckpointDetail>
 /** Extract and upload a PDF source with progress. */
 addSource(projectId: string, file: File, onProgress: (progress: IngestProgress) => void): Promise<Source>
 /** Delete a source, its extracted pages and stored PDF. */
 deleteSource(id: string): Promise<void>
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
 /** Read note content, scheduling, history and comments. */
 getCard(noteNo: number): Promise<CardDetail>
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
