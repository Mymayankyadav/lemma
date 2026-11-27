import { formatDay, formatShortDate } from "../../lib/format";
/** "Today · Mon 9 Nov" or "Sat 7 Nov". */
export function pickerDate(value: string): string {
  const word = formatDay(value);
  return ["Today", "Tomorrow", "Yesterday"].includes(word) ? word + " · " + formatShortDate(value) : formatShortDate(value);
}
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type InputHTMLAttributes,
  type CSSProperties,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  LoaderCircle,
  Minus,
  Plus,
  X,
  CircleDot,
  CircleCheck,
  CircleX,
  TriangleAlert,
} from "lucide-react";
import { SubjectMark, subjects, subjectClass, type Subject } from "./Subject";
import { InfoTip } from "./InfoTip";
import { Sheet } from "./Sheet";
import { Picker } from "./Picker";
import { ChoiceSurface } from "./ChoiceSurface";
import { handoffLayer } from "./layers";
export { Sheet } from "./Sheet";
import "./components.css";
import "./motion.css";
export function Button({
  variant = "secondary",
  small = false,
  loading = false,
  destructive = false,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  small?: boolean;
  loading?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
        type="button"
      {...props}
      disabled={props.disabled || loading}
      aria-busy={loading || undefined}
      aria-label={
        props["aria-label"] ??
        (loading && typeof children === "string" ? children : undefined)
      }
      className={`v7-button v7-${variant} ${small ? "v7-small" : ""} ${destructive ? "v7-danger" : ""} ${className}`}
    >
      <span>{children}</span>
      <span className="v7-button-progress" aria-hidden="true">
        {loading && <LoaderCircle className="v7-spinner" aria-hidden="true" />}
      </span>
    </button>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
        type="button"
      {...props}
      aria-label={label}
      title={props.title ?? label}
      className="v7-icon-button"
    >
      {children}
    </button>
  );
}
export function Chip({
  children,
  kind = "neutral",
  subject = 1,
  selected,
  onClick,
}: {
  children: ReactNode;
  kind?: "neutral" | "subject" | "status" | "ready" | "mastery" | "gold" | "live";
  subject?: number;
  selected?: boolean;
  onClick?: () => void;
}) {
  const name:Subject=subjects[Math.max(0,Math.min(subjects.length-1,subject-1))] ?? "Other";
  const content=<>{kind==="subject"&&<SubjectMark subject={name}/>} {kind==="status"&&<CircleCheck aria-hidden="true"/>}{kind==="ready"&&<CircleDot aria-hidden="true"/>}{kind==="mastery"&&<span className="v7-proof" aria-hidden="true">∎</span>}{children}</>;
  // N125: a selected filter chip already draws its tick in CSS (components.css); a second <Check/> showed "✓ ✓ 50 min".
  return onClick?<button type="button" className="v7-filter-chip" aria-pressed={!!selected} onClick={onClick}>{content}</button>:
   <span className={kind==="subject"?"v7-tag "+subjectClass(name):"v7-badge "+(kind==="gold"?"v7-tone-warning":kind==="mastery"||kind==="status"?"v7-tone-success":"v7-tone-info")}>{content}</span>;
}

/** V11 (v7 UX audit r3): whether every option's label fits its segment at the current width and text size. */
export function useSegmentsFit(ref: { current: HTMLElement | null }, key: string, measureUnwrapped = false): boolean {
  const [fit, setFit] = useState(true);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    // The label's own width (it may use the button's padding), against the button's: overlapping text is what matters.
    const range = typeof document.createRange === "function" ? document.createRange() : null;
    const probe = measureUnwrapped ? document.createElement("span") : null;
    if (probe) {
      probe.ariaHidden = "true";
      probe.style.cssText = "position:fixed;visibility:hidden;pointer-events:none;white-space:pre;width:max-content";
    }
    const textWidth = (button: HTMLElement) => {
      // Measure the same single line in both layouts. A range over already-wrapped text
      // can report that it fits, unwrap the control and resize it again on the next frame.
      if (probe) {
        probe.textContent = button.textContent;
        button.appendChild(probe);
        const width = probe.getBoundingClientRect().width;
        probe.remove();
        return width;
      }
      if (!range) return button.scrollWidth;
      range.selectNodeContents(button);
      return range.getBoundingClientRect?.().width ?? button.scrollWidth;
    };
    const check = () => {
      // Not laid out yet (a closed sheet): keep the last answer instead of reading zero widths.
      if (!box.isConnected || box.clientWidth === 0) return;
      setFit([...box.querySelectorAll<HTMLElement>("button")].every((button) => textWidth(button) <= button.clientWidth - 2));
    };
    check();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(check);
    observer?.observe(box);
    void document.fonts?.ready.then(check).catch(() => undefined);
    return () => observer?.disconnect();
  }, [ref, key, measureUnwrapped]);
  return fit;
}
export function Segmented({
  label,
  options,
  value,
  onChange,
  tabs = false,
  disabled = false,
  panelId,
  measureUnwrapped = false,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  tabs?: boolean;
  disabled?: boolean;
  panelId?: string;
  measureUnwrapped?: boolean;
}) {
  const tabSemantics=tabs&&!!panelId;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  // V11: labels never overlap. When they do not fit (large text, a narrow phone), a choice of more than three becomes
  // the kit's Picker menu and up to three wrap onto two lines. A hidden copy keeps measuring, so it switches back.
  const box = useRef<HTMLDivElement>(null), [mode, setMode] = useState("segments");
  // The measured element moves when the mode flips, so the key includes the mode and the observer follows it.
  const fit = useSegmentsFit(box, options.join("\u0000") + "|" + mode, measureUnwrapped), menu = !tabs && !fit && options.length > 3;
  useEffect(() => setMode(menu ? "menu" : "segments"), [menu]);
  const control = (measure: boolean) => (
    <div
      ref={measure && !tabs ? box : undefined}
      className={(tabs ? "v7-tabs" : "v7-segmented") + (measure && menu ? " v7-segmented-measure" : "")}
      role={measure && menu ? undefined : tabSemantics ? "tablist" : "radiogroup"}
      aria-label={measure && menu ? undefined : label}
      aria-hidden={measure && menu ? true : undefined}
      inert={measure && menu ? true : undefined}
      data-wrap={!tabs && !fit && !menu ? "" : undefined}
    >
      {options.map((option, index) => (
        <button
        type="button"
          key={option}
          ref={(el) => {
            refs.current[index] = el;
          }}
          disabled={disabled}
          role={tabSemantics ? "tab" : "radio"}
          id={tabSemantics ? `${panelId}-tab-${index}` : undefined}
          aria-controls={tabSemantics ? panelId : undefined}
          aria-selected={tabSemantics ? option === value : undefined}
          aria-checked={tabSemantics ? undefined : option === value}
          tabIndex={option === value ? 0 : -1}
          onClick={() => onChange(option)}
          onKeyDown={(e) => {
            let i = index;
            if (e.key === "ArrowRight" || e.key === "ArrowDown") i = (index + 1) % options.length;
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
              i = (index + options.length - 1) % options.length;
            else if (e.key === "Home") i = 0;
            else if (e.key === "End") i = options.length - 1;
            else return;
            e.preventDefault();
            onChange(options[i]);
            refs.current[i]?.focus();
          }}
        >
          {option}
        </button>
      ))}
    </div>
  );
  if (!menu) return control(true);
  return <div className="v7-segmented-menu">{control(true)}<Picker label={label} value={value} options={options} onChange={onChange} disabled={disabled} /></div>;
}
export function Field({
  label,
  error,
  id,
  className = "",
  hint,
  optional = false,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; optional?: boolean }) {
  const auto = useId(),
    fieldId = id ?? auto;
  return (
    <div className="v7-field-group">
      {/* KC19: "Optional" is a Supporting-style suffix, not part of the label's words. */}
      <label htmlFor={fieldId}>{label}{optional && <span className="v7-field-optional"> · Optional</span>}</label>
      <input
        {...props}
        id={fieldId}
        className={`v7-field ${className}`}
        data-v7-autofocus={props.autoFocus || undefined}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${fieldId}-error` : props.readOnly ? `${fieldId}-readonly` : hint ? `${fieldId}-hint` : props["aria-describedby"]
        }
      />
      {hint && !error && <p id={`${fieldId}-hint`} className="v7-field-hint">{hint}</p>}
      {props.readOnly && (
        <p id={`${fieldId}-readonly`} className="v7-readonly-note">
          Read only · Changes are unavailable here
        </p>
      )}
      {error && (
        <p id={`${fieldId}-error`} className="v7-error">
          <CircleX aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  );
}
export { Picker };
export { DatePicker } from "./DatePicker";
export function TimePicker({
  start,
  end,
  onChange,
}: {
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const timeId = useId();
  const [editing, setEditing] = useState<"start" | "end" | null>(null),
    [typing, setTyping] = useState(false);
  const value = editing === "start" ? start : end;
  const [startHours, startMinutes] = start.split(":").map(Number);
  const [endHours, endMinutes] = end.split(":").map(Number);
  const selectedDuration =
    ((endHours * 60 + endMinutes - (startHours * 60 + startMinutes)) + 1440) % 1440;
  function duration(minutes: number) {
    const [h, m] = start.split(":").map(Number),
      total = (h * 60 + m + minutes) % 1440;
    onChange(
      start,
      `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`,
    );
  }
  return (
    <div className="v7-stack">
      <div className="v7-columns">
        <Button onClick={() => setEditing("start")}>Start {start}</Button>
        <Button onClick={() => setEditing("end")}>End {end}</Button>
      </div>
      <div className="v7-wrap">
        {[25, 50, 90].map((n) => (
          <Chip key={n} selected={selectedDuration === n} onClick={() => duration(n)}>
            {n} min
          </Chip>
        ))}
        <Chip selected={!([25, 50, 90].includes(selectedDuration))} onClick={() => setEditing("end")}>Custom</Chip>
      </div>
      <Sheet
        open={editing !== null}
        onClose={() => {
          setEditing(null);
          setTyping(false);
        }}
        title={`Choose ${editing ?? "start"} time`}
        footer={
          <Button variant="primary" onClick={() => setEditing(null)}>
            Use time
          </Button>
        }
      >
        <Button variant="ghost" onClick={() => setTyping(!typing)}>
          {typing ? "Use time wheel" : "Type a time"}
        </Button>
        {typing ? (
          <Field
            label="Time"
            hint="24-hour time, for example 09:30"
            inputMode="numeric"
            autoComplete="off"
            maxLength={5}
            defaultValue={value}
            onChange={(e) => {
              // B7: a themed 24-hour text field, never the browser's native time control.
              const typed = e.target.value.trim(), match = /^([01]?\d|2[0-3])[:.]?([0-5]\d)$/.exec(typed);
              if (!match) return;
              const next = match[1].padStart(2, "0") + ":" + match[2];
              if (editing === "start") onChange(next, end); else onChange(start, next);
            }}
          />
        ) : (
          <div
            className="v7-time-wheel"
            role="listbox"
            aria-label="Time in five minute steps"
            aria-activedescendant={`${timeId}-${value}`}
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
              e.preventDefault();
              const [h, m] = value.split(":").map(Number),
                total =
                  (h * 60 + m + (e.key === "ArrowDown" ? 5 : 1435)) % 1440,
                next = `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
              editing === "start" ? onChange(next, end) : onChange(start, next);
            }}
          >
            {Array.from({ length: 288 }, (_, i) => {
              const time = `${String(Math.floor(i / 12)).padStart(2, "0")}:${String((i % 12) * 5).padStart(2, "0")}`;
              return (
                <button
        type="button"
                  role="option"
                  id={`${timeId}-${time}`}
                  aria-selected={time === value}
                  key={time}
                  ref={(el) => {
                    if (el && time === value)
                      el.scrollIntoView({ block: "center" });
                  }}
                  tabIndex={-1}
                  onClick={() =>
                    editing === "start"
                      ? onChange(time, end)
                      : onChange(start, time)
                  }
                >
                  {time}
                </button>
              );
            })}
          </div>
        )}
      </Sheet>
    </div>
  );
}
export function Checkbox({
  label,
  checked,
  onChange,
  disabled = false,
  mixed = false,
}: {
  /** Usually text; a row may pass rendered maths. */
  label: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  mixed?: boolean;
}) {
  return (
    <label className="v7-check-choice">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-checked={mixed ? "mixed" : checked}
        ref={(el) => {
          if (el) el.indeterminate = mixed;
        }}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
export function RadioOption({
  label,
  name,
  checked,
  onChange,
  disabled = false,
}: {
  label: ReactNode;
  name: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="v7-radio-row">
      <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}
export function Switch({
  label,
  checked,
  onChange,
  disabled = false,
  info,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  /** N220: a short explanation behind an (i) beside the label, instead of a paragraph under the switch. */
  info?: ReactNode;
}) {
  const switchId = useId();
  if (info) return (
    <div className="v7-switch-choice v7-switch-with-info">
      <span className="v7-switch-text"><label htmlFor={switchId}>{label}</label><InfoTip label={label}>{info}</InfoTip></span>
      <input
        id={switchId}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="v7-switch-visual" aria-hidden="true"><span>{checked?<Check/>:<Minus/>}</span></span>
    </div>
  );
  return (
    <label className="v7-switch-choice">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="v7-switch-visual" aria-hidden="true"><span>{checked?<Check/>:<Minus/>}</span></span>
    </label>
  );
}
export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const id = useId();
  const progress = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
  return (
    <div className="v7-range-slider">
      <label htmlFor={id}>
        {label}{" "}
        <output className="v7-value" htmlFor={id}>
          {value}
        </output>
      </label>
      <input
        id={id}
        className="v7-slider"
        style={{ "--v7-range-progress": `${progress}%`, "--v7-slider-position": `${progress}%` } as CSSProperties}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
    </div>
  );
}
/**
 * R0 · F14: the one stepper: a pill with 44 px end caps and a tabular numeral, always with a visible label and a unit
 * ("Focused time · 25 min"). `unit` may be a function for plurals ("1 block" / "2 blocks").
 */
export function Stepper({
  label,
  unit,
  value,
  onChange,
  min = 0,
  max = 10,
  format,
}: {
  label: string;
  unit: string | ((value: number) => string);
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  /** Optional display of the value (e.g. hours as "2 h 30 min"); the unit is then omitted. */
  format?: (value: number) => string;
}) {
  const labelId = useId();
  const unitText = typeof unit === "function" ? unit(value) : unit;
  const shown = format ? format(value) : value + (unitText ? " " + unitText : "");
  const delay=useRef<ReturnType<typeof setTimeout>|null>(null),repeat=useRef<ReturnType<typeof setInterval>|null>(null),repeated=useRef(false);
  const latest=useRef({value,onChange,min,max});latest.current={value,onChange,min,max};
  function stop(){if(delay.current)clearTimeout(delay.current);if(repeat.current)clearInterval(repeat.current);delay.current=null;repeat.current=null;}
  function step(direction:number){const state=latest.current,next=Math.max(state.min,Math.min(state.max,state.value+direction));if(next!==state.value)state.onChange(next);else stop();}
  function hold(direction:number){stop();repeated.current=false;delay.current=setTimeout(()=>{repeated.current=true;step(direction);repeat.current=setInterval(()=>step(direction),120);},400);}
  useEffect(()=>stop,[]);
  return (
    <div className="v7-stepper-field"><span id={labelId} className="v7-stepper-label">{label}</span>
    <div className="v7-stepper" role="group" aria-labelledby={labelId} onKeyDown={event=>{if(["ArrowUp","ArrowRight","ArrowDown","ArrowLeft","Home","End"].includes(event.key)){event.preventDefault();if(event.key==="Home")onChange(min);else if(event.key==="End")onChange(max);else step(event.key==="ArrowUp"||event.key==="ArrowRight"?1:-1);}}}>
      <IconButton
        label={`Decrease ${label}`}
        disabled={value <= min}
        onPointerDown={()=>hold(-1)} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop} onBlur={stop}
        onClick={()=>{if(!repeated.current)step(-1);repeated.current=false;}}
      >
        <Minus />
      </IconButton>
      <output aria-label={label+" value"} aria-live="polite" aria-atomic="true">{shown}</output>
      <IconButton
        label={`Increase ${label}`}
        disabled={value >= max}
        onPointerDown={()=>hold(1)} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop} onBlur={stop}
        onClick={()=>{if(!repeated.current)step(1);repeated.current=false;}}
      >
        <Plus />
      </IconButton>
    </div></div>
  );
}
export function Card({
  children,
  hero = false,
  subject = 1,
}: {
  children: ReactNode;
  hero?: boolean;
  subject?: number;
}) {
  return (
    <article
      className={`${hero ? "v7-hero" : "v7-card"} v7-subject-${subject}`}
    >
      {children}
    </article>
  );
}
export function ListRow({
  lead,
  title,
  meta,
  trailing,
}: {
  lead: ReactNode;
  title: string;
  meta: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="v7-list-row">
      <span className="v7-lead">{lead}</span>
      <div className="v7-grow">
        <p className="v7-label">{title}</p>
        <p className="v7-meta">{meta}</p>
      </div>
      {trailing ?? <ChevronRight aria-hidden="true" />}
    </div>
  );
}
export function Meter({
  label,
  value,
  max = 100,
  subject,
}: {
  label: string;
  value: number;
  max?: number;
  /** A subject's mastery takes its colour; anything else is drawn in the neutral data colour (KC3/KC4). */
  subject?: number;
}) {
  return (
    <div className={`v7-meter-row ${subject ? `v7-subject-${subject}` : "v7-meter-neutral"}`} data-complete={value >= max && max > 0}>
      <div className="v7-between">
        <span>{label}</span>
        <span className="v7-meta">
          {value} of {max}
        </span>
      </div>
      <div
        className="v7-meter"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-label={label}
        aria-valuetext={value >= max && max > 0 ? "Complete" : `${value} of ${max}`}
      >
        <span
          style={{
            width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`,
          }}
        />
      </div>
    </div>
  );
}
export function StatTile({
  label,
  value,
  change,
}: {
  label: string;
  value: string;
  change?: string;
}) {
  return (
    <div className="v7-stat">
      <p className="v7-meta">{label}</p>
      <p className="v7-figure-m">{value}</p>
      {change && <span className="v7-stat-change">{change}</span>}
    </div>
  );
}
export function Menu({
  label,
  items,
  defaultOpen = false,
}: {
  label: string;
  items: { label: string; icon: ReactNode; onClick: () => void }[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const ref = useRef<HTMLDivElement>(null), interacted = useRef(false);
  return <div className="v7-menu-anchor" ref={ref}>
    <Button aria-haspopup="menu" aria-expanded={open} onClick={()=>{interacted.current=true;setOpen(!open);}}
      onKeyDown={event=>{if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();interacted.current=true;setOpen(true);}}}>
      {label}<ChevronDown aria-hidden="true"/>
    </Button>
    <ChoiceSurface title={label} role="menu" anchor={()=>ref.current?.querySelector('button')??null}
      open={open} onClose={()=>setOpen(false)} autoFocus={interacted.current}>
      <div className="v7-menu-content" role="group" aria-label={label}>
        {items.map(item=><button type="button" role="menuitem" className={/delete|remove/i.test(item.label)?'v7-menu-danger':undefined}
          key={item.label} onClick={()=>handoffLayer(()=>{setOpen(false);item.onClick();})}>{item.icon}{item.label}</button>)}
      </div>
    </ChoiceSurface>
  </div>;
}
export function Toast({
  message,
  action,
  onAction,
  onClose,
  preview = false,
}: {
  message: string;
  action?: string;
  onAction?: () => void;
  onClose: () => void;
  preview?: boolean;
}) {
  const close = useRef(onClose);
  close.current = onClose;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remaining = useRef(action?.toLowerCase() === "undo" ? 8000 : 6000);
  const started = useRef(0);
  const paused=useRef({pointer:false,focus:false});
  function pause(reason:"pointer"|"focus") {
    paused.current[reason]=true;
    if (!timer.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    remaining.current = Math.max(0, remaining.current - (Date.now() - started.current));
  }
  function resume(reason?:"pointer"|"focus") {
    if(reason)paused.current[reason]=false;
    if (paused.current.pointer || paused.current.focus || preview || timer.current) return;
    started.current = Date.now();
    timer.current = setTimeout(() => close.current(), remaining.current);
  }
  useEffect(() => {
    remaining.current = action?.toLowerCase() === "undo" ? 8000 : 6000;
    resume();
    return () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  }, [message, action, preview]);
  const start = useRef(0);
  return (
    <div
      className={preview ? "v7-toast v7-toast-preview" : "v7-toast"}
      role={preview ? "group" : "status"}
      aria-label={preview ? "Toast example" : undefined}
      aria-live={preview ? undefined : "polite"}
      onMouseEnter={()=>pause("pointer")}
      onMouseLeave={()=>resume("pointer")}
      onFocusCapture={()=>pause("focus")}
      onBlurCapture={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) resume("focus"); }}
      onPointerDown={(e) => {
        start.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (Math.abs(e.clientX - start.current) > 80) onClose();
      }}
    >
      <span>{message}</span>
      {action && (
        <Button small variant="ghost" onClick={onAction}>
          {action}
        </Button>
      )}
      <IconButton label="Dismiss notification" onClick={onClose}>
        <X />
      </IconButton>
    </div>
  );
}
export function Banner({
  children,
  action,
  onAction,
  tone = "warning",
}: {
  children: ReactNode;
  action: string;
  onAction: () => void;
  tone?: "warning" | "critical" | "good";
}) {
  return (
    <aside className={`v7-feedback-banner v7-tone-${tone === "critical" ? "danger" : tone === "good" ? "success" : "warning"}`}>
      {tone === "warning" ? <TriangleAlert aria-hidden="true" /> :
        tone === "critical" ? <CircleX aria-hidden="true" /> :
        <CircleCheck aria-hidden="true" />}
      <p>{children}</p>
      <Button small variant="ghost" onClick={onAction}>
        {action}
      </Button>
    </aside>
  );
}
export function Skeleton({surface="section"}: {surface?: "sheet" | "section"} = {}) {
  return (
    <div className="v7-skeleton" data-loading-surface={surface} onAnimationStart={event=>{if(event.target===event.currentTarget)event.currentTarget.dataset.shownAt=String(performance.now());}} role="status" aria-label="Loading content">
      <span />
      <span />
      <span />
    </div>
  );
}
export function EmptyState({
  children,
  action,
  onAction,
}: {
  children: ReactNode;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="v7-empty-emblem">
      <SubjectMark subject="Analysis" size="hero"/>
      <p>{children}</p>
      <Button onClick={onAction}>{action}</Button>
    </div>
  );
}

