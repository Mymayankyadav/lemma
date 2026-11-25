import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act} from 'react';
import type {Root} from 'react-dom/client';
import {startNative} from '../../../src/platform/start';
import {holdCaptureText,takeCaptureText,takeSharedSources} from '../../../src/platform/share';

const f=vi.hoisted(()=>({native:null as any,items:[] as any[],ack:vi.fn(),toast:vi.fn(),roots:[] as Array<{root:Root;host:Node}>}));
vi.mock('react-dom/client',async importOriginal=>{
 const actual=await importOriginal<typeof import('react-dom/client')>();
 return {...actual,createRoot:(...args:Parameters<typeof actual.createRoot>)=>{
  const root=actual.createRoot(...args);f.roots.push({root,host:args[0]});return root;
 }};
});
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async()=>({data:{},error:null})})}));
vi.mock('../../../src/data/env',()=>({supabaseUrl:'https://example.invalid',supabasePublishableKey:'fake'}));
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'live'}));
vi.mock('../../../src/data',()=>({getApi:()=>({getAuth:async()=>null,getHome:async()=>({projects:[],due:0}),getSettings:async()=>({timeZone:'UTC',notify:{enabled:false}})})}));
vi.mock('../../../src/data/study',()=>({getStudyApi:()=>({activeStudyEntry:async()=>null,listCalendarBlocks:async()=>[]})}));
vi.mock('../../../src/data/parked-thoughts',()=>({getThoughtApi:()=>({})}));
vi.mock('../../../src/ui/Toast',()=>({toast:f.toast}));
vi.mock('../../../src/platform/bridge',()=>({lemmaNative:async()=>f.native}));
vi.mock('../../../src/platform/device',()=>({DEVICE_PREFS_CHANGED:'prefs',checkForUpdate:async()=>{},readDevicePref:()=>false}));
vi.mock('../../../src/platform/splash',()=>({whenRootPainted:()=>{}}));
vi.mock('../../../src/platform/NativeWelcome',()=>({default:()=>null}));
vi.mock('@capacitor/app',()=>({App:{getInfo:async()=>({version:'1'}),addListener:async()=>({}),getLaunchUrl:async()=>null,toggleBackButtonHandler:async()=>{}}}));
vi.mock('@capacitor/core',()=>({Capacitor:{convertFileSrc:(path:string)=>path}}));
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 f.items=[];f.ack.mockReset().mockResolvedValue(undefined);f.toast.mockReset();
 while(takeCaptureText()!==null){/* drain the previous test */}takeSharedSources();
 f.native=new Proxy({pushToken:async()=>({configured:false,token:null}),timerPendingActions:async()=>({actions:[]}),shareTake:async()=>({items:f.items.splice(0)}),shareAck:f.ack},
  {get(target:any,key){if(key==='then')return undefined;return key in target?target[key]:async()=>({});}});
 vi.spyOn(window,'setInterval').mockReturnValue(1);vi.spyOn(window,'setTimeout').mockReturnValue(1);
});
async function start(){
 // Startup intentionally launches Welcome without awaiting it. Drain that
 // import and its real React render while this test still owns its DOM.
 await act(async()=>{await startNative();await vi.dynamicImportSettled();});
}
afterEach(async()=>{
 await act(async()=>{await vi.dynamicImportSettled();});
 await act(async()=>{
  for(const {root,host} of f.roots.splice(0)){root.unmount();host.parentNode?.removeChild(host);}
 });
 vi.restoreAllMocks();vi.unstubAllGlobals();
});

describe('native shares retain accepted input (#1795, #1796)',()=>{
 it('preserves both texts drained together until each capture consumes one',async()=>{
  f.items=[{kind:'text',text:'Lemma one'},{kind:'text',text:'Lemma two'}];
  await start();
  expect(takeCaptureText()).toBe('Lemma one');expect(takeCaptureText()).toBe('Lemma two');expect(takeCaptureText()).toBeNull();
 });
 it('does not overwrite a text already waiting for capture',()=>{
  holdCaptureText('Original proof');holdCaptureText('New proof');
  expect(takeCaptureText()).toBe('Original proof');expect(takeCaptureText()).toBe('New proof');
 });
 it('does not consume or acknowledge a native file when the bridge responds 404',async()=>{
  f.items=[{kind:'files',files:[{path:'local-notes',name:'proof.pdf',mime:'application/pdf'}]}];
  const blob=vi.fn(async()=>new Blob(['Missing local file']));vi.stubGlobal('fetch',async()=>({ok:false,status:404,blob}));
  await start();
  expect(blob).not.toHaveBeenCalled();expect(takeSharedSources()).toEqual([]);expect(f.ack).not.toHaveBeenCalled();
  expect(f.toast).toHaveBeenCalledWith('Lemma could not open what was shared. Try again.',{tone:'danger'});
 });
 it('acknowledges successful bytes only after staging all files',async()=>{
  f.items=[{kind:'files',files:[{path:'local-notes',name:'proof.md',mime:'text/markdown'}]}];
  const bytes=new Blob(['My proof'],{type:'text/markdown'});vi.stubGlobal('fetch',async()=>({ok:true,status:200,blob:async()=>bytes}));
  f.ack.mockImplementation(async()=>{expect(takeSharedSources().map(file=>[file.name,file.size])).toEqual([['proof.md',bytes.size]]);});
  await start();expect(f.ack).toHaveBeenCalledOnce();expect(f.ack).toHaveBeenCalledWith({paths:['local-notes']});
 });
});
