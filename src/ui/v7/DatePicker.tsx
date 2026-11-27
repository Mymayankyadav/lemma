import {useLayoutEffect, useRef, useState} from 'react';
import {ChevronDown, ChevronLeft, ChevronRight} from 'lucide-react';
import {Button, IconButton, pickerDate} from './components';
import {ChoiceSurface} from './ChoiceSurface';
import {changeMonth, civilDate, dayKey, moveDay} from './dateGrid';

function DayGrid({value,today,choose}: {value:string;today?:string;choose:(v:string)=>void}) {
  const [cursor, setCursor] = useState(()=>civilDate(value));
  const grid = useRef<HTMLDivElement>(null), moveFocus = useRef(false);
  const focusKey = dayKey(cursor), current = civilDate(today), first = new Date(cursor.getFullYear(),cursor.getMonth(),1,12);
  const count = new Date(cursor.getFullYear(),cursor.getMonth()+1,0).getDate();
  useLayoutEffect(()=>{
    if (!moveFocus.current) return;
    moveFocus.current = false;
    grid.current?.querySelector<HTMLElement>('[data-day="'+focusKey+'"]')?.focus({preventScroll:true});
  },[focusKey]);
  function shortcut(offset:number) {
    const date = new Date(current);
    date.setDate(date.getDate()+offset); choose(dayKey(date));
  }
  return <>
    <div className="v7-wrap"><Button small onClick={()=>shortcut(0)}>Today</Button><Button small onClick={()=>shortcut(1)}>Tomorrow</Button>
      <Button small onClick={()=>shortcut((8-current.getDay())%7||7)}>Next Monday</Button></div>
    <div className="v7-calendar-heading">
      <IconButton label="Previous month" onClick={()=>setCursor(changeMonth(cursor,-1))}><ChevronLeft/></IconButton>
      <h3 aria-live="polite">{cursor.toLocaleDateString(undefined,{month:'long',year:'numeric'})}</h3>
      <IconButton label="Next month" onClick={()=>setCursor(changeMonth(cursor,1))}><ChevronRight/></IconButton>
    </div>
    <div className="v7-calendar" role="group" aria-label="Days of month" ref={grid}>
      {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d=><span className="v7-caption" key={d}>{d}</span>)}
      {Array.from({length:first.getDay()},(_,i)=><span key={'empty-'+i}/>)}
      {Array.from({length:count},(_,i)=>{
        const date = new Date(cursor.getFullYear(),cursor.getMonth(),i+1,12), key=dayKey(date);
        return <button key={key} type="button" tabIndex={key===focusKey?0:-1}
          data-day={key} data-v7-autofocus={key===focusKey?'true':undefined}
          aria-label={date.toLocaleDateString(undefined,{dateStyle:'full'})} aria-pressed={key===value} aria-current={key===dayKey(current)?'date':undefined}
          onClick={()=>choose(key)} onKeyDown={event=>{
            const next = moveDay(date,event.key,event.shiftKey);
            if (!next) return;
            event.preventDefault(); event.stopPropagation(); moveFocus.current=dayKey(next)!==key; setCursor(next);
          }}>{i+1}</button>;
      })}
    </div>
  </>;
}
export function DatePicker({value,onChange,label='Date',today,compact=false,open:controlled,onOpenChange,hideTrigger=false}: {
  value:string; onChange:(v:string)=>void; label?:string; today?:string; compact?:boolean;
  open?:boolean; onOpenChange?:(open:boolean)=>void; hideTrigger?:boolean;
}) {
  const [local,setLocal] = useState(false), trigger=useRef<HTMLButtonElement>(null);
  const open=controlled??local;
  function toggle(next:boolean) {setLocal(next);onOpenChange?.(next);}
  return <div className={compact?'v7-date-pill':'v7-field-group'}>
    {!hideTrigger && !compact && <span>{label}</span>}
    {!hideTrigger && <button type="button" ref={trigger} className="v7-field v7-picker" aria-label={label+': '+value} aria-haspopup="dialog"
      aria-expanded={open} onClick={()=>toggle(!open)}>{pickerDate(value)}<ChevronDown/></button>}
    <ChoiceSurface open={open} title="Choose a date" onClose={()=>toggle(false)} anchor={()=>trigger.current}>
      <DayGrid value={value} today={today} choose={date=>{onChange(date);toggle(false);}}/>
    </ChoiceSurface>
  </div>;
}
