import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {WeekdayCapacity} from '../../../src/features/adaptive/WeekdayCapacity';
import {useAgenda,type AgendaRead} from '../../../src/data/adaptive/agenda-api';
import {authGeneration,authOwner,publishAuth} from '../../../src/data/authBoundary';

const fixture=vi.hoisted(()=>{
 const single=vi.fn(),rpc=vi.fn(),getUser=vi.fn(),invoke=vi.fn();
 const query={select:vi.fn(),eq:vi.fn(),single};
 query.select.mockReturnValue(query);query.eq.mockReturnValue(query);
 return {minutes:Array<number>(7).fill(60),rpc,getUser,invoke,single,query,
  db:{from:vi.fn(()=>query),rpc,auth:{getUser},functions:{invoke}}};
});
vi.mock('../../../src/data/mode',()=>({getMode:()=> 'live',getDemoProfile:()=> 'default'}));
vi.mock('../../../src/data/live/client',()=>({liveClient:()=>fixture.db}));
vi.mock('../../../src/data/usePlanRelease',()=>({usePlanRelease:()=>true}));
vi.mock('../../../src/data/hooks',()=>({useSettings:()=>({data:{timeZone:'UTC',rolloverHour:0}})}));

let host:HTMLDivElement,root:Root,cache:QueryClient;
function Agenda(){
 const {query}=useAgenda();
 return <output aria-label="Next action">{query.data?.label} · {query.data?.decision.outcome.kind}</output>;
}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 publishAuth({id:'owner-a'});sessionStorage.clear();fixture.minutes=Array<number>(7).fill(60);
 fixture.query.select.mockReturnValue(fixture.query);fixture.query.eq.mockReturnValue(fixture.query);fixture.db.from.mockReturnValue(fixture.query);
 fixture.getUser.mockImplementation(async()=>({data:{user:{id:authOwner()}},error:null}));
 fixture.single.mockImplementation(async()=>({data:{capacity:{weekday_minutes:[...fixture.minutes]}},error:null}));
 fixture.rpc.mockImplementation(async(_name:string,args:{p_operation_id:string;p_minutes:number[]})=>{
  fixture.minutes=[...args.p_minutes];return {data:{operationId:args.p_operation_id,status:'applied'},error:null};
 });
 fixture.invoke.mockImplementation(async()=>{
  const available=fixture.minutes.some(value=>value>0);
  const outcome=available?{kind:'action' as const,taskId:'review-card',start:0,end:5}:{kind:'no-capacity' as const,until:null};
  const agenda:AgendaRead={label:'Study for '+authOwner(),decision:{asOf:new Date().toISOString(),
   snapshotVersion:'capacity-'+fixture.minutes.join(','),requested:'new',effective:'new',policyVersion:'v3',reason:'capacity',outcome,baseline:outcome}};
  return {data:{released:true,agenda},error:null};
 });
 for(const [method,open] of [['showModal',true],['close',false]] as const)
  Object.defineProperty(HTMLDialogElement.prototype,method,{configurable:true,value:function(this:HTMLDialogElement){this.open=open;}});
 cache=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());cache.clear();host.remove();sessionStorage.clear();vi.resetAllMocks();});

async function settled(assertion:()=>void){
 let failure:unknown;
 for(let attempt=0;attempt<100;attempt++){
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});
  try{assertion();return;}catch(error){failure=error;}
 }
 throw failure;
}
async function render(){
 await act(async()=>root.render(<QueryClientProvider client={cache}><div key={authGeneration()}><WeekdayCapacity/><Agenda/></div></QueryClientProvider>));
 await settled(()=>{
  expect(host.querySelector('output')?.textContent).toBe('Study for '+authOwner()+' · action');
  expect(host.textContent).toContain('Available today · 60 min');
 });
}
async function press(label:string){
 const button=[...host.querySelectorAll('button')].find(button=>button.textContent===label);
 expect(button,'button '+label).toBeDefined();await act(async()=>button!.click());
}
async function clearAvailability(){
 await press('Edit weekday minutes');
 await act(async()=>{
  const setValue=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!;
  for(const input of host.querySelectorAll('input')){
   setValue.call(input,'0');input.dispatchEvent(new Event('input',{bubbles:true}));
  }
 });
}

it('immediately replaces the displayed agenda after a confirmed weekday save without waiting for the 30 second poll',async()=>{
 await render();expect(fixture.invoke).toHaveBeenCalledTimes(1);
 expect(cache.getQueryData(['agenda','live',authGeneration()])).toBeDefined();
 await clearAvailability();await press('Save availability');
 await settled(()=>expect(host.textContent).toContain('Available today · 0 min'));
 expect(host.querySelector('dialog')).toBeNull();
 await settled(()=>expect(host.querySelector('output')?.textContent).toBe('Study for owner-a · no-capacity'));
 expect(fixture.invoke).toHaveBeenCalledTimes(2);
 expect(fixture.invoke).toHaveBeenLastCalledWith('mcp/agenda',{method:'POST'});
});

it('does not refresh the agenda with rejected availability after a save conflict',async()=>{
 fixture.rpc.mockImplementationOnce(async(_name:string,args:{p_operation_id:string})=>({data:{operationId:args.p_operation_id,status:'conflict'},error:null}));
 await render();await clearAvailability();await press('Save availability');
 await settled(()=>expect(host.querySelector('[role="alert"]')?.textContent).toContain('Availability changed elsewhere'));
 expect(host.querySelector('dialog')?.open).toBe(true);
 expect(host.querySelector('output')?.textContent).toBe('Study for owner-a · action');
 expect(fixture.invoke).toHaveBeenCalledTimes(1);
 expect(cache.getQueryState(['agenda','live',authGeneration()])?.isInvalidated).toBe(false);
});

it('does not refresh the new owner agenda when the old owner save acknowledgement arrives after an account switch',async()=>{
 let finish:(value:{data:{operationId:string;status:string};error:null})=>void=()=>{};
 fixture.rpc.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 await render();await clearAvailability();await press('Save availability');
 await settled(()=>expect(fixture.rpc).toHaveBeenCalledTimes(1));
 const operationId=fixture.rpc.mock.calls[0][1].p_operation_id as string;
 await act(async()=>publishAuth({id:'owner-b'}));await render();
 expect(fixture.invoke).toHaveBeenCalledTimes(2);
 await act(async()=>{finish({data:{operationId,status:'applied'},error:null});});
 await settled(()=>expect(host.querySelector('output')?.textContent).toBe('Study for owner-b · action'));
 expect(fixture.invoke).toHaveBeenCalledTimes(2);
 expect(cache.getQueryState(['agenda','live',authGeneration()])?.isInvalidated).toBe(false);
});
