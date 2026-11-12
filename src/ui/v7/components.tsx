import { formatDay, formatShortDate } from "../../lib/format";
/** "Today · Mon 9 Nov" or "Sat 7 Nov". */
export function pickerDate(value: string): string {
  const word = formatDay(value);
  return ["Today", "Tomorrow", "Yesterday"].includes(word) ? word + " · " + formatShortDate(value) : formatShortDate(value);
}
import {
  useEffect,
  useId,
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
  ChevronLeft,
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
import "./components.css";
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
  const content=<>{kind==="subject"&&<SubjectMark subject={name}/>} {kind==="status"&&<CircleCheck aria-hidden="true"/>}{kind==="ready"&&<CircleDot aria-hidden="true"/>}{kind==="mastery"&&<span className="v7-proof" aria-hidden="true">∎</span>}{onClick&&selected&&<Check aria-hidden="true"/>}{children}</>;
  return onClick?<button type="button" className="v7-filter-chip" aria-pressed={!!selected} onClick={onClick}>{content}</button>:
   <span className={kind==="subject"?"v7-tag "+subjectClass(name):"v7-badge "+(kind==="gold"?"v7-tone-warning":kind==="mastery"||kind==="status"?"v7-tone-success":"v7-tone-info")}>{content}</span>;
}

export function Segmented({
  label,
  options,
  value,
  onChange,
  tabs = false,
  disabled = false,
  panelId,
}: {
  label: string;
  options: string[];
  value: string;
  onChange: (value: string) => void;
  tabs?: boolean;
  disabled?: boolean;
  panelId?: string;
}) {
  const tabSemantics=tabs&&!!panelId;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div
      className={tabs ? "v7-tabs" : "v7-segmented"}
      role={tabSemantics ? "tablist" : "radiogroup"}
      aria-label={label}
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
export function Sheet({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  full = false,
  hideTitle = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Full height on phones (Search, §6.1 G). */
  full?: boolean;
  /** The body's first field is the header (SE3); the title stays for assistive technology. */
  hideTitle?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId(),
    close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    const trigger = document.activeElement as HTMLElement | null;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-v7-autofocus="true"]')?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previous;
      trigger?.focus();
    };
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`v7-sheet${full ? " v7-sheet-full" : ""}`}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const box = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom
          )
            close.current();
        }
      }}
    >
      <div className="v7-grabber" />
      <header className="v7-sheet-header">
        <div>
          {eyebrow && <p className="v7-eyebrow">{eyebrow}</p>}
          <h2 id={id} className={hideTitle ? "v7-sr-only" : "v7-headline"}>
            {title}
          </h2>
        </div>
        <IconButton label="Close" onClick={onClose}>
          <X />
        </IconButton>
      </header>
      <div className="v7-sheet-body">{children}</div>
      {footer && <footer className="v7-sheet-footer">{footer}</footer>}
    </dialog>
  );
}
export function Picker({
  label,
  value,
  options,
  onChange,
  disabled = false,
  disabledReason,
  optional = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  disabledReason?: string;
  optional?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [desktop, setDesktop] = useState(false),
    id = useId(),
    ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = matchMedia("(min-width:700px)");
    const update = () => {
      setDesktop(media.matches);
      setOpen(false);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open || !desktop) return;
    ref.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
    const outside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, [open, desktop]);
  // R2 · F76: beyond 8 options a picker gains a search field and a filtered list, so long lists stay usable.
  const searchable = options.length > 8;
  const shown = searchable && query.trim() ? options.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase())) : options;
  const search = searchable ? (
    <input type="search" className="v7-field v7-picker-search" placeholder={"Search " + label.toLowerCase()} aria-label={"Search " + label.toLowerCase()}
      value={query} onChange={(e) => setQuery(e.target.value)} />
  ) : null;
  function choose(option: string) {
    onChange(option);
    setQuery("");
    setOpen(false);
    ref.current?.querySelector("button")?.focus();
  }
  return (
    <div className="v7-field-group v7-menu-anchor" ref={ref}>
      <span id={id}>{label}{optional && <span className="v7-field-optional"> · Optional</span>}</span>
      <button
        type="button"
        disabled={disabled || !!disabledReason}
        title={disabledReason}
        aria-label={`${label}: ${value}`}
        aria-haspopup={desktop ? "listbox" : "dialog"}
        aria-expanded={open}
        className="v7-field v7-picker"
        onClick={() => setOpen(!open)}
      >
        {value}
        <ChevronDown aria-hidden="true" />
      </button>
      {disabledReason && <p className="v7-disabled-reason">{disabledReason}</p>}
      {desktop && open ? (
        <div
          className="v7-menu"
          role="listbox"
          aria-label={label}
          onKeyDown={(e) => {
            const buttons = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
              ),
              index = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
            if (e.key === "Escape") {
              setOpen(false);
              ref.current?.querySelector("button")?.focus();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              buttons[
                (index + (e.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                  buttons.length
              ].focus();
            }
          }}
        >
          {search}
          {shown.map((option) => (
            <button
        type="button"
              role="option"
              aria-selected={value === option}
              key={option}
              onClick={() => choose(option)}
            >
              <Check
                aria-hidden="true"
                className={value === option ? "" : "v7-hidden-label"}
              />
              {option}
            </button>
          ))}
        </div>
      ) : (
        <Sheet
          open={open && !desktop}
          onClose={() => setOpen(false)}
          title={label}
        >
          {search}
          <div role="radiogroup" aria-label={label}>
            {shown.length === 0 && <p className="v7-meta">No matches.</p>}
            {shown.map((option) => (
              <label className="v7-radio-row" key={option}>
                <input
                  type="radio"
                  name={id}
                  checked={value === option}
                  onChange={() => choose(option)}
                />
                {option}
              </label>
            ))}
          </div>
        </Sheet>
      )}
    </div>
  );
}

function dateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function DatePicker({
  value,
  onChange,
  label = "Date",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false),
    [month, setMonth] = useState(() => new Date(value + "T12:00:00"));
  const selected = new Date(value + "T12:00:00");
  const first = new Date(month.getFullYear(), month.getMonth(), 1),
    count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  function pick(date: Date) {
    onChange(dateString(date));
    setOpen(false);
  }
  function shortcut(offset: number) {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    pick(date);
  }
  return (
    <div className="v7-field-group">
      <span>{label}</span>
      <button
        type="button"
        className="v7-field v7-picker"
        aria-label={`${label}: ${value}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {/* F51: one date format ("Sat 7 Nov"), with Today/Tomorrow/Yesterday in front when it applies. */}
        {pickerDate(value)}
        <ChevronDown />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Choose a date">
        <div className="v7-wrap">
          <Button small onClick={() => shortcut(0)}>
            Today
          </Button>
          <Button small onClick={() => shortcut(1)}>
            Tomorrow
          </Button>
          <Button
            small
            onClick={() => shortcut((8 - new Date().getDay()) % 7 || 7)}
          >
            Next Monday
          </Button>
        </div>
        <div className="v7-calendar-heading">
          <IconButton
            label="Previous month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            <ChevronLeft />
          </IconButton>
          <h3 aria-live="polite">
            {month.toLocaleDateString(undefined, {
              month: "long",
              year: "numeric",
            })}
          </h3>
          <IconButton
            label="Next month"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            <ChevronRight />
          </IconButton>
        </div>
        <div className="v7-calendar" role="group" aria-label="Days of month">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
            <span className="v7-caption" key={d}>
              {d}
            </span>
          ))}
          {Array.from({ length: first.getDay() }, (_, i) => (
            <span key={`empty-${i}`} />
          ))}
          {Array.from({ length: count }, (_, i) => {
            const date = new Date(month.getFullYear(), month.getMonth(), i + 1);
            return (
              <button
        type="button"
                key={i}
                autoFocus={dateString(date) === dateString(selected)}
                aria-label={date.toLocaleDateString(undefined, {
                  dateStyle: "full",
                })}
                aria-pressed={dateString(date) === value}
                onClick={() => pick(date)}
                onKeyDown={(e) => {
                  const offset = (
                    {
                      ArrowRight: 1,
                      ArrowLeft: -1,
                      ArrowDown: 7,
                      ArrowUp: -7,
                    } as Record<string, number>
                  )[e.key];
                  if (offset) {
                    e.preventDefault();
                    const next = new Date(date);
                    next.setDate(next.getDate() + offset);
                    if (next.getMonth() === month.getMonth())
                      (
                        e.currentTarget.parentElement?.querySelectorAll(
                          "button",
                        )[next.getDate() - 1] as HTMLElement
                      )?.focus();
                    else
                      setMonth(
                        new Date(next.getFullYear(), next.getMonth(), 1),
                      );
                  }
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      </Sheet>
    </div>
  );
}
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
  label: string;
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
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
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
  const [open, setOpen] = useState(defaultOpen),
    [desktop, setDesktop] = useState(true),
    interacted = useRef(false),
    ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = matchMedia("(min-width:700px)");
    const update = () => setDesktop(media.matches);
    update();media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!open) return;
    if (interacted.current) ref.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    function outside(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", outside);
    return () => document.removeEventListener("click", outside);
  }, [open]);
  const menu = <div className={desktop ? "v7-menu" : "v7-menu-content"} role="menu" aria-label={label}
    onKeyDown={event => {
      const buttons=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("button"));
      const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      if(event.key==="Escape"){event.preventDefault();setOpen(false);ref.current?.querySelector("button")?.focus();}
      else if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){
        event.preventDefault();const next=event.key==="Home"?0:event.key==="End"?buttons.length-1:(index+(event.key==="ArrowDown"?1:buttons.length-1))%buttons.length;buttons[next]?.focus();
      }else if(event.key.length===1&&/[a-z0-9]/i.test(event.key)){event.preventDefault();buttons.find(button=>button.textContent?.trim().toLowerCase().startsWith(event.key.toLowerCase()))?.focus();}
    }}>
    {items.map(item=><button type="button" role="menuitem" className={/delete|remove/i.test(item.label)?"v7-menu-danger":undefined} key={item.label} onClick={()=>{setOpen(false);ref.current?.querySelector("button")?.focus();item.onClick();}}>{item.icon}{item.label}</button>)}
  </div>;
  return (
    <div className="v7-menu-anchor" ref={ref}>
      <Button
        aria-haspopup="menu"
        aria-expanded={open}
        onKeyDown={event=>{if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();interacted.current=true;setOpen(true);}}}
        onClick={() => {
          interacted.current = true;
          setOpen(!open);
        }}
      >
        {label}<ChevronDown aria-hidden="true" />
      </Button>
      {open && (desktop ? menu : <Sheet open={open} onClose={()=>setOpen(false)} title={label}>{menu}</Sheet>)}
    </div>
  );
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
export function Skeleton() {
  return (
    <div className="v7-skeleton" role="status" aria-label="Loading content">
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

