import type { DemoStore, DemoCheckpoint, DemoNote } from "./model";

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
 const sessions=data.sessions.filter(s=>inWindow(s.startedAt));
 const minutes=sessions.reduce((n,s)=>n+s.minutes,0);
 const sortedMinutes=sessions.map(s=>s.minutes).sort((a,b)=>a-b);
 const middle=Math.floor(sortedMinutes.length/2);
 const typicalSession=sortedMinutes.length
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
 return {days,reviews,right,reviewDays,calibration,sessions:sessions.length,minutes,typicalSession,
  subjectMinutes:[...bySubject.values()],checkpointDays,
  mostRevisited:most?{label:most.label,times:most.times,
   conceptName:data.concepts.find(c=>c.id===most.conceptId)?.name??null}:null};
}

/** Pure, repeatable stress profiles. No network calls, dates or random IDs. */
export type StressProfile = "stress" | "extreme";

export function makeStressStore(original: DemoStore, profile: StressProfile): DemoStore {
  const data = structuredClone(original);
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
        stage: pIndex === 0 ? undefined : `Stage ${Math.min(15, Math.floor((n - 1) * 15 / count) + 1)}`,
        dueOn: `@date:${n - 10}`, demonstratedAt: n < 4 ? "@date:-10" : null,
      };
      data.checkpoints.push(cp);
    }
    if (pIndex > 0) {
      for (const cp of existing) {
        const n = Number(cp.code.replace("CP", ""));
        cp.stage = `Stage ${Math.min(15, Math.floor((n - 1) * 15 / count) + 1)}`;
      }
    }
  }

  // F2: exercise the per-project source limit, not just the first project.
  // Page counts are metadata; materialising thousands of dummy PDF pages per
  // source would turn the fixture into a memory test instead of a UI stress test.
  const firstSource = data.sources.find(source => source.projectId === baseProject.id);
  if (!firstSource) throw Error("Stress fixture requires a seeded project source");
  const sourceKinds = ["book", "notes", "slides", "problems", "syllabus", "exam", "other"] as const;
  const sourceTarget = extreme ? 100 : 30;
  const existingByProject = new Map<string,number>();
  for (const source of data.sources)
    existingByProject.set(source.projectId,(existingByProject.get(source.projectId)??0)+1);
  for (const [projectIndex,project] of data.projects.entries()) {
    const existing = existingByProject.get(project.id)??0;
    for (let i=existing;i<sourceTarget;i++) {
      data.sources.push({
        ...firstSource,
        id: `stress-source-${projectIndex}-${i}`, projectId:project.id,
        title: `Source ${i+1}: mathematical notes and proofs`,
        short: `stresssrc${i}`, filename:`source-${i+1}.pdf`,
        kind:sourceKinds[i%sourceKinds.length],position:i,
        pageCount:extreme?3000:1200,
        status:"ready",hasText:false,outline:[],pages:[],
        sha256:null,createdAt:`@day:-${i%60}:0.5:0`,
        addedAt:`@day:-${i%60}:0.5:0`,planCheckedAt:null,
      });
    }
  }

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

  // Long faces and four representative maths stress cases remain real card content.
  const longFront = "State and prove the necessary and sufficient conditions. ".repeat(30).slice(0, 1500);
  const longBack = "First establish the hypotheses, then prove both directions. ".repeat(60).slice(0, 3000);
  const matrix = String.raw`$$\begin{pmatrix}${Array.from({length:10},(_,r)=>Array.from({length:10},(_,c)=>r===c?"1":"0").join("&")).join(String.raw`\\`)}\end{pmatrix}$$`;
  const aligned = String.raw`$$\begin{aligned}${Array.from({length:25},(_,i)=>`a_${i+1}&=a_${i}+1`).join(String.raw`\\`)}\end{aligned}$$`;
  const sum = String.raw`$$\sum_{i=1}^{60} ${Array.from({length:60},(_,i)=>`x_${i+1}`).join("+")}$$`;
  const inline = String.raw`$\operatorname{${"longexpression".repeat(10)}}$`;
  data.notes = [];
  // ST-5-style bounded server aggregate represents the stored review pressure.
  data.reviews = [];
  data.stressReviewCount = extreme ? 300000 : 50000;
  for (let i = 0; i < cardCount; i++) {
    const project = data.projects[i % data.projects.length];
    const no = i + 1;
    const note: DemoNote = {
      ...baseNote, projectId: project.id, sessionId: null, conceptId: null,
      note: {
        ...baseNote.note, noteId: `stress-note-${no}`, noteNo: no,
        projectSlug: project.slug, checkpointCode: `CP${(i % 36) + 1}`,
        front: i === 0 ? longFront : i === 2 ? matrix : i === 3 ? aligned : i === 4 ? sum : i === 5 ? inline : `Recall the definition in card ${no}?`,
        back: i === 0 ? longBack : `Prove the statement for card ${no}.`,
        status: "active", sessionNumber: null, sourceShort: null, pageLabel: null,
      },
      cards: [{ id: `stress-card-${no}`, ord: 1, state: {
        ...baseNote.cards[0].state, due: i < dueCount ? "@due:-1" : "@due:14",
        lastReview: "@day:-14:0.5:0",
      }}],
      comments: [],
    };
    data.notes.push(note);
  }
  // Audit #462: sessions are per project, not shared across the entire library.
  // Materialise long event histories for the actual /s/real-analysis/7 route
  // and a second project's first session. The remaining sessions exercise list
  // pagination without allocating millions of repetitive event objects.
  const eventCount = extreme ? 400 : 150;
  // ST-6 acceptance expects foldable nine-hint runs followed by visible evidence steps.
  const eventKind = (index: number) => {
    const phase = index % 12;
    return phase < 9 ? "hint" as const : phase === 9 ? "attempt" as const
      : phase === 10 ? "evidence" as const : "recheck" as const;
  };
  data.sessions = [];
  for (const [projectIndex, project] of data.projects.entries()) {
    for (let index = 0; index < sessionCount; index++) {
      const number = index + 1;
      const fullHistory = (projectIndex === 0 && number === 7)
        || (projectIndex === projectCount - 1 && number === 1);
      const events = fullHistory
        ? Array.from({length: eventCount}, (_, eventIndex) => {
            const kind = eventKind(eventIndex);
            return {
              id: projectIndex * sessionCount * eventCount + index * eventCount + eventIndex + 1,
              kind,
              body: `Reasoning step ${eventIndex + 1}: justify the inference using the hypotheses of the lemma.`,
              outcome: kind === "evidence" ? "demonstrated" as const : kind === "attempt" ? "partial" as const : null,
              hintLevel: kind === "hint" ? (eventIndex % 12) + 1 : null,
              checkpointCode: `CP${(index % 36) + 1}`,
              createdAt: `@day:-${index % 90}:0.5:0`,
            };
          })
        : [];
      data.sessions.push({
        ...baseSession,
        id: `stress-session-${projectIndex}-${number}`,
        projectId: project.id,
        number,
        checkpointCode: `CP${(index % 36) + 1}`,
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
