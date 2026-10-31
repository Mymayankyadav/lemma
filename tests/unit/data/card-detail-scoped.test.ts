import {beforeEach,describe,expect,it,vi} from 'vitest';
import {LiveAdapter} from '../../../src/data/live/adapter';

const mock=vi.hoisted(()=>({from:vi.fn(),getUser:vi.fn()}));
vi.mock('../../../src/data/live/client',()=>({
 liveClient:()=>({from:mock.from,auth:{getUser:mock.getUser}}),
}));

type Query={table:string;filters:{kind:string;key:string;value:unknown}[];limit:number|null};
const requests:Query[]=[];
const fixtures:Record<string,Record<string,unknown>[]> = {
 notes:[{id:'n1',no:12,user_id:'owner-1',project_id:'p1',checkpoint_id:'cp1',session_id:'s1',
  source_id:'src1',front:'Question',back:'Answer',type:'basic',kind:'theorem',
  tags:[],status:'active',origin:'user',page_label:'3'}],
 projects:[{id:'p1',user_id:'owner-1',slug:'algebra',status:'active'},
  {id:'p2',user_id:'owner-1',slug:'other',status:'active'}],
 checkpoints:[{id:'cp1',user_id:'owner-1',code:'CP3'}],
 sessions:[{id:'s1',user_id:'owner-1',number:2}],
 sources:[{id:'src1',user_id:'owner-1',short:'Book'}],
 cards:[{id:'c1',user_id:'owner-1',note_id:'n1',ord:1,state:2,due:'2026-10-31T00:00:00Z',
  stability:4,difficulty:5,last_review:null,step:0,reps:2,lapses:0},
  {id:'c2',user_id:'owner-1',note_id:'n2',ord:1}],
 reviews:[{id:'r1',user_id:'owner-1',card_id:'c1',reviewed_at:'2026-10-30T00:00:00Z',
  rating:3,confidence:4,undone_at:null},
  {id:'r2',user_id:'owner-1',card_id:'c2',reviewed_at:'2026-10-29T00:00:00Z',
  rating:1,confidence:1,undone_at:null}],
 card_comments:[{id:'cm1',user_id:'owner-1',note_id:'n1',no:7,body:'Fix proof',
  status:'addressed',created_at:'2026-10-30T00:00:00Z',resolved_at:null,resolved_by_proposal:'prop1'},
  {id:'cm2',user_id:'owner-1',note_id:'n2',no:8}],
 proposals:[{id:'prop1',user_id:'owner-1',origin:'claude'},
  {id:'prop2',user_id:'owner-1',origin:'chatgpt'}],
};

describe('FIX-546a live Card detail scoped queries',()=>{
 beforeEach(()=>{
  requests.length=0;
  mock.from.mockReset();
  mock.getUser.mockReset().mockResolvedValue({data:{user:{id:'owner-1'}},error:null});
  mock.from.mockImplementation((table:string)=>{
   const request:Query={table,filters:[],limit:null};requests.push(request);
   const q={
    select:(_columns:string)=>q,
    eq:(key:string,value:unknown)=>{request.filters.push({kind:'eq',key,value});return q;},
    neq:(key:string,value:unknown)=>{request.filters.push({kind:'neq',key,value});return q;},
    in:(key:string,value:unknown)=>{request.filters.push({kind:'in',key,value});return q;},
    limit:(n:number)=>{request.limit=n;return q;},
    single:async()=>({data:filtered()[0]??null,error:null}),
    then:(onFulfilled:(value:unknown)=>unknown,onRejected?:(error:unknown)=>unknown)=>
     Promise.resolve({data:filtered(),error:null}).then(onFulfilled,onRejected),
   };
   function filtered(){
    let rows=[...(fixtures[table]??[])];
    for(const f of request.filters){
     if(f.kind==='eq')rows=rows.filter(row=>row[f.key]===f.value);
     if(f.kind==='neq')rows=rows.filter(row=>row[f.key]!==f.value);
     if(f.kind==='in')rows=rows.filter(row=>(f.value as unknown[]).includes(row[f.key]));
    }
    return request.limit===null?rows:rows.slice(0,request.limit);
   }
   return q;
  });
 });
 it('loads one owner-scoped note and only its referenced metadata/cards/reviews/comments/proposals',async()=>{
  const detail=await new LiveAdapter().getCard(12);
  expect(detail.note).toMatchObject({noteNo:12,projectSlug:'algebra',checkpointCode:'CP3',
   sessionNumber:2,sourceShort:'Book'});
  expect(detail.cards).toHaveLength(1);
  expect(detail.history).toEqual([{reviewedAt:'2026-10-30T00:00:00Z',rating:3,confidence:4}]);
  expect(detail.comments).toMatchObject([{no:7,resolvedByOrigin:'claude'}]);
  expect(requests.map(r=>r.table).sort()).toEqual([
   'card_comments','cards','checkpoints','notes','projects','proposals','reviews','sessions','sources'
  ]);
  for(const request of requests)
   expect(request.filters).toContainEqual({kind:'eq',key:'user_id',value:'owner-1'});
  for(const table of ['projects','checkpoints','sessions','sources']){
   const request=requests.find(r=>r.table===table)!;
   expect(request.filters.some(f=>f.kind==='eq'&&f.key==='id')).toBe(true);
   expect(request.limit).toBe(1);
  }
  for(const table of ['cards','card_comments'])
   expect(requests.find(r=>r.table===table)!.filters).toContainEqual({
    kind:'eq',key:'note_id',value:'n1'
   });
  expect(requests.find(r=>r.table==='reviews')!.filters).toContainEqual({
   kind:'in',key:'card_id',value:['c1']
  });
  expect(requests.find(r=>r.table==='proposals')!.filters).toContainEqual({
   kind:'in',key:'id',value:['prop1']
  });
  expect(mock.getUser).toHaveBeenCalledOnce();
 });
 it('skips unrelated review and proposal tables when the selected note has no references',async()=>{
  const savedCards=fixtures.cards,savedComments=fixtures.card_comments;
  try{
   fixtures.cards=[];fixtures.card_comments=[];
   const detail=await new LiveAdapter().getCard(12);
   expect(detail.cards).toEqual([]);
   expect(detail.history).toEqual([]);
   expect(detail.comments).toEqual([]);
   expect(requests.map(r=>r.table)).not.toContain('reviews');
   expect(requests.map(r=>r.table)).not.toContain('proposals');
  }finally{
   fixtures.cards=savedCards;fixtures.card_comments=savedComments;
  }
 });

});
