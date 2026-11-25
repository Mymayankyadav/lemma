// Shadow forecasts are frozen before the answer. Only the qualitative plan is served.
import type {ExamAction, ExamPlan, ExamRow, ExamSnapshot, EvidenceStatus} from './plan.ts';

export type Triplet = [number, number, number];
export const answers = ['correct', 'partial', 'incorrect', 'unscorable'] as const;
type Outcome = typeof answers[number];
type Likelihood = [number, number, number, number];
interface Component {key:string; gap:number; gainIfGap:Triplet; gainIfSecure:Triplet}
export interface Lesson {kind:'teach'|'practice'|'review'; keys:string[]; minutes:number; components:Component[]}
export interface Probe {key:string; minutes:number; gap:number; givenGap:Likelihood; givenSecure:Likelihood}
export interface Model {
  minutes:number; lessons:Lesson[]; probes:Probe[]; fallback:{rate:Triplet; minutes:number};
  terminal?: ExamAction; pinned?:string[];
}
export interface Candidate {
  action:string; keys:string[]; minutes:number; gain_low:number; gain_mid:number; gain_high:number;
  rationale:string; voi?:number; netVoi?:number; breakEvenMinutes?:number;
  branches?:{outcome:Outcome; probability:number; gap:number; next:string[]; followupMinutes:number}[];
}
const round=(n:number)=>Math.round(n*1e8)/1e8;
const seeds:Record<EvidenceStatus,Triplet>={secure:[.70,.85,.95],stale:[.40,.65,.85],shaky:[.35,.55,.75],conflicting:[.25,.55,.85],unseen:[.15,.5,.85],gap:[.10,.25,.45]};
const gapOf=(r:ExamRow)=>Math.max(.01, Math.min(.99,(.95-r.probability)/.85));
const zero:Triplet=[0,0,0];
function lesson(row:ExamRow,kind:Lesson['kind']):Lesson {
  const recovery:Triplet=kind==='teach'?[.10,.25,.40]:kind==='practice'?[.05,.15,.25]:[.01,.05,.09];
  const minutes=kind==='teach'?Math.max(6,Math.min(15,Math.round(.6*(row.row.minutes??(8/.6))))):kind==='practice'?5:2;
  // Seed contrasts preserve the status mean. Bounds also include blueprint uncertainty.
  const weights:Triplet=[row.low,row.expected,row.high], prior=gapOf(row);
  const missingCredit:Triplet=[1-seeds[row.status][2],1-row.probability,1-seeds[row.status][0]];
  const weighted=(factor:number)=>recovery.map((k,i)=>weights[i]*missingCredit[i]*k*factor) as Triplet;
  const normalization=.05+.85*prior;
  return {kind,keys:[row.row.key],minutes,components:[{key:row.row.key,gap:prior,
    gainIfGap:weighted(.90/normalization),gainIfSecure:weighted(.05/normalization)}]};
}
export function selectorModel(plan:ExamPlan):Model {
  const minutes=plan.minutes??0;
  if(['confirm','map','resume','verify'].includes(plan.next.kind)||!minutes)
    return {minutes,lessons:[],probes:[],fallback:{rate:zero,minutes:0},terminal:plan.next};
  const byKey=new Map(plan.rows.map(r=>[r.row.key,r]));
  const usable=(r:ExamRow)=>!['defer','skip'].includes(r.disposition?.disposition??'');
  const lessons:Lesson[]=[],probes:Probe[]=[], rates:Triplet[]=[];
  function prerequisites(r:ExamRow, visiting:Set<string>, done:Map<string,ExamRow>):boolean {
    if(visiting.has(r.row.key))return false;
    if(done.has(r.row.key))return true;
    visiting.add(r.row.key);
    for(const key of r.row.prereqs??[]) {
      const p=byKey.get(key);
      if(p&&p.status!=='secure'&&(!usable(p)||!prerequisites(p,visiting,done)))return false;
    }
    done.set(r.row.key,r);visiting.delete(r.row.key);return true;
  }
  for(const row of plan.rows.filter(usable)) {
    if(row.status==='secure'&&row.disposition?.disposition!=='pin')continue;
    const family=new Map<string,ExamRow>();
    if(!prerequisites(row,new Set(),family))continue;
    for(const kind of ['teach','practice'] as const) {
      const bundle=[...family.values()].map(r=>lesson(r,r===row?kind:'teach'));
      lessons.push({kind,keys:[...family.keys()],minutes:bundle.reduce((n,l)=>n+l.minutes,0),components:bundle.flatMap(l=>l.components)});
    }
    if(family.size!==1)continue;
    if(['unseen','conflicting','shaky','stale'].includes(row.status))probes.push({key:row.row.key,
      minutes:row.row.format==='mcq'?1:2,gap:gapOf(row),givenGap:[.15,.15,.65,.05],givenSecure:[.8,.1,.05,.05]});
    // Short, divisible independent corrections are the fallback. Its finite pool is charged once.
    const corrective=lesson(row,'review');
    rates.push(([0,1,2] as const).map(i=>gain(corrective,i)/corrective.minutes) as Triplet);
  }
  rates.sort((a,b)=>b[1]-a[1]);
  return {minutes,lessons,probes,fallback:{rate:rates[0]??zero,minutes:Math.min(minutes,rates.length*2)},
    pinned:plan.rows.filter(r=>r.disposition?.disposition==='pin').map(r=>r.row.key)};
}
function gain(l:Lesson,i:number,key?:string,posterior?:number) {
  return l.components.reduce((n,c)=>{const p=c.key===key&&posterior!==undefined?posterior:c.gap;
    return n+p*c.gainIfGap[i]+(1-p)*c.gainIfSecure[i];},0);
}
function fallback(model:Model,time:number,i:number) {
  return Math.min(model.fallback.minutes, Math.max(0,time))*model.fallback.rate[i];
}
// Evaluate lessons against exactly the same clock and fallback, including the option to do corrections alone.
function best(model:Model,time:number,i:number,key?:string,posterior?:number) {
  let value=fallback(model,time,i), keys:string[]=[];
  for(const l of model.lessons) {
    if(l.minutes>time)continue;
    const score=gain(l,i,key,posterior)+fallback(model,time-l.minutes,i);
    if(score>value){value=score;keys=l.keys;}
  }
  return {value,keys};
}
function candidate(action:string,keys:string[],minutes:number,values:Triplet,rationale:string):Candidate {
  return {action,keys,minutes,gain_low:round(values[0]),gain_mid:round(values[1]),gain_high:round(values[2]),rationale};
}
export function selectExam(model:Model) {
  const candidates:Candidate[]=[];
  if(model.terminal) {
    const a=model.terminal;candidates.push(candidate(a.kind,a.keys,a.minutes,zero,a.why));
  } else {
    for(const l of model.lessons.filter(l=>l.minutes<=model.minutes)) {
      const values=([0,1,2] as const).map(i=>gain(l,i)+fallback(model,model.minutes-l.minutes,i)) as Triplet;
      candidates.push(candidate(l.kind,l.keys,l.minutes,values,l.keys.length>1?'Repair prerequisites before the dependent task.':'Direct lesson plus remaining timed corrections.'));
    }
    candidates.push(candidate('corrections',[],Math.min(model.minutes,model.fallback.minutes),
      ([0,1,2] as const).map(i=>fallback(model,model.minutes,i)) as Triplet,'Use the available time for timed corrections.'));
    for(const probe of model.probes) {
      const followup=model.minutes-probe.minutes;
      if(followup<=0||!model.lessons.some(l=>l.minutes<=followup&&l.keys.includes(probe.key)))continue;
      const values:Triplet=[0,0,0];
      const branches=answers.map((outcome,j)=>{
        const p=probe.gap*probe.givenGap[j]+(1-probe.gap)*probe.givenSecure[j];
        const posterior=p>0?probe.gap*probe.givenGap[j]/p:probe.gap;
        for(const i of [0,1,2])values[i]+=p*best(model,followup,i,probe.key,posterior).value;
        return {outcome,probability:round(p),gap:round(posterior),next:best(model,followup,1,probe.key,posterior).keys,followupMinutes:followup};
      });
      if(new Set(branches.filter(b=>b.probability>0).map(b=>JSON.stringify(b.next))).size<2)continue;
      const c=candidate('probe',[probe.key],probe.minutes,values,'The response changes which feasible lesson follows.');
      c.voi=round(values[1]-best(model,followup,1).value);
      c.netVoi=round(values[1]-best(model,model.minutes,1).value);
      if(model.fallback.rate[1]>0)c.breakEvenMinutes=round(c.voi/model.fallback.rate[1]);
      c.branches=branches;candidates.push(c);
    }
  }
  const pinned=(c:Candidate)=>Number(!!model.pinned?.some(k=>c.keys.includes(k)));
  candidates.sort((a,b)=>pinned(b)-pinned(a)||b.gain_mid-a.gain_mid||a.minutes-b.minutes);
  return {policy:'selector-v1' as const,shadow:true as const,candidates:candidates.slice(0,10),chosen:candidates[0],runner_up:candidates[1]??null};
}
export function predictionRows(plan:ExamPlan,snapshot:ExamSnapshot) {
  const asOf=Date.parse(snapshot.now);
  return plan.rows.map(r=>{
    const attempts=snapshot.attempts.filter(a=>a.row_key===r.row.key&&!a.voided_at&&Date.parse(a.occurred_at)<=asOf&&
      a.independence==='independent'&&!a.hint_level&&a.novelty!=='seen_solution'&&['correct','partial','incorrect'].includes(a.outcome));
    const times=new Set(attempts.map(a=>Date.parse(a.occurred_at)));
    const course=snapshot.evidence.filter(e=>r.row.concepts?.includes(e.concept)&&!e.voided_at&&Date.parse(e.occurred_at)<=asOf&&
      !times.has(Date.parse(e.occurred_at))&&!e.hint_level&&!['seen_solution','self_reported'].includes(e.novelty)&&['pass','partial','fail'].includes(e.outcome));
    return {key:r.row.key,form:r.row.format??'unspecified',facet:r.row.level??'unspecified',priorCount:attempts.length+course.length,
      evidence:r.status,source:'qualitative-v1 status seed',p:r.probability,low:seeds[r.status][0],high:seeds[r.status][2]};
  });
}
export async function inputsHash(value:unknown) {
  const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?
    Object.fromEntries(Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>[k,canonical(x)])):v;
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(value))));
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
