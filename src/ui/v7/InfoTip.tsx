import {useEffect, useId, useRef, useState, type ReactNode} from 'react';
import {Info} from 'lucide-react';

/**
 * N220: an explanation on demand. A small (i) beside a label opens a short note; tapping elsewhere or Escape closes it.
 * Screens use it instead of a paragraph under every control, so the text is there when the context is not obvious.
 */
export function InfoTip({label, children, align = 'start'}: {label: string; children: ReactNode; align?: 'start' | 'end'}) {
  const [open, setOpen] = useState(false), id = useId(), root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {if (!root.current?.contains(event.target as Node)) setOpen(false);};
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      root.current?.querySelector('button')?.focus();
    };
    document.addEventListener('pointerdown', outside, true);
    root.current?.addEventListener('keydown', escape);
    const node = root.current;
    return () => {document.removeEventListener('pointerdown', outside, true); node?.removeEventListener('keydown', escape);};
  }, [open]);
  return <span className="v7-info" ref={root} data-align={align}>
    <button type="button" className="v7-info-button" aria-label={'About ' + label} aria-expanded={open} aria-controls={id}
      onClick={event => {event.preventDefault(); event.stopPropagation(); setOpen(value => !value);}}>
      <Info aria-hidden="true"/>
    </button>
    <span id={id} role="note" className="v7-info-tip" hidden={!open}>{children}</span>
  </span>;
}
