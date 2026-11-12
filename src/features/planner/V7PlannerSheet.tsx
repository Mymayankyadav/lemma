import {useState} from 'react';
import {Link} from 'react-router';
import type {TaskRecord} from '../../data/tasks';
import {Button,Checkbox,DatePicker,Picker,Sheet} from '../../ui/v7/components';
import {TimeRange} from '../../ui/v7/KitPrimitives';
import {formatClock,formatDuration,formatShortDate,formatTimeLeft} from '../../lib/format';
import {localWallParts} from '../time-log/local-time';
import type {PlannerResult} from './model';
type PlannerUnplaced={taskId:string;reason:string;estimateMinutes?:number|null};

type Move={date:string;start:string;end:string};
const rangeLabel=(n:number)=>n===1?'Today only':n+' days';
const ranges=[1,2,3,4,5,6,7];

/** PL2: a specific reason for each task that was not placed, with the action that fixes it. */
const tasks0=(task:TaskRecord|undefined)=>task?.estimateMinutes??null;
export function unplacedLine(entry:PlannerUnplaced,task:TaskRecord|undefined,preview:PlannerResult|null,zone:string,rangeDays:number):{text:string;action:{label:string;to?:string;range?:number}|null}{
 const estimate=entry.estimateMinutes??tasks0(task);
 switch(entry.reason){
  case 'after_due':{
   const due=task?formatTimeLeft(task.due.kind==='none'?{kind:'date',date:preview?.days[0]?.date??''}:task.due,{zone,clock24h:true}):'Due soon';
   const window=preview?.days.find(day=>day.windowStart)?.windowStart;
   return {text:due+(window?' · your first free slot is '+formatClock(window,{zone,clock24h:true}):' · no free slot before then'),action:{label:'Change due date',to:'/tasks'}};
  }
  case 'too_long':return {text:(estimate?formatDuration(estimate)+' is':'It is')+' longer than your longest sitting',action:{label:'Split it',to:'/tasks'}};
  case 'no_estimate':return {text:'No time estimate yet',action:{label:'Add an estimate',to:'/tasks'}};
  case 'no_capacity':return {text:'No free study time left in '+(rangeDays===1?'today':'these '+rangeDays+' days'),action:rangeDays<7?{label:'Plan '+(rangeDays+1)+' days',range:rangeDays+1}:{label:'Free up time',to:'/calendar?view=day'}};
  default:return {text:'Could not be placed',action:{label:'Open tasks',to:'/tasks'}};
 }
}

/** B1: the planner's Adjust panel as the kit's Sheet — 24 px top corners, surface.overlay, header and footer — with the kit's
 *  Select (a sheet of radio rows on phones), Checkbox, Date and Time range fields, and an action.bg primary. */
export default function V7PlannerSheet({anchor,zone,busy,loading,error,selectionError,preview,tasks,selected,overrides,unplaced,count,rangeDays,onClose,onCommit,onToggle,onMove,onRange}:{
 anchor:string;zone:string;busy:boolean;loading:boolean;error:string|null;selectionError:string|null;preview:PlannerResult|null;tasks:TaskRecord[];
 selected:Set<string>;overrides:Map<string,Move>;unplaced:PlannerUnplaced[];count:number;rangeDays:number;
 onClose:()=>void;onCommit:()=>void;onToggle:(key:string,on:boolean)=>void;onMove:(key:string,part:'date'|'start'|'end',value:string,original:Move)=>void;onRange:(days:number)=>void;
}){
 const [editing,setEditing]=useState<string|null>(null);
 return <Sheet open onClose={onClose} title="Plan study tasks" eyebrow={'Plan · '+formatShortDate(anchor,{zone})}
  footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
   <Button variant="primary" disabled={busy||loading||!!selectionError||!count} onClick={onCommit}>{busy?'Saving…':count===1?'Add 1 block':'Add '+count+' blocks'}</Button></>}>
  <div className="v7-plan">
   <Picker label="Days to plan" value={rangeLabel(rangeDays)} options={ranges.map(rangeLabel)} disabled={loading||busy}
    onChange={label=>onRange(ranges.find(n=>rangeLabel(n)===label)??1)}/>
   {loading&&<p role="status" className="v7-meta">Finding free time for your tasks…</p>}
   {error&&<p role="alert" className="v7-alert">{error}</p>}
   {selectionError&&<p role="alert" className="v7-alert">{selectionError}</p>}
   {preview&&<section aria-label="Planner preview" className="v7-plan-list">
    {preview.placements.length===0&&<p className="v7-meta">No free slots left in these days. Try more days, or free up time in Calendar.</p>}
    {preview.placements.map(place=>{
     const key=place.taskId+':'+place.part,chosen=selected.has(key),moved=overrides.get(key)??place;
     const title=tasks.find(task=>task.id===place.taskId)?.title??'Study task';
     const startWall=moved.start?localWallParts(moved.start,zone):{day:moved.date,clock:''};
     const endWall=moved.end?localWallParts(moved.end,zone):{day:moved.date,clock:''};
     return <div key={key} className="v7-plan-row">
      <Checkbox label={title} checked={chosen} disabled={busy} onChange={on=>onToggle(key,on)}/>
      <p className="v7-meta">{formatShortDate(moved.date,{zone})} · {moved.start&&moved.end?formatClock(moved.start,{zone})+'–'+formatClock(moved.end,{zone}):'choose valid times'} · {formatDuration(place.minutes)}</p>
      {chosen&&(editing===key?<div className="v7-plan-move">
       <DatePicker label={'Date for '+title} value={startWall.day} onChange={value=>onMove(key,'date',value,place)}/>
       <TimeRange legend={'Time for '+title} start={startWall.clock||'09:00'} end={endWall.clock||'10:00'} onChange={(start,end)=>{
        if(start!==startWall.clock)onMove(key,'start',start,place);
        else if(end!==endWall.clock)onMove(key,'end',end,place);
       }}/>
       <Button variant="ghost" small onClick={()=>setEditing(null)}>Done</Button>
      </div>:<Button variant="ghost" small onClick={()=>setEditing(key)}>Change time</Button>)}
     </div>;
    })}
    {unplaced.length>0&&<section aria-label="Not placed" className="v7-plan-unplaced">
     <h3 className="v7-eyebrow">Not placed</h3>
     {unplaced.map((entry,index)=>{const task=tasks.find(item=>item.id===entry.taskId),line=unplacedLine(entry,task,preview,zone,rangeDays);
      return <div key={entry.taskId+':'+index} className="v7-plan-row">
       <p><strong>{task?.title??'Study task'}</strong></p><p className="v7-meta">{line.text}</p>
       {line.action&&(line.action.to?<Link className="v7-button v7-ghost v7-small" to={line.action.to}><span>{line.action.label}</span></Link>
        :<Button variant="ghost" small onClick={()=>onRange(line.action!.range!)}>{line.action.label}</Button>)}
      </div>;})}
    </section>}
   </section>}
  </div>
 </Sheet>;
}
