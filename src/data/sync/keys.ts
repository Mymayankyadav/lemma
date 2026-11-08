import type { QueryClient } from '@tanstack/react-query'

/** Query-key prefixes actually consumed by the owner-facing hooks. Unknown
 * resources deliberately fall back to all owner queries, never to silence. */
export const RESOURCE_KEYS: Record<string, readonly string[]> = {
  tasks: ['tasks', 'task', 'home', 'calendar', 'planner'],
  calendar_blocks: ['calendar', 'home', 'focus', 'study-entries'],
  study_entries: ['home', 'focus', 'study-entries', 'time-log', 'insights', 'calendar'],
  study_intervals: ['home', 'focus', 'study-entries', 'time-log', 'insights'],
  day_plans: ['home', 'day-plans', 'planner', 'calendar'],
  day_plan_items: ['home', 'day-plans', 'planner', 'tasks'],
  settings: ['settings', 'notify-preview', 'home'],
  projects: ['projects', 'project', 'home', 'atlas', 'plan-revisions'],
  subjects: ['subjects', 'projects', 'home', 'atlas'],
  sources: ['project', 'projects', 'source-transcript-stats', 'source-transcript-page'],
  source_pages: ['source-transcript-stats', 'source-transcript-page', 'project'],
  sessions: ['sessions', 'session', 'project', 'home'],
  checkpoints: ['checkpoint', 'project', 'home', 'atlas'],
  proposals: ['proposals', 'proposal', 'home', 'project', 'session'],
  proposal_drafts: ['proposals', 'proposal', 'home'],
  notes: ['decks', 'cards', 'cards-page', 'card', 'home', 'atlas'],
  cards: ['decks', 'cards', 'cards-page', 'card', 'review-items', 'home', 'insights'],
  reviews: ['decks', 'card', 'card-history-page', 'review-items', 'home', 'insights', 'review-log'],
  push_devices: ['push-devices', 'notify-preview'],
  notify_holds: ['notify-holds', 'notify-preview'],
  notifications: ['notifications-recent', 'notify-preview'],
};

/** Auth and bootstrap are session coordination, not cached owner records. */
export function isOwnerQuery(query: {queryKey: readonly unknown[]}): boolean {
  return query.queryKey.length > 0 &&
    query.queryKey[0] !== 'auth' && query.queryKey[0] !== 'bootstrap';
}
export async function invalidateOwnerQueries(client: QueryClient): Promise<void> {
  await client.invalidateQueries({predicate: isOwnerQuery});
}
export async function invalidateResources(client: QueryClient, resources: readonly string[]): Promise<void> {
  if (!resources.length) return;
  if (resources.some(resource => !Object.prototype.hasOwnProperty.call(RESOURCE_KEYS, resource))) {
    await invalidateOwnerQueries(client);
    return;
  }
  const keys = new Set(resources.flatMap(resource => RESOURCE_KEYS[resource]));
  await client.invalidateQueries({predicate: query => keys.has(String(query.queryKey[0]))});
}
