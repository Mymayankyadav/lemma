import { formatDay } from "../../lib/format";
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
      className={`v7-button v7-${variant} ${small ? "v7-small" : ""} ${destructive ? "v7-critical" : ""} ${className}`}
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
  const content = (
    <>
      {kind === "subject" && (
        <span className={`v7-dot v7-subject-${subject}`} aria-hidden="true" />
      )}
      {kind === "status" && <Check aria-hidden="true" />}
      {kind === "ready" && <CircleDot aria-hidden="true" />}
      {kind === "mastery" && <span className="v7-proof" aria-hidden="true">∎</span>}
      {children}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className="v7-chip v7-filter"
      aria-pressed={!!selected}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <span
      className={`v7-chip v7-chip-${kind} ${kind === "subject" ? `v7-subject-${subject}` : ""}`}
    >
      {content}
    </span>
  );
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
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div
      className={tabs ? "v7-tabs" : "v7-segmented"}
      role="tablist"
      aria-label={label}
    >
      {options.map((option, index) => (
        <button
          key={option}
          ref={(el) => {
            refs.current[index] = el;
          }}
          type="button"
          disabled={disabled}
          role="tab"
          aria-controls={panelId}
          aria-selected={option === value}
          tabIndex={option === value ? 0 : -1}
          onClick={() => onChange(option)}
          onKeyDown={(e) => {
            let i = index;
            if (e.key === "ArrowRight") i = (index + 1) % options.length;
            else if (e.key === "ArrowLeft")
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
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const auto = useId(),
    fieldId = id ?? auto;
  return (
    <div className="v7-field-group">
      <label htmlFor={fieldId}>{label}</label>
      <input
        {...props}
        id={fieldId}
        className={`v7-field ${className}`}
        data-v7-autofocus={props.autoFocus || undefined}
        aria-invalid={!!error}
        aria-describedby={
          error ? `${fieldId}-error` : props.readOnly ? `${fieldId}-readonly` : props["aria-describedby"]
        }
      />
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
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: ReactNode;
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
      className="v7-sheet"
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
          <h2 id={id} className="v7-headline">
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
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
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
  function choose(option: string) {
    onChange(option);
    setOpen(false);
    ref.current?.querySelector("button")?.focus();
  }
  return (
    <div className="v7-field-group v7-menu-anchor" ref={ref}>
      <span id={id}>{label}</span>
      <button
        disabled={disabled}
        aria-label={`${label}: ${value}`}
        aria-haspopup={desktop ? "listbox" : "dialog"}
        aria-expanded={open}
        className="v7-field v7-picker"
        onClick={() => setOpen(!open)}
      >
        {value}
        <ChevronDown aria-hidden="true" />
      </button>
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
          {options.map((option) => (
            <button
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
          <div role="radiogroup" aria-label={label}>
            {options.map((option) => (
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
        className="v7-field v7-picker"
        aria-label={`${label}: ${value}`}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {formatDay(value)}
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
            type="time"
            step={300}
            value={value}
            onChange={(e) =>
              editing === "start"
                ? onChange(e.target.value, end)
                : onChange(start, e.target.value)
            }
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
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  mixed?: boolean;
}) {
  return (
    <label className="v7-check-label">
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
    <label className="v7-switch-label">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
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
    <div className="v7-field-group">
      <label htmlFor={id}>
        {label}{" "}
        <output className="v7-value" htmlFor={id}>
          {value}
        </output>
      </label>
      <input
        id={id}
        className="v7-slider"
        style={{ "--v7-range-progress": `${progress}%` } as CSSProperties}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
      />
    </div>
  );
}
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 10,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const delay=useRef<ReturnType<typeof setTimeout>|null>(null),repeat=useRef<ReturnType<typeof setInterval>|null>(null),repeated=useRef(false);
  const latest=useRef({value,onChange,min,max});latest.current={value,onChange,min,max};
  function stop(){if(delay.current)clearTimeout(delay.current);if(repeat.current)clearInterval(repeat.current);delay.current=null;repeat.current=null;}
  function step(direction:number){const state=latest.current,next=Math.max(state.min,Math.min(state.max,state.value+direction));if(next!==state.value)state.onChange(next);else stop();}
  function hold(direction:number){stop();repeated.current=false;delay.current=setTimeout(()=>{repeated.current=true;step(direction);repeat.current=setInterval(()=>step(direction),120);},400);}
  useEffect(()=>stop,[]);
  return (
    <div className="v7-stepper" role="group" aria-label={label}>
      <IconButton
        label={`Decrease ${label}`}
        disabled={value <= min}
        onPointerDown={()=>hold(-1)} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop} onBlur={stop}
        onClick={()=>{if(!repeated.current)step(-1);repeated.current=false;}}
      >
        <Minus />
      </IconButton>
      <output aria-live="polite">{value}</output>
      <IconButton
        label={`Increase ${label}`}
        disabled={value >= max}
        onPointerDown={()=>hold(1)} onPointerUp={stop} onPointerCancel={stop} onPointerLeave={stop} onBlur={stop}
        onClick={()=>{if(!repeated.current)step(1);repeated.current=false;}}
      >
        <Plus />
      </IconButton>
    </div>
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
  subject = 1,
}: {
  label: string;
  value: number;
  max?: number;
  subject?: number;
}) {
  return (
    <div className={`v7-meter-row v7-subject-${subject}`} data-complete={value >= max && max > 0}>
      <div className="v7-between">
        <span>{label}</span>
        <span className="v7-meta">
          {value} / {max}
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
    <aside className={`v7-banner v7-${tone}`}>
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
    <div className="v7-empty">
      <svg className="v7-empty-art" viewBox="0 0 120 120" aria-hidden="true">
        <path d="M20 90h80M30 80V35h60v45M40 25h40M45 45h30M45 55h20M45 65h25" />
      </svg>
      <p>{children}</p>
      <Button onClick={onAction}>{action}</Button>
    </div>
  );
}

