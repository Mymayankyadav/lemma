import {act,type ReactNode} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {DemoAdapter,demoSeedFixture} from '../../../src/data/demo/adapter';
import {assemble} from '../../../supabase/functions/_shared/adaptive/facts';
import {renderQueue} from '../../../supabase/functions/_shared/adaptive/queue';
import {TodayScheduler,ProjectScheduler,TodaySchedulerView} from '../../../src/features/adaptive/Views';
import LegacyCheckpoint from '../../../src/features/checkpoint/Page';
import {Stages} from '../../../src/features/project/PathsView';
import V6Checkpoint from '../../../src/features/checkpoint/v6/V6Checkpoint';
import CheckpointV7 from '../../../src/features/checkpoint/v7/CheckpointV7';
import V6Project from '../../../src/features/project/v6/V6Project';
import V7Path from '../../../src/features/project/v7/V7Path';

const mock=vi.hoisted(()=>({settings:{} as any,project:{} as any,checkpoint:{} as any,adaptive:{} as any}));
vi.mock('../../../src/data/hooks',()=>({
 useSettings:()=>({data:mock.settings}),useProject:()=>({data:mock.project}),useCheckpoint:()=>({data:mock.checkpoint}),
 useInsightData:()=>({data:{checkpointEvents:[]}}),useHome:()=>({data:{projects:[],pendingProposals:0}}),useSearchCards:()=>({data:[]}),
}));
vi.mock('../../../src/features/adaptive/useAdaptive',()=>({useAdaptive:()=>mock.adaptive}));
vi.mock('../../../src/features/project/Page',()=>({default:()=>null}));
vi.mock('../../../src/features/project/useProjectInsight',()=>({useProjectInsight:()=>({data:{checkpointEvents:[]}})}));
vi.mock('../../../src/ui/Sheet',()=>({Sheet:({children}:{children:ReactNode})=><section>{children}</section>}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>vi.fn()}));
vi.mock('../../../src/app/v7/PageHeaders',()=>({DetailHeader:({title}:{title:string})=><header>{title}</header>}));
vi.mock('../../../src/app/v7/Margin',()=>({Margin:()=>null}));
vi.mock('../../../src/features/project/SourcesPanel',()=>({SourcesPanel:()=>null}));
vi.mock('../../../src/features/project/ProjectSwitcher',()=>({ProjectSwitcher:()=>null,default:()=>null}));
vi.mock('../../../src/flags',()=>({isFlagOn:()=>false}));
let root:Root,host:HTMLDivElement,slug:string,id:string;
const flags={time_block:true,recheck_v2:true,scheduler_v2:true};
function mount(node:ReactNode,checkpoint=false){
 const path='/p/'+slug+(checkpoint?'/cp/'+mock.checkpoint.view.code:'');
 act(()=>root.render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}>
  <MemoryRouter initialEntries={[path]}><Routes><Route path={checkpoint?'/p/:slug/cp/:code':'/p/:slug'} element={node}/></Routes></MemoryRouter>
 </QueryClientProvider>));
}
beforeEach(async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});localStorage.clear();
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 const fixture=structuredClone(demoSeedFixture);fixture.settings.flags={...flags};
 const project=fixture.projects.find(p=>p.status==='active')!;slug=project.slug;id=project.id;
 const adapter=new DemoAdapter({fixture});
 mock.settings=await adapter.getSettings();mock.project=await adapter.getProject(slug);
 const cp=mock.project.checkpoints.find((c:any)=>c.ui==='now')??mock.project.checkpoints[0];
 mock.checkpoint=await adapter.getCheckpoint(slug,cp.code);
 Object.assign(mock.checkpoint.view,{planState:'deferred',deferredReason:'prune:approved',deferredAt:'2026-11-16T10:00:00Z',
  stepMeta:[{state:'deferred',tier:'venture',deferred_reason:'prune:venture',deferred_at:'2026-11-16T10:00:00Z'}]});
 Object.assign(cp,mock.checkpoint.view);
 const data=await adapter.getAdaptiveData(),now=new Date('2026-11-17T12:00:00Z');
 data.rows.settings={...data.rows.settings,flags:{...flags},capacity:{weekday_minutes:240}};
 data.rows.projects.find(p=>p.id===id)!.last_study_on='2026-11-22';
 const concept=data.rows.cpConcepts.find(c=>c.checkpoint_id===cp.id)?.concept_id??data.rows.concepts[0].id;
 data.rows.cpConcepts.push({checkpoint_id:cp.id,concept_id:concept});
 data.rechecks=[{class_id:concept,level:'understand',seq:1,state:'open',due:'2026-11-16',prompt:'Explain the key hypothesis from the demo proof.'},
  {class_id:concept,level:'recall',seq:1,state:'open',due:'2026-11-17',prompt:'State the demo definition.'},
  {class_id:concept,level:'use',seq:1,state:'open',due:'2026-11-18',prompt:'Future check'},
  {class_id:concept,level:'transfer',seq:1,state:'retired',due:'2026-11-16',prompt:'Retired check'}];
 const state=assemble(data.rows,now);mock.adaptive={data:{...data,state},flags:mock.settings.flags};
});
afterEach(()=>{act(()=>root.unmount());host.remove();vi.restoreAllMocks();});
function off(){mock.settings.flags={};mock.adaptive.flags={};mock.adaptive.data.state.flags={};}

describe('N171 gated scheduler views over the demo fixture',()=>{
 for(const [label,Component] of [['legacy',LegacyCheckpoint],['v6',V6Checkpoint],['v7',CheckpointV7]] as const){
  it(label+' checkpoint distinguishes deferred steps and hides the retired recheck fields',()=>{
   mock.checkpoint.view.ui='revisit';mock.checkpoint.view.recheckDue='2026-11-17';mock.checkpoint.recheckPrompt='Legacy prompt';
   mount(<Component/>,true);
   expect(host.textContent).toContain('Deferred');expect(host.textContent).toContain('prune:approved');
   expect(host.textContent).toContain('prune:venture');expect(host.textContent).toContain('2026-11-16');
   expect(host.querySelector('li[data-adaptive-state="deferred"]')).toBeTruthy();
   expect(host.textContent).not.toContain('Recheck due');expect(host.textContent).not.toContain('Legacy prompt');
  });
  it(label+' checkpoint preserves old labels with flags off',()=>{
   off();mock.checkpoint.view.ui='revisit';mock.checkpoint.recheckPrompt='Legacy prompt';mount(<Component/>,true);
   expect(host.textContent).toMatch(/Re-?check due/i);expect(host.textContent).toContain('Legacy prompt');
   expect(host.textContent).not.toContain('prune:approved');expect(host.querySelector('[data-adaptive-state="deferred"]')).toBeNull();
  });
 }
 for(const [label,Component] of [['v6',V6Project],['v7',V7Path]] as const){
  it(label+' plan shows checkpoint disposition, date, steps and project rechecks',()=>{
   mount(<Component/>);expect(host.textContent).toContain('prune:approved');expect(host.textContent).toContain('2026-11-16');
   expect(host.textContent).toContain('Step 1: Deferred');
   if(label==='v7'){
    const disclosure=Array.from(host.querySelectorAll<HTMLButtonElement>('button[aria-expanded]')).find(button=>button.textContent==='Rechecks');
    expect(disclosure?.getAttribute('aria-expanded')).toBe('false');
    expect(host.textContent).not.toContain('Due rechecks');
    act(()=>disclosure!.click());
   }
   expect(host.textContent).toContain('Due rechecks');
   expect(host.textContent).toContain('Explain the key hypothesis');expect(host.textContent).not.toContain('Future check');
  });
  it(label+' plan is unchanged with flags off',()=>{
   off();mount(<Component/>);expect(host.textContent).not.toContain('Deferred');expect(host.textContent).not.toContain('Due rechecks');
   expect(host.querySelector('.adaptive-panel')).toBeNull();
  });
 }
 it('legacy plan shows checkpoint and step dispositions when enabled',()=>{
  mount(<Stages detail={mock.project}/>);expect(host.textContent).toContain('prune:approved');expect(host.textContent).toContain('Step 1: Deferred');
 });
 it('legacy plan retains its existing rows with flags off',()=>{
  off();mount(<Stages detail={mock.project}/>);expect(host.textContent).not.toContain('prune:approved');expect(host.querySelector('[data-adaptive-state="deferred"]')).toBeNull();
 });
 it('Today shows exact shared TIME and queue values, limiting the queue to eight',()=>{
  const data=mock.adaptive.data,p=data.state.projects[id];
  data.state.queue.items=Array.from({length:11},(_,i)=>({type:'step',ref:'Demo step '+i,est_minutes:5,reason_code:'next_cp'}));
  mount(<TodaySchedulerView data={data}/>);
  expect(host.textContent).toContain('240 min');expect(host.textContent).toContain(p.time.lastStudyOn);
  expect(p.block).toContain('study_days_left=6');expect(host.textContent).toContain('Study days left (incl. today)6');
  const queue=host.querySelector('[aria-label="Today\'s queue"]')!;
  expect(queue.querySelectorAll('li')).toHaveLength(8);expect(queue.textContent).toContain('+3 more');
  expect(renderQueue(data.state.queue,8)).toContain('+3 more');
  expect(host.textContent).toContain('Overdue');expect(host.textContent).toContain('Due today');
 });
 it('Today and project panels vanish with flags off, without mounting the data hook',()=>{
  off();mock.adaptive=undefined;mount(<><TodayScheduler/><ProjectScheduler projectId={id}/></>);expect(host.textContent).toBe('');
 });
 it('each flag reveals only its own facts; infeasibility links to the plan',()=>{
  const data=mock.adaptive.data,p=data.state.projects[id];
  p.feasibility={slack:-123};p.atRisk=true;data.state.flags={time_block:true};mount(<TodaySchedulerView data={data}/>);
  expect(host.textContent).toContain('short by 123 min · core at risk');expect(host.textContent).not.toContain('Due rechecks');
  expect(host.querySelector('a[href="/p/'+slug+'?tab=map"]')).toBeTruthy();
  data.state.flags={recheck_v2:true};mount(<TodaySchedulerView data={data}/>);
  expect(host.textContent).toContain('Due rechecks');expect(host.textContent).not.toContain('Capacity today');expect(host.textContent).not.toContain('short by');
 });
 it('renders skipped checkpoints with the recorded prune reason',()=>{
  mock.checkpoint.view.planState='skipped';mock.checkpoint.view.deferredReason='prune';mount(<V6Checkpoint/>,true);
  expect(host.textContent).toContain('Skipped');expect(host.textContent).toContain('prune');
 });
});
