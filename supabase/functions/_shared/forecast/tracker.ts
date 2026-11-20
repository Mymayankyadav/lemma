/** Four-state retrieval/execution filter from memory/tracker.py, with the registered application settings. */
export interface Query {
  kc:string;day:number;kind:'attempt'|'recall'|'execution'|'lesson';difficulty?:number;fatigue?:number;
  hint?:number;reliability?:number;required?:string[];
}
export interface Observation {query:Query;outcome:boolean|null;eventId:string;sourceId?:string;feedback?:boolean}
const clip=(p:number)=>Math.max(1e-9,Math.min(1-1e-9,p));
const logistic=(x:number)=>1/(1+Math.exp(-Math.max(-40,Math.min(40,x))));
const sum=(a:number[])=>a.reduce((s,x)=>s+x,0);
const norm=(a:number[])=>{const total=sum(a);return a.map(x=>x/total);};
const dot=(a:number[],b:number[])=>sum(a.map((x,i)=>x*b[i]));
const recorded=(p:number,q:Query)=>(q.reliability??1)*p+(1-(q.reliability??1))*.5;
const states=[[0,0],[0,1],[1,0],[1,1]];
const initial=[(1-.38)*(1-.14),(1-.38)*.14,.38*(1-.55),.38*.55];
type Timed={at:number;state:number[]};
interface Estimate {probability:number;target:number[];prerequisites:[string,number[]][]}
function advance(prior:number[],transition:(r:number,e:number)=>number[]){
  const result=[0,0,0,0];
  for(const [i,[r,e]] of states.entries()){
    const [r1,e1]=transition(r,e),mass=prior[i];
    result[0]+=mass*(1-r1)*(1-e1);result[1]+=mass*(1-r1)*e1;
    result[2]+=mass*r1*(1-e1);result[3]+=mass*r1*e1;
  }
  return result;
}
function emissions(q:Query){
  const d=.75*(q.difficulty??0)+.30*(q.fatigue??0),h=q.hint??0;
  return states.map(([r,e])=>{
    if(q.kind==='recall')return logistic((r?1.9:-1.9)-d+.85*h);
    if(q.kind==='execution')return logistic((e?1.55:-1.1)-d+.70*h);
    return logistic((e?1.65:-.95)-d+.65*h)*(r?1:Math.min(.84,.035+.20*h));
  });
}
class Latent {
  private readonly states=new Map<string,Timed>();
  constructor(private readonly recallDays:number,private readonly executionDays:number){}
  at(kc:string,day:number){
    const record=this.states.get(kc);
    if(!record)return initial;
    if(record.at===day)return record.state;
    const duration=day-record.at,keepR=2**(-duration/this.recallDays),keepE=2**(-duration/this.executionDays);
    return advance(record.state,(r,e)=>[r*keepR,.12+(e-.12)*keepE]);
  }
  learn(kc:string,day:number,prior:number[],recall:number,execution:number){
    const state=norm(advance(prior,(r,e)=>[r||recall,e||execution]));
    this.states.set(kc,{at:day,state});
  }
  predict(q:Query,required:string[]):Estimate{
    const prior=this.at(q.kc,q.day), raw=emissions(q);
    if(q.kind!=='attempt'){const target=raw.map(p=>recorded(p,q));return {probability:dot(prior,target),target,prerequisites:[]};}
    const weak=.30+.06*(q.hint??0),factor=[weak,weak,1,1];
    const probs=required.map(kc=>dot(this.at(kc,q.day),factor)),product=probs.reduce((a,b)=>a*b,1),mean=dot(prior,raw);
    const target=raw.map(p=>recorded(.05+.92*p*product,q));
    return {probability:dot(prior,target),target,prerequisites:required.map((kc,i)=>[kc,factor.map(x=>recorded(.05+.92*mean*(product/probs[i])*x,q))])};
  }
  observe(q:Query,prediction:Estimate,y:boolean,feedback:boolean){
    const posterior=(kc:string,prob:number[])=>norm(this.at(kc,q.day).map((weight,i)=>weight*(y?prob[i]:1-prob[i])));
    const target=posterior(q.kc,prediction.target);
    const messages=prediction.prerequisites.map(([kc,ps])=>({kc,state:posterior(kc,ps)}));
    for(const {kc,state} of messages)this.states.set(kc,{at:q.day,state});
    if(q.kind==='attempt'&&(y||feedback)){
      const strength=(q.reliability??1)*((q.hint??0)===0?1:.30);
      this.learn(q.kc,q.day,target,.21*strength,.085*strength);
    }else this.states.set(q.kc,{at:q.day,state:target});
  }
}
const rates=[.06,.12,.20,.30,.42,.55,.68,.80,.91];
const cold=[.10,.14,.20,.21,.16,.10,.055,.025,.01],taught=[.035,.085,.14,.20,.205,.16,.105,.05,.02];
class Cautious {
  private readonly states=new Map<string,Timed>();
  private readonly lessons=new Set<string>();
  at(kc:string,day:number){
    const first=this.lessons.has(kc)?taught:cold,old=this.states.get(kc);
    if(!old)return first;
    const keep=2**(-(day-old.at)/24);
    return old.state.map((p,i)=>keep*p+(1-keep)*first[i]);
  }
  emissions(q:Query){
    const adjustment=-.75*(q.difficulty??0)-.30*(q.fatigue??0)+.78*(q.hint??0);
    return rates.map(p=>recorded(logistic(Math.log(p/(1-p))+adjustment),q));
  }
  observe(q:Query,y:boolean){
    const old=this.at(q.kc,q.day),ps=this.emissions(q);
    this.states.set(q.kc,{at:q.day,state:norm(old.map((w,i)=>w*(y?ps[i]:1-ps[i])))});
  }
  lesson(q:Query){
    const old=this.at(q.kc,q.day);this.lessons.add(q.kc);
    this.states.set(q.kc,{at:q.day,state:old.map((p,i)=>.70*p+.30*taught[i])});
  }
}
export class Tracker {
  private readonly experts=[new Latent(34,180),new Latent(11,19)];
  private readonly fallback=new Cautious();
  private readonly weights=new Map<string,number[]>();
  private readonly lessons=new Set<string>();
  private readonly counts=new Map<string,number>();
  private readonly events=new Set<string>();
  private readonly sources=new Set<string>();
  private day=-Infinity;
  constructor(private readonly prerequisites:Record<string,string[]>={}){}
  private required(q:Query){
    const {hint=0,reliability=1,fatigue=0,difficulty=0}=q;
    if(!q.kc||!['attempt','execution','recall','lesson'].includes(q.kind)||![q.day,hint,reliability,fatigue,difficulty].every(Number.isFinite)||
      q.day<this.day||!Number.isInteger(hint)||hint<0||hint>4||reliability<0||reliability>1||fatigue<0)throw Error('Invalid or out-of-order forecast query');
    return [...new Set((q.required??this.prerequisites[q.kc]??[]).filter(id=>id!==q.kc))];
  }
  private key(kc:string,ref:boolean){return JSON.stringify([kc,ref]);}
  private pool(kc:string,ref:boolean){
    const prior=norm(ref?[.20,.20,.25,.35]:[.20,.20,.25]);
    return {prior,weights:this.weights.get(this.key(kc,ref))??prior};
  }
  private predictions(q:Query,reference?:number){
    const required=this.required(q);
    if(reference!==undefined&&(q.kind!=='attempt'||!Number.isFinite(reference)||reference<0||reference>1))throw Error('Invalid native reference');
    const latent=this.experts.map(e=>e.predict(q,required)),ps=latent.map(p=>p.probability);
    if(q.kind==='attempt'){
      ps.push(dot(this.fallback.at(q.kc,q.day),this.fallback.emissions(q)));
      if(reference!==undefined)ps.push(recorded(reference,q));
    }
    return {latent,ps:ps.map(clip)};
  }
  predict(q:Query,reference?:number){
    if(q.kind==='lesson')throw Error('A lesson has no forecast target');
    const {ps}=this.predictions(q,reference),ref=q.kind==='attempt'?reference!==undefined:this.weights.has(this.key(q.kc,true));
    let {weights}=this.pool(q.kc,ref);
    const latent=norm(weights.slice(0,2));
    if(q.kind!=='attempt')weights=latent;
    const states=this.experts.map(e=>e.at(q.kc,q.day));
    return {probability:dot(weights,ps),recall:dot(latent,states.map(s=>s[2]+s[3])),execution:dot(latent,states.map(s=>s[1]+s[3])),
      expertWeights:Object.fromEntries(weights.map((w,i)=>[['durable','labile','cautious','reference'][i],w])),
      lessonObserved:this.lessons.has(q.kc),observations:this.counts.get(q.kc)??0,disagreement:Math.max(...ps)-Math.min(...ps)};
  }
  update(e:Observation,reference?:number):boolean{
    if(!e.eventId?.trim()||e.sourceId!==undefined&&!e.sourceId.trim())throw Error('Invalid observation identity');
    if(this.events.has(e.eventId)||e.sourceId!==undefined&&this.sources.has(e.sourceId))return false;
    const q=e.query;this.required(q);
    if(q.kind==='lesson'){
      if(e.outcome!==null||reference!==undefined)throw Error('A lesson has no scored outcome');
      for(const expert of this.experts)expert.learn(q.kc,q.day,expert.at(q.kc,q.day),.74,.26);
      this.fallback.lesson(q);this.lessons.add(q.kc);
    }else{
      if(typeof e.outcome!=='boolean')throw Error('A measured event needs a binary outcome');
      const {ps,latent}=this.predictions(q,reference);
      if((q.reliability??1)>0){
        if(q.kind==='attempt'){
          const ref=reference!==undefined,{prior,weights}=this.pool(q.kc,ref);
          const post=norm(weights.map((w,i)=>w*(e.outcome?ps[i]:1-ps[i])));
          this.weights.set(this.key(q.kc,ref),post.map((w,i)=>(1-.06)*w+.06*prior[i]));
          this.fallback.observe(q,e.outcome);
        }
        this.experts.forEach((expert,i)=>expert.observe(q,latent[i],e.outcome!,!!e.feedback));
        this.counts.set(q.kc,(this.counts.get(q.kc)??0)+1);
      }
    }
    this.events.add(e.eventId);if(e.sourceId!==undefined)this.sources.add(e.sourceId);
    this.day=q.day;return true;
  }
}
