import {useEffect,useState} from 'react';
import {useSettings,useSubjects} from '../../../data/hooks';
import {getGoalApi} from '../../../data/study-goals';
import type {GoalPeriod,GoalRecord,NewGoal} from '../../../data/study-goals/contract';
import {formatDuration,ownerZone} from '../../../lib/format';
import {dayKey,shiftDay,weekStartDay} from '../../calendar/model';
import {Button,DatePicker,Picker,Segmented,Sheet} from '../../../ui/v7/components';
import {RulerSlider} from '../../../ui/v7/RulerSlider';

export function duplicatesGoal(input:NewGoal,goal:GoalRecord,editingId?:string) {
  return goal.id!==editingId&&goal.period===input.period&&goal.startDate===input.startDate&&goal.endDate===input.endDate
    &&goal.timeZone===input.timeZone&&(goal.subjectId??null)===(input.subjectId??null)&&(goal.projectId??null)===(input.projectId??null);
}

export function goalDates(day:string,period:GoalPeriod,weekStart:number) {
  if(period==='week'){
    const start=weekStartDay(day,weekStart);
    return {startDate:start,endDate:shiftDay(start,6)};
  }
  if(period==='month'){
    const month=day.slice(0,7)+'-01';
    const next=new Date(month+'T12:00:00Z');next.setUTCMonth(next.getUTCMonth()+1);
    return {startDate:month,endDate:shiftDay(next.toISOString().slice(0,10),-1)};
  }
  return {startDate:day,endDate:day};
}

export function GoalEditor({goal,onClose,onSaved}: {goal:GoalRecord|null;onClose:()=>void;onSaved:()=>void}) {
  const settings=useSettings(),subjects=useSubjects(),zone=goal?.timeZone??ownerZone(settings.data);
  const today=dayKey(new Date(),zone),weekStart=settings.data?.weekStart??1;
  const [period,setPeriod]=useState<GoalPeriod>(goal?.period??'week');
  const [dates,setDates]=useState(goal?{startDate:goal.startDate,endDate:goal.endDate}:goalDates(today,period,weekStart));
  const [minutes,setMinutes]=useState(goal?.targetMinutes??300),[subjectId,setSubject]=useState(goal?.subjectId??'');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const subjectRows=subjects.data??[];
  async function save() {
    setBusy(true);
    setError('');
    try{
      if(dates.endDate<dates.startDate)throw new Error('The goal must end on or after its start.');
      const input={period,...dates,timeZone:zone,targetMinutes:minutes,subjectId:subjectId||null,projectId:goal?.projectId??null};
      const api=getGoalApi();
      let cursor:string|null=null;
      do{
        const page=await api.listGoals({limit:50,cursor,subjectId:input.subjectId,projectId:input.projectId});
        if(page.items.some(row=>duplicatesGoal(input,row,goal?.id)))throw new Error('A goal already exists for this period and subject. Edit it to change the target.');
        cursor=page.nextCursor;
      }while(cursor);
      if(goal)await api.updateGoal(goal.id,goal.version,input);
      else await api.createGoal(input);
      onSaved();
      onClose();
    }catch(failure){setError(failure instanceof Error?failure.message:'Could not save the goal.');}
    finally{setBusy(false);}
  }
  const initialDates=goal??goalDates(today,'week',weekStart);
  const dirty=period!==(goal?.period??'week')||minutes!==(goal?.targetMinutes??300)||subjectId!==(goal?.subjectId??'')
    ||dates.startDate!==initialDates.startDate||dates.endDate!==initialDates.endDate;
  return <Sheet open dirty={dirty} title={goal?'Edit goal':'Add a goal'} onClose={onClose}
    footer={<Button variant="primary" loading={busy} onClick={()=>{void save();}}>Save goal</Button>}>
    <div className="v7-form-stack">
      <Segmented label="Goal period" options={['Week','Month','Custom']} value={period[0].toUpperCase()+period.slice(1)}
       onChange={label=>{const next=label.toLowerCase() as GoalPeriod;setPeriod(next);setDates(goalDates(today,next,weekStart));}}/>
      {period==='custom'&&<>
        <DatePicker label="Starts" value={dates.startDate} onChange={startDate=>setDates(value=>({...value,startDate}))}/>
        <DatePicker label="Ends" value={dates.endDate} onChange={endDate=>setDates(value=>({...value,endDate}))}/>
      </>}
      <RulerSlider label="Focus target" min={5} max={Math.max(2400,minutes)} step={5} value={minutes}
        format={formatDuration} tickFormat={value=>Math.round(value/60)+' h'} onChange={setMinutes}/>
      {!goal?.projectId&&<Picker label="Subject" value={subjectRows.find(row=>row.id===subjectId)?.name??'All subjects'}
        options={['All subjects',...subjectRows.map(row=>row.name)]} onChange={label=>setSubject(subjectRows.find(row=>row.name===label)?.id??'')}/>}
      {error&&<p role="alert">{error}</p>}
    </div>
  </Sheet>;
}

export function PlanningGoals() {
  const [rows,setRows]=useState<GoalRecord[]|null>(null),[error,setError]=useState(false);
  const [editing,setEditing]=useState<GoalRecord|null|undefined>(undefined);
  function reload(){
    void getGoalApi().listGoals({limit:50}).then(page=>{setRows(page.items);setError(false);}).catch(()=>setError(true));
  }
  useEffect(reload,[]);
  return <section aria-label="Goals" className="v7-goals">
    <div className="v7-card-heading"><h2 className="v7-learn-h2">Goals</h2><Button small onClick={()=>setEditing(null)}>Add a goal</Button></div>
    {error&&<p role="alert">Could not load goals. <button type="button" onClick={reload}>Retry</button></p>}
    {rows?.length===0&&<p className="v7-meta">No goals yet.</p>}
    <ul>{rows?.map(goal=><li key={goal.id} className="v7-goal-head">
      <span>{goal.period==='week'?'Weekly':goal.period==='month'?'Monthly':'Custom'} · {formatDuration(goal.targetMinutes)}</span>
      <Button small variant="ghost" onClick={()=>setEditing(goal)}>Edit</Button>
    </li>)}</ul>
    {editing!==undefined&&<GoalEditor goal={editing} onClose={()=>setEditing(undefined)} onSaved={reload}/>}
  </section>;
}
