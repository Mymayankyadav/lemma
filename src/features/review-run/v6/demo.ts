// N83 demo-only durable review state. Isolated to one tab and persisted
// before the UI moves to the next card.
import type {ReviewItem} from '../../../data/types';
import type {DurableRun,StartRunInput} from './transport';
type Store={schema:1;runs:DurableRun[]};
const KEY='lemma.v6.demo.review-runs.v1';
let serial=0;
const clone=<T>(x:T):T=>structuredClone(x);
const id=()=>globalThis.crypto?.randomUUID?.()??'demo-review-'+(++serial)+'-'+Date.now();
const initial=():Store=>({schema:1,runs:[]});
let memory=initial(),inMemoryOnly=false;
function load():Store{
 try{
  const raw=sessionStorage.getItem(KEY);
  if(!raw)return inMemoryOnly?memory:initial();
  const value=JSON.parse(raw) as Store;
  if(value.schema!==1||!Array.isArray(value.runs))throw Error('bad storage');
  return value;
 }catch{return memory;}
}
function save(store:Store){
 memory=clone(store);
 try{sessionStorage.setItem(KEY,JSON.stringify(store));inMemoryOnly=false;}
 catch{inMemoryOnly=true;/* tab storage unavailable */}
}
function get(id:string):DurableRun|null{
 return clone(load().runs.find(x=>x.id===id)??null);
}
function update(id:string,expected:number,
 change:(run:DurableRun)=>DurableRun):DurableRun{
 const store=load(),found=store.runs.find(x=>x.id===id);
 if(!found)throw Error('Durable review run missing');
 if(found.version!==expected)throw Error('Review run version conflict');
 const run=change(clone(found));
 save({...store,runs:store.runs.map(x=>x.id===id?run:x)});
 return clone(run);
}
export function demoStart(input:StartRunInput,selected:ReviewItem[]):DurableRun{
 const store=load(),now=new Date().toISOString();
 const items=selected.slice(0,Math.min(input.cardBudget,input.minuteBudget)).map((card,i)=>({
  id:id(),cardId:card.cardId,expectedCardVersion:1,
  position:i,state:'pending' as const,reviewId:null,staleReason:null,
 }));
 const run:DurableRun={
  id:id(),status:items.length?'running':'exhausted',
  position:0,version:1,startedAt:now,endedAt:items.length?null:now,
  items,progress:{position:0,total:items.length,graded:0,skipped:0,
   remaining:items.length,done:items.length===0},
 };
 save({...store,runs:[...store.runs,run]});
 return clone(run);
}
export const demoRead=get;
export function demoResume():DurableRun|null{
 const runs=load().runs.filter(x=>x.status==='running'||x.status==='paused');
 return clone(runs.at(-1)??null);
}
export function demoUnpause(id:string,version:number){
 return update(id,version,r=>{
  if(r.status!=='paused')throw Error('Run must be paused');
  return {...r,status:'running',version:r.version+1};
 });
}
export function demoPause(id:string,version:number){
 return update(id,version,r=>{
  if(r.status!=='running')throw Error('Run must be running');
  return {...r,status:'paused',version:r.version+1};
 });
}
function advance(id:string,version:number,itemId:string,
 grade:number|null,reason:string|null){
 return update(id,version,r=>{
  if(r.status!=='running')throw Error('Run is not active');
  const item=r.items[r.position];
  if(!item||item.id!==itemId||item.state!=='pending')throw Error('Item already advanced');
  const items=r.items.map(x=>x.id!==itemId?x:{
   ...x,state:grade===null?'stale' as const:'graded' as const,
   reviewId:grade,staleReason:reason,
  });
  const position=r.position+1,ended=position===items.length;
  return {...r,items,position,version:r.version+1,
   status:ended?'exhausted':'running',
   endedAt:ended?new Date().toISOString():null,
   progress:{position,total:items.length,
    graded:items.filter(x=>x.state==='graded').length,
    skipped:items.filter(x=>x.state==='stale').length,
    remaining:items.length-position,done:ended},
  };
 });
}
export function demoGrade(runId:string,version:number,itemId:string,reviewId:number){
 if(!Number.isSafeInteger(reviewId)||reviewId<1)throw Error('Invalid committed grade receipt');
 return advance(runId,version,itemId,reviewId,null);
}
export function demoSkip(runId:string,version:number,itemId:string,reason:string){
 if(typeof reason!=='string'||!reason.trim()||reason.length>200)
  throw Error('Stale reason required');
 return advance(runId,version,itemId,null,reason);
}
/** bug #1299: step back to the last graded item (the caller undoes its demo review first). */
export function demoUndoLast(runId:string,version:number,itemId:string){
 return update(runId,version,r=>{
  if((r.status!=='running'&&r.status!=='exhausted')||r.position<1)throw Error('No answer to undo in this run');
  const item=r.items[r.position-1];
  if(!item||item.id!==itemId||item.state!=='graded'||item.reviewId===null)
   throw Error('Only the last graded item can be undone');
  const items=r.items.map(x=>x.id!==itemId?x:{...x,state:'pending' as const,reviewId:null});
  const position=r.position-1;
  return {...r,items,position,version:r.version+1,status:'running',endedAt:null,
   progress:{position,total:items.length,
    graded:items.filter(x=>x.state==='graded').length,
    skipped:items.filter(x=>x.state==='stale').length,
    remaining:items.length-position,done:false},
  };
 });
}
