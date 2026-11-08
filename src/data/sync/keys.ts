import type { QueryClient } from '@tanstack/react-query'

/** Every known journalled resource maps to the owner's affected query families.
 * Unknown future resources deliberately invalidate the whole owner cache.
 * Never invalidate the in-progress review-items queue on a change event. */
export const RESOURCE_KEYS: Readonly<Record<string, readonly string[]>> = {
 actions: ['history'], action_changes: ['history'],
 subjects: ['subjects', 'projects', 'project', 'atlas', 'home'],
 projects: ['projects', 'project', 'home', 'atlas', 'plan-revisions'],
 concepts: ['atlas', 'project', 'checkpoint', 'home'],
 concept_links: ['atlas', 'project', 'checkpoint'],
 checkpoint_concepts: ['project', 'checkpoint', 'atlas'],
 checkpoint_prereqs: ['project', 'checkpoint', 'atlas'],
 checkpoint_sources: ['project', 'checkpoint', 'source-transcript-stats'],
 checkpoints: ['project', 'checkpoint', 'home', 'atlas'],
 sessions: ['sessions', 'session', 'project', 'home'],
 session_events: ['sessions', 'session', 'project', 'home'],
 session_event_corrections: ['sessions', 'session', 'project', 'home'],
 misconceptions: ['session', 'atlas', 'project'],
 diagnostics: ['session', 'checkpoint', 'project', 'home'],
 sources: ['projects', 'project', 'home', 'source-transcript-stats', 'source-transcript-page'],
 source_pages: ['source-transcript-page', 'source-transcript-stats', 'project'],
 source_revisions: ['source-transcript-stats', 'source-transcript-page', 'project'],
 source_page_revisions: ['source-transcript-stats', 'source-transcript-page'],
 proposals: ['proposals', 'proposal', 'home', 'project', 'plan-revisions'],
 proposal_drafts: ['proposals', 'proposal', 'home', 'project'],
 notes: ['cards', 'card', 'cards-page', 'decks', 'atlas', 'home'],
 cards: ['cards', 'card', 'cards-page', 'decks', 'home', 'insights', 'review-log'],
 card_comments: ['card-comments-page', 'card'],
 reviews: ['card', 'card-history-page', 'cards', 'cards-page', 'decks', 'home', 'insights', 'review-log'],
 review_corrections: ['card', 'card-history-page', 'cards', 'home', 'insights', 'review-log'],
 styles: ['styles', 'project', 'projects'],
 settings: ['settings', 'notify-preview', 'home'],
 tasks: ['tasks', 'task', 'home', 'calendar', 'planner', 'day-plans'],
 deadlines: ['deadlines', 'tasks', 'home', 'calendar', 'planner'],
 calendar_blocks: ['calendar', 'focus', 'time-log', 'home', 'planner', 'day-plans'],
 study_entries: ['focus', 'time-log', 'home', 'calendar', 'progress'],
 study_intervals: ['focus', 'time-log', 'home', 'calendar', 'progress'],
 study_events: ['focus', 'time-log', 'progress', 'home'],
 study_goals: ['home', 'progress', 'focus'],
 presets: ['presets', 'focus', 'settings'],
 day_plans: ['day-plans', 'planner', 'calendar', 'home', 'ritual'],
 day_plan_items: ['day-plans', 'planner', 'calendar', 'home', 'ritual'],
 practice_topics: ['practice', 'calendar', 'home', 'progress'],
 practice_events: ['practice', 'calendar', 'home', 'progress'],
 parked_thoughts: ['focus', 'parked-thoughts', 'home'],
 overlap_acknowledgements: ['calendar', 'planner', 'day-plans'],
 review_runs: ['review-run', 'review-log', 'home'],
 review_run_items: ['review-run', 'review-log', 'home'],
 pending_commands: ['home', 'proposals'],
 notifications: ['notifications-recent', 'notify-preview', 'home'],
 notify_holds: ['notify-holds', 'notify-preview'],
 push_devices: ['push-devices', 'notify-preview'],
 record_aliases: ['atlas', 'project', 'source-transcript-stats'],
 command_receipts: ['history'],
}

export async function invalidateOwnerChanges(
 client: QueryClient,
 resources: readonly string[],
 reset = false,
): Promise<void> {
 if (reset || resources.some(resource => !Object.prototype.hasOwnProperty.call(RESOURCE_KEYS, resource))) {
  // Includes new/unknown owner resources; auth/bootstrap remain managed by
  // their own session lifecycle but may refetch harmlessly on a reset.
  await client.invalidateQueries()
  return
 }
 const prefixes = new Set(resources.flatMap(resource => RESOURCE_KEYS[resource] ?? []))
 await Promise.all([...prefixes].map(prefix => client.invalidateQueries({ queryKey: [prefix] })))
}
