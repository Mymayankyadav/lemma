import {beforeEach,describe,expect,it,vi} from 'vitest';
import {LiveAdapter} from '../../../src/data/live/adapter';

const mock=vi.hoisted(()=>({from:vi.fn(),getUser:vi.fn()}));
vi.mock('../../../src/data/live/client',()=>({
 liveClient:()=>({from:mock.from,auth:{getUser:mock.getUser}}),
}));

type Query={table:string;filters:{kind:string;key:string;value:unknown}[];limit:number|null;range:[number,number]|null;orders:string[];or:string|null};
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
  {id:'c2',user_id:'owner-1',note_id:'n2',ord:1},
  {id:'c3',user_id:'owner-2',note_id:'n1',ord:1}],
 reviews:[{id:'r1',user_id:'owner-1',card_id:'c1',reviewed_at:'2026-10-30T00:00:00Z',
  rating:3,confidence:4,undone_at:null},
  {id:'r2',user_id:'owner-1',card_id:'c2',reviewed_at:'2026-10-29T00:00:00Z',
  rating:1,confidence:1,undone_at:null},
  {id:'r3',user_id:'owner-2',card_id:'c1',reviewed_at:'2026-10-28T00:00:00Z',
  rating:1,confidence:1,undone_at:null}],
 card_comments:[{id:'cm1',user_id:'owner-1',note_id:'n1',no:7,body:'Fix proof',
  status:'addressed',created_at:'2026-10-30T00:00:00Z',resolved_at:null,resolved_by_proposal:'prop1'},
  {id:'cm2',user_id:'owner-1',note_id:'n2',no:8},
  {id:'cm3',user_id:'owner-2',note_id:'n1',no:9}],
 proposals:[{id:'prop1',user_id:'owner-1',origin:'claude'},
  {id:'prop2',user_id:'owner-1',origin:'chatgpt'}],
};

describe('FIX-546a live Card detail scoped queries',()=>{
 beforeEach(()=>{
  requests.length=0;
  mock.from.mockReset();
  mock.getUser.mockReset().mockResolvedValue({data:{user:{id:'owner-1'}},error:null});
  mock.from.mockImplementation((table:string)=>{
   const request:Query={table,filters:[],limit:null,range:null,orders:[],or:null};requests.push(request);
   const q={
    select:(_columns:string)=>q,
    eq:(key:string,value:unknown)=>{request.filters.push({kind:'eq',key,value});return q;},
    neq:(key:string,value:unknown)=>{request.filters.push({kind:'neq',key,value});return q;},
    is:(key:string,value:unknown)=>{request.filters.push({kind:'is',key,value});return q;},
    or:(expr:string)=>{request.or=expr;return q;},
    in:(key:string,value:unknown)=>{request.filters.push({kind:'in',key,value});return q;},
    limit:(n:number)=>{request.limit=n;return q;},
    range:(start:number,end:number)=>{request.range=[start,end];return q;},
    order:(key:string,_options:unknown)=>{request.orders.push(key);return q;},
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
     if(f.kind==='is')rows=rows.filter(row=>row[f.key]===f.value);
    }
    if(request.orders.length)rows.sort((a,b)=>{for(const key of request.orders){const x=a[key],y=b[key];const cmp=key==='id'&&/^\d+$/.test(String(x))&&/^\d+$/.test(String(y)) ? (BigInt(String(x))>BigInt(String(y))?1:BigInt(String(x))<BigInt(String(y))?-1:0) : String(x).localeCompare(String(y));if(cmp)return -cmp;}return 0;});
    if(request.or){const m=request.or.match(/^(reviewed_at|created_at)\.lt\.(.+),and\(\1\.eq\.(.+),id\.lt\.(.+)\)$/);if(!m)throw Error('unexpected keyset '+request.or);rows=rows.filter(row=>String(row[m[1]])<m[2]||(String(row[m[1]])===m[3]&&(/^[0-9]+$/.test(String(row.id))?BigInt(String(row.id))<BigInt(m[4]):String(row.id).localeCompare(m[4])<0)));}
    if(request.range)rows=rows.slice(request.range[0],request.range[1]+1);
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
   'card_comments','cards','cards','checkpoints','notes','notes','notes','projects','proposals','reviews','sessions','sources'
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
  expect(mock.getUser).toHaveBeenCalledTimes(3);
  for(const table of ['reviews','card_comments'])expect(requests.find(r=>r.table===table)?.limit).toBe(21);
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

 it('does not advertise More when exactly 20 owner-scoped rows exist, but does at 21',async()=>{
  const savedReviews=fixtures.reviews,savedComments=fixtures.card_comments;
  try{
   fixtures.reviews=Array.from({length:20},(_,i)=>({
    id:String(100-i),user_id:'owner-1',card_id:'c1',
    reviewed_at:new Date(Date.UTC(2026,9,31)-i*3600000).toISOString(),
    rating:3,confidence:'sure',undone_at:null,
   }));
   fixtures.card_comments=Array.from({length:20},(_,i)=>({
    id:'00000000-0000-4000-8000-'+String(100-i).padStart(12,'0'),
    no:100-i,user_id:'owner-1',note_id:'n1',body:'Comment '+i,status:'open',
    created_at:new Date(Date.UTC(2026,9,31)-i*3600000).toISOString(),
    resolved_at:null,resolved_by_proposal:null,
   }));
   const api=new LiveAdapter();
   const exact=await api.getCard(12);
   expect(exact.history).toHaveLength(20);
   expect(exact.comments).toHaveLength(20);
   expect(exact.historyNextCursor).toBeNull();
   expect(exact.commentsNextCursor).toBeNull();
   expect(requests.filter(q=>q.table==='reviews')).toHaveLength(1);
   expect(requests.filter(q=>q.table==='card_comments')).toHaveLength(1);
   const lastReview=fixtures.reviews.pop()!,lastComment=fixtures.card_comments.pop()!;
   const nineteen=await api.getCard(12);
   expect(nineteen.history).toHaveLength(19);
   expect(nineteen.comments).toHaveLength(19);
   expect(nineteen.historyNextCursor).toBeNull();
   expect(nineteen.commentsNextCursor).toBeNull();
   fixtures.reviews.push(lastReview);
   fixtures.card_comments.push(lastComment);
   fixtures.reviews.push({...fixtures.reviews[19],id:'1',reviewed_at:'2026-01-01T00:00:00Z'});
   fixtures.card_comments.push({...fixtures.card_comments[19],
    id:'00000000-0000-4000-8000-000000000001',no:1,created_at:'2026-01-01T00:00:00Z'});
   const more=await api.getCard(12);
   expect(more.history).toHaveLength(20);
   expect(more.comments).toHaveLength(20);
   expect(more.historyNextCursor).toBeTruthy();
   expect(more.commentsNextCursor).toBeTruthy();
  }finally{
   fixtures.reviews=savedReviews;fixtures.card_comments=savedComments;
  }
 });
 it('rejects numeric live comment cursors before any UUID comparison query',async()=>{
  const {encodeCardPageCursor}=await import('../../../src/data/card-cursor')
  const forged=encodeCardPageCursor('comments',12,{at:'2026-10-31T00:00:00Z',id:'17'})
  await expect(new LiveAdapter().getCardCommentsPage(12,forged)).rejects.toMatchObject({code:'invalid'})
  expect(requests.filter(r=>r.table==='card_comments')).toHaveLength(0)
 })
 it('bounds 1,001 reviews to 20 rows and follows stable keyset pages without offset scans',async()=>{
  const original=fixtures.reviews;
  try{
   fixtures.reviews=Array.from({length:1001},(_,i)=>({
    id:String(i+1),user_id:'owner-1',card_id:'c1',
    reviewed_at:new Date(Date.UTC(2026,9,31)-Math.floor(i/2)*3600000).toISOString(),
    rating:3,confidence:'sure',undone_at:null,
   }));
   const adapter=new LiveAdapter();
   const detail=await adapter.getCard(12);
   expect(detail.history).toHaveLength(20);
   expect(new TextEncoder().encode(JSON.stringify(detail)).byteLength).toBeLessThan(200_000);
   expect(requests.length).toBeLessThanOrEqual(12);
   const first=await adapter.getCardHistoryPage(12);
   expect(first.rows).toHaveLength(20);
   expect(first.nextCursor).not.toBeNull();
   const second=await adapter.getCardHistoryPage(12,first.nextCursor!);
   expect(second.rows).toHaveLength(20);
   expect(second.rows[0].reviewedAt<=first.rows[19].reviewedAt).toBe(true);
   const reviewQueries=requests.filter(q=>q.table==='reviews');
   expect(reviewQueries).toHaveLength(3);
   expect(reviewQueries.every(q=>q.limit===21&&q.range===null)).toBe(true);
   expect(reviewQueries[2].or).toContain('reviewed_at.lt.');
   for(const q of reviewQueries){
    expect(q.filters).toContainEqual({kind:'eq',key:'user_id',value:'owner-1'});
    expect(q.filters).toContainEqual({kind:'in',key:'card_id',value:['c1']});
   }
  }finally{
   fixtures.reviews=original;
  }
 });;

 it('paginates 1,001 owner-scoped comments using timestamp and UUID ties without offset scans',async()=>{
  const original=fixtures.card_comments;
  try{
   fixtures.card_comments=Array.from({length:1001},(_,i)=>({
    id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),
    no:i+1,user_id:'owner-1',note_id:'n1',body:'Note '+i,status:'open',
    created_at:new Date(Date.UTC(2026,9,31)-Math.floor(i/2)*3600000).toISOString(),
    resolved_at:null,resolved_by_proposal:null,
   }));
   const api=new LiveAdapter();
   const first=await api.getCardCommentsPage(12);
   expect(first.rows).toHaveLength(20);
   expect(first.nextCursor).not.toBeNull();
   const second=await api.getCardCommentsPage(12,first.nextCursor!);
   expect(second.rows).toHaveLength(20);
   expect(new Set([...first.rows,...second.rows].map(c=>c.no)).size).toBe(40);
   const queries=requests.filter(q=>q.table==='card_comments');
   expect(queries).toHaveLength(2);
   expect(queries.every(q=>q.limit===21&&q.range===null)).toBe(true);
   expect(queries[1].or).toContain('created_at.lt.');
   for(const q of queries){
    expect(q.filters).toContainEqual({kind:'eq',key:'user_id',value:'owner-1'});
    expect(q.filters).toContainEqual({kind:'eq',key:'note_id',value:'n1'});
   }
  }finally{fixtures.card_comments=original;}
 });

});
