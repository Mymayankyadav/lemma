import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { LemmaError } from '../api'
import type { CardComment, CardState, CheckpointView, Project, SessionSummary, Settings, Source, Style, Subject } from '../types'
import { checkpointUi, sessionDisplay } from '../../lib/derive'
import { supabaseUrl } from '../env'

export type Row = Record<string, any>
export const snake = (name: string) => name.replace(/[A-Z]/g, x => '_' + x.toLowerCase())
export function toDb(patch: Record<string, unknown>): Row {
  return Object.fromEntries(Object.entries(patch).map(([key, value]) => [snake(key), value]))
}
export function fail(error: unknown): never {
  if (error instanceof LemmaError) throw error
  const err = error as Partial<PostgrestError> & { message?: string; name?: string; status?: number }
  const message = err?.message ?? 'Unexpected Supabase failure'
  if (typeof navigator !== 'undefined' && !navigator.onLine || /failed to fetch|networkerror|network request failed/i.test(message))
    throw new LemmaError('offline', 'You appear to be offline. Try again when connected.')
  if (err?.status === 401 || err?.status === 403 || err?.code === '42501' || /jwt expired|invalid jwt/i.test(message))
    throw new LemmaError('auth', message)
  if (err?.code === 'PGRST116' || err?.code === '22P02' || err?.code === '23503') throw new LemmaError('not_found', message)
  if (err?.code === '23505' || /already|conflict|only the last answer/i.test(message))
    throw new LemmaError('conflict', message)
  if (err?.code === '23514' || err?.code === '22001' || /invalid|cannot|must /i.test(message))
    throw new LemmaError('invalid', message)
  throw new LemmaError('server', message)
}
export function checked<T>(result: {data: T | null; error: unknown}): T {
  if (result.error) return fail(result.error)
  if (result.data === null) throw new LemmaError('not_found', 'The requested record was not found')
  return result.data
}
export async function owner(db: SupabaseClient): Promise<string> {
  const {data, error} = await db.auth.getUser()
  if (error) return fail(error)
  if (!data.user) throw new LemmaError('auth', 'Sign in to Lemma first')
  return data.user.id
}
/** Supabase/PostgREST truncates unpaged selections at the API max (usually 1000). */
export async function rows(db: SupabaseClient, table: string, uid: string, includeArchived=false): Promise<Row[]> {
  const output: Row[] = []
  const size = 1000
  for (let start=0; ;start+=size) {
    let query = db.from(table).select('*').eq('user_id', uid)
    if (table === 'projects'&&!includeArchived) query = query.neq('status', 'archived')
    const batch = checked((await query.range(start,start+size-1)) as {
      data: Row[] | null; error: unknown
    })
    output.push(...batch)
    if (batch.length < size) break
  }
  return output
}
export function settingsRow(r: Row): Settings {
  return {
    notify:r.notify??null,
    desiredRetention:r.desired_retention, newPerDay:r.new_per_day, reviewsPerDay:r.reviews_per_day,
    learnSteps:r.learn_steps, relearnSteps:r.relearn_steps, rolloverHour:r.rollover_hour, maxIntervalDays:r.max_interval_days,
    fuzz:r.fuzz, loadBalance:r.load_balance, learnAheadMinutes:r.learn_ahead_minutes,
    fsrsWeights:r.fsrs_weights, fsrsTunedAt:r.fsrs_tuned_at, macros:r.macros,
    defaultStyle:r.default_style, tutorRules:r.tutor_rules, mixDecks:r.mix_decks,
    preferredChat:r.preferred_chat,
    connectorUrl:`${supabaseUrl ?? ''}/functions/v1/mcp/${r.connector_secret}`,
    connectorLastSeenAt:r.connector_last_seen_at, connectorLastClient:r.connector_last_client, timeZone:r.time_zone,
  }
}
export function styleRow(r: Row): Style {
  return {key:r.key,name:r.name,icon:r.icon,instructions:r.instructions,position:r.position}
}
export function subjectRow(r: Row): Subject {
  return {id:r.id,name:r.name,glyph:r.glyph,hue:r.hue,position:r.position}
}
export function projectRow(r: Row): Project {
  return {id:r.id,slug:r.slug,title:r.title,goal:r.goal??'',style:r.style??'socratic',status:r.status,subjectId:r.subject_id??'',createdAt:r.created_at,pinned:r.pinned??false,system:r.system??false,targetDate:r.target_date??null,targetLabel:r.target_label??null}
}
export function sourceRow(r: Row): Source {
  return {id:r.id,projectId:r.project_id,title:r.title,short:r.short,filename:r.filename,bytes:r.bytes??null,pageCount:r.page_count,status:r.status,hasText:r.has_text,outline:r.outline ?? [],createdAt:r.created_at,kind:r.kind??'other',sha256:r.sha256??null,position:r.position??0,addedAt:r.added_at??r.created_at,planCheckedAt:r.plan_checked_at??null,origin:r.origin??'user'}
}
export function cardState(r: Row): CardState {
  return {state:r.state,due:r.due,stability:r.stability,difficulty:r.difficulty,lastReview:r.last_review,step:r.step,reps:r.reps,lapses:r.lapses}
}
export function cardStateDb(s: CardState): Row {
  return {state:s.state,due:s.due,stability:s.stability,difficulty:s.difficulty,last_review:s.lastReview,step:s.step,reps:s.reps,lapses:s.lapses}
}
export function commentRow(r: Row, proposalOrigin: string | null = null): CardComment {
  return {no:Number(r.no),body:r.body,status:r.status,createdAt:r.created_at,resolvedAt:r.resolved_at,resolvedByOrigin:proposalOrigin as CardComment['resolvedByOrigin']}
}
export function sessionRow(r: Row, projectSlug: string, checkpointCode: string | null): SessionSummary {
  return {id:r.id,projectSlug,number:r.number,goal:r.goal,checkpointCode,client:r.client,
    display:sessionDisplay({state:r.state,lastActivityAt:r.last_activity_at}),goalMet:r.goal_met,
    startedAt:r.started_at,lastActivityAt:r.last_activity_at,minutes:r.minutes}
}
export function checkpointRow(r: Row, prereqs: readonly CheckpointView[] = [], today?: string): CheckpointView {
  return {id:r.id,code:r.code,title:r.title,position:r.position,
    ui:checkpointUi({status:r.status,needsRevisit:r.needs_revisit,recheckDue:r.recheck_due},prereqs.map(p=>p.ui),today),
    currentStep:r.current_step,stepsTotal:(r.steps as string[]).length,
    recheckDue:r.recheck_due,dueCards:0}
}
export function slugify(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)
}
export function noteOrds(front: string, type: string): number[] {
  if (type === 'reverse') return [1,2]
  if (type !== 'cloze') return [1]
  const ords = [...new Set([...front.matchAll(/\{\{c([1-9]\d*)::/gi)].map(m=>Number(m[1])))]
  return ords.length ? ords.sort((a,b)=>a-b) : [1]
}
