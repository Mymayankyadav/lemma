import {describe,expect,it,vi} from 'vitest';
import {SCREEN_ROUTES,deviceKey,drainDeviceCommands,runDeviceCommand,startDeviceCommandRunner,type RunDeps} from '../../../src/platform/deviceCommands';
import type {DeviceCommand,DeviceCommandApi} from '../../../src/data/device-commands/contract';

const FUTURE=new Date(Date.now()+60_000).toISOString();
const cmd=(kind:DeviceCommand['kind'],payload:Record<string,unknown>,expiresAt=FUTURE):DeviceCommand=>({id:'c1',kind,payload,expiresAt});
const entry=(status='running')=>({id:'e1',version:3,status} as any);
function deps(active:any=null){
 const calls:string[]=[];
 const study:any={
  activeStudyEntry:vi.fn(async()=>active),
  startStudyEntry:vi.fn(async(i:any)=>{calls.push('start:'+i.intent);return {record:entry(),actionNo:1}}),
  pauseStudyEntry:vi.fn(async(id:string,v:number)=>{calls.push('pause:'+id+':'+v)}),
  resumeStudyEntry:vi.fn(async(id:string,v:number)=>{calls.push('resume:'+id+':'+v)}),
  breakStudyEntry:vi.fn(async()=>{calls.push('break')}),
  nextPhase:vi.fn(async()=>{calls.push('next_phase')}),
  saveStudyEntry:vi.fn(async()=>{calls.push('save')}),
  discardStudyEntry:vi.fn(async()=>{calls.push('discard')}),
 };
 const nav:string[]=[];
 const d:RunDeps={navigate:to=>{nav.push(to)},study,changed:()=>{calls.push('changed')},
  locate:{path:async id=>id==='p1'?'/p/algebra':null,checkpoint:async id=>id==='k1'?'/p/algebra/cp/CP2':null}};
 return {d,calls,nav,study};
}
describe('N160 device commands: running what chat sent',()=>{
 it('opens each allowed screen through its route',async()=>{
  const {d,nav}=deps();
  for(const screen of Object.keys(SCREEN_ROUTES))expect(await runDeviceCommand(cmd('open',{screen}),d)).toEqual({status:'applied'});
  expect(nav).toEqual(Object.values(SCREEN_ROUTES));
  expect(SCREEN_ROUTES.today).toBe('/');
  expect((await runDeviceCommand(cmd('open',{screen:'nowhere'}),d)).status).toBe('rejected');
 });
 it('opens records it can find, and rejects the rest with a reason',async()=>{
  const {d,nav}=deps();
  expect(await runDeviceCommand(cmd('open',{record:{type:'path',id:'p1'}}),d)).toEqual({status:'applied'});
  expect(await runDeviceCommand(cmd('open',{record:{type:'checkpoint',id:'k1'}}),d)).toEqual({status:'applied'});
  expect(await runDeviceCommand(cmd('open',{record:{type:'task',id:'t1'}}),d)).toEqual({status:'applied'});
  expect(nav).toEqual(['/p/algebra','/p/algebra/cp/CP2','/tasks']);
  expect(await runDeviceCommand(cmd('open',{record:{type:'path',id:'zzz'}}),d)).toEqual({status:'rejected',reason:'That path is not on this account'});
 });
 it('drives the timer with the same API calls and the entry\'s own version',async()=>{
  const running=deps(entry('running'));
  expect(await runDeviceCommand(cmd('timer',{action:'pause'}),running.d)).toEqual({status:'applied'});
  expect(running.calls).toEqual(['pause:e1:3','changed']);
  for(const [action,call] of [['break','break'],['next_phase','next_phase'],['save','save'],['discard','discard']] as const){
   const x=deps(entry('running'));
   expect((await runDeviceCommand(cmd('timer',{action}),x.d)).status).toBe('applied');
   expect(x.calls[0]).toBe(call);
  }
  const paused=deps(entry('paused'));
  expect((await runDeviceCommand(cmd('timer',{action:'resume'}),paused.d)).status).toBe('applied');
  expect(paused.calls[0]).toBe('resume:e1:3');
 });
 it('refuses a timer action that does not fit, with a reason chat can read',async()=>{
  expect(await runDeviceCommand(cmd('timer',{action:'pause'}),deps(null).d)).toEqual({status:'rejected',reason:'No timer is running'});
  expect(await runDeviceCommand(cmd('timer',{action:'pause'}),deps(entry('paused')).d)).toEqual({status:'rejected',reason:'The timer is already paused'});
  expect(await runDeviceCommand(cmd('timer',{action:'resume'}),deps(entry('running')).d)).toEqual({status:'rejected',reason:'The timer is already running'});
  expect(await runDeviceCommand(cmd('timer',{action:'start'}),deps(entry()).d)).toEqual({status:'rejected',reason:'A timer is already running'});
  const none=deps(null);
  expect((await runDeviceCommand(cmd('timer',{action:'start',intent:'Proofs'}),none.d)).status).toBe('applied');
  expect(none.calls[0]).toBe('start:Proofs');
  expect((await runDeviceCommand(cmd('timer',{action:'dance'}),deps(entry()).d)).status).toBe('rejected');
 });
 it('never runs an expired command, and reports a failing call as rejected',async()=>{
  const x=deps(entry());
  const old=cmd('timer',{action:'pause'},new Date(Date.now()-1000).toISOString());
  expect(await runDeviceCommand(old,x.d)).toEqual({status:'rejected',reason:'The command expired before this device ran it'});
  expect(x.study.activeStudyEntry).not.toHaveBeenCalled();
  x.study.pauseStudyEntry.mockRejectedValueOnce(new Error('The timer changed; try again'));
  expect(await runDeviceCommand(cmd('timer',{action:'pause'}),x.d)).toEqual({status:'rejected',reason:'The timer changed; try again'});
 });
});
describe('N160 device commands: delivery confirmation',()=>{
 const fakeApi=(waiting:DeviceCommand[]):{api:DeviceCommandApi;reports:string[]}=>{
  const reports:string[]=[];
  return {reports,api:{mode:'live',register:async()=>({id:'dev1'}),pending:async()=>waiting,
   report:async(id,stage,reason)=>{reports.push(id+':'+stage+(reason?':'+reason:''))},subscribe:()=>()=>undefined}};
 };
 it('reports delivered before it acts, then applied or rejected',async()=>{
  const {api,reports}=fakeApi([cmd('open',{screen:'review'}),{...cmd('timer',{action:'pause'}),id:'c2'}]);
  const {d}=deps(null);
  expect(await drainDeviceCommands(api,'dev1',d)).toBe(2);
  expect(reports).toEqual(['c1:delivered','c1:applied','c2:delivered','c2:rejected:No timer is running']);
 });
 it('registers, drains at once and again on a live change, and stops cleanly',async()=>{
  vi.useFakeTimers();
  const waiting=[cmd('open',{screen:'today'})];
  const reports:string[]=[];let change=()=>{};let unsubscribed=false;
  const api:DeviceCommandApi={mode:'live',register:async()=>({id:'dev1'}),
   pending:async()=>waiting.splice(0),report:async(id,stage)=>{reports.push(id+':'+stage)},
   subscribe:(_id,onChange)=>{change=onChange;return()=>{unsubscribed=true}}};
  const {d,nav}=deps();
  const stop=startDeviceCommandRunner(api,d,{key:'k1234567',label:'Web',platform:'web'},{pollMs:1000});
  await vi.advanceTimersByTimeAsync(10);
  expect(nav).toEqual(['/']);
  waiting.push({...cmd('open',{screen:'review'}),id:'c9'});
  change();await vi.advanceTimersByTimeAsync(10);
  expect(reports).toEqual(['c1:delivered','c1:applied','c9:delivered','c9:applied']);
  stop();expect(unsubscribed).toBe(true);
  vi.useRealTimers();
 });
 it('keeps one stable device key',()=>{
  const store=new Map<string,string>();
  const storage={getItem:(k:string)=>store.get(k)??null,setItem:(k:string,v:string)=>{store.set(k,v)}};
  const first=deviceKey(storage);
  expect(first).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  expect(deviceKey(storage)).toBe(first);
 });
});
