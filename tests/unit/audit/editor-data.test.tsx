import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import BlockSheet from '../../../src/features/calendar/block-sheet/BlockSheet';
import TaskSheet from '../../../src/features/tasks/v7/TaskSheetV7';

const h=vi.hoisted(()=>({study:{} as any,tasks:{} as any,primary:{} as any,notify:vi.fn()}));
vi.mock('../../../src/data',()=>({getApi:()=>h.primary}));
vi.mock('../../../src/data/study',()=>({getStudyApi:()=>h.study}));
vi.mock('../../../src/data/tasks',()=>({getTaskApi:()=>h.tasks}));
vi.mock('../../../src/data/hooks',()=>({
 useProjects:()=>({data:[]}),useSubjects:()=>({data:[]}),
 useSettings:()=>({data:{timeZone:'Asia/Kolkata'}}),
}));
vi.mock('../../../src/ui/Toast',()=>({useToast:()=>h.notify}));
vi.mock('../../../src/flags',()=>({isFlagOn:()=>false}));
vi.mock('../../../src/ui/v7/KitPrimitives',()=>({TimeRange:()=>null}));
vi.mock('../../../src/ui/v7/components',()=>({
 Sheet:({open,children,footer}:any)=>open?<div role="dialog">{children}{footer}</div>:null,
 Button:({children,onClick,disabled,loading}:any)=><button type="button" onClick={onClick} disabled={disabled||loading}>{children}</button>,
 Field:({label,value,onChange,...rest}:any)=><input aria-label={rest['aria-label']??label} value={value} onChange={onChange}/>,
 Picker:({label,value,options,onChange}:any)=><select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{options.map((o:string)=><option key={o}>{o}</option>)}</select>,
 DatePicker:({label,value,onChange}:any)=><input aria-label={label} value={value} onChange={e=>onChange(e.target.value)}/>,
 Segmented:({options,onChange}:any)=><div>{options.map((o:string)=><button type="button" key={o} onClick={()=>onChange(o)}>{o}</button>)}</div>,
 // N220: the block sheet's length presets are kit chips.
 Chip:({children,onClick,selected}:any)=><button type="button" aria-pressed={!!selected} onClick={onClick}>{children}</button>,
}));

let host:HTMLDivElement,root:Root;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 h.primary={listProjects:async()=>[],getProject:async()=>({checkpoints:[]})};
 h.tasks={listTasks:async()=>({items:[],total:0,nextCursor:null})};
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.clearAllMocks();});
const button=(label:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===label)!;
async function input(label:string,value:string){
 const node=host.querySelector(`[aria-label="${label}"]`)! as HTMLInputElement;
 await act(async()=>{
  const proto=node instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(node,value);
  node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));
 });
}

it('reloads the latest Calendar links after a version conflict before retry',async()=>{
 const old={id:'b',kind:'study',title:'Proof',status:'planned',startsAt:'2026-11-14T09:00:00Z',endsAt:'2026-11-14T10:00:00Z',timeZone:'UTC',version:1,
  projectId:'path-old',subjectId:'subject-old',checkpointId:'cp-old',taskId:'task-old'} as any;
 const fresh={...old,title:'Changed elsewhere',version:2,projectId:'path-new',subjectId:'subject-new',checkpointId:'cp-new',taskId:'task-new'};
 const update=vi.fn().mockRejectedValueOnce(Object.assign(new Error('stale'),{code:'conflict'})).mockImplementation(async(_id,_version,patch)=>({record:{...fresh,...patch,version:3},actionNo:1}));
 h.study={listCalendarBlocks:async()=>[fresh],updateCalendarBlock:update};
 await act(async()=>root.render(<BlockSheet v7 block={old} date="2026-11-14" zone="UTC" onClose={()=>{}} onRefresh={()=>{}}/>));
 const submit=async()=>act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 await submit();
 expect(host.textContent).toContain('current block was reloaded');
 await submit();
 expect(update.mock.calls[1][1]).toBe(2);
 expect(update.mock.calls[1][2]).toMatchObject({projectId:'path-new',checkpointId:'cp-new',taskId:'task-new',subjectId:'subject-new'});
});

it('interprets a task due time in the configured account zone, as the Tasks list does',async()=>{
 expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
 const create=vi.fn(async(input)=>({record:{...input,id:'task-new',version:1},actionNo:1}));
 h.tasks={...h.tasks,createTask:create};
 await act(async()=>root.render(<TaskSheet onDismiss={()=>{}}/>));
 await input('Title','Proof deadline');
 await input('Due','Date & time');
 await input('Due date','2026-11-16');
 await input('Due time','1020');
 await act(async()=>button('Save task').click());
 expect(create).toHaveBeenCalledTimes(1);
 expect(create.mock.calls[0][0].due).toEqual({kind:'instant',at:'2026-11-16T11:30:00.000Z'});
});
