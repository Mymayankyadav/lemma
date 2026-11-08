import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import {LiveAdapter} from '../../../src/data/live/adapter';
import {liveClient} from '../../../src/data/live/client';
import {getApi} from '../../../src/data';
import CardVariants from '../../../src/features/card/v6/CardVariants';
vi.mock('../../../src/data/live/client',()=>({liveClient:vi.fn()}));
vi.mock('../../../src/data',()=>({getApi:vi.fn()}));

beforeEach(()=>{vi.clearAllMocks()});

describe('N104 card scheduling adapters',()=>{
 it('reschedules exactly one demo sibling and resets it without losing review history',async()=>{
  const demo=new DemoAdapter();
  const search=await demo.searchCards('');
  expect(search.length).toBeGreaterThan(0);
  const id=search[0].noteNo;
  const before=await demo.getCard(id);
  expect(before.cards.length).toBeGreaterThan(0);
  const ord=before.cards[0].ord;
  const previousDue=before.cards[0].state.due;
  await demo.rescheduleCard(id,ord,'2026-12-01T07:30:00Z');
  const after=await demo.getCard(id);
  expect(after.cards.find(c=>c.ord===ord)?.state.due).toBe('2026-12-01T07:30:00.000Z');
  expect(after.cards.filter(c=>c.ord!==ord)).toEqual(before.cards.filter(c=>c.ord!==ord));
  expect(after.history).toEqual(before.history);
  await expect(demo.rescheduleCard(id,ord,'2026-12-01T07:30:00')).rejects.toThrow();
  await demo.resetCard(id,ord);
  const reset=await demo.getCard(id);
  expect(reset.cards.find(c=>c.ord===ord)?.state).toMatchObject({
   state:0,stability:0,difficulty:0,lastReview:null,step:0,reps:0,lapses:0});
  expect(reset.history).toEqual(before.history);
  expect(previousDue).toBeTruthy();
 });
 it('live mutations send one owner-free receipt envelope through the registered RPC',async()=>{
  const seen:Array<Record<string,unknown>>=[];
  const rpc=vi.fn(async(name:string,args:{p:Record<string,unknown>})=>{
   expect(name).toBe('card_schedule_command');
   seen.push(args.p);
   return {data:{status:'ok',actionNo:12},error:null};
  });
  vi.mocked(liveClient).mockReturnValue({
   auth:{getUser:async()=>({data:{user:{id:'a'}},error:null})},rpc
  } as never);
  const live=new LiveAdapter();
  await live.rescheduleCard(8,2,'2026-12-04T08:00:00Z');
  await live.resetCard(8,2);
  expect(seen.map(p=>p.operation)).toEqual(['reschedule','reset']);
  expect(seen[0]).toMatchObject({
   schemaVersion:1,resource:'card_schedule',
   target:{noteNo:8,ord:2},patch:{due:'2026-12-04T08:00:00Z'}});
  expect(seen[1]).toMatchObject({target:{noteNo:8,ord:2},patch:{}});
  expect(JSON.stringify(seen)).not.toMatch(/"user_id"|"owner"|"actor"/);
  expect(seen[0].operationId).not.toEqual(seen[1].operationId);
  await expect(live.rescheduleCard(8,2,'2026-12-04T08:00:00')).rejects.toThrow();
 });
});

describe('N104 v6 variant actions',()=>{
 it('offers per-sibling reschedule and a two-step confirmed reset',async()=>{
  const original=window.location.pathname;
  window.history.replaceState({},'','/lemma/cards/9');
  const resetCard=vi.fn(async()=>{}),rescheduleCard=vi.fn(async()=>{});
  vi.mocked(getApi).mockReturnValue({
   resetCard,rescheduleCard,getCard:async()=>({cards:[{
    ord:2,state:{state:0,due:'2026-11-08T00:00:00Z',
     stability:0,difficulty:0,lastReview:null,step:0,reps:0,lapses:0}
   }]})
  } as never);
  const host=document.createElement('div');document.body.append(host);
  const root=createRoot(host);
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  try{
   await act(async()=>root.render(<CardVariants variants={[{
    ordinal:2,due:'2026-12-01T00:00:00Z',stability:3,reps:4,state:2
   }]}/>));
   expect(host.textContent).toContain('Reschedule');
   expect(host.textContent).toContain('Reset to New');
   expect(host.querySelector('input[type="datetime-local"]')).not.toBeNull();
   const reset=()=>[...host.querySelectorAll('button')].find(b=>
    b.textContent==='Reset to New');
   await act(async()=>reset()!.click());
   expect(resetCard).not.toHaveBeenCalled();
   const confirm=[...host.querySelectorAll('button')].find(b=>
    b.textContent==='Confirm reset');
   await act(async()=>confirm!.click());
   expect(resetCard).toHaveBeenCalledWith(9,2);
   expect(host.textContent).toContain('Card returned to New.');
  }finally{
   await act(async()=>root.unmount());host.remove();
   window.history.replaceState({},'',original);
  }
 });
});
