import type { Action } from '../adaptive/kg.ts';
import type { MeasurementState } from '../adaptive/measure.ts';
import type { ProjectNeed } from '../adaptive/scheduler.ts';

/** All times except native needAt/model.now use minutes on the same host-supplied clock. */
export interface Window { start: number; end: number; projectId?: string }
export interface Fixed extends Window {
  id: string; occurrenceKey?: string; revision?: number; before?: number; after?: number;
  role?: string; cancelled?: boolean;
}
export interface Task {
  id: string; kind: 'course'|'card'|'personal'|'tutor'; remaining: number; projectId?: string;
  release?: number; due?: number; needBy?: number; expiry?: number; importance?: number; severity?: number;
  required?: boolean; core?: boolean; unannounced?: boolean; splittable?: boolean; minChunk?: number;
  resumeMinutes?: number; progressWeight?: number; authority?: string; declined?: boolean;
  atlasAction?: Omit<Action,'id'|'minutes'>;
}
export interface PreparedTask extends Task {
  release: number; due: number; expiry: number; severity: number; split: boolean; pending: number;
  minimum: number; deadline: number; weight: number; progress: number;
}
export interface Observation { estimated?: number; actual?: number; kept?: boolean }
export interface Reservation { taskId: string; start: number; end: number }
export interface Interleaving {
  id: string; atBoundary?: boolean; alreadyMixed?: boolean; urgent?: boolean; offered?: boolean;
  headroom?: number; typicalMinutes: number; alternativeMinutes: number; promptMinutes: number; switchMinutes: number;
}
export interface Snapshot {
  now: number; end: number; tasks: Task[];
  /** Host-only cooperative deadline for optional scenario work. The legal baseline stays available. */
  checkDeadline?: () => void; availability?: Window[]; fixed?: Fixed[];
  atlasModel?: MeasurementState; atlasProjects?: (Partial<ProjectNeed> & {id:string})[]; cardCap?: number;
  studyReturnAt?: number; protectedUntil?: number; activeId?: string; resumeCost?: number;
  protectedPersonal?: string[]; personalReservations?: Reservation[]; confirmedDeadlines?: string[];
  history?: Observation[]; ownerPreferences?: {cardWeight?: number}; interleaving?: Interleaving;
}
export interface Commitment {
  taskId: string; source: string; confirmedCore: boolean; forced: boolean; actionKind: string;
  conceptId: string; maxMinutes: number; phase: string; deadline: number;
}
export interface Options {
  policy?: string; includeForecasts?: boolean; cardWeight?: number;
  verifiedAtlasCommitment?: (id:string) => Commitment|undefined;
}
export interface State {
  now: number; end: number; fixed: Fixed[]; windows: Window[]; tasks: PreparedTask[];
  expired: string[]; pendingTutor: {id:string;state:string}[];
  calendar: {currentFixed: Fixed[];nextFixed: Fixed|null;conflicts: {ids:string[];start:number;end:number;kind:string}[]};
  activeId?:string; protectedUntil:number; resumeCost:number; input:Snapshot;
}
export interface Option {task:PreparedTask; full:number}
export interface Legal { window:Window; options:Option[]; urgent:Option|null }
export interface Pick extends Window {id:string;kind:Task['kind'];minutes:number;resumeMinutes:number;bufferMinutes?:number}
export interface Selection {action:Pick|null;hold:{until:number;reason:string}|null;origin?:string;baselineError?:string}
export interface Evidence {
  sample:number;center:number;shift:number;attendanceSample:number;kept:number;spread:number;supported:boolean;
}
export interface Scenario {required:number[];windows:Window[]}
export interface Forecast {id:string;accessibleMinutes:number;pFeasible:number;estimatedMinutes:number;requiredP80:number;meaning:string}
export type Detail = Record<string,unknown>;
export interface Guard extends Detail {status:string}
export interface Ranked extends Selection {
  policy:string;reason:string;forecasts:Forecast[];evidence:Partial<Evidence> & Detail;
  risks: {id:string;reason:string;pFeasible:number;choices:string[]}[];
  freeIntervals?: Window[]; currentFixed?: Fixed[]; nextFixed?: Fixed|null; fixedConflicts?: State['calendar']['conflicts'];
  pendingTutor?: State['pendingTutor']; expired?: string[]; interleavingTip?: {id:string;kind:string;reason:string}|null;
  floor?:Guard; commitment?:Guard; ownerWeight?:Guard; attendanceGuard?:Guard;
}
export function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'Invalid decision evidence'; }
