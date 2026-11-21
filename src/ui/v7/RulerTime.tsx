import {RulerSlider} from './RulerSlider';
import {useState} from 'react';
import {Button,Field,Sheet} from './components';
import {Disclosure} from './Disclosure';

export function dayMinute(value: string, fallback = 0) {
  const match = /^(\d{2}):(\d{2})(?::\d{2}(?:\.\d{1,9})?)?$/.exec(value);
  return match ? Math.min(1439,Number(match[1]) * 60 + Number(match[2])) : fallback;
}

export function minuteClock(value: number) {
  const minute = Math.max(0,Math.min(1439,Math.round(value)));
  return String(Math.floor(minute/60)).padStart(2,'0') + ':' + String(minute%60).padStart(2,'0');
}

export function RulerTime({label,value,onChange,disabled=false}: {
  label:string;value:string;onChange:(value:string)=>void;disabled?:boolean;
}) {
  const [open,setOpen]=useState(false),[draft,setDraft]=useState(value);
  const clock=draft.trim().replace(/^(\d{2})(\d{2})$/,'$1:$2');
  const valid=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(clock);
  const apply=()=>{if(valid){onChange(clock);setOpen(false);}};
  return <>
    <RulerSlider label={label} value={dayMinute(value,540)} min={0} max={1439} step={1}
      format={minuteClock} disabled={disabled} onChange={minute=>onChange(minuteClock(minute))}/>
    <Button small variant="ghost" disabled={disabled} onClick={()=>{setDraft(value);setOpen(true);}}>Type {label.toLowerCase()}</Button>
    <Sheet open={open} title={label} onClose={()=>setOpen(false)} footer={<>
      <Button variant="ghost" onClick={()=>setOpen(false)}>Cancel</Button>
      <Button variant="primary" disabled={!valid} onClick={apply}>Use time</Button>
    </>}>
      <Field label="Time (HH:MM)" autoFocus inputMode="numeric" maxLength={5} value={draft} hint="Enter 09:17 or 0917."
        error={!valid?'Use a time from 00:00 to 23:59.':undefined} onChange={event=>setDraft(event.target.value)}
        onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();apply();}}}/>
      <Disclosure label="Quarter-hour presets"><div className="v7-wrap" role="group" aria-label="Time presets">
        {Array.from({length:96},(_,index)=>minuteClock(index*15)).map(time=><Button key={time} variant="ghost"
          onClick={()=>{onChange(time);setOpen(false);}}>{time}</Button>)}
      </div></Disclosure>
    </Sheet>
  </>;
}
