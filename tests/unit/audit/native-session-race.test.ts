// @vitest-environment jsdom
import {it,expect,vi} from 'vitest';
import {startNative} from '../../../src/platform/start';
import {FOCUS_CHANGED} from '../../../src/app/v7/focus';

const f=vi.hoisted(()=>({auth:null as any,native:null as any,calendar:[] as any[],timer:null as any,
 readEntry:(async()=>null) as ()=>Promise<any>,readBlocks:(async()=>[]) as ()=>Promise<any[]>}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>({
 auth:{onAuthStateChange:(cb:any)=>{f.auth=cb;return {data:{subscription:{unsubscribe:()=>{}}}};}},
 rpc:async()=>({data:{},error:null}),
})}));
vi.mock('../../../src/data/env',()=>({supabaseUrl:'https://example.invalid',supabasePublishableKey:'fake-anon-key'}));
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'live'}));
vi.mock('../../../src/data',()=>({getApi:()=>({getHome:async()=>({projects:[{id:'private-path-A',title:'Private Path A'}],due:0}),getSettings:async()=>({timeZone:'UTC',notify:{enabled:false}})})}));
vi.mock('../../../src/data/study',()=>({getStudyApi:()=>({activeStudyEntry:()=>f.readEntry(),listCalendarBlocks:()=>f.readBlocks()})}));
vi.mock('../../../src/data/parked-thoughts',()=>({getThoughtApi:()=>({})}));
vi.mock('../../../src/platform/bridge',()=>({lemmaNative:async()=>f.native}));
vi.mock('../../../src/platform/device',()=>({DEVICE_PREFS_CHANGED:'prefs',checkForUpdate:async()=>{},readDevicePref:(key:string)=>key==='calendarSync'}));
vi.mock('../../../src/platform/splash',()=>({whenRootPainted:()=>{}}));
vi.mock('../../../src/platform/NativeWelcome',()=>({default:()=>null}));
vi.mock('@capacitor/app',()=>({App:{getInfo:async()=>({version:'1'}),addListener:async()=>({}),getLaunchUrl:async()=>null,toggleBackButtonHandler:async()=>{}}}));

it('does not republish old-account timer/calendar data when reads finish after sign-out',async()=>{
 let releaseBlocks!:(b:any[])=>void,releaseEntry!:(e:any)=>void;
 let blocksPending=false,entryPending=false;
 f.readBlocks=()=>{blocksPending=true;return new Promise(resolve=>{releaseBlocks=resolve;});};
 f.native=new Proxy({
  pushToken:async()=>({configured:false,token:null}),timerPendingActions:async()=>({actions:[]}),shareTake:async()=>({items:[]}),
  calendarStatus:async()=>({permission:'granted'}),calendarSync:async({events}:any)=>{f.calendar=events;return {};},
  calendarRemoveAll:vi.fn(async()=>{f.calendar=[];return {};}),
  timerUpdate:async({state}:any)=>{f.timer=state;},timerClear:vi.fn(async()=>{f.timer=null;}),
 },{get(target:any,key){if(key==='then')return undefined;return key in target?target[key]:async()=>({});}});
 const interval=vi.spyOn(window,'setInterval').mockReturnValue(1);
 await startNative();await vi.waitFor(()=>expect(blocksPending).toBe(true));await vi.waitFor(()=>expect(f.auth).not.toBeNull());
 f.readEntry=()=>{entryPending=true;return new Promise(resolve=>{releaseEntry=resolve;});};
 window.dispatchEvent(new Event(FOCUS_CHANGED));await vi.waitFor(()=>expect(entryPending).toBe(true));
 f.auth('SIGNED_OUT',null);
 expect(f.native.calendarRemoveAll).toHaveBeenCalled();expect(f.timer).toBeNull();expect(f.calendar).toEqual([]);
 releaseBlocks([{id:'private-block-A',kind:'study',status:'planned',title:'Private appointment A',startsAt:'2026-11-15T09:00:00Z',endsAt:'2026-11-15T10:00:00Z',timeZone:'UTC'}]);
 releaseEntry({id:'private-entry-A',version:2,status:'running',intent:'Private intention A',projectId:'private-path-A',mode:'open',intervals:[{kind:'focus',start:new Date(Date.now()-60000).toISOString(),end:null}]});
 await new Promise(resolve=>setTimeout(resolve,30));
 console.info('native state after completed sign-out cleanup and late reads',{calendar:f.calendar,timer:f.timer});
 interval.mockRestore();
 expect({calendar:f.calendar,timer:f.timer}).toEqual({calendar:[],timer:null});
});
