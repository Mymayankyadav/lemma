import {useEffect, useId, useState} from 'react';
import {Clock} from 'lucide-react';

/** "930", "0930", "9:30" or "09.30" as "09:30"; null when it is not a time of day. */
export function parseClock(text: string): string | null {
  const match = /^(\d{1,2})[:.]?(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hours = Number(match[1]), minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? String(hours).padStart(2, '0') + ':' + match[2] : null;
}

/**
 * N220: a 24-hour time typed as digits, the way a phone's clock app takes it (the kit's own field, not a native time
 * input, B7). Four digits apply at once; anything else applies when the field is left, and an invalid entry returns
 * to the last good time.
 */
export function TimeField({label, value, onChange, disabled = false}: {
  label: string; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId(), [draft, setDraft] = useState(value), [editing, setEditing] = useState(false);
  useEffect(() => {if (!editing) setDraft(value);}, [value, editing]);
  const valid = parseClock(draft) !== null;
  return <div className="v7-time-field">
    <label htmlFor={id}>{label}</label>
    <span className="v7-time-input" data-invalid={!valid || undefined}>
      <input id={id} type="text" inputMode="numeric" autoComplete="off" enterKeyHint="done" maxLength={5} placeholder="HH:MM"
        value={draft} disabled={disabled} aria-invalid={!valid || undefined}
        onFocus={event => {setEditing(true); event.currentTarget.select();}}
        onChange={event => {
          const next = event.target.value.replace(/[^\d:.]/g, '');
          setDraft(next);
          const time = parseClock(next);
          if (time && next.replace(/\D/g, '').length === 4) onChange(time);
        }}
        onBlur={() => {
          setEditing(false);
          const time = parseClock(draft);
          if (time) {setDraft(time); if (time !== value) onChange(time);}
          else setDraft(value);
        }}
        onKeyDown={event => {if (event.key === 'Enter') {event.preventDefault(); event.currentTarget.blur();}}}/>
      <Clock aria-hidden="true"/>
    </span>
  </div>;
}
