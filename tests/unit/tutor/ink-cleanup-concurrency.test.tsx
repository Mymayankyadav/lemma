import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useTutorInk} from '../../../src/features/tutor/TutorInk';
import {authGeneration,publishAuth} from '../../../src/data/authBoundary';
import {emptyInk,imageData,readInkDraft,removeSubmittedInk,writeInkDraft,type InkDraft,type TutorInkScope} from '../../../src/data/tutor/ink-storage';
import {imageReference} from '../../../supabase/functions/_shared/tutor-answer';

// A transaction-shaped store: reads see the last completed write, and each
// readwrite transaction commits atomically. Separate hook instances model tabs.
function installStore(){
 const data=new Map<string,unknown>(),pending:Array<()=>void>=[];let running=false;
 const clone=(value:any):any=>value instanceof Blob?value:Array.isArray(value)?value.map(clone):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,clone(item)])):value;
 const next=()=>{running=false;const start=pending.shift();if(start){running=true;queueMicrotask(start);}};
 const db={close:vi.fn(),onversionchange:null,transaction:(_names:unknown,mode:string)=>{
  const operations:Array<()=>void>=[];let finished=false,working:Map<string,unknown>;
  const tx:any={oncomplete:null,onabort:null,error:null,abort(){if(finished)return;finished=true;tx.onabort?.();next();},objectStore:(name:string)=>({
   get:(key:string)=>request(()=>clone(working.get(name+':'+key))),
   put:(value:unknown,key:string)=>request(()=>{working.set(name+':'+key,clone(value));return key;}),
  })};
  function pump(){
   if(finished)return;const operation=operations.shift();
   if(operation){operation();queueMicrotask(pump);return;}
   finished=true;if(mode==='readwrite'){data.clear();for(const [key,value] of working)data.set(key,value);}
   tx.oncomplete?.();next();
  }
  function request(operation:()=>unknown){
   const request:any={result:undefined,onsuccess:null};
   operations.push(()=>{request.result=operation();request.onsuccess?.();});
   return request;
  }
  pending.push(()=>{working=new Map(data);pump();});
  if(!running)next();return tx;
 }};
 vi.stubGlobal('indexedDB',{open:()=>{const request:any={result:db,onsuccess:null};queueMicrotask(()=>request.onsuccess?.());return request;}});
}

let root:Root,host:HTMLElement,scope:TutorInkScope,tabs:Array<ReturnType<typeof useTutorInk>>;
function Tab({index}:{index:number}){tabs[index]=useTutorInk(scope,true);return null;}
const photo=(id:string)=>({id,kind:'photo' as const,mimeType:'image/png',blob:new Blob(['bytes:'+id],{type:'image/png'})});
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();history.replaceState({},'','/?demo=0');publishAuth(null);publishAuth({id:'ink-owner'});
 scope={ownerId:'ink-owner',generation:authGeneration(),pathId:'p',checkpointId:'cp'};tabs=[];installStore();
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();publishAuth(null);vi.unstubAllGlobals();});

describe('submitted-image cleanup (#1751)',()=>{
 it('removes only the submitted image from the latest durable draft, preserving a newer tab image and bytes',async()=>{
  await writeInkDraft(scope,{...emptyInk,photos:[photo('A')]});
  await act(async()=>root.render(<><Tab index={0}/><Tab index={1}/></>));
  await vi.waitFor(()=>expect(tabs.every(tab=>tab.ready)).toBe(true));
  await act(async()=>{await tabs[1].update(current=>({...current,photos:[...current.photos,photo('B')]}));});
  expect(tabs[0].draft.photos.map(item=>item.id)).toEqual(['A']);
  await act(async()=>{
   await (tabs[0].update as any)((current:InkDraft)=>removeSubmittedInk(current,new Set(['A'])),{latestStored:true});
  });
  const saved=await readInkDraft(scope);
  expect(saved.photos.map(item=>item.id)).toEqual(['B']);
  expect(await imageData(saved.photos[0].blob)).toBe('data:image/png;base64,Ynl0ZXM6Qg==');
  expect(tabs[0].draft.photos.map(item=>item.id)).toEqual(['B']);
 });
 it('keeps the second tab drawing state while deleting an older submitted image',async()=>{
  await writeInkDraft(scope,{...emptyInk,photos:[photo('A')]});
  await act(async()=>root.render(<><Tab index={0}/><Tab index={1}/></>));
  await vi.waitFor(()=>expect(tabs.every(tab=>tab.ready)).toBe(true));
  const strokes=[[{x:12,y:14},{x:22,y:24}]];
  await act(async()=>{await tabs[1].update(current=>({...current,strokes,drawingId:'new-drawing'}));});
  await act(async()=>{await (tabs[0].update as any)((current:InkDraft)=>removeSubmittedInk(current,new Set(['A'])),{latestStored:true});});
  expect(await readInkDraft(scope)).toMatchObject({photos:[],strokes,drawingId:'new-drawing'});
 });
 it('retains a newer queued answer and accepted wording until its own image is submitted',async()=>{
  const first='11111111-1111-4111-8111-111111111111',second='22222222-2222-4222-8222-222222222222';
  const queuedText='Let '+imageReference(second);
  const queuedAcceptedSpans=[{start:0,end:3,text:'Let',source:'tutor' as const}];
  await writeInkDraft(scope,{...emptyInk,inlineImages:true,photos:[photo(first)]});
  await act(async()=>root.render(<><Tab index={0}/><Tab index={1}/></>));
  await vi.waitFor(()=>expect(tabs.every(tab=>tab.ready)).toBe(true));
  await act(async()=>{await tabs[1].update(current=>({...current,photos:[...current.photos,photo(second)],queuedText,queuedAcceptedSpans}));});
  await act(async()=>{await tabs[0].update(current=>removeSubmittedInk(current,new Set([first])),{latestStored:true});});
  const saved=await readInkDraft(scope);
  expect(saved.photos.map(item=>item.id)).toEqual([second]);
  expect(saved.queuedText).toBe(queuedText);
  expect(saved.queuedAcceptedSpans).toEqual(queuedAcceptedSpans);
  expect(tabs[0].draft.queuedText).toBe(queuedText);
  await act(async()=>{await tabs[0].update(current=>removeSubmittedInk(current,new Set([second]),{question:queuedText,acceptedSpans:queuedAcceptedSpans}),{latestStored:true});});
  expect(await readInkDraft(scope)).toMatchObject({photos:[],queuedText:undefined,queuedAcceptedSpans:undefined});
 });
 it.each(['text','provenance'])('preserves a newer queued answer that reuses the sent image but changes its %s',async change=>{
  const id='11111111-1111-4111-8111-111111111111',original='Let '+imageReference(id);
  const queuedText=(change==='text'?'New ':'Let ')+imageReference(id);
  const queuedAcceptedSpans=[{start:0,end:3,text:queuedText.slice(0,3),source:'tutor' as const}];
  const submitted={question:original,acceptedSpans:[{start:0,end:3,text:'Let',source:'word' as const}]};
  await writeInkDraft(scope,{...emptyInk,inlineImages:true,photos:[photo(id)]});
  await act(async()=>root.render(<><Tab index={0}/><Tab index={1}/></>));
  await vi.waitFor(()=>expect(tabs.every(tab=>tab.ready)).toBe(true));
  await act(async()=>{await tabs[1].update(current=>({...current,queuedText,queuedAcceptedSpans}));});
  await act(async()=>{await tabs[0].update(current=>removeSubmittedInk(current,new Set([id]),submitted),{latestStored:true});});
  const saved=await readInkDraft(scope);
  expect(saved.photos.map(item=>item.id)).toEqual([id]);
  expect(saved.queuedText).toBe(queuedText);
  expect(saved.queuedAcceptedSpans).toEqual(queuedAcceptedSpans);
  expect(await imageData(saved.photos[0].blob)).toBe(await imageData(photo(id).blob));
  await act(async()=>{await tabs[0].update(current=>removeSubmittedInk(current,new Set([id]),
   {question:queuedText,acceptedSpans:queuedAcceptedSpans}),{latestStored:true});});
  expect(await readInkDraft(scope)).toMatchObject({photos:[],queuedText:undefined,queuedAcceptedSpans:undefined});
 });
 it('recognizes the confirmed answer after transcript whitespace and accepted-span normalization',()=>{
  const id='11111111-1111-4111-8111-111111111111',question='Let '+imageReference(id);
  const draft={...emptyInk,inlineImages:true as const,photos:[photo(id)],queuedText:'  '+question+'  ',
   queuedAcceptedSpans:[{start:2,end:5,text:'Let',source:'tutor' as const}]};
  expect(removeSubmittedInk(draft,new Set([id]),{question,
   acceptedSpans:[{start:0,end:3,text:'Let',source:'tutor'}]})).toMatchObject({
   photos:[],queuedText:undefined,queuedAcceptedSpans:undefined,
  });
 });
 it('rejects cleanup after an account generation changes',async()=>{
  await writeInkDraft(scope,{...emptyInk,photos:[photo('A')]});
  await act(async()=>root.render(<Tab index={0}/>));await vi.waitFor(()=>expect(tabs[0].ready).toBe(true));
  publishAuth(null);publishAuth({id:'ink-owner'});
  await expect((tabs[0].update as any)((current:InkDraft)=>removeSubmittedInk(current,new Set(['A'])),{latestStored:true})).rejects.toThrow('account changed');
  const currentScope={...scope,generation:authGeneration()};
  expect((await readInkDraft(currentScope)).photos.map(item=>item.id)).toEqual(['A']);
 });
});
