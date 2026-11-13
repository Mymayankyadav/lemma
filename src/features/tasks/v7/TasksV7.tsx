import {EmptyMoment} from '../../../ui/v7/EmptyMoment';
import {haptic} from '../../../ui/v7/haptics';
import {useCallback,useEffect,useMemo,useRef,useState,type PointerEvent as ReactPointerEvent} from 'react';
import {Link,useNavigate} from 'react-router';
import {Ban,CalendarPlus,Check,ChevronDown,ChevronUp,GripVertical,Pencil,Play,RotateCcw,Trash2} from 'lucide-react';
import {useHome,useSettings} from '../../../data/hooks';
import {getTaskApi} from '../../../data/tasks';
import type {TaskPatch,TaskRecord} from '../../../data/tasks/contract';
import {HubHeader} from '../../../app/v7/V7Shell';
import {Button,Chip,Segmented,Sheet,Skeleton} from '../../../ui/v7/components';
import {StatusBadge} from '../../../ui/v7/Status';
import {RowMenu} from '../../../ui/v7/RowMenu';
import {SubjectGlyph} from '../../../ui/v7/Subject';
import {useEnterMarks,type EnterMark} from '../../../ui/v7/useEnterMarks';
import {motionReduced} from '../../../ui/v7/effects';
import {motionV1} from '../../../ui/v7/motion';
import {subjectClass} from '../../../ui/v7/Subject';
import {ownerZone} from '../../../lib/format';
import {useToast} from '../../../ui/Toast';
import {kitSubject} from '../../atlas/v7/model';
import {useOverdueSummary} from '../../calendar/v7/overdue';
import TaskSheet from './TaskSheetV7';
import {applyFilter,civilDay,dayWord,dueChip,estimateText,groupTodo,isOverdue,noFilter,reorderedTasks,segmentOf,segments,swipeIntent,type Segment,type TaskFilter} from './tasksModel';
import './tasks.css';

const PAGE=50;
const statuses:TaskRecord['status'][]=['backlog','in_progress','completed','cancelled'];
const merge=(old:TaskRecord[],next:readonly TaskRecord[])=>{
 const map=new Map(old.map(task=>[task.id,task]));
 for(const task of next)map.set(task.id,task);
 return [...map.values()].sort((a,b)=>statuses.indexOf(a.status)-statuses.indexOf(b.status)||a.position-b.position||a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
};

/** PLAN §6.6: tasks as To do / Doing / Done, one card per group, rows with chips, swipe right to complete. */
export default function TasksV7(){
 const navigate=useNavigate(),notify=useToast(),home=useHome(),settings=useSettings();
 const zone=ownerZone(settings.data);
 const [rows,setRows]=useState<TaskRecord[]>([]),[total,setTotal]=useState(0),[cursor,setCursor]=useState<string|null>(null);
 const [phase,setPhase]=useState<'loading'|'ready'|'error'>('loading'),[message,setMessage]=useState(''),[reload,setReload]=useState(0),[busy,setBusy]=useState(false);
 const [segment,setSegment]=useState<Segment>('To do'),[filter,setFilter]=useState<TaskFilter>(noFilter),[picker,setPicker]=useState(false);
 const [editing,setEditing]=useState<TaskRecord|null>(null),[now,setNow]=useState(()=>new Date());
 const overdue=useOverdueSummary(zone,rows);
 const epoch=useRef(0);
 useEffect(()=>{const timer=window.setInterval(()=>setNow(new Date()),60_000);return()=>window.clearInterval(timer);},[]);
 useEffect(()=>{
  let live=true;const mine=++epoch.current;setPhase('loading');
  void getTaskApi().listTasks({limit:PAGE,status:statuses}).then(page=>{
   if(!live||epoch.current!==mine)return;
   setRows(merge([],page.items));setTotal(page.total);setCursor(page.nextCursor);setPhase('ready');
  }).catch(error=>{if(!live||epoch.current!==mine)return;setMessage(error instanceof Error?error.message:'Could not load tasks.');setPhase('error');});
  return()=>{live=false;};
 },[reload]);
 useEffect(()=>{const again=()=>setReload(value=>value+1);window.addEventListener('focus',again);return()=>window.removeEventListener('focus',again);},[]);
 const projects=useMemo(()=>(home.data?.projects??[]).filter(project=>!project.system),[home.data]);
 const [pathQuery,setPathQuery]=useState('');
 const look=useMemo(()=>new Map(projects.map(project=>[project.id,{title:project.title,klass:subjectClass(kitSubject(project.subject.name))}])),[projects]);
 const put=useCallback((record:TaskRecord)=>setRows(old=>merge(old,[record])),[]);
 const change=useCallback(async(task:TaskRecord,patch:TaskPatch,done?:{message:string;undo:TaskPatch})=>{
  if(busy)return;
  setBusy(true);setMessage('');
  const api=getTaskApi();
  try{
   const receipt=await api.updateTask(task.id,task.version,patch);
   put(receipt.record);
   if(done)notify(done.message,{tone:'success',action:{label:'Undo',onClick:()=>{
    void api.updateTask(receipt.record.id,receipt.record.version,done.undo).then(back=>put(back.record)).catch(()=>{setReload(value=>value+1);});
   }}});
  }catch(error){
   const value=error as {code?:string;message?:string};
   if(value?.code==='conflict'||/conflict|version|stale/i.test(value?.message??'')){setMessage('Task changed elsewhere. The latest version was loaded.');setReload(count=>count+1);}
   else setMessage(value?.message??'Could not update this task.');
  }finally{setBusy(false);}
 },[busy,notify,put]);
 async function remove(task:TaskRecord){
  if(busy)return;
  setBusy(true);
  try{await getTaskApi().deleteTask(task.id,task.version);setRows(old=>old.filter(item=>item.id!==task.id));setTotal(count=>Math.max(0,count-1));notify('Task deleted',{tone:'success'});}
  catch(error){setMessage(error instanceof Error?error.message:'Could not delete this task.');}
  finally{setBusy(false);}
 }
 async function more(){
  if(!cursor||busy)return;
  setBusy(true);
  try{const page=await getTaskApi().listTasks({limit:PAGE,status:statuses,cursor});setRows(old=>merge(old,page.items));setCursor(page.nextCursor);setTotal(page.total);}
  catch(error){setMessage(error instanceof Error?error.message:'Could not load more tasks.');}
  finally{setBusy(false);}
 }
 async function reorder(list:readonly TaskRecord[],from:string,to:string){
  if(busy||from===to||!list.some(task=>task.id===to))return;
  const next=reorderedTasks(list,from,to);setBusy(true);setMessage('');
  try{
   // Integer positions are part of the existing versioned Task API. Renumber
   // the visible group so equal or adjacent old positions cannot defeat a move.
   for(const [index,task] of next.entries()){
    const position=(index+1)*1024;
    if(task.position!==position)put((await getTaskApi().updateTask(task.id,task.version,{position})).record);
   }
   notify('Task order saved',{tone:'success'});
  }catch(error){setMessage(error instanceof Error?error.message:'Could not save the task order.');setReload(value=>value+1);}
  finally{setBusy(false);}
 }
 const visible=useMemo(()=>applyFilter(rows,filter,now,zone),[rows,filter,now,zone]);
 // B3: the same predicate as the shared overdue count (open tasks past their due day or instant).
 const overdueCount=useMemo(()=>rows.filter(task=>isOverdue(task,now,zone)).length,[rows,now,zone]);
 const groups=useMemo(()=>groupTodo(visible,now,zone),[visible,now,zone]);
 const doing=visible.filter(task=>task.status==='in_progress'),done=visible.filter(task=>task.status==='completed'),cancelled=visible.filter(task=>task.status==='cancelled');
 const unscheduled=rows.some(task=>task.status==='backlog'&&task.due.kind==='none');
 // A1: a task added after the list loaded rises in; the loaded list itself never animates.
 const enter=useEnterMarks(rows.map(task=>task.id),phase==='ready');
 const rowFor=(task:TaskRecord,list:readonly TaskRecord[])=><TaskRow key={task.id} enter={enter(task.id)} task={task} list={list} now={now} zone={zone} busy={busy} look={task.projectId?look.get(task.projectId)??null:null}
  onChange={change} onEdit={setEditing} onDelete={remove} onReorder={reorder}
  onSchedule={()=>navigate('/calendar?view=day&quick=1&task='+encodeURIComponent(task.id)+(task.estimateMinutes?'&len='+task.estimateMinutes:''))}/>;
 const filterTitle=filter.projectId?look.get(filter.projectId)?.title??'Path':'All paths';
 return <main id="main-content" className="v7-page v7-tk" aria-label="Tasks">
  <HubHeader title="Calendar">
   <nav className="v7-hub-tabs" aria-label="Calendar sections"><Link to="/calendar">Schedule</Link><Link to="/tasks" aria-current="page">Tasks</Link></nav>
  </HubHeader>
  {overdue.total>0&&<Link className="v7-tk-overdue" to="/calendar?view=day&overdue=1" aria-label={overdue.total+' overdue. Triage'}>
   <StatusBadge tone="warning">{overdue.total} overdue</StatusBadge><span className="v7-meta">Tasks, deadlines and practice · Triage</span>
  </Link>}
  <div className="v7-tk-bar">
   <Segmented label="Task status" options={[...segments]} value={segment} onChange={value=>setSegment(value as Segment)}/>
  </div>
  <div className="v7-tk-filters" role="group" aria-label="Filters">
   <Chip selected={!!filter.projectId} onClick={()=>setPicker(true)}>{filterTitle}</Chip>
   {(overdueCount>0||filter.overdueOnly)&&<Chip selected={filter.overdueOnly} onClick={()=>setFilter(old=>({...old,overdueOnly:!old.overdueOnly}))}>{'Overdue '+overdueCount}</Chip>}
   <Chip selected={filter.highOnly} onClick={()=>setFilter(old=>({...old,highOnly:!old.highOnly}))}>High priority</Chip>
   {/* TK3/KC10: "Plan these" sits in the filter row, not alone and centred. */}
   {unscheduled&&segment==='To do'&&<Button variant="ghost" small className="v7-tk-plan" onClick={()=>navigate('/calendar?view=day&plan=1')}>Plan these</Button>}
  </div>
  {!!message&&<p role="alert" className="v7-alert">{message}</p>}
  {phase==='loading'&&<><Skeleton/><Skeleton/></>}
  {phase==='error'&&<div role="alert" className="v7-tk-empty"><p>{message||'Could not load tasks.'}</p><Button onClick={()=>setReload(value=>value+1)}>Retry</Button></div>}
  {phase==='ready'&&<>
   {segment==='To do'&&(groups.length?groups.map(group=><section key={group.key} className="v7-tk-card" aria-label={group.label}>
     <h2 className="v7-eyebrow">{group.label} · {group.items.length}</h2><ul>{group.items.map(task=>rowFor(task,group.items))}</ul></section>)
     :<EmptyMoment art={total===0?undefined:'tasks'} title={total===0?'No tasks yet':'Nothing to do here'}>{total===0?'Use Capture to add one; it lands here.':'Tasks that match this view will appear here.'}</EmptyMoment>)}
   {segment==='Doing'&&(doing.length?<section className="v7-tk-card" aria-label="Doing"><h2 className="v7-eyebrow">Doing · {doing.length}</h2><ul>{doing.map(task=>rowFor(task,doing))}</ul></section>:<EmptyMoment title="Nothing in progress">Move a task here from its ⋯ menu when you start it.</EmptyMoment>)}
   {segment==='Done'&&<>
    {done.length?<section className="v7-tk-card" aria-label="Done"><h2 className="v7-eyebrow">Done · {done.length}</h2><ul>{done.map(task=>rowFor(task,done))}</ul></section>:<EmptyMoment title="Nothing completed yet">Finished tasks gather here.</EmptyMoment>}
    {cancelled.length>0&&<details className="v7-tk-cancelled"><summary>Cancelled ({cancelled.length})</summary><section className="v7-tk-card" aria-label="Cancelled"><ul>{cancelled.map(task=>rowFor(task,cancelled))}</ul></section></details>}
   </>}
   {cursor&&<div className="v7-tk-more"><span>{rows.length} of {total} tasks shown</span><Button variant="secondary" small loading={busy} onClick={()=>{void more();}}>Load more</Button></div>}
  </>}
  <Sheet open={picker} onClose={()=>setPicker(false)} title="Filter by path" footer={<Button variant="primary" onClick={()=>setPicker(false)}>Done</Button>}>
   {projects.length>8&&<input type="search" className="v7-field v7-picker-search" placeholder="Search paths" aria-label="Search paths" value={pathQuery} onChange={event=>setPathQuery(event.target.value)}/>}
   <div className="v7-tk-picker" role="radiogroup" aria-label="Path">
    <button type="button" role="radio" aria-checked={!filter.projectId} className="v7-filter-chip" onClick={()=>setFilter(old=>({...old,projectId:null}))}>All paths</button>
    {projects.filter(project=>!pathQuery.trim()||project.title.toLowerCase().includes(pathQuery.trim().toLowerCase())||project.id===filter.projectId).map(project=><button key={project.id} type="button" role="radio" aria-checked={filter.projectId===project.id} className="v7-filter-chip" onClick={()=>setFilter(old=>({...old,projectId:project.id}))}>{project.title}</button>)}
   </div>
  </Sheet>
  {editing&&<TaskSheet key={editing.id+':'+editing.version} task={editing} onDismiss={()=>setEditing(null)} onSaved={put}
   onConflict={()=>{setMessage('Task changed elsewhere. The latest version was loaded.');setReload(value=>value+1);setEditing(null);}}/>}
 </main>;
}

interface RowProps{enter:EnterMark;task:TaskRecord;list:readonly TaskRecord[];now:Date;zone:string;busy:boolean;look:{title:string;klass:string}|null;
 onChange:(task:TaskRecord,patch:TaskPatch,done?:{message:string;undo:TaskPatch})=>Promise<void>;onEdit:(task:TaskRecord)=>void;onDelete:(task:TaskRecord)=>Promise<void>;onSchedule:()=>void;
 onReorder:(list:readonly TaskRecord[],from:string,to:string)=>Promise<void>}
function TaskRow({enter,task,list,now,zone,busy,look,onChange,onEdit,onDelete,onSchedule,onReorder}:RowProps){
 const done=task.status==='completed',closed=done||task.status==='cancelled',chip=closed?null:dueChip(task,now,zone),estimate=estimateText(task.estimateMinutes);
 const [dx,setDx]=useState(0),[revealed,setRevealed]=useState(false),start=useRef<{x:number;y:number}|null>(null);
 const index=list.findIndex(item=>item.id===task.id);
 // A1: completing here draws the tick first (240 ms, only when motion is allowed), then saves, so the tick is seen before
 // the row leaves To do. Tasks that were already done never animate; under reduced motion the save is immediate as before.
 const [drawn,setDrawn]=useState(false),drawTimer=useRef<number|undefined>(undefined);
 useEffect(()=>()=>window.clearTimeout(drawTimer.current),[]);
 const complete=()=>{
  // A failed save un-draws the tick (the row stays in To do with its error).
  const save=()=>{void onChange(task,{status:'completed'},{message:'Task completed',undo:{status:task.status}}).finally(()=>setDrawn(false));};
  // AW6: one click as the tick finishes drawing (at once when it does not animate).
  if(motionReduced()){haptic('check');save();return;}
  setDrawn(true);drawTimer.current=window.setTimeout(()=>{haptic('check');save();},Math.round(motionV1.base*1000));
 };
 const reopen=()=>{void onChange(task,{status:'backlog'},{message:'Task reopened',undo:{status:task.status}});};
 const down=(event:ReactPointerEvent<HTMLDivElement>)=>{if(closed||(event.target as HTMLElement).closest('button,a,[role=menu]'))return;start.current={x:event.clientX,y:event.clientY};};
 const move=(event:ReactPointerEvent<HTMLDivElement>)=>{const origin=start.current;if(!origin)return;const x=event.clientX-origin.x,y=event.clientY-origin.y;if(Math.abs(x)>8&&Math.abs(x)>Math.abs(y))setDx(Math.max(-140,Math.min(140,x)));};
 const up=(event:ReactPointerEvent<HTMLDivElement>)=>{
  const origin=start.current;start.current=null;if(!origin)return;
  const intent=swipeIntent(event.clientX-origin.x,event.clientY-origin.y);
  setDx(0);
  if(intent==='complete')complete();else if(intent==='reveal')setRevealed(value=>!value);
 };
 const swap=(up:boolean)=>{const other=list[index+(up?-1:1)];if(other)void onReorder(list,task.id,other.id);};
 const items=[
  ...(!closed?[{label:'Schedule',icon:<CalendarPlus aria-hidden="true"/>,onClick:onSchedule}]:[]),
  {label:'Edit',icon:<Pencil aria-hidden="true"/>,onClick:()=>onEdit(task)},
  ...(task.status==='backlog'?[{label:'Move to Doing',icon:<Play aria-hidden="true"/>,onClick:()=>{void onChange(task,{status:'in_progress'});}}]:[]),
  ...(task.status==='in_progress'?[{label:'Move to To do',icon:<RotateCcw aria-hidden="true"/>,onClick:()=>{void onChange(task,{status:'backlog'});}}]:[]),
  ...(!closed&&index>0?[{label:'Move up',icon:<ChevronUp aria-hidden="true"/>,onClick:()=>swap(true)}]:[]),
  ...(!closed&&index>=0&&index<list.length-1?[{label:'Move down',icon:<ChevronDown aria-hidden="true"/>,onClick:()=>swap(false)}]:[]),
  ...(!closed?[{label:'Cancel task',icon:<Ban aria-hidden="true"/>,onClick:()=>{void onChange(task,{status:'cancelled'},{message:'Task cancelled',undo:{status:task.status}});}}]:[]),
  ...(task.status==='cancelled'?[{label:'Reopen',icon:<RotateCcw aria-hidden="true"/>,onClick:reopen}]:[]),
  {label:'Delete task',icon:<Trash2 aria-hidden="true"/>,onClick:()=>{void onDelete(task);}},
 ];
 return <li {...enter} className={'v7-tk-row '+(look?.klass??'')} data-task-id={task.id} data-state={task.status} data-revealed={revealed||undefined}>
  <div className="v7-tk-main" style={{transform:dx?'translateX('+dx+'px)':undefined}} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{start.current=null;setDx(0);}}>
   <button type="button" role="checkbox" aria-checked={done||drawn} className="v7-tk-check" disabled={busy||drawn||task.status==='cancelled'}
    aria-label={(done?'Reopen ':'Complete ')+task.title} onClick={()=>{if(done)reopen();else complete();}}>
    <span aria-hidden="true" data-v7-draw={drawn?'':undefined}>{(done||drawn)&&<Check/>}</span></button>
   <div className="v7-tk-body">
    <p className="v7-tk-title" data-closed={closed||undefined}>{task.title}</p>
    {/* TK4: one fixed order — due, priority, estimate, subject — that wraps as one unit. KC1: overdue is a Badge with its icon;
        KC2: the path carries its subject glyph, not a dot. */}
    <p className="v7-tk-chips">
     {chip&&(chip.tone==='overdue'?<StatusBadge tone="warning">{chip.text}</StatusBadge>:<span className="v7-tk-chip" data-tone={chip.tone}>{chip.text}</span>)}
     <span className="v7-tk-meta">{[done&&task.completedAt?'Done '+dayWord(civilDay(task.completedAt,zone),now,zone):null,task.priority==='high'&&!closed?'High priority':null,estimate].filter(Boolean).join(' · ')}
      {look&&<span className="v7-tk-path">{(done&&task.completedAt)||(task.priority==='high'&&!closed)||estimate?' · ':''}<SubjectGlyph klass={look.klass}/>{look.title}</span>}</span>
    </p>
   </div>
   {!closed&&list.length>1&&<button type="button" className="v7-tk-reorder" disabled={busy} aria-label={'Reorder '+task.title} title="Drag to reorder; Up/Down also move this task"
    onPointerDown={event=>{event.currentTarget.setPointerCapture(event.pointerId);}}
    onPointerUp={event=>{const target=document.elementFromPoint(event.clientX,event.clientY)?.closest<HTMLElement>('[data-task-id]')?.dataset.taskId;if(target)void onReorder(list,task.id,target);}}
    onKeyDown={event=>{if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();swap(event.key==='ArrowUp');}}}><GripVertical aria-hidden="true"/></button>}
   <RowMenu label={'More actions for '+task.title} title={task.title} items={items}/>
  </div>
  {revealed&&!closed&&<div className="v7-tk-reveal" role="group" aria-label={'Quick actions for '+task.title}>
   <Button small onClick={onSchedule}>Schedule</Button><Button small onClick={()=>onEdit(task)}>Edit</Button>
   <Button small destructive onClick={()=>{void onDelete(task);}}>Delete</Button></div>}
 </li>;
}

