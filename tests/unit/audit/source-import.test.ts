import {it,expect,vi,beforeEach} from 'vitest';
import {LiveAdapter} from '../../../src/data/live/adapter';
import {noteOrds} from '../../../src/data/live/helpers';
const f=vi.hoisted(()=>({db:null as any,rows:{} as Record<string,any[]>,lostReady:false,next:0}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>f.db}));
vi.mock('../../../src/pdf/ingest',()=>({ingest:async()=>({pageCount:1,pages:[{page:1,label:'1',body:'The only accepted text'}],outline:[],hasText:true})}));
class Query implements PromiseLike<any>{
 op='select';value:any;filters:any[]=[];one=false;
 constructor(public table:string){}
 select(..._args:any[]){return this;} eq(k:string,v:any){this.filters.push((r:any)=>r[k]===v);return this;}
 neq(k:string,v:any){this.filters.push((r:any)=>r[k]!==v);return this;}
 in(k:string,v:any[]){this.filters.push((r:any)=>v.includes(r[k]));return this;}
 range(..._args:any[]){return this;}limit(..._args:any[]){return this;}order(..._args:any[]){return this;}
 single(){this.one=true;return this;}maybeSingle(){this.one=true;return this;}
 insert(v:any){this.op='insert';this.value=v;return this;}update(v:any){this.op='update';this.value=v;return this;}delete(){this.op='delete';return this;}
 then(resolve:any,reject:any){
  const all=f.rows[this.table]??=[],matches=all.filter(r=>this.filters.every(test=>test(r)));let result:any[]=matches,error:any=null;
  if(this.op==='insert'){result=(Array.isArray(this.value)?this.value:[this.value]).map(r=>({id:'new-'+(++f.next),created_at:new Date().toISOString(),...r}));f.rows[this.table]=[...all,...result];}
  if(this.op==='update'){
   for(const r of matches)Object.assign(r,this.value);
   if(f.lostReady&&this.table==='sources'&&this.value.status==='ready'){f.lostReady=false;error={message:'Failed to fetch: acknowledgement lost after commit'};}
  }
  if(this.op==='delete'){
   f.rows[this.table]=all.filter(r=>!matches.includes(r));
   if(this.table==='sources')f.rows.source_pages=(f.rows.source_pages??[]).filter(p=>!matches.some(s=>s.id===p.source_id));
   if(this.table==='cards')f.rows.reviews=(f.rows.reviews??[]).filter(p=>!matches.some(s=>s.id===p.card_id));
  }
  // Return snapshots as PostgREST does, rather than live references into the test store.
  const data=structuredClone(this.one?result[0]??null:result);
  return Promise.resolve({data,error}).then(resolve,reject);
 }
}
beforeEach(()=>{
 f.rows={projects:[{id:'p',user_id:'owner',slug:'proofs'}],sources:[],source_pages:[]};f.next=0;f.lostReady=false;
 f.db={auth:{getUser:async()=>({data:{user:{id:'owner'}},error:null})},from:(table:string)=>new Query(table)};
});

it('preserves a successfully committed source when its final readback acknowledgement is lost',async()=>{
 f.lostReady=true;const file=new File(['# Proof\nThe text'],'proof.md',{type:'text/markdown'});
 Object.defineProperty(file,'arrayBuffer',{value:async()=>new TextEncoder().encode('# Proof\nThe text').buffer});
 let failed=false;try{await new LiveAdapter().addSource('p',file,()=>{});}catch{failed=true;}
 expect(failed).toBe(false);
 console.info('after committed ready response is lost',f.rows.sources,f.rows.source_pages);
 expect(f.rows.sources).toHaveLength(1);
 expect(f.rows.source_pages).toHaveLength(1);
});

it('control: an ordinary acknowledged source import persists its pages',async()=>{
 const file=new File(['# Proof'],'proof.md',{type:'text/markdown'});
 Object.defineProperty(file,'arrayBuffer',{value:async()=>new TextEncoder().encode('# Proof').buffer});
 const source=await new LiveAdapter().addSource('p',file,()=>{});
 expect(source.status).toBe('ready');expect(f.rows.source_pages).toHaveLength(1);
});

