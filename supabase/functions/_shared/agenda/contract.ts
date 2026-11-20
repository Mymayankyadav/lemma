/** Persisted owner choice. New behavior is served after the backend release gate opens. */
export type SchedulingAlgorithm = 'new' | 'legacy';

export function requestedAlgorithm(stored: unknown, released: boolean): SchedulingAlgorithm {
  if (!released || stored === 'legacy') return 'legacy';
  if (stored === null || stored === undefined || stored === 'new') return 'new';
  return 'legacy';
}

export type AgendaOutcome =
  | { kind: 'action'; taskId: string; start: number; end: number }
  | { kind: 'hold' | 'fixed' | 'protected' | 'no-capacity' | 'unavailable'; until: number | null };

export interface AgendaDecision {
  asOf: string;
  snapshotVersion: string;
  requested: SchedulingAlgorithm | 'unknown';
  effective: SchedulingAlgorithm | 'hold';
  policyVersion: string;
  reason: string;
  outcome: AgendaOutcome;
  baseline: AgendaOutcome;
  unresolved?: {taskId:string;reason:string}[];
}
