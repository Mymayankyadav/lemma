import { createElement, useId, useState, type CSSProperties, type ReactNode } from "react";
import { Check, CircleCheck, Clock3, Info, LockKeyhole, LoaderCircle, OctagonX, TriangleAlert, X } from "lucide-react";
import { Emblem } from "./Emblem";

export const subjects = ["Analysis","Algebra","Topology","Number theory","Geometry","Logic","Probability","Combinatorics"] as const;
export type Subject = typeof subjects[number] | "Other";
const glyph: Record<string,string> = {
  Analysis:"∫",Algebra:"λ",Topology:"τ","Number theory":"≡",Geometry:"△",Logic:"⊢",Probability:"ℙ",Combinatorics:"∑",Other:"✳",
};
export function SubjectMark({subject,size="glyph"}:{subject:Subject;size?:"glyph"|"tile"|"hero"}) {
  const index=subjects.indexOf(subject as typeof subjects[number]);
  return <span className={"v7-subject-mark v7-subject-"+(index<0?0:index+1)+" v7-mark-"+size} aria-hidden="true">
    {size==="hero" ? <Emblem subject={subject} seed={subject} size={164} animate={false}/> : <span className="v7-math-glyph">{glyph[subject]}</span>}
  </span>;
}
export function Tag({subject}:{subject:Subject}) {
  return <span className={"v7-tag v7-subject-"+(subjects.indexOf(subject as typeof subjects[number])+1)}>
    <SubjectMark subject={subject}/><span>{subject}</span>
  </span>;
}
export type ProofState="conjecture"|"progress"|"demonstrated"|"review";
export type Tone="info"|"success"|"warning"|"danger";
const icons:Record<Tone,typeof Info>={info:Info,success:CircleCheck,warning:TriangleAlert,danger:OctagonX};
export function Badge({tone="info",children}:{tone?:Tone;children:ReactNode}) {
  const Icon=icons[tone];
  return <span className={"v7-badge v7-tone-"+tone}><Icon size={16} fill="currentColor" stroke="var(--v7-role-surface-raised)" aria-hidden="true"/>{children}</span>;
}
export function ProofBadge({state}:{state:ProofState}) {
  const labels:Record<ProofState,string>={conjecture:"Conjecture",progress:"In progress",demonstrated:"Demonstrated",review:"Review due"};
  const marks:Record<ProofState,string>={conjecture:"○",progress:"◐",demonstrated:"∎",review:"↻"};
  return <span className={"v7-badge v7-proof-"+state}><span className="v7-proof-symbol" aria-hidden="true">{marks[state]}</span>{labels[state]}</span>;
}
export function FilterChip({children,selected,onChange}:{children:ReactNode;selected:boolean;onChange:(next:boolean)=>void}) {
  return <button className="v7-filter-chip" type="button" aria-pressed={selected} onClick={()=>onChange(!selected)}>
    {selected && <Check size={16} aria-hidden="true"/>}{children}
  </button>;
}
export function ToggleButton({children,selected,onChange}:{children:ReactNode;selected:boolean;onChange:(next:boolean)=>void}) {
  return <button className="v7-toggle-button" type="button" aria-pressed={selected} onClick={()=>onChange(!selected)}>
    {selected && <Check size={18} aria-hidden="true"/>}{children}
  </button>;
}
export function StateButton({children,variant="secondary",disabledReason,loading=false,pressed=false,onClick,small=false}:{
  children:ReactNode;variant?:"primary"|"secondary"|"tertiary"|"danger"|"confirm";
  disabledReason?:string;loading?:boolean;pressed?:boolean;small?:boolean;onClick?:()=>void;
}) {
  return <div className="v7-action-wrapper">
    <button type="button" className={"v7-state-button v7-action-"+variant+(small?" v7-action-small":"")}
      disabled={!!disabledReason||loading} title={disabledReason}
      aria-busy={loading||undefined} aria-pressed={pressed||undefined}
      onClick={onClick}>
      <span className="v7-action-spinner" aria-hidden="true">{loading&&<LoaderCircle className="v7-spinner" size={18}/>}</span>
      <span>{loading?"Saving…":children}</span>
    </button>
    {disabledReason&&<span className="v7-disabled-reason">{disabledReason}</span>}
  </div>;
}
export function FormField({label,helper="",optional=false,initial="",required=false,readOnly=false,disabledReason,showError=false}:{
  label:string;helper?:string;optional?:boolean;initial?:string;required?:boolean;readOnly?:boolean;disabledReason?:string;showError?:boolean;
}) {
  const id=useId(),[value,setValue]=useState(initial),[touched,setTouched]=useState(showError);
  const invalid=required&&touched&&!value.trim();
  return <div className={"v7-form-field"+(readOnly?" v7-is-readonly":"")}>
    <label htmlFor={id}>{label}{optional&&<span className="v7-optional">Optional</span>}
      {readOnly&&<LockKeyhole size={16} aria-label="Read only"/>}
    </label>
    <div className="v7-field-frame">
      <input id={id} value={value} onChange={e=>setValue(e.target.value)}
        onBlur={()=>setTouched(true)} readOnly={readOnly} disabled={!!disabledReason}
        aria-invalid={invalid||undefined} aria-describedby={invalid?id+"-error":helper||disabledReason?id+"-helper":undefined}
        placeholder={readOnly?"":required?"Add a name":"Optional note"}/>
      {invalid&&<OctagonX className="v7-input-error-icon" size={20} aria-hidden="true"/>}
    </div>
    {invalid?<p id={id+"-error"} className="v7-field-error"><OctagonX size={16} aria-hidden="true"/>Add a name before continuing.</p>:
      (helper||disabledReason)&&<p id={id+"-helper"} className="v7-field-hint">{disabledReason??helper}</p>}
  </div>;
}
function timeMinutes(v:string){const [h,m]=v.split(":").map(Number);return h*60+m;}
function toTime(v:number){const t=(v+1440)%1440;return String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0");}
export function TimeRangeField(){
  const [start,setStart]=useState("09:00"),[end,setEnd]=useState("09:50"),[custom,setCustom]=useState(false);
  const duration=(timeMinutes(end)-timeMinutes(start)+1440)%1440;
  const selected=[25,50,90].includes(duration)?duration:0;
  const setPreset=(n:number)=>{setCustom(false);setEnd(toTime(timeMinutes(start)+n));};
  return <fieldset className="v7-time-range">
    <legend>Time range</legend>
    <div className="v7-time-pair">
      <label>Start<span className="v7-time-input"><input type="time" value={start} step={300} onChange={e=>{const n=e.target.value;setStart(n);setEnd(toTime(timeMinutes(n)+duration));}}/><Clock3 size={18} aria-hidden="true"/></span></label>
      <span className="v7-range-dash" aria-hidden="true">–</span>
      <label>End<span className="v7-time-input"><input type="time" value={end} step={300} onChange={e=>setEnd(e.target.value)}/><Clock3 size={18} aria-hidden="true"/></span></label>
    </div>
    <div className="v7-preset-wrap" role="group" aria-label="Session duration presets">
      {[25,50,90].map(n=><FilterChip key={n} selected={!custom&&selected===n} onChange={()=>setPreset(n)}>{n} min</FilterChip>)}
      <FilterChip selected={custom} onChange={()=>setCustom(true)}>Custom</FilterChip>
    </div>
    {custom&&<RangeSlider label="Duration" value={duration} min={5} max={180} unit="min" onChange={n=>setEnd(toTime(timeMinutes(start)+n))}/>}
    <p className="v7-field-hint">{duration} min session · {start}–{end}</p>
  </fieldset>;
}
export function RadioGroup(){
  const [value,setValue]=useState("Review");
  return <fieldset className="v7-radio-group"><legend>Session mode</legend>
    {["Study","Review","Practice"].map(option=><label key={option} className="v7-radio-choice">
      <input type="radio" name="v7-study-mode" checked={value===option} onChange={()=>setValue(option)}/><span>{option}</span>
    </label>)}
  </fieldset>;
}
export function CheckChoice({disabledReason}:{disabledReason?:string}) {
  const [value,setValue]=useState(!disabledReason);
  return <label className="v7-check-choice"><input type="checkbox" checked={value} disabled={!!disabledReason} onChange={e=>setValue(e.target.checked)}/>
    <span>Include review cards{disabledReason&&<small>{disabledReason}</small>}</span></label>;
}
export function SwitchChoice({disabledReason}:{disabledReason?:string}) {
  const [value,setValue]=useState(!disabledReason);
  return <label className="v7-switch-choice"><span>Session reminders{disabledReason&&<small>{disabledReason}</small>}</span>
    <input type="checkbox" role="switch" checked={value} disabled={!!disabledReason} onChange={e=>setValue(e.target.checked)}/>
    <span className="v7-switch-visual" aria-hidden="true"><span>{value?"✓":"−"}</span></span>
  </label>;
}
export function RangeSlider({label,value,min=0,max=100,unit="",onChange}:{
  label:string;value:number;min?:number;max?:number;unit?:string;onChange:(value:number)=>void;
}) {
  const id=useId(),pct=(Math.max(min,Math.min(max,value))-min)/(max-min)*100;
  const style={"--v7-slider-position":pct+"%"} as CSSProperties;
  return <div className="v7-range-slider">
    <label htmlFor={id}>{label}<output htmlFor={id}>{value} {unit}</output></label>
    <input id={id} type="range" min={min} max={max} step={5} value={value} style={style}
      aria-valuetext={value+" "+unit}
      onChange={e=>onChange(Number(e.target.value))}
      onKeyDown={e=>{if(e.key==="PageUp"||e.key==="PageDown"){e.preventDefault();onChange(Math.min(max,Math.max(min,value+(e.key==="PageUp"?15:-15))));}}}/>
    <div className="v7-range-limits"><span>{min} {unit}</span><span>{max} {unit}</span></div>
  </div>;
}
export function MasteryBar({subject,value,total=100}:{subject:Subject;value:number;total?:number}) {
  const pct=Math.max(0,Math.min(100,value/total*100));
  return <div className={"v7-mastery v7-subject-"+(subjects.indexOf(subject as typeof subjects[number])+1)}>
    <div className="v7-mastery-caption"><span>{subject}</span><span>{pct===0?"Not started":value+" of "+total}</span></div>
    <div className="v7-mastery-track" role="progressbar" aria-label={subject+" mastery"} aria-valuenow={value} aria-valuemin={0} aria-valuemax={total} aria-valuetext={pct>=100?"Demonstrated":value+" of "+total}>
      <span style={{width:pct+"%"}}/>{pct>=100&&<b aria-hidden="true">∎</b>}
    </div>
    {pct>=100&&<ProofBadge state="demonstrated"/>}
  </div>;
}
export function ConstellationProgress({subject="Analysis"}:{subject?:Subject}) {
  const states:ProofState[]=["demonstrated","demonstrated","demonstrated","progress","conjecture","conjecture","conjecture"];
  return <div className={"v7-constellation v7-subject-"+(subjects.indexOf(subject as typeof subjects[number])+1)}>
    <ol aria-label={subject+" checkpoints"}>
      {states.map((s,i)=><li className={"v7-star-"+s} key={i}
        aria-label={"Checkpoint "+(i+1)+" of 7, "+(s==="progress"?"in progress":s==="demonstrated"?"demonstrated":"not started")}>
        <span aria-hidden="true">★</span><small>{i+1}</small></li>)}
    </ol>
  </div>;
}
export function StatementCard({kind="Lemma",subject="Topology",number="4.2",demonstrated=false}:{
  kind?:"Definition"|"Lemma"|"Theorem"|"Example"|"Exercise"|"Proof";
  subject?:Subject;number?:string;demonstrated?:boolean;
}) {
  const title=kind==="Definition"?"Compactness":kind==="Exercise"?"Find a finite subcover":"Every open cover has a finite subcover";
  return <article className={"v7-statement v7-statement-"+kind.toLowerCase()+" v7-subject-"+(subjects.indexOf(subject as typeof subjects[number])+1)}>
    <p className="v7-eyebrow">{kind} {number} · {subject}</p>
    <h3 className="v7-subhead">{title}</h3>
    <p className="v7-reading">For each open cover of a compact space, a finite subfamily suffices.</p>
    <p className="v7-reading"><em>Proof.</em> Let {createElement("math", null, createElement("mi", null, "K"))} be compact. Select a finite subcover by the defining property. {demonstrated&&<span aria-label="End of demonstrated proof" className="v7-qed">∎</span>}</p>
  </article>;
}
export function StatMeasure({label,value,unit,change}:{label:string;value:string;unit:string;change?:string}) {
  return <div className="v7-stat-measure"><p>{label}</p><strong>{value}<small> {unit}</small></strong>
    <span>{change??"No change yesterday"}</span></div>;
}
export function FeedbackBanner({tone="warning",action,children,onAction}:{tone?:Tone;action?:string;children:ReactNode;onAction?:()=>void}) {
  const Icon=icons[tone];
  return <aside className={"v7-feedback-banner v7-tone-"+tone}><Icon size={20} aria-hidden="true"/><div>{children}</div>
    {action&&<button type="button" onClick={onAction}>{action}</button>}</aside>;
}
export function SampleToast({onClose}:{onClose:()=>void}) {
  return <div className="v7-sample-toast" role="group" aria-label="Toast preview">
    <span><CircleCheck size={18} aria-hidden="true"/>Session removed</span>
    <button onClick={onClose}>Undo</button><button onClick={onClose} aria-label="Dismiss example"><X size={18}/></button>
  </div>;
}
export function EmptyEmblem({subject="Analysis"}:{subject?:Subject}){
  return <div className="v7-empty-emblem"><SubjectMark subject={subject} size="hero"/><h3 className="v7-subhead">Your next idea belongs here.</h3><p>Add a path to begin exploring a new idea.</p><StateButton> Add a path </StateButton></div>;
}
export function ErrorEmblem({subject="Analysis"}:{subject?:Subject}){
  return <div className="v7-empty-emblem v7-broken-emblem"><SubjectMark subject={subject} size="hero"/><h3 className="v7-subhead">This path could not load.</h3><p>Check your connection, then retry.</p><StateButton>Retry</StateButton></div>;
}
