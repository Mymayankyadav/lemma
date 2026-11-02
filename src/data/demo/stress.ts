import type { DemoStore, DemoCheckpoint, DemoNote, DemoSession, DemoSource } from "./model";

import type {InsightAggregate,Subject} from "../types";
import {DAY} from "../../lib/calendar";
import {studyDayBounds} from "../../lib/derive";

/**
 * Represent the 50k/300k stored-review pressure using the same bounded daily
 * aggregate shape as the live ST-5 RPC. Materialising 300k review objects in a
 * browser demo would defeat the 4x CPU and transfer budgets, while the real UI
 * only consumes the 7/30/90-day aggregates. Each daily bucket is deterministic,
 * conserves its review/rating counts, and is independent of the browser locale.
 */
export function makeStressInsightAggregate(
 data:DemoStore, days:7|30|90, now:number, timeZone:string, rolloverHour:number,
):InsightAggregate|null {
 const total=data.stressReviewCount??null;
 if(total===null)return null;
 const end=studyDayBounds(now,timeZone,rolloverHour).index;
 const first=end-89;
 const full=Array.from({length:90},(_,i)=>{
  const count=Math.floor(total/90)+(i<total%90?1:0);
  const again=Math.floor(count*.14),hard=Math.floor(count*.20),good=Math.floor(count*.48);
  return {date:new Date((first+i)*DAY).toISOString().slice(0,10),
   count,again,hard,good,easy:count-again-hard-good,right:count-again};
 });
 const reviewDays=full.slice(-days);
 const reviews=reviewDays.reduce((n,row)=>n+row.count,0);
 const right=reviewDays.reduce((n,row)=>n+row.right,0);
 const sure=Math.floor(reviews*.45),unsure=Math.floor(reviews*.35),guess=reviews-sure-unsure;
 const sureRight=Math.min(sure,Math.floor(sure*.94));
 const unsureRight=Math.min(unsure,Math.floor(unsure*.83));
 const calibration:InsightAggregate['calibration']=[
  {confidence:'sure',total:sure,right:sureRight},
  {confidence:'unsure',total:unsure,right:unsureRight},
  {confidence:'guess',total:guess,right:right-sureRight-unsureRight},
 ];
 const start=end-days+1;
 const inWindow=(at:string)=>{
  const timestamp=Date.parse(at);
  return Number.isFinite(timestamp)&&timestamp<=now&&studyDayBounds(timestamp,timeZone,rolloverHour).index>=start;
 };
 // Representative stored histories must not double-count the virtual aggregate.
 const virtualCount=data.stressSessionCount??0;
 const sessions=virtualCount?[]:data.sessions.filter(s=>inWindow(s.startedAt));
 // Deferred browser fixtures keep only a per-project count. Derive the same
 // 90-day synthetic session aggregates without allocating every history row.
 const perProjectInWindow=virtualCount
  ?Math.floor(virtualCount/90)*days+Math.min(days,virtualCount%90):0;
 const totalSessions=virtualCount?perProjectInWindow*data.projects.length:sessions.length;
 const baseMinutes=virtualCount?(data.stressSessionMinutes??0):0;
 const minutes=virtualCount?totalSessions*baseMinutes:sessions.reduce((n,s)=>n+s.minutes,0);
 const sortedMinutes=virtualCount?[]:sessions.map(s=>s.minutes).sort((a,b)=>a-b);
 const middle=Math.floor(sortedMinutes.length/2);
 const typicalSession=virtualCount?baseMinutes:sortedMinutes.length
  ?sortedMinutes.length%2?sortedMinutes[middle]:(sortedMinutes[middle-1]+sortedMinutes[middle])/2
  :null;
 const bySubject=new Map<string,{subject:Subject;minutes:number}>();
 const projectById=new Map(data.projects.map(p=>[p.id,p]));
 const subjectById=new Map(data.subjects.map(s=>[s.id,s]));
 for(const session of sessions){
  const subject=subjectById.get(projectById.get(session.projectId)?.subjectId??'');
  if(!subject)continue;
  const entry=bySubject.get(subject.id)??{subject,minutes:0};
  entry.minutes+=session.minutes;bySubject.set(subject.id,entry);
 }
 if(virtualCount)for(const project of data.projects){
  const subject=subjectById.get(project.subjectId);
  if(!subject)continue;
  const entry=bySubject.get(subject.id)??{subject,minutes:0};
  entry.minutes+=perProjectInWindow*baseMinutes;bySubject.set(subject.id,entry);
 }
 const checkpointDays=Array.from({length:28},(_,i)=>{
  const index=end-27+i;
  const events=data.checkpointEvents.filter(e=>Number.isFinite(Date.parse(e.at))&&
   studyDayBounds(Date.parse(e.at),timeZone,rolloverHour).index===index);
  return {date:new Date(index*DAY).toISOString().slice(0,10),
   demonstrated:events.filter(e=>e.kind==='demonstrated').length,
   rechecked:events.filter(e=>e.kind!=='demonstrated').length};
 });
 const most=data.misconceptions.reduce<(typeof data.misconceptions)[number]|null>(
  (best,item)=>!best||item.times>best.times?item:best,null);
 return {days,reviews,right,reviewDays,calibration,sessions:totalSessions,minutes,typicalSession,
  subjectMinutes:[...bySubject.values()],checkpointDays,
  mostRevisited:most?{label:most.label,times:most.times,
   conceptName:data.concepts.find(c=>c.id===most.conceptId)?.name??null}:null};
}

/** Materialise a single 150/400-event reasoning history only when a session is opened.
 * ST-6's nine-hint runs remain foldable; attempts/evidence/rechecks remain visible.
 */
export function stressSessionEvents(session: Pick<DemoSession, "id" | "checkpointCode"> & Partial<Pick<DemoSession, "startedAt" | "lastActivityAt">>, count: number): DemoSession["events"] {
  const match = /^stress-session-(\d+)-(\d+)$/.exec(session.id);
  if (!match || !Number.isSafeInteger(count) || count < 0) return [];
  const projectIndex = Number(match[1]), number = Number(match[2]);
  const start = Date.parse(session.startedAt ?? ""), end = Date.parse(session.lastActivityAt ?? "");
  const hydrated = Number.isFinite(start) && Number.isFinite(end) && end >= start;
  // Authored @day tokens resolve on hydration; on-demand virtual sessions already
  // carry ISO bounds. Both paths put every event inside its ended session.
  const offset = (number - 1) % 90;
  return Array.from({length: count}, (_, index) => {
    const progress = (index + 1) / (count + 1);
    const createdAt = hydrated
      ? new Date(start + (end - start) * progress).toISOString()
      : `@day:-${offset}:${(0.3 + 0.3 * progress).toFixed(10)}:0`;
    const phase = index % 12;
    const kind = phase < 9 ? "hint" as const : phase === 9 ? "attempt" as const
      : phase === 10 ? "evidence" as const : "recheck" as const;
    return {
      id: (projectIndex * 1000 + number) * count + index + 1,
      kind,
      body: `${kind === "hint" ? "Hint" : kind === "attempt" ? "Attempt" : kind === "evidence" ? "Evidence" : "Recheck"} ${index + 1}: justify each inference using the hypotheses of the lemma.`,
      outcome: kind === "evidence" ? "demonstrated" as const : kind === "attempt" ? "partial" as const : null,
      hintLevel: kind === "hint" ? phase + 1 : null,
      checkpointCode: session.checkpointCode,
      createdAt,
    };
  });
}

export function stressSourcePage(source: Pick<DemoSource, "id" | "hasText" | "pageCount">, page: number) {
  if (!source.id.startsWith("stress-source-") || !source.hasText
      || !Number.isSafeInteger(page) || page < 1 || page > (source.pageCount ?? 0)) return null;
  return {page, label: String(page),
    body: `Synthetic mathematics notes, page ${page}. Prove the stated lemma and cite its hypotheses.`,
    transcribedBy: null, transcribedAt: null, confidence: null};
}

/** Build the real note rows only when a route needs card content. */
/** Heavy, immutable stress note examples are shared by every 50-row Cards page. */
const STRESS_LONG_FRONT = "State and prove the necessary and sufficient conditions. ".repeat(30).slice(0, 1500);
const STRESS_LONG_BACK = "First establish the hypotheses, then prove both directions. ".repeat(60).slice(0, 3000);
const STRESS_MATRIX = String.raw`$$\begin{pmatrix}${Array.from({length:10},(_,r)=>Array.from({length:10},(_,c)=>r===c?"1":"0").join("&")).join(String.raw`\\`)}\end{pmatrix}$$`;
const STRESS_ALIGNED = String.raw`$$\begin{STRESS_ALIGNED}${Array.from({length:25},(_,i)=>`a_${i+1}&=a_${i}+1`).join(String.raw`\\`)}\end{STRESS_ALIGNED}$$`;
const STRESS_SUM = String.raw`$$\sum_{i=1}^{60} ${Array.from({length:60},(_,i)=>`x_${i+1}`).join("+")}$$`;
const STRESS_INLINE = String.raw`$\operatorname{${"longexpression".repeat(10)}}$`;

export function makeStressNotes(baseNote:DemoNote,projects:DemoStore['projects'],cardCount:number,dueCount:number,startIndex=0):DemoNote[]{
 const notes:DemoNote[]=[];
  for (let i = startIndex; i < startIndex + cardCount; i++) {
    const project = projects[i % projects.length];
    const no = i + 1;
    const note: DemoNote = {
      ...baseNote, projectId: project.id, sessionId: null, conceptId: null,
      note: {
        ...baseNote.note, noteId: `stress-note-${no}`, noteNo: no,
        projectSlug: project.slug, checkpointCode: `CP${(i % 36) + 1}`,
        front: i === 0 ? STRESS_LONG_FRONT : i === 2 ? STRESS_MATRIX : i === 3 ? STRESS_ALIGNED : i === 4 ? STRESS_SUM : i === 5 ? STRESS_INLINE : `Recall the definition in card ${no}?`,
        back: i === 0 ? STRESS_LONG_BACK : `Prove the statement for card ${no}.`,
        status: "active", sessionNumber: null, sourceShort: null, pageLabel: null,
      },
      cards: [{ id: `stress-card-${no}`, ord: 1, state: {
        ...baseNote.cards[0].state, due: i < dueCount ? "@due:-1" : "@due:14",
        lastReview: "@day:-14:0.5:0",
      }}],
      comments: [],
    };
    notes.push(note);
  }
 return notes;
}

/** Deterministic full Atlas; defer it until an Atlas/idea route needs it. */
export function fillStressAtlas(data:DemoStore,ideaCount:number,linkCount:number,baseConcept:DemoStore['concepts'][number]):void{
  for (let i = data.concepts.length; i < ideaCount; i++) {
    const subject = data.subjects[i % data.subjects.length];
    data.concepts.push({
      ...baseConcept, id: `stress-idea-${i}`, slug: `stress-idea-${i}`,
      name: `Idea ${i}: ${i % 7 === 0 ? "Long mathematical statement" : "Definition"}`,
      blurb: `A mathematical idea with index ${i}`, subjectId: subject.id,
      level: "planet", parentId: null, isStar: false, pinX: null, pinY: null,
    });
  }
  // Deterministic DAG links; avoid duplicates and self-loops.
  const linkKeys = new Set(data.links.map(link => `${link.fromId}:${link.toId}:${link.kind}`));
  for (let offset = 1; data.links.length < linkCount && offset < ideaCount; offset++) {
    for (let i = 0; i + offset < ideaCount && data.links.length < linkCount; i++) {
      const fromId = data.concepts[i].id, toId = data.concepts[i + offset].id;
      const key = `${fromId}:${toId}:prereq`;
      if (!linkKeys.has(key)) {
        data.links.push({ fromId, toId, kind: "prereq" });
        linkKeys.add(key);
      }
    }
  }

}


/** Generate the exact source rows for one stress project. Shared by full
 * fixture materialization and direct project reads, so neither route can
 * silently diverge on IDs, kinds, dates, or representative source metadata.
 */
export function makeStressProjectSources(
  firstSource:DemoSource, existing:readonly DemoSource[],
  project:DemoStore['projects'][number],projectIndex:number,
  projectCount:number,sourceTarget:number,extreme:boolean,
):DemoSource[]{
  const rows=[...existing];
  const sourceKinds=["book","notes","slides","problems","syllabus","exam","other"] as const;
  for(let i=existing.length;i<sourceTarget;i++){
    const representative=(projectIndex===0||projectIndex===projectCount-1)&&i===existing.length;
    rows.push({
      ...firstSource,
      id:`stress-source-${projectIndex}-${i}`,projectId:project.id,
      title:`Source ${i+1}: mathematical notes and proofs`,
      short:`stresssrc${i}`,filename:`source-${i+1}.pdf`,
      kind:representative?"notes":sourceKinds[i%sourceKinds.length],position:i,
      pageCount:extreme?3000:1200,
      status:"ready",hasText:representative,outline:[],pages:[],
      sha256:null,createdAt:`@day:-${i%60}:0.5:0`,
      addedAt:`@day:-${i%60}:0.5:0`,planCheckedAt:null,
    });
  }
  return rows;
}

/** Generate exact per-project stress sources only when a source route needs them. */
export function fillStressSources(data:DemoStore,sourceTarget:number,extreme:boolean):void{
  const original=[...data.sources];
  const firstSource=original.find(source=>source.projectId===data.projects[0].id);
  if(!firstSource)throw Error("Stress fixture requires a seeded project source");
  for(const [projectIndex,project] of data.projects.entries()){
    const existing=original.filter(source=>source.projectId===project.id);
    const generated=makeStressProjectSources(firstSource,existing,project,projectIndex,
      data.projects.length,sourceTarget,extreme);
    data.sources.push(...generated.slice(existing.length));
  }
}

/** Pure, repeatable stress profiles. No network calls, dates or random IDs. */
export type StressProfile = "stress" | "extreme";

export function makeStressStore(original: DemoStore, profile: StressProfile, options: {deferSessions?: boolean;deferNotes?:boolean;deferAtlas?:boolean;deferSources?:boolean} = {}): DemoStore {
  // The stress profile replaces these collections in full. Cloning the seed's
  // 1,300 historical reviews (and their nested FSRS states) before throwing
  // them away needlessly blocks the first Today paint under 4x CPU. Keep one
  // actual note/session/proposal template and all persistent curriculum data.
  // The generated 5k/30k notes and review aggregate are still materialized
  // exactly as before; this only removes discarded intermediate work.
  const data: DemoStore = structuredClone({
    ...original,
    notes: original.notes.slice(0, 1),
    sessions: original.sessions.slice(0, 1),
    proposals: original.proposals.slice(0, 1),
    reviews: [],
    misconceptions: [],
    checkpointEvents: [],
  });
  const extreme = profile === "extreme";
  const projectCount = extreme ? 60 : 15;
  const checkpointCount = extreme ? 100 : 40;
  const ideaCount = extreme ? 2500 : 600;
  const linkCount = extreme ? 8000 : 1500;
  const cardCount = extreme ? 30000 : 5000;
  const dueCount = extreme ? 4000 : 600;
  const proposalCount = extreme ? 600 : 150;
  const sessionCount = extreme ? 1000 : 300;
  const subjectCount = extreme ? 40 : 15;
  // Keep two real mathematical stage names in the stress project so browser
  // acceptance checks the rendered KaTeX font and recoverable long-name scroll.
  // The stage count and checkpoint grouping remain exactly fifteen.
  const stageName=(projectIndex:number,position:number,total:number)=>{
    const stage=Math.min(15,Math.floor((position-1)*15/total)+1);
    if(projectIndex===3&&stage===14)return String.raw`Topology of $\mathbb{R}^n$`;
    if(projectIndex===3&&stage===15)return String.raw`\(\operatorname{verylongmathematicalstageverylongmathematicalstageverylongmathematicalstage}\)`;
    return `Stage ${stage}`;
  };
  const baseProject = data.projects[0];
  const baseCheckpoint = data.checkpoints[0];
  const baseNote = data.notes[0];
  const baseSession = data.sessions[0];
  const baseProposal = data.proposals[0];
  const baseConcept = data.concepts[0];
  if (!baseProject || !baseCheckpoint || !baseNote || !baseSession || !baseProposal || !baseConcept) {
    throw Error("Stress fixture requires the seeded demo records");
  }

  for (let i = data.subjects.length; i < subjectCount; i++) {
    data.subjects.push({ id: `subject-stress-${i}`, name: `Subject ${i + 1}`, glyph: "∑", hue: "slate", position: i });
  }
  for (let i = data.projects.length; i < projectCount; i++) {
    data.projects.push({
      ...baseProject, id: `project-stress-${i}`, slug: `stress-project-${i}`,
      title: `Mathematics project ${i + 1}`, subjectId: data.subjects[i % data.subjects.length].id,
      goal: `Prove the main results in subject ${i + 1}`, targetDate: "@date:90",
      targetLabel: "Exam", lastActivityAt: `@day:-${i % 30}:0.5:0`,
    });
  }

  // Preserve the owner's actual failure shape: 36 checkpoints without any stage.
  // A separate project has 100 checkpoints and 15 stages in the extreme profile.
  for (const [pIndex, project] of data.projects.entries()) {
    const count = pIndex === 0 ? 36 : checkpointCount;
    const existing = data.checkpoints.filter(cp => cp.projectId === project.id);
    for (const cp of existing) {
      if (pIndex === 0) cp.stage = undefined;
    }
    for (let n = existing.length + 1; n <= count; n++) {
      const code = `CP${n}`;
      const cp: DemoCheckpoint = {
        ...baseCheckpoint, id: `${project.id}-cp-${n}`, projectId: project.id, code,
        title: `Checkpoint ${n}: a proof with precise hypotheses`, position: n * 10,
        objective: `Prove the result in ${code}`, criterion: "Give a complete proof without hints",
        status: n === 4 ? "in_progress" : n < 4 ? "demonstrated" : "not_started",
        currentStep: n < 4 ? 3 : 0, recheckLevel: 0, recheckDue: null,
        recheckPrompt: `Explain the argument for ${code}`, needsRevisit: false,
        prereqs: n > 1 ? [`CP${n - 1}`] : [], conceptIds: [],
        stage: pIndex === 0 ? undefined : stageName(pIndex,n,count),
        dueOn: `@date:${n - 10}`, demonstratedAt: n < 4 ? "@date:-10" : null,
      };
      data.checkpoints.push(cp);
    }
    if (pIndex > 0) {
      for (const cp of existing) {
        const n = Number(cp.code.replace("CP", ""));
        cp.stage = stageName(pIndex,n,count);
      }
    }
  }

  const sourceTarget=extreme?100:30;
  if(options.deferSources)data.stressSourceTarget=sourceTarget;
  else fillStressSources(data,sourceTarget,extreme);

  if(options.deferAtlas){
    data.stressAtlasIdeaCount=ideaCount;
    data.stressAtlasLinkCount=linkCount;
  }else fillStressAtlas(data,ideaCount,linkCount,baseConcept);

  data.reviews = [];
  data.stressReviewCount = extreme ? 300000 : 50000;
  if(options.deferNotes){
    data.notes=[];
    data.stressNoteCount=cardCount;
    data.stressDueCount=dueCount;
  }else{
    data.notes=makeStressNotes(baseNote,data.projects,cardCount,dueCount);
  }
  const eventCount = extreme ? 400 : 150;
  data.sessions = [];
  // The browser virtualises sessions so unrelated routes never hydrate 60,000
  // records. The default generator remains fully materialised for fixture tests.
  if (options.deferSessions) {
    data.stressSessionCount = sessionCount;
    data.stressSessionMinutes = baseSession.minutes;
    // Keep two real long histories for ST-6 visual acceptance; all other
    // sessions remain virtual and do not inflate unrelated route startup.
    for (const [projectIndex, number] of [[0,7],[projectCount-1,1]] as const) {
      const project = data.projects[projectIndex];
      const id = `stress-session-${projectIndex}-${number}`;
      const checkpointCode = `CP${((number-1)%36)+1}`;
      data.sessions.push({
        ...baseSession, id, projectId:project.id, number, checkpointCode,
        goal:`Study session ${number} for ${project.title}`, state:"ended",
        startedAt:`@day:-${(number-1)%90}:0.3:0`,
        lastActivityAt:`@day:-${(number-1)%90}:0.6:0`,
        events:stressSessionEvents({id,checkpointCode},eventCount),
      });
    }
  }
  else for (const [projectIndex, project] of data.projects.entries()) {
    for (let index = 0; index < sessionCount; index++) {
      const number = index + 1;
      const fullHistory = (projectIndex === 0 && number === 7)
        || (projectIndex === projectCount - 1 && number === 1);
      const sessionId = `stress-session-${projectIndex}-${number}`;
      const checkpointCode = `CP${(index % 36) + 1}`;
      const events = fullHistory ? stressSessionEvents({id: sessionId, checkpointCode}, eventCount) : [];
      data.sessions.push({
        ...baseSession,
        id: sessionId,
        projectId: project.id,
        number,
        checkpointCode,
        goal: `Study session ${number} for ${project.title}`,
        state: "ended",
        startedAt: `@day:-${index % 90}:0.3:0`,
        lastActivityAt: `@day:-${index % 90}:0.6:0`,
        events,
      });
    }
  }
  // Keep a real plan-change proposal at the route exercised by the ST-0
  // matrix. Previously the generated IDs replaced proposal-6, so the route
  // showed an error while the all-route test still passed.
  const planProposal = original.proposals.find(p => p.id === "proposal-6" && p.kind === "plan_change");
  if (!planProposal) throw Error("Stress fixture requires proposal-6 plan change");
  // Keep the 36-checkpoint no-stage baseline exact: a pending amendment
  // would add CP4a to its project timeline. Put the genuine plan-change
  // payload on the last stress project instead, which has matching CP codes.
  const stressPlanProposal = structuredClone(planProposal);
  const proposalProject = data.projects[projectCount - 1];
  stressPlanProposal.projectSlug = proposalProject.slug;
  stressPlanProposal.projectGlyph = data.subjects.find(s => s.id === proposalProject.subjectId)?.glyph ?? stressPlanProposal.projectGlyph;
  data.proposals = [stressPlanProposal];
  for (let i = 1; i < proposalCount; i++) {
    const project = data.projects[i % data.projects.length];
    data.proposals.push({
      ...baseProposal, id: `stress-proposal-${i}`, projectSlug: project.slug,
      reason: `Tutor proposal ${i + 1}`, createdAt: `@day:-${i % 10}:0.5:0`,
      status: "pending", card: baseProposal.card ? {...baseProposal.card, front: `Explain idea ${i + 1}.`} : null,
    });
  }
  data.misconceptions = [];
  data.checkpointEvents = [];
  data.seed = extreme ? 2026103102 : 2026103101;
  // Keep the backlog real: dueCount describes overdue cards, not the daily quota.
  // A 4,000-card backlog must still offer a bounded 200-card daily share.
  data.settings.reviewsPerDay = 200;
  data.settings.newPerDay = 20;
  return data;
}
