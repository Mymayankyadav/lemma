import type {
  AtlasGraph,
  CardComment,
  CardDetail,
  CardState,
  CheckpointUi,
  Client,
  GoalMet,
  InsightData,
  Misconception,
  Project,
  Proposal,
  SessionEvent,
  Settings,
  Source,
  Style,
  Subject,
} from "../types";
export interface DemoCheckpoint {
  id: string;
  projectId: string;
  code: string;
  /** V3 Metro data: hydrated relative to the demo study day. */
  stage?: string;
  dueOn?: string | null;
  demonstratedAt?: string | null;
  title: string;
  position: number;
  objective: string;
  criterion: string;
  steps: string[];
  pages: string | null;
  sourceShort: string | null;
  status: "not_started" | "in_progress" | "demonstrated";
  currentStep: number;
  recheckLevel: number;
  recheckDue: string | null;
  recheckPrompt: string | null;
  needsRevisit: boolean;
  prereqs: string[];
  conceptIds: string[];
  proposed?: boolean;
}
export interface DemoProject extends Project {
  lastActivityAt: string | null;
}
export interface DemoSession {
  id: string;
  projectId: string;
  number: number;
  goal: string;
  checkpointCode: string | null;
  client: Client;
  state: "open" | "ended";
  goalMet: GoalMet;
  style: string;
  startedAt: string;
  lastActivityAt: string;
  minutes: number;
  summaryText: string | null;
  resumeQuestion: string | null;
  resumeStep: number | null;
  events: SessionEvent[];
  pages: string | null;
}
export interface DemoNote {
  note: CardDetail["note"];
  projectId: string;
  sessionId: string | null;
  conceptId: string | null;
  cards: { id: string; ord: number; state: CardState }[];
  comments: CardComment[];
}
type ReviewDatum = InsightData["reviews"][number];
export interface DemoReview extends ReviewDatum {
  id: number;
  cardId: string;
  prev: CardState;
  undoneAt: string | null;
}
export interface DemoMisconception extends Misconception {
  projectId: string;
  conceptId: string | null;
}
export type DemoConcept = Omit<
  AtlasGraph["concepts"][number],
  "status" | "checkpointRefs" | "dueCards"
> & {
  level?: "cluster" | "galaxy" | "system" | "planet" | "moon";
  parentId?: string | null;
  isStar?: boolean;
};
export interface DemoSource extends Source {
  kind?: "book" | "notes" | "slides" | "problems" | "syllabus" | "exam" | "other";
  addedAt?: string;
  planCheckedAt?: string | null;
  position?: number;
  pages: { page: number; label: string; body: string; transcribedBy?:'claude'|'chatgpt'|null; transcribedAt?:string|null; confidence?:'high'|'check'|null }[];
  error?: string | null;
}
export interface DemoProposal extends Proposal {
  status: "pending" | "approved" | "rejected";
  approvedAt?: string;
}
export interface DemoStore {
  version: 1;
  seed: number;
  settings: Settings;
  styles: Style[];
  subjects: Subject[];
  projects: DemoProject[];
  checkpoints: DemoCheckpoint[];
  sources: DemoSource[];
  sessions: DemoSession[];
  notes: DemoNote[];
  reviews: DemoReview[];
  /** ST-0: simulated server-side historical review count; raw rows stay bounded. */
  stressReviewCount?: number;
  /** Generated stress notes remain virtual until a card route needs them. */
  stressNoteCount?: number;
  stressDueCount?: number;
  /** Full per-project source count when S/X source records are virtual on Today. */
  stressSourceTarget?: number;
  stressAtlasIdeaCount?: number;
  stressAtlasLinkCount?: number;
  /** Browser-only virtual per-project session count (avoids 60k hydrated rows). */
  stressSessionCount?: number;
  /** Duration of one virtual stress session for bounded Insights aggregates. */
  stressSessionMinutes?: number;
  proposals: DemoProposal[];
  concepts: DemoConcept[];
  links: AtlasGraph["links"];
  misconceptions: DemoMisconception[];
  checkpointEvents: InsightData["checkpointEvents"];
}
export type UiByCode = Map<string, CheckpointUi>;
