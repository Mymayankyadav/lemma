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
>;
export interface DemoSource extends Source {
  pages: { page: number; label: string; body: string }[];
  error?: string | null;
}
export interface DemoProposal extends Proposal {
  status: "pending" | "approved" | "rejected";
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
  proposals: DemoProposal[];
  concepts: DemoConcept[];
  links: AtlasGraph["links"];
  misconceptions: DemoMisconception[];
  checkpointEvents: InsightData["checkpointEvents"];
}
export type UiByCode = Map<string, CheckpointUi>;
