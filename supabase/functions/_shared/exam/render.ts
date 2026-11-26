import type {ExamAction, ExamPlan, ExamSitting} from './plan.ts';

const oneLine = (s: string, limit = 120) => s.replace(/\s+/g, ' ').trim().slice(0, limit);
const marks = (n: number) => String(Math.round(n * 10) / 10);
export function localExamTime(instant: string | null | undefined, zone: string) {
  if (!instant) return 'date to confirm';
  return new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: zone, timeZoneName: 'short'}).format(new Date(instant));
}
export function examTimeLeft(starts: string | null, now: string) {
  if (!starts) return 'date to confirm';
  const delta = Date.parse(starts) - Date.parse(now), minutes = Math.floor(Math.abs(delta) / 60_000);
  const hours = Math.floor(minutes / 60), days = Math.floor(hours / 24);
  const amount = days ? `${days} d ${hours % 24} h` : hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
  return delta > 0 ? `in ${amount}` : `${amount} ago`;
}
export const describeAction = (a: ExamAction) => `${a.kind}${a.keys.length ? ' ' + a.keys.join(' + ') : ''}${a.minutes ? ` (${a.minutes} min)` : ''}`;
export function coverageLine(plan: ExamPlan, sitting: ExamSitting) {
  const {accounted, secure, deferred} = plan.coverage;
  return `accounted ${marks(accounted)}/${sitting.total_marks ?? '?'} · independently covered ${marks(secure)} · deferred ${marks(deferred)}`;
}
export function renderExam(sitting: ExamSitting, slug: string, plan: ExamPlan, now: string, ideas: number, limit = 3000) {
  const {bookmark} = sitting;
  const title = `EXAM ${oneLine(sitting.title)} [${slug}] · ${sitting.status} · phase ${sitting.phase} · ${localExamTime(sitting.starts_at, sitting.time_zone)} (${examTimeLeft(sitting.starts_at, now)})`;
  const header = [title, [sitting.duration_minutes && `${sitting.duration_minutes}-min paper`, sitting.total_marks && `${sitting.total_marks} marks`, sitting.objective === 'pass_threshold' ? `goal: pass at ${sitting.pass_marks}` : 'goal: expected marks'].filter(Boolean).join(' · '),
    `TIME budget ${plan.minutes ?? 'unknown'} min${sitting.study_minutes_set_at ? ` (set ${localExamTime(sitting.study_minutes_set_at, sitting.time_zone)})` : ''}${sitting.last_study_at ? ` · study until ${localExamTime(sitting.last_study_at, sitting.time_zone)}` : ''}`,
    'ROWS key · expected marks · evidence · disposition · rough marks exposed'];
  const tail = [`COVERAGE ${coverageLine(plan, sitting)} · ${plan.conflicts.length ? 'conflicts ' + plan.conflicts.length : 'conflicts none'}`,
    ...plan.conflicts.slice(0,2).map(s => 'CONFLICT ' + oneLine(s, 120)), `NEXT ${describeAction(plan.next)}`,
    ...(plan.runnerUp ? [`RUNNER-UP ${describeAction(plan.runnerUp)}`] : []), `WHY ${plan.next.why}`,
    `CARD IDEAS ${ideas} open · BOOKMARK ${bookmark?.checkpoint ? `${bookmark.checkpoint}${bookmark.step ? ` step ${bookmark.step}/${bookmark.steps ?? '?'}` : ''}${bookmark.session ? ' S'+bookmark.session : ''}${bookmark.question ? ' '+oneLine(bookmark.question,100) : ''}` : 'no course checkpoint captured'}`];
  const lines = [...header], reserved = tail.join('\n').length + 1;
  let remaining = limit - lines.join('\n').length - reserved - 1;
  for (const [i, r] of plan.rows.entries()) {
    const disposition = r.disposition ? `${r.disposition.disposition} ${oneLine(r.disposition.reason ?? '',80)}${r.disposition.reopen ? ' · reopen: '+oneLine(r.disposition.reopen,50) : ''}`.trim() : '—';
    const line = `${r.row.key} · ${marks(r.expected)}${r.row.marks_low != null || r.row.marks_high != null ? ` [${marks(r.low)}–${marks(r.high)}]` : ''}${r.row.provisional ? ' provisional' : ''} · ${r.status} (${r.fact}) · ${disposition} · ${marks(r.exposure)} exposed`;
    if (line.length + 30 > remaining) { lines.push(`… ${plan.rows.length-i} more rows`); break; }
    lines.push(line); remaining -= line.length + 1;
  }
  return [...lines, ...tail].join('\n').slice(0, limit);
}
export function renderExamResume(s: ExamSitting, slug: string, plan: ExamPlan | undefined, now: string, ideas: number, rules: string) {
  const when = `${localExamTime(s.starts_at,s.time_zone)} (${examTimeLeft(s.starts_at,now)})`;
  if (s.status === 'finished') return ideas ? `CARD IDEAS ${ideas} open from ${oneLine(s.title)}. Offer after the first course task: draft, link, keep or dismiss.` : '';
  const start = `EXAM ${oneLine(s.title)} · ${s.status} · ${when}`;
  if (s.starts_at && Date.parse(s.starts_at) <= Date.parse(now) && ['active','paused'].includes(s.status)) return `${start} · Ask whether it took place. Finish with happened true/false or set the postponed date.`;
  if (s.status !== 'active' || !plan) return `${start} · activate exam_sittings to resume prep. Course study continues below.`;
  return [`${start} · ${s.total_marks ?? '?'} marks · phase ${s.phase} · budget ${plan.minutes ?? '?'} min`,
    `PLANNER get(what=exam, project=${slug}) · ${coverageLine(plan,s)}`,
    `NEXT ${describeAction(plan.next)}${plan.runnerUp ? ' · runner-up '+describeAction(plan.runnerUp) : ''}`,
    ...(rules ? ['EXAM RULES',rules] : [])].join('\n').slice(0,1500);
}
