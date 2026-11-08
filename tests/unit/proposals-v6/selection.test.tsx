import {createElement,useState,act} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createRoot,type Root} from 'react-dom/client';
import {readFileSync} from 'node:fs';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {Proposal} from '../../../src/data/types';
import SelectionPanel,{applySelectedDecisions,selectedPending} from '../../../src/features/proposals/v6/Selection';

const make=(id:string,kind:Proposal['kind'],front:string,checkpoint:string):Proposal=>({
 id,kind,projectSlug:'proof-path',projectGlyph:'∑',sessionNumber:2,
 origin:'chatgpt',reason:null,createdAt:'2026-11-06T08:00:00Z',
 card:kind==='card'?{front,back:'A proof',checkpoint,type:'basic',kind:'proof'}:null,
 cardEdit:kind==='card_edit'?{note_no:3,front,back:'A proof',current:{front,back:'A proof'},comments:[]}:null,
 plan:kind==='plan'?{checkpoints:[{code:checkpoint,title:front,steps:[]}] as never}:null,
 planChange:kind==='plan_change'?{ops:[]} :null,
} as unknown as Proposal);
const cardA=make('a','card','Proof of the fundamental theorem','C1');
const cardB=make('b','card_edit','Edit the argument','C1');
const planA=make('c','plan','Add an algebra checkpoint','C2');
const changeA=make('d','plan_change','Move an algebra checkpoint','C2');

describe('N32.2.1 v6 Inbox selected decisions',()=>{
 it('keeps selection owner-visible, deterministic, deduplicated and capped to 20',()=>{
  const all=[cardA,cardB,planA,cardA,changeA];
  expect(selectedPending(all,new Set(['d','a','foreign']))).toEqual([cardA,changeA]);
  expect(selectedPending(all,new Set())).toEqual([]);
  const many=Array.from({length:30},(_,i)=>make(String(i),'card','Front','C1'));
  expect(selectedPending(many,new Set(many.map(p=>p.id)))).toHaveLength(20);
 });
 it('approves exactly the selected IDs in source order and preserves each real response',async()=>{
  const approved:string[]=[];
  const reject=vi.fn(async()=>undefined);
  const result=await applySelectedDecisions(['a','b','a'],'approve',async id=>{
   approved.push(id);return {record:'real receipt'};
  },reject);
  expect(approved).toEqual(['a','b']);
  expect(reject).not.toHaveBeenCalled();
  expect(result).toEqual({succeeded:['a','b'],remaining:[],failed:false});
 });
 it('rejects without invoking approval and stops on first failed commit, leaving others untouched',async()=>{
  const attempts:string[]=[];
  const approve=vi.fn(async()=>undefined);
  const result=await applySelectedDecisions(['a','b','c'],'reject',approve,async id=>{
   attempts.push(id);
   if(id==='b')throw new Error('stale proposal conflict');
  });
  expect(attempts).toEqual(['a','b']);
  expect(result).toEqual({succeeded:['a'],remaining:['b','c'],failed:true});
  expect(approve).not.toHaveBeenCalled();
 });
 it('never reports a successful batch when its first atomic proposal decision fails',async()=>{
  const result=await applySelectedDecisions(['a','b'],'approve',async()=>{
   throw new Error('offline');
  },async()=>undefined);
  expect(result).toEqual({succeeded:[],remaining:['a','b'],failed:true});
 });
 it('renders full group names, real proposals, 44px labels and independent approval/rejection actions',()=>{
  const html=renderToStaticMarkup(createElement(SelectionPanel,{
   visible:[cardA,cardB],all:[cardA,cardB,planA],ids:new Set(['a']),
   kind:'cards',busy:false,onToggle:()=>{},onSelectPage:()=>{},onClear:()=>{},
   onStage:()=>{}
  }));
  expect(html).toContain('Select Inbox proposals');
  expect(html).toContain('S2 / C1');
  expect(html).toContain('Proof of the fundamental theorem');
  expect(html).toContain('Select Card edit: N3');
  expect(html).toContain('min-h-11');
  expect(html).toContain('Approve 1 selected');
  expect(html).toContain('Reject 1 selected');
  expect(html).toContain('type="checkbox"');
 });
 let root:Root,host:HTMLDivElement;
 beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
 });
 afterEach(async()=>{await act(async()=>root.unmount());host.remove()});
 it('uses native checkbox selection, page-select, Clear, and keyboard-activatable batch buttons',async()=>{
  const staged:('approve'|'reject')[]=[];
  function Harness(){
   const [ids,setIds]=useState<Set<string>>(new Set());
   return <SelectionPanel visible={[cardA,cardB]} all={[cardA,cardB,planA]}
    ids={ids} kind="cards" busy={false}
    onToggle={id=>setIds(old=>{const next=new Set(old);next.has(id)?next.delete(id):next.add(id);return next})}
    onSelectPage={()=>setIds(new Set(['a','b']))} onClear={()=>setIds(new Set())}
    onStage={action=>staged.push(action)}/>;
  }
  await act(async()=>root.render(createElement(Harness)));
  const selected=host.querySelector<HTMLInputElement>('input[aria-label="Select Proof of the fundamental theorem"]')!;
  expect(selected.checked).toBe(false);
  await act(async()=>selected.click());
  expect(selected.checked).toBe(true);
  const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
  await act(async()=>button('Approve 1 selected').click());
  expect(staged).toEqual(['approve']);
  await act(async()=>button('Select this page').click());
  expect(host.querySelectorAll('input:checked')).toHaveLength(2);
  await act(async()=>button('Reject 2 selected').click());
  expect(staged).toEqual(['approve','reject']);
  await act(async()=>button('Clear').click());
  expect(host.querySelectorAll('input:checked')).toHaveLength(0);
  expect((button('Approve 0 selected') as HTMLButtonElement).disabled).toBe(true);
 });
 it('keeps all selection UI behind v6Shell and extends the original six-second Undo stage',()=>{
  const source=readFileSync('src/features/proposals/Page.tsx','utf8');
  // N113: the selection panel sits behind the mockup's Browse queue control, still v6-only.
  expect(source).toContain('{v6&&!query.isLoading&&!query.isError&&<div hidden={!browsing||undefined} className="flex flex-col gap-3"><SelectionPanel');
  expect(source).toContain('setStaged({ids,action,label:');
  expect(source).toContain('applySelectedDecisions(ids,action,');
  expect(source).toContain('id=>approve.mutateAsync({id}),id=>reject.mutateAsync(id)');
  expect(source).toContain('},6000)');
  expect(source).toContain('>Undo</button>');
  expect(source).toContain('{!v6 && p.reason && (');
  expect(source).toContain('See the whole plan');
 });
});
