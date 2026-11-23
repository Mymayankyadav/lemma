import {Check} from 'lucide-react';
import {createContext, useContext, useEffect, useRef, type ReactNode} from 'react';
import {tutorMessageKey, type TutorMessageRef} from '../../data/tutor/manual-api';

export type TutorSelectedMessage = {message: TutorMessageRef; text: string};
export const TutorSelection = createContext<{
  selected: ReadonlyMap<string, TutorSelectedMessage>;
  select: (entry: TutorSelectedMessage, toggle?: boolean) => void;
} | null>(null);

export function TutorChatMessage({message, text, children, latest}: TutorSelectedMessage & {children: ReactNode; latest?: boolean}) {
  const selection = useContext(TutorSelection);
  const key = tutorMessageKey(message), active = Boolean(selection?.selected.size);
  const checked = selection?.selected.has(key);
  const press = useRef<{x: number; y: number; pointer: number; timer: number} | undefined>(undefined);
  const suppressClick = useRef(false);
  function endPress() {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = undefined;
  }
  useEffect(() => endPress, []);
  function pick(toggle = false) {
    selection?.select({message, text}, toggle);
  }
  const kind = message.kind === 'reply' ? 'Tutor reply' : 'Your message';
  return <div className={'msg ' + (message.kind === 'reply' ? 'a' : 'u')} data-tutor-message={key}
    data-latest-reply={latest || undefined} data-followup={message.kind === 'followup' ? '' : undefined}
    data-selected={checked || undefined} tabIndex={selection ? 0 : undefined}
    role={active ? 'checkbox' : undefined} aria-checked={active ? checked : undefined}
    aria-label={active ? kind + ': ' + text.slice(0, 120) : undefined}
    onPointerDown={event => {
      suppressClick.current = false;
      if (!selection || active || event.button !== 0 || !event.isPrimary) return;
      endPress();
      const {clientX: x, clientY: y, pointerId: pointer} = event;
      const timer = window.setTimeout(() => {
        suppressClick.current = true;
        document.getSelection()?.removeAllRanges();
        pick();
        endPress();
      }, 480);
      press.current = {x, y, pointer, timer};
    }}
    onPointerMove={event => {
      const start = press.current;
      if (start?.pointer === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) endPress();
    }}
    onPointerUp={endPress} onPointerCancel={endPress} onPointerLeave={endPress}
    onContextMenu={event => {
      if (!selection || (!active && (event.target as Element).closest('a'))) return;
      event.preventDefault();
      endPress();
      pick();
    }}
    onClickCapture={event => {
      if (!active && !suppressClick.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (!suppressClick.current) pick(true);
      suppressClick.current = false;
    }}
    onKeyDown={event => {
      if (event.target !== event.currentTarget || (event.key !== ' ' && event.key !== 'Enter')) return;
      event.preventDefault();
      pick(true);
    }}>
    {active && <span className="tutor-message-check" aria-hidden="true">{checked && <Check size={14}/>}</span>}
    <div className="bd" inert={active}>{children}</div>
  </div>;
}
