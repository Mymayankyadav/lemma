// @vitest-environment node
import {expect,it} from 'vitest';
import {DemoAdapter} from '../../../src/data/demo/adapter';
import type {FirstCardInput} from '../../../src/data/demo/first-card';
import {preview,scheduleConfig} from '../../../src/lib/fsrs';

const now=Date.parse('2026-11-09T12:00:00Z');
const input:FirstCardInput={
 operationId:'9da8ece4-7935-449e-b554-4a9270973301',
 path:{kind:'new',title:'First topology path'},front:'What is compact?',back:'Every open cover has a finite subcover.',
};
const filter={query:''};

function fixture(){
 const rows=new Map<string,string>();
 let reject=false;
 const tab={getItem:(key:string)=>rows.get(key)??null,setItem:(key:string,value:string)=>{
  if(reject)throw Error('fixture storage unavailable');rows.set(key,value);
 }};
 const open=()=>new DemoAdapter({firstUse:true,timeZone:'UTC',now:()=>now,authoredCardStorage:tab});
 return {open,fail:()=>{reject=true},allow:()=>{reject=false}};
}

it('replays one path and card after repeated submits and an omitted acknowledgement',async()=>{
 const env=fixture(),first=env.open();
 expect(await first.listProjects()).toEqual([]);
 expect((await first.searchCardsPage(filter)).rows).toEqual([]);
 const [receipt,repeated]=await Promise.all([first.createFirstCard(input),first.createFirstCard(input)]);
 expect(repeated).toEqual(receipt);
 // The browser did not keep the response; a new adapter must return it from storage.
 const afterReload=env.open();
 expect(await afterReload.createFirstCard(input)).toEqual(receipt);
 await expect(afterReload.createFirstCard({...input,back:'a different request'})).rejects.toMatchObject({code:'conflict'});
 await expect(afterReload.createFirstCard({...input,operationId:'c43d6a28-af4a-4950-bb87-627a8267998b'})).rejects.toMatchObject({code:'conflict'});
 expect(await afterReload.listProjects()).toHaveLength(1);
 expect((await afterReload.searchCardsPage(filter)).rows.map(row=>row.noteNo)).toEqual([receipt.noteNo]);
 const detail=await afterReload.getCard(receipt.noteNo);
 expect(detail.note).toMatchObject({front:input.front,back:input.back,noteId:receipt.noteId,projectSlug:receipt.projectSlug});
 expect(detail.cards.map(card=>card.cardId)).toEqual([receipt.cardId]);
 const state=detail.cards[0].state;
 const after=preview(state,now,scheduleConfig(await afterReload.getSettings()))[3].card;
 await afterReload.recordReview({cardId:receipt.cardId,rating:3,confidence:null,durationMs:200,next:after});
 const reloaded=await env.open().getCard(receipt.noteNo);
 expect(reloaded.history).toHaveLength(1);
 expect(reloaded.cards[0].state.reps).toBe(state.reps+1);
 expect((await fixture().open().searchCardsPage(filter)).rows).toEqual([]);
});

it('rolls back the path and card when their joint receipt cannot be persisted',async()=>{
 const env=fixture(),api=env.open();
 env.fail();
 await expect(api.createFirstCard(input)).rejects.toThrow('fixture storage unavailable');
 expect(await api.listProjects()).toEqual([]);
 expect((await api.searchCardsPage(filter)).rows).toEqual([]);
 env.allow();
 await api.createFirstCard(input);
 expect(await env.open().listProjects()).toHaveLength(1);
});

it('uses an existing path, or leaves no rows if that path is invalid',async()=>{
 const env=fixture(),api=env.open();
 await expect(api.createFirstCard({...input,path:{kind:'existing',slug:'not-a-path'}})).rejects.toMatchObject({code:'not_found'});
 expect((await api.searchCardsPage(filter)).rows).toEqual([]);
 const path=await api.createProjectDraft({title:'Already here'});
 const r=await api.createFirstCard({...input,path:{kind:'existing',slug:path.slug}});
 expect(r.projectSlug).toBe(path.slug);
 expect((await env.open().listProjects()).map(p=>p.id)).toEqual([path.id]);
 await expect(new DemoAdapter().createFirstCard(input)).rejects.toMatchObject({code:'invalid'});
});
