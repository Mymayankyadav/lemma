/** Domain contract from docs/spec/data.md §7. Dates are ISO strings. */
export type Glyph = string
export type Hue = 'amber' | 'violet' | 'cyan' | 'rose' | 'lime' | 'slate'
export type IsoDate = string
export type Client = 'claude' | 'chatgpt' | 'other'
export type ProjectStatus = 'planning' | 'active' | 'paused' | 'done' | 'archived'
export type SourceKind = 'book' | 'notes' | 'slides' | 'problems' | 'syllabus' | 'exam' | 'other'
export type ConceptLevel = 'cluster' | 'galaxy' | 'system' | 'planet' | 'moon'
export interface PlanRevision { revision: number; approvedAt: IsoDate; summary: string; proposalId: string | null }
export type NoteType = 'basic' | 'cloze' | 'reverse'
export type NoteKind = 'definition' | 'theorem' | 'why' | 'example' | 'counterexample' | 'proof' | 'other'
export type NoteStatus = 'active' | 'suspended' | 'deleted'
export type Confidence = 'sure' | 'unsure' | 'guess' | null
export type Rating = 1 | 2 | 3 | 4
export type SchedulingState = 0 | 1 | 2 | 3
export type GoalMet = 'yes' | 'partial' | 'no' | null
export type EventKind = 'pretest' | 'attempt' | 'hint' | 'explanation' | 'misconception' | 'evidence' | 'recheck' | 'note'
export type Outcome = 'demonstrated' | 'partial' | 'failed' | null
export type CheckpointUi = 'proposed' | 'revisit' | 'done' | 'now' | 'next' | 'locked'
/** Optional DB-3 preferences; unknown keys survive future client upgrades. */
export interface UiPreferences {
 mode?: 'auto' | 'day' | 'night'
 world?: string; keep?: string[]; fav?: string[]
 timeline?: 'ascent' | 'metro' | 'line'; timelineKeep?: string[]
 atlas?: 'orbits' | 'branches' | 'outline'; atlasKeep?: string[]
 density?: 'compact' | 'cozy' | 'comfortable'; motion?: 'calm' | 'lively'
 follow?: boolean; day?: string; night?: string
 [key: string]: unknown
}
/** Owner preferences; unknown keys survive future versions. */
export interface NotifyPrefs {
 enabled?: boolean
 mode?: 'live' | 'daily' | 'weekly' | 'off'
 studyTime?: string
 quiet?: {start:string;end:string}
 maxPerDay?: number
 kinds?: Partial<Record<'due'|'deadline'|'behind'|'resume'|'tutor'|'digest'|'plan'|'rhythm',boolean>>
 dueThreshold?: 1 | 10 | 25 | 50
 approveCards?: boolean
 digest?: {weekday:0|1|2|3|4|5|6;time:string}
 backoff?: Partial<Record<string,string>>
 offered?: number
 [key:string]:unknown
}
export interface PushDevice {
 id:string;label:string;platform:'android_app'|'android_web'|'desktop'|'ios'|'other'
 lastSeenAt:IsoDate|null;lastOkAt:IsoDate|null;disabledAt:IsoDate|null
 disabledReason:'gone'|'removed'|'failing'|null;isThisDevice:boolean
}
export interface SentNotification {
 id:number;kind:string;title:string;body:string;sentAt:IsoDate|null
 action:string|null;actionAt:IsoDate|null
}
export interface NotifyHold {scope:string;label:string;until:IsoDate}
export interface NotifyPreviewRow {at:IsoDate;kind:string;title:string;reason:string;held:boolean}
export interface Settings {
 notify?: NotifyPrefs | null
 ui?: UiPreferences | null
 desiredRetention: number; newPerDay: number; reviewsPerDay: number
 learnSteps: string; relearnSteps: string; rolloverHour: number; maxIntervalDays: number
 fuzz: boolean; loadBalance: boolean; learnAheadMinutes: number
 fsrsWeights: number[] | null; fsrsTunedAt: IsoDate | null; macros: string
 defaultStyle: string; tutorRules: string | null; mixDecks: boolean
 preferredChat: 'claude' | 'chatgpt'; connectorUrl: string
 connectorLastSeenAt: IsoDate | null; connectorLastClient: Client | null; timeZone: string
}
export interface Style { key: string; name: string; icon: string; instructions: string; position: number }
export interface Subject { id: string; name: string; glyph: Glyph; hue: Hue; position: number }
/** Bounded server-computed segment for the Paths mini Metro (ST-5/ST-1). */
export interface ProjectStageProgress {
 label: string; firstCode: string; lastCode: string
 done: number; total: number; overdue: number
 schedule: 'complete' | 'behind' | 'dated' | 'unscheduled'
}
export interface ProjectSummary {
 /** Optional until both demo/live adapters supply the ST-5 stage aggregate. */
 stageProgress?: ProjectStageProgress[]
 /** Date-grounded headline, null when there is no schedule evidence. */
 scheduleHeadline?: string | null
 pinned?: boolean; system?: boolean
 targetDate?: IsoDate | null; targetLabel?: string | null
 id: string; slug: string; title: string; subject: Subject; status: ProjectStatus; done: number; total: number
 current: {code: string; title: string; step: number; stepsTotal: number} | null
 lastActivityAt: IsoDate | null; cardsCount: number; sessionsCount: number; sourcesCount: number
 /** Titles of this project's own sources, for searching the Paths library without N+1 fetches. */
 sourceTitles?: string[]
}
export interface Project {
 pinned?: boolean; system?: boolean
 targetDate?: IsoDate | null; targetLabel?: string | null
 id: string; slug: string; title: string; goal: string; style: string; status: ProjectStatus; subjectId: string; createdAt: IsoDate
}
export interface CheckpointView {
 dueOn?: IsoDate | null; demonstratedAt?: IsoDate | null
 stage?: string | null
 id: string; code: string; title: string; position: number; ui: CheckpointUi; currentStep: number; stepsTotal: number
 recheckDue: IsoDate | null; dueCards: number
}
export interface ProjectDetail {
 planRevisions?: PlanRevision[]
 project: Project; subject: Subject; checkpoints: CheckpointView[]; done: number; total: number
 sources: Source[]; sessions: SessionSummary[]; pendingProposals: number
}
export interface CheckpointDetail {
 view: CheckpointView; objective: string; criterion: string; steps: string[]; pages: string | null
 sourceShort: string | null; prereqs: string[]; concepts: {slug: string; name: string}[]
 recheckPrompt: string | null; events: SessionEvent[]; cardsCount: number; sessions: SessionSummary[]
}
export interface TranscribedSourcePage {
 sourceId:string;page:number;label:string|null;body:string;
 transcribedBy:'claude'|'chatgpt'|null;confidence:'high'|'check'|null;
}
export interface SourceTranscriptionStat {sourceId:string;transcribed:number;needsCheck:number}
export interface Source {
 origin?:'user'|'claude'|'chatgpt'|'other'|null;
 kind?: SourceKind; sha256?: string | null; position?: number; addedAt?: IsoDate; planCheckedAt?: IsoDate | null
 id: string; projectId: string; title: string; short: string; filename: string; bytes?: number | null; pageCount: number | null
 status: 'queued' | 'reading' | 'uploading' | 'saving' | 'extracting' | 'ready' | 'failed'; hasText: boolean
 outline: {title: string; page: number; level: number}[]; createdAt: IsoDate
}
export interface IngestProgress {
 phase: 'queued' | 'reading' | 'uploading' | 'saving' | 'done' | 'failed'; page: number; pageCount: number; message: string
}
export interface SessionSummary {
 id: string; projectSlug: string; number: number; goal: string; checkpointCode: string | null; client: Client
 display: 'live' | 'paused' | 'ended'; goalMet: GoalMet; startedAt: IsoDate; lastActivityAt: IsoDate; minutes: number | null
}
export interface SessionEvent {
 id: number; kind: EventKind; body: string; outcome: Outcome; hintLevel: number | null; checkpointCode: string | null; createdAt: IsoDate
}
export interface SessionDetail {
 summary: SessionSummary; styleName: string; summaryText: string | null; resumeQuestion: string | null; resumeStep: number | null
 events: SessionEvent[]; misconceptions: Misconception[]; cards: {noteNo: number; front: string; state: 'pending' | 'active'}[]
 pendingProposals: {cards: number; planChanges: number}; pages: string | null
}
export interface Misconception { id: string; label: string; times: number; lastSeenAt: IsoDate; resolvedAt: IsoDate | null }
/** Proposal payload keys intentionally preserve the JSON shapes in data.md §5.4. */
export interface CardPayload {
 front: string; back: string; type: NoteType; kind: NoteKind; checkpoint?: string; concept?: string
 source?: string; page?: string; tags?: string[]; direct?: boolean
}
export interface CardEditPayload { note_no: number; front?: string; back?: string; type?: NoteType; resolves?: number[] }
export interface PlanCheckpoint {
 due_on?: IsoDate | null; sources?: {source:string; pages?:string}[]
 stage?: string | null
 code?: string; title: string; objective: string; criterion: string; steps: string[]; pages?: string
 source?: string; prereqs?: string[]; concepts?: string[]; recheck_prompt?: string
}
export interface PlanPayload {
 checkpoints: PlanCheckpoint[]
 concepts?: ProposedIdea[]
}
/** An idea in a plan proposal (MCP-4): nesting by level and parent name, links by name. */
export interface ProposedIdea {
 name: string; topic?: string | null; blurb?: string; prereqs?: string[]; related?: string[]
 level?: ConceptLevel; parent?: string | null; star?: boolean
}
export type PlanChangeOp =
 | ({op: 'add'; after?: string} & PlanCheckpoint)
 | ({op: 'update'; code: string} & Partial<Pick<PlanCheckpoint, 'title' | 'objective' | 'criterion' | 'steps' | 'pages' | 'recheck_prompt' | 'stage'>>)
 | {op: 'remove'; code: string}
 | {op: 'move'; code: string; after: string}
 | {op: 'prereq_add' | 'prereq_remove'; code: string; prereq: string}
export interface PlanChangePayload { ops: PlanChangeOp[]; concepts?: ProposedIdea[] }
export interface Proposal {
 id: string; kind: 'card' | 'card_edit' | 'plan' | 'plan_change'; projectSlug: string; projectGlyph: Glyph
 sessionNumber: number | null; origin: Exclude<Client, never>; reason: string | null; createdAt: IsoDate
 card: CardPayload | null
 cardEdit: (CardEditPayload & {current: {front: string; back: string}; comments: CardComment[]}) | null
 plan: PlanPayload | null; planChange: PlanChangePayload | null
}
export type DeckKey = `project:${string}` | `cp:${string}:${string}`
export interface DeckNode { key: DeckKey; label: string; glyph: Glyph; level: 0 | 1; due: number; children: DeckNode[] }
export interface QueueFilter { decks: DeckKey[]; sessionId: string | null; conceptSlug: string | null; includeNew: boolean; newOnly: boolean }
export interface CardState {
 state: SchedulingState; due: IsoDate; stability: number; difficulty: number; lastReview: IsoDate | null; step: number; reps: number; lapses: number
}
export interface ReviewItem {
 cardId: string; noteId: string; noteNo: number; ord: number; type: NoteType; kind: NoteKind; front: string; back: string
 projectSlug: string; glyph: Glyph; checkpointCode: string | null; checkpointTitle: string | null; sessionNumber: number | null
 sourceShort: string | null; pageLabel: string | null; state: CardState
}
export interface RecordReviewInput { cardId: string; rating: Rating; confidence: Confidence; durationMs: number; next: CardState }
export interface CardRow {
 noteNo: number; front: string; type: NoteType; kind: NoteKind; projectSlug: string; glyph: Glyph
 checkpointCode: string | null; due: IsoDate | null; status: NoteStatus; openComments: number
}
/** ST-5/ST-4: a bounded, server-filtered page of card-library rows. */
export interface CardSearchFilters {
 query: string
 projectSlug?: string
 checkpointCode?: string
 state?: SchedulingState
 noteStatus?: NoteStatus
 hasOpenComments?: boolean
 offset?: number
}
export interface CardSearchPage { rows: CardRow[]; nextOffset: number | null }
export interface CardDetail {
 note: {noteId: string; noteNo: number; front: string; back: string; type: NoteType; kind: NoteKind; tags: string[]
 status: NoteStatus; origin: 'user' | Client; projectSlug: string; checkpointCode: string | null
 sessionNumber: number | null; sourceShort: string | null; pageLabel: string | null}
 cards: {ord: number; state: CardState}[]
 history: {reviewedAt: IsoDate; rating: Rating; confidence: Confidence}[]; comments: CardComment[]
 /** Server-probed continuation for initial 20-row pages; a full page does not imply more. */
 historyNextCursor?: string | null; commentsNextCursor?: string | null
}
/** ST-4 D7: each server-filtered history request returns at most 20 rows.
 * The opaque cursor encodes a stable (timestamp,id) continuation; never an offset.
 */
export interface CardHistoryPage { rows: CardDetail['history']; nextCursor: string | null }
export interface CardCommentsPage { rows: CardComment[]; nextCursor: string | null }
export interface CardComment {
 no: number; body: string; status: 'open' | 'addressed' | 'dismissed'; createdAt: IsoDate; resolvedAt: IsoDate | null
 resolvedByOrigin: Client | null
}
export interface AtlasGraph {
 subjects: Subject[]
 concepts: {id: string; slug: string; name: string; topic?: string | null; level?: ConceptLevel; parentId?: string | null; isStar?: boolean; blurb: string | null; subjectId: string
 status: 'revisit' | 'demonstrated' | 'in_progress' | 'not_started'; pinX: number | null; pinY: number | null
 checkpointRefs: {projectSlug: string; code: string}[]; dueCards: number}[]
 links: {fromId: string; toId: string; kind: 'prereq' | 'related'}[]
}
/** Bounded owner-scoped Insights RPC payload; demo may continue using raw rows. */
export interface InsightAggregate {
 days: number; reviews: number; right: number
 reviewDays: {date: IsoDate; count: number; again: number; hard: number; good: number; easy: number; right: number}[]
 calibration: {confidence: Exclude<Confidence, null>; total: number; right: number}[]
 sessions: number; minutes: number; typicalSession: number | null
 subjectMinutes: {subject: Subject; minutes: number}[]
 checkpointDays: {date: IsoDate; demonstrated: number; rechecked: number}[]
 mostRevisited: {label: string; times: number; conceptName: string | null} | null
}
export interface InsightData {
 /** ST-5: server aggregate, supplied instead of unbounded raw rows in live mode. */
 aggregate?: InsightAggregate
 reviews: {reviewedAt: IsoDate; rating: Rating; stateBefore: SchedulingState; confidence: Confidence; durationMs: number; projectId: string}[]
 sessions: {startedAt: IsoDate; minutes: number; projectId: string; goalMet: GoalMet}[]
 checkpointEvents: {at: IsoDate; kind: 'demonstrated' | 'recheck_ok' | 'recheck_fail'; checkpointCode: string; projectId: string}[]
 projects: {id: string; title: string; subject: Subject}[]; misconceptions: {label: string; times: number; conceptName: string | null}[]
}
export interface HomeSummary {
 resume: {projectSlug: string; projectTitle: string; glyph: Glyph; checkpointCode: string | null; checkpointTitle: string | null
 step: number; stepsTotal: number; question: string | null; objective: string | null; pausedAt: IsoDate | null; sessionNumber: number | null} | null
 due: number; pendingProposals: number; projects: ProjectSummary[]
}
export interface NewProjectInput { title: string; slug?: string; subjectId: string; goal: string; style: string }
/** v3 name-only creation; the tutor supplies goal, subject and style later. */
export interface NewProjectDraftInput { title: string; sources?: File[] }


