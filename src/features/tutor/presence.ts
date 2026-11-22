export const LISTENER_FRESH_MS = 30_000;
export type Presence = 'Listening' | 'Replying' | 'Not listening';

export function tutorPresence(now: number, seenAt?: string | null, claimExpiresAt?: string | null, offline?: boolean): Presence {
  if (offline) return 'Not listening';
  if (claimExpiresAt && Date.parse(claimExpiresAt) > now) return 'Replying';
  const seen = seenAt ? Date.parse(seenAt) : Number.NaN;
  return seen <= now && now - seen < LISTENER_FRESH_MS ? 'Listening' : 'Not listening';
}
