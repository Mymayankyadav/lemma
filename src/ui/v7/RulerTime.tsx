import {RulerSlider} from './RulerSlider';

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
  return <RulerSlider label={label} value={dayMinute(value,540)} min={0} max={1439} step={1}
    format={minuteClock} disabled={disabled} onChange={minute=>onChange(minuteClock(minute))}/>;
}
