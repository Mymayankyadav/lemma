export type Interval = { start: string; end: string; kind?: 'focus' | 'break' };
export type StudyEntry = { id: string; status: 'saved' | 'draft' | 'discarded' | 'running' | 'paused'; subjectId?: string | null; intervals: Interval[] };
export type Range = { start: string; end: string };
export type ActiveEffort = { startedAt: string; focusMinutes: number; intervals?: Interval[]; phase?: 'focus' | 'break' | 'paused' };
export type Occupied = { start: string; end: string };
