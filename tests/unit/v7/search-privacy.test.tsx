import {act,type ReactNode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import SearchSheet from '../../../src/app/v7/SearchSheet';
import {publishAuth} from '../../../src/data/authBoundary';
import {readRoomRecent,rememberRoomItem} from '../../../src/ui/v7/room';

const f=vi.hoisted(()=>({home:{projects:[] as any[],due:0},atlas:{concepts:[]},room:false}));
vi.mock('../../../src/data/hooks',()=>({useHome:()=>({data:f.home}),useAtlas:()=>({data:f.atlas})}));
vi.mock('../../../src/data',()=>({getApi:()=>({getProject:async()=>null,searchCards:async()=>[]})}));
vi.mock('../../../src/data/tasks',()=>({getTaskApi:()=>({listTasks:async()=>({items:[]})})}));
vi.mock('../../../src/data/StudyUiRelease',()=>({useStudyUi:()=>false}));
vi.mock('../../../src/flags',()=>({isFlagOn:(name:string)=>name==='v7Room'&&f.room}));
vi.mock('../../../src/ui/v7/components',()=>({Sheet:({open,children}:{open:boolean;children:ReactNode})=>open?<div>{children}</div>:null,Button:({children,...props}:any)=><button {...props}>{children}</button>}));

let root:Root,host:HTMLElement;
const privateItem={id:'path:private',group:'Paths' as const,title:'PRIVATE_OWNER_A_TITLE',parent:'Private A subject',to:'/p/private'};
const render=(query?:string)=>act(async()=>root.render(<SearchSheet open onClose={()=>{}} onPick={()=>{}} initial={query===undefined?undefined:{query,activeId:null,expanded:[]}}/>));
async function reopen(){await act(async()=>root.unmount());root=createRoot(host);await render();}
async function rememberThroughSearch(){
 f.home={projects:[{id:'p',slug:'private',title:privateItem.title,subject:{name:privateItem.parent},system:false}],due:0};
 await render('PRIVATE_OWNER_A');
 const found=[...host.querySelectorAll('button')].find(button=>button.textContent?.includes(privateItem.title));
 expect(found).toBeDefined();await act(async()=>found!.click());
 f.home={projects:[],due:0};await reopen();expect(host.textContent).toContain(privateItem.title);
}
beforeEach(()=>{
 localStorage.clear();sessionStorage.clear();history.replaceState({},'','/?demo=0');
 publishAuth(null);publishAuth({id:'owner-a'});f.home={projects:[],due:0};f.room=false;
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();publishAuth(null);vi.restoreAllMocks();});

describe('private navigation recents (#1758)',()=>{
 it.each([false,true])('discards rendered and persisted A recents at sign-out and owner changes (room=%s)',async room=>{
  f.room=room;await rememberThroughSearch();
  await act(async()=>publishAuth(null));await render();
  expect(host.textContent).not.toContain(privateItem.title);
  await act(async()=>publishAuth({id:'owner-b'}));await render();
  expect(host.textContent).not.toContain(privateItem.title);
  await reopen();expect(host.textContent).not.toContain(privateItem.title);
  await act(async()=>publishAuth({id:'owner-a'}));await render();
  expect(host.textContent).toContain(privateItem.title);
 });
 it('isolates live history from demo history and demo profiles',async()=>{
  await rememberThroughSearch();history.replaceState({},'','/?demo=1');await render();
  expect(host.textContent).not.toContain(privateItem.title);
  rememberRoomItem({...privateItem,title:'DEMO_ONLY'});expect(readRoomRecent()[0]?.title).toBe('DEMO_ONLY');
  history.replaceState({},'','/?demo=stress');expect(readRoomRecent()).toEqual([]);
  history.replaceState({},'','/?demo=0');expect(readRoomRecent()).toEqual([]);
 });
 it('never adopts the legacy unowned history even for the first authenticated reader',async()=>{
  for(const key of ['lemma.v7.recent','lemma.v7.room.recent'])localStorage.setItem(key,JSON.stringify([privateItem]));
  await render();expect(host.textContent).not.toContain(privateItem.title);
  expect(readRoomRecent()).toEqual([]);
  expect(localStorage.getItem('lemma.v7.recent')).toBeNull();
  expect(localStorage.getItem('lemma.v7.room.recent')).toBeNull();
 });
 it('does not remember private room titles while signed out',()=>{
  publishAuth(null);rememberRoomItem(privateItem);expect(readRoomRecent()).toEqual([]);
  publishAuth({id:'owner-b'});expect(readRoomRecent()).toEqual([]);
 });
});
