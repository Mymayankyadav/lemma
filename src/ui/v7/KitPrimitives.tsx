import { createElement, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check, ChevronRight, Clock3, LockKeyhole, LoaderCircle, Minus } from "lucide-react";
import { Emblem } from "./Emblem";
import { Toast } from "./components";
import { haptic } from "./haptics";

import { SubjectMark, subjectClass, type Subject } from "./Subject";
export { subjects, SubjectMark, subjectClass, type Subject } from "./Subject";
export function Tag({ subject }: { subject: Subject }) {
  return <span className={`v7-tag ${subjectClass(subject)}`}><SubjectMark subject={subject} /><span>{subject}</span></span>;
}
export type ProofState = "conjecture" | "progress" | "demonstrated" | "review";
export type Tone = "info" | "success" | "warning" | "danger";
export function StatusIcon({ tone, size = 20 }: { tone: Tone; size?: number }) {
  return <svg className="v7-status-icon" width={size} height={size} style={{ width: size, height: size }} viewBox="0 0 20 20" aria-hidden="true">
    {tone === "warning" ? <path fill="currentColor" d="M8.3 2.8a2 2 0 0 1 3.4 0l7 12.1a2 2 0 0 1-1.7 3H3a2 2 0 0 1-1.7-3Z" /> : tone === "danger" ?
      <path fill="currentColor" d="M6 1h8l5 5v8l-5 5H6l-5-5V6Z" /> : <circle fill="currentColor" cx="10" cy="10" r="9" />}
    <g fill="none" stroke="var(--v7-tone-bg, var(--v7-role-surface-raised))" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {tone === "success" ? <path d="m5.5 10 3 3 6-6" /> : tone === "danger" ? <path d="m7 7 6 6m0-6-6 6" /> : tone === "warning" ? <path d="M10 7v4m0 3h.01" /> : <path d="M10 9v5m0-8h.01" />}
    </g>
  </svg>;
}
export function Badge({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`v7-badge v7-tone-${tone}`}><StatusIcon tone={tone} size={14} />{children}</span>;
}
export function ProofBadge({ state }: { state: ProofState }) {
  const labels: Record<ProofState, string> = { conjecture: "Conjecture", progress: "In progress", demonstrated: "Demonstrated", review: "Review due" };
  const marks: Record<ProofState, string> = { conjecture: "○", progress: "◐", demonstrated: "∎", review: "↻" };
  return <span className={`v7-badge v7-proof-${state}`}><span className="v7-proof-symbol" aria-hidden="true">{marks[state]}</span>{labels[state]}</span>;
}
export function FilterChip({ children, selected, onChange, disabledReason }: { children: ReactNode; selected: boolean; onChange: (next: boolean) => void; disabledReason?: string }) {
  return <button className="v7-filter-chip" type="button" aria-pressed={selected} disabled={!!disabledReason} title={disabledReason} onClick={() => onChange(!selected)}>
    {selected && <Check size={16} aria-hidden="true" />}{children}
  </button>;
}
export function ToggleButton({ children, selected, onChange, disabledReason }: { children: ReactNode; selected: boolean; onChange: (next: boolean) => void; disabledReason?: string }) {
  return <button className="v7-toggle-button" type="button" aria-pressed={selected} disabled={!!disabledReason} title={disabledReason} onClick={() => onChange(!selected)}>
    {selected && <Check size={20} aria-hidden="true" />}{children}
  </button>;
}
export function StateButton({ children, variant = "secondary", disabledReason, loading = false, saved = false, onClick, small = false }: {
  children: ReactNode; variant?: "primary" | "secondary" | "tertiary" | "danger" | "confirm";
  disabledReason?: string; loading?: boolean; saved?: boolean; small?: boolean; onClick?: () => void;
}) {
  const id = useId();
  return <div className="v7-action-wrapper">
    <button type="button" className={`v7-state-button v7-action-${variant}${small ? " v7-action-small" : ""}`}
      disabled={!!disabledReason || loading} title={disabledReason} aria-describedby={disabledReason ? id : undefined}
      aria-busy={loading || undefined} onClick={onClick}>
      <span className="v7-action-idle" aria-hidden={loading || saved || undefined}>{children}</span>
      <span className="v7-action-result" aria-hidden={!loading && !saved}>
        {saved ? <Check size={20} aria-hidden="true" /> : <LoaderCircle className="v7-spinner" size={20} aria-hidden="true" />}
        {saved ? "Saved" : "Saving…"}
      </span>
    </button>
    {disabledReason && <span id={id} className="v7-disabled-reason">{disabledReason}</span>}
  </div>;
}
export function FormField({ label, helper = "", optional = false, initial = "", required = false, readOnly = false, disabledReason, showError = false }: {
  label: string; helper?: string; optional?: boolean; initial?: string; required?: boolean; readOnly?: boolean; disabledReason?: string; showError?: boolean;
}) {
  const id = useId(), [value, setValue] = useState(initial), [touched, setTouched] = useState(showError);
  const invalid = required && touched && !value.trim();
  return <div className={`v7-form-field${readOnly ? " v7-is-readonly" : ""}`}>
    <label htmlFor={id}>{label}{optional && <span className="v7-optional">Optional</span>}{readOnly && <LockKeyhole size={16} aria-hidden="true" />}</label>
    <div className="v7-field-frame">
      <input id={id} value={value} onChange={e => setValue(e.target.value)} onBlur={() => setTouched(true)} readOnly={readOnly} disabled={!!disabledReason}
        aria-required={required || undefined} aria-invalid={invalid || undefined} aria-describedby={invalid ? id + "-error" : helper || disabledReason ? id + "-helper" : undefined}
        placeholder={readOnly || disabledReason ? "" : required ? "Add a name" : "Optional note"} />
      {invalid && <span className="v7-input-error-icon v7-tone-danger"><StatusIcon tone="danger" /></span>}
    </div>
    {invalid ? <p id={id + "-error"} className="v7-field-error v7-tone-danger"><StatusIcon tone="danger" size={16} />Add a name before continuing.</p> :
      (helper || disabledReason) && <p id={id + "-helper"} className="v7-field-hint">{disabledReason ?? helper}</p>}
  </div>;
}
function timeMinutes(value:string){const [h,m]=value.split(":").map(Number);return h*60+m;}
function toTime(value:number){const t=((value%1440)+1440)%1440;return String(Math.floor(t/60)).padStart(2,"0")+":"+String(t%60).padStart(2,"0");}
function validTime(value:string){return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);}
export function TimeRangeField(){
 const id=useId(),[start,setStart]=useState("09:00"),[end,setEnd]=useState("09:50"),[draftStart,setDraftStart]=useState(start),[draftEnd,setDraftEnd]=useState(end),[error,setError]=useState(""),[custom,setCustom]=useState(false);
 const duration=(timeMinutes(end)-timeMinutes(start)+1440)%1440;
 function updateEnd(value:string){setEnd(value);setDraftEnd(value);}
 function commitStart(){if(!validTime(draftStart)){setError("Enter a start time in 24-hour HH:MM format.");return;}setError("");setStart(draftStart);updateEnd(toTime(timeMinutes(draftStart)+duration));}
 function commitEnd(){if(!validTime(draftEnd)){setError("Enter an end time in 24-hour HH:MM format.");return;}setError("");setEnd(draftEnd);setCustom(![25,50,90].includes((timeMinutes(draftEnd)-timeMinutes(start)+1440)%1440));}
 return <fieldset className="v7-time-range"><legend>Time range</legend><div className="v7-time-pair">
  <label>Start<span className="v7-time-input"><input type="text" inputMode="numeric" maxLength={5} value={draftStart} placeholder="09:00" aria-describedby={id} aria-invalid={!!error&&!validTime(draftStart)||undefined} onChange={e=>setDraftStart(e.target.value)} onBlur={commitStart}/><Clock3 size={20} aria-hidden="true"/></span></label>
  <span className="v7-range-dash" aria-hidden="true">–</span>
  <label>End<span className="v7-time-input"><input type="text" inputMode="numeric" maxLength={5} value={draftEnd} placeholder="09:50" aria-describedby={id} aria-invalid={!!error&&!validTime(draftEnd)||undefined} onChange={e=>setDraftEnd(e.target.value)} onBlur={commitEnd}/><Clock3 size={20} aria-hidden="true"/></span></label>
 </div><div className="v7-preset-wrap" role="group" aria-label="Session duration presets">{[25,50,90].map(n=><FilterChip key={n} selected={!custom&&duration===n} onChange={()=>{setCustom(false);updateEnd(toTime(timeMinutes(start)+n));}}>{n} min</FilterChip>)}<FilterChip selected={custom} onChange={()=>setCustom(true)}>Custom</FilterChip></div>
 {custom&&<RangeSlider label="Duration" value={duration} min={5} max={Math.max(180,Math.ceil(duration/5)*5)} unit="min" onChange={n=>updateEnd(toTime(timeMinutes(start)+n))}/>}
 <p id={id} className={error?"v7-field-error":"v7-field-hint"}>{error||`${duration} min session · ${start}–${end}${end<start?" · Ends the next day":""} · 24-hour time`}</p></fieldset>;
}
export function RadioGroup({ disabledReason }: { disabledReason?: string }) {
  const [value, setValue] = useState("Review"), name = useId();
  return <fieldset className="v7-radio-group" disabled={!!disabledReason}><legend>Session mode</legend>
    {["Study", "Review", "Practice"].map(option => <label key={option} className="v7-radio-choice"><input type="radio" name={name} checked={value === option} onChange={() => setValue(option)} /><span>{option}</span></label>)}
    {disabledReason && <p className="v7-disabled-reason">{disabledReason}</p>}
  </fieldset>;
}
export function CheckChoice({ disabledReason, mixed = false }: { disabledReason?: string; mixed?: boolean }) {
  const [value, setValue] = useState(!disabledReason);
  return <label className="v7-check-choice"><input type="checkbox" checked={value} aria-checked={mixed ? "mixed" : value} ref={el => { if (el) el.indeterminate = mixed; }} disabled={!!disabledReason} onChange={e => setValue(e.target.checked)} />
    <span>Include review cards{disabledReason && <small>{disabledReason}</small>}</span></label>;
}
export function SwitchChoice({ disabledReason }: { disabledReason?: string }) {
  const [value, setValue] = useState(!disabledReason);
  return <label className="v7-switch-choice"><span>Session reminders{disabledReason && <small>{disabledReason}</small>}</span>
    <input type="checkbox" role="switch" checked={value} disabled={!!disabledReason} onChange={e => setValue(e.target.checked)} />
    <span className="v7-switch-visual" aria-hidden="true"><span>{value ? <Check size={16} /> : <Minus size={16} />}</span></span>
  </label>;
}
export function RangeSlider({ label, value, min = 0, max = 100, unit = "", onChange, disabledReason }: {
  label: string; value: number; min?: number; max?: number; unit?: string; onChange: (value: number) => void; disabledReason?: string;
}) {
  const id = useId(), [dragging, setDragging] = useState(false), pct = max > min ? (Math.max(min, Math.min(max, value)) - min) / (max - min) * 100 : 0;
  const style = { "--v7-slider-position": pct + "%" } as CSSProperties;
  return <div className="v7-range-slider" style={style}>
    <label htmlFor={id}>{label}<output htmlFor={id}>{value} {unit}</output></label>
    <div className="v7-range-control">
      {dragging && <span className="v7-range-bubble" aria-hidden="true">{value} {unit}</span>}
      <input id={id} type="range" min={min} max={max} step={5} value={value} disabled={!!disabledReason} title={disabledReason} aria-valuetext={value + " " + unit}
        onPointerDown={() => setDragging(true)} onPointerUp={() => setDragging(false)} onPointerCancel={() => setDragging(false)} onBlur={() => setDragging(false)}
        onChange={e => onChange(Number(e.target.value))} onKeyDown={e => { if (e.key === "PageUp" || e.key === "PageDown") { e.preventDefault(); onChange(Math.min(max, Math.max(min, value + (e.key === "PageUp" ? 15 : -15)))); } }} />
      <div className="v7-range-ticks" aria-hidden="true">{[25, 50, 90].filter(n => n >= min && n <= max).map(n => <i key={n} style={{ left: (n - min) / (max - min) * 100 + "%" }} />)}</div>
    </div>
    <div className="v7-range-limits"><span>{min} {unit}</span><span>{max} {unit}</span></div>
    {disabledReason && <p className="v7-disabled-reason">{disabledReason}</p>}
  </div>;
}
export function MasteryBar({ subject, value, total = 100 }: { subject: Subject; value: number; total?: number }) {
  const safeTotal = Math.max(1, total), current = Math.max(0, Math.min(safeTotal, value)), pct = current / safeTotal * 100;
  return <div className={`v7-mastery ${subjectClass(subject)}`}>
    <div className="v7-mastery-caption"><span><SubjectMark subject={subject} />{subject}</span><span>{pct === 0 ? "Not started" : current + " of " + safeTotal}</span></div>
    <div className="v7-mastery-track" role="progressbar" aria-label={subject + " mastery"} aria-valuenow={current} aria-valuemin={0} aria-valuemax={safeTotal} aria-valuetext={pct >= 100 ? "Demonstrated" : current + " of " + safeTotal}>
      <span style={{ width: pct + "%" }} />
    </div>{pct >= 100 && <span className="v7-mastery-complete"><b className="v7-mastery-end" aria-hidden="true">∎</b><ProofBadge state="demonstrated" /></span>}
  </div>;
}
export function ConstellationProgress({ subject = "Analysis", demonstrated = false }: { subject?: Subject; demonstrated?: boolean }) {
  const id = useId(), points = [[14, 28], [58, 17], [103, 25], [149, 10], [195, 25], [240, 17], [284, 28]];
  const states: ProofState[] = ["demonstrated", "demonstrated", "demonstrated", demonstrated ? "demonstrated" : "progress", "conjecture", "conjecture", "conjecture"];
  return <div className={`v7-constellation ${subjectClass(subject)}`}>
    <svg className="v7-constellation-lines" viewBox="0 0 298 54" preserveAspectRatio="none" aria-hidden="true"><polyline points={points.map(p => p.join(",")).join(" ")} fill="none" /></svg>
    <ol aria-label={subject + " checkpoints"}>{states.map((state, i) => <li className={`v7-star-${state}`} key={i} style={{ "--v7-star-offset": points[i][1] + "px" } as CSSProperties}
      aria-current={state === "progress" ? "step" : undefined} aria-label={`Checkpoint ${i + 1} of 7, ${state === "progress" ? "in progress" : state === "demonstrated" ? "demonstrated" : "not started"}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><defs><clipPath id={`${id}-${i}`}><rect width="12" height="24" /></clipPath></defs>
        <path className="v7-star-outline" d="m12 2 3 6.5 7 1-5 5 1.2 7-6.2-3.4L5.8 21l1.2-6.5-5-5 7-1Z" />
        {state === "progress" && <path className="v7-star-half" clipPath={`url(#${id}-${i})`} d="m12 2 3 6.5 7 1-5 5 1.2 7-6.2-3.4L5.8 21l1.2-6.5-5-5 7-1Z" />}
      </svg><small>{i + 1}</small>
    </li>)}</ol>
  </div>;
}
const math = (symbol: string) => createElement("math", null, createElement("mi", null, symbol));
export function StatementCard({ kind = "Lemma", subject = "Topology", number = "4.2", demonstrated = false }: {
  kind?: "Definition" | "Lemma" | "Theorem" | "Example" | "Exercise" | "Proof"; subject?: Subject; number?: string; demonstrated?: boolean;
}) {
  const copy = {
    Definition: ["Compactness", <>A space {math("K")} is compact if every open cover of {math("K")} contains a finite subcover.</>],
    Lemma: ["Closed subsets stay compact", <>Every closed subset of a compact space is compact.</>],
    Theorem: ["Every open cover has a finite subcover", <>For a compact space {math("K")}, finitely many members of any open cover already cover {math("K")}.</>],
    Example: ["A closed interval", <>The closed interval [0, 1] is compact in the usual topology on the real line.</>],
    Exercise: ["Find a finite subcover", <>Cover [0, 1] with the intervals (−1, ¾) and (¼, 2). Explain why both are needed.</>],
    Proof: ["A finite choice suffices", <>Compactness supplies a finite subcover for each open cover of {math("K")}.</>],
  };
  return <article className={`v7-statement v7-statement-${kind.toLowerCase()} ${subjectClass(subject)}`}>
    <p className="v7-eyebrow"><SubjectMark subject={subject} />{kind} {number} · {subject}</p>
    <h3 className="v7-subhead">{copy[kind][0]}</h3><p className="v7-reading">{copy[kind][1]}</p>
    {(kind === "Theorem" || kind === "Lemma" || kind === "Proof") && <p className="v7-reading"><em>Proof.</em> {kind === "Lemma" ? <>Adjoin the open complement to a cover of the closed subset. A finite subcover of the whole space restricts to one of the subset.</> : <>Apply the defining property of compactness to the given open cover.</>}{demonstrated && <span aria-label="End of demonstrated proof" className="v7-qed">∎</span>}</p>}
  </article>;
}
export function StatMeasure({ label, value, unit, change }: { label: string; value: string; unit: string; change?: string }) {
  return <div className="v7-stat-measure"><p>{label}</p><strong>{value}<small> {unit}</small></strong><span>{change ?? "No change yesterday"}</span></div>;
}
export function FeedbackBanner({ tone = "warning", action, children, onAction }: { tone?: Tone; action?: string; children: ReactNode; onAction?: () => void }) {
  return <aside className={`v7-feedback-banner v7-tone-${tone}`}><StatusIcon tone={tone} /><div>{children}</div>{action && <button type="button" onClick={onAction}>{action}</button>}</aside>;
}
export function SampleToast({ onClose }: { onClose: () => void }) {
  return <Toast message="Session removed" action="Undo" onAction={onClose} onClose={onClose} />;
}
export function EmptyEmblem({ subject = "Analysis" }: { subject?: Subject }) {
  return <div className="v7-empty-emblem"><SubjectMark subject={subject} size="hero" /><h3 className="v7-subhead">Your next idea belongs here.</h3><p>Add a path in {subject} to begin exploring a new idea.</p><StateButton>Add a path</StateButton></div>;
}
export function ErrorEmblem({ subject = "Analysis" }: { subject?: Subject }) {
  return <div className="v7-empty-emblem v7-broken-emblem"><SubjectMark subject={subject} size="hero" broken /><h3 className="v7-subhead">This {subject} path could not load.</h3><p>Check your connection, then retry.</p><StateButton>Retry</StateButton></div>;
}
/** One event owns the full completion sequence; no unrelated gallery state is updated. */
export function CompletionPattern() {
  const [phase, setPhase] = useState(0), timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function complete() {
    timers.current.forEach(clearTimeout);
    setPhase(1);
    haptic("complete",true);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [delay, next] of [[300, 2], [600, 3], [1500, 4]]) timers.current.push(setTimeout(() => setPhase(next), reduced ? 120 : delay));
  }
  return <div className={`v7-completion-pattern v7-subject-1 v7-completion-phase-${phase}`}>
    <div className="v7-demo-row"><SubjectMark subject="Analysis" /><span className="v7-control-label">Checkpoint 4 · A finite subcover</span></div>
    <div className="v7-completion-scene"><Emblem key={phase >= 3 ? "complete" : "pending"} subject="Analysis" seed="checkpoint-4" size={96} animate={phase >= 3} />{phase >= 2 && <span className="v7-qed" aria-hidden="true">∎</span>}</div>
    <ConstellationProgress demonstrated={phase >= 3} />
    <div className="v7-demo-row"><StateButton saved={phase>=1} onClick={complete}>Mark demonstrated</StateButton><button type="button" className="v7-demo-trigger" onClick={phase ? () => { timers.current.forEach(clearTimeout); setPhase(0); } : complete}>{phase ? "Reset completion" : "Try completion feedback"}</button>{phase >= 1 && <Check aria-label="Proof saved" />}</div>
    <p role="status" className="v7-meta">{phase === 4 ? "Demonstrated" : phase ? "Completing the proof…" : "Complete the proof to fill its star."}</p>
  </div>;
}
export function PathRow({ subject, title, demonstrated = false }: { subject: Subject; title: string; demonstrated?: boolean }) {
  return <button type="button" className={`v7-path-row ${subjectClass(subject)}`}><SubjectMark subject={subject} size="tile" /><span><strong>{title}</strong><span className="v7-meta">{subject} · {demonstrated ? <ProofBadge state="demonstrated" /> : "Checkpoint 4 of 7"}</span></span><ChevronRight size={20} aria-hidden="true" /></button>;
}
