/** The registered practice/router.py comparison, fit only on mature randomized assignments. */
export const NATIVE='atlas80';
export const ARMS=[NATIVE,'atlas_dp80','level80','shared80','skill80','sqrt80','hard72','easy88','guided80','contrast80'] as const;
export type Arm=typeof ARMS[number];
export const GROUPS=['0-4','5-7','8-12'] as const;
export type Group=typeof GROUPS[number];
const caps={transfer7:.005,abandon_rate:.025,trigger_rate:.035,feedback_share:.085,idle_share:.045};
type Metric=keyof typeof caps;
const metrics=Object.keys(caps) as Metric[];
type Metrics=Record<Metric,number>;
type Summary=Record<Metric,{mean:number;variance:number}>;
type Bounds=Record<Metric,{delta:number;lower:number;upper:number}>;
export interface Scope {track:string;policy:string;bank:string;rubric:string}
export interface PilotRow extends Scope, Metrics {learner:string;arm:Arm;anchors:readonly number[];randomized:boolean;mature:boolean}
export interface Certificate extends Scope {
  version:1;source:'randomized-pilot';validThrough:string;overall:Arm;routes:Record<Group,Arm>;
  evidence:Record<string,Partial<Record<Arm,{n:number;bounds:Bounds|null;eligible:boolean}>>>;
}
const sameScope=(a:Scope,b:Scope)=>a.track===b.track&&a.policy===b.policy&&a.bank===b.bank&&a.rubric===b.rubric;
export function civilDay(value:string):boolean{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const time=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
}
export function intake(anchors:readonly number[]):Group{
  if(!Array.isArray(anchors)||anchors.length!==12||anchors.some(x=>x!==0&&x!==1))throw Error('Expected twelve binary intake responses');
  const score=anchors.reduce((n,x)=>n+x,0);
  return score<=4?'0-4':score<=7?'5-7':'8-12';
}
function summary(rows:PilotRow[]):Summary|null{
  if(rows.length<100)return null;
  return Object.fromEntries(metrics.map(key=>{
    const mean=rows.reduce((total,r)=>total+r[key],0)/rows.length;
    return [key,{mean,variance:rows.reduce((s,r)=>s+(r[key]-mean)**2,0)/(rows.length*(rows.length-1))}];
  })) as Summary;
}
function bounds(a:Summary,b:Summary,z:number):Bounds {
  return Object.fromEntries(metrics.map(key=>{
    const delta=a[key].mean-b[key].mean,radius=z*Math.sqrt(a[key].variance+b[key].variance);
    return [key,{delta,lower:delta-radius,upper:delta+radius}];
  })) as Bounds;
}
export function fitPracticePolicy(rows:PilotRow[],scope:Scope,validThrough:string):Certificate{
  if(![scope.track,scope.policy,scope.bank,scope.rubric].every(s=>typeof s==='string'&&s.trim())||!civilDay(validThrough))throw Error('Invalid registered scope');
  const seen=new Set<string>(),groups=new Map<string,PilotRow[]>();
  for(const row of rows){
    if(!sameScope(scope,row)||row.randomized!==true||row.mature!==true||!row.learner||seen.has(row.learner)||!ARMS.includes(row.arm)||
      metrics.some(k=>!Number.isFinite(row[k])||row[k]<0||row[k]>1))throw Error('Ineligible or duplicate pilot observation');
    seen.add(row.learner);
    for(const level of ['overall',intake(row.anchors)]){
      const key=level+'/'+row.arm,group=groups.get(key)??[];
      group.push(row);groups.set(key,group);
    }
  }
  const evidence:Certificate['evidence']={},centers=new Map<string,Summary|null>(),eligible=new Map<string,Arm[]>();
  // NormalDist.inv_cdf(1 - (.05/2)/180) and (.../216), preregistered family sizes.
  const zBase=3.6351881983520586,zSwitch=3.6819228338561945;
  for(const level of ['overall',...GROUPS]){
    const arms:Arm[]=[];evidence[level]={};
    for(const arm of ARMS)centers.set(level+'/'+arm,summary(groups.get(level+'/'+arm)??[]));
    const control=centers.get(level+'/'+NATIVE);
    for(const arm of ARMS){
      const data=centers.get(level+'/'+arm),b=arm!==NATIVE&&data&&control?bounds(data,control,zBase):null;
      const passed=!!b&&b.transfer7.lower>caps.transfer7&&metrics.every(k=>k==='transfer7'||b[k].upper<=caps[k]);
      evidence[level][arm]={n:groups.get(level+'/'+arm)?.length??0,bounds:b,eligible:passed};
      if(passed)arms.push(arm);
    }
    arms.sort((a,b)=>evidence[level][b]!.bounds!.transfer7.lower-evidence[level][a]!.bounds!.transfer7.lower);
    eligible.set(level,arms);
  }
  const overall=eligible.get('overall')![0]??NATIVE;
  const routes={} as Record<Group,Arm>;
  for(const group of GROUPS){
    const arms=eligible.get(group)!;
    let best=arms[0]??NATIVE;
    if(best!==overall&&overall!==NATIVE&&arms.includes(overall)){
      const swing=bounds(centers.get(group+'/'+best)!,centers.get(group+'/'+overall)!,zSwitch);
      if(swing.transfer7.lower<=caps.transfer7)best=overall;
    }
    routes[group]=best;
  }
  return {...scope,version:1,source:'randomized-pilot',validThrough,overall,routes,evidence};
}
/** A matching trained router alone never enrolls an owner. A persisted live randomized arm is required too. */
export function eligiblePractice(anchors:readonly number[],certificate:Certificate|null,scope:Scope,day:string):Arm{
  if(!certificate||certificate.version!==1||certificate.source!=='randomized-pilot'||!sameScope(scope,certificate)||
    !civilDay(day)||!civilDay(certificate.validThrough)||day>certificate.validThrough)return NATIVE;
  try{
    const group=intake(anchors),arm=certificate.routes[group],result=certificate.evidence[group]?.[arm];
    return ARMS.includes(arm)&&result?.eligible===true&&result.n>=100?arm:NATIVE;
  }catch{return NATIVE;}
}
