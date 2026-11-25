import {useId, useState, type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';

export function Disclosure({label, children, defaultOpen = false,open:controlled,onOpen,mountWhenOpen=false}: {
  label: ReactNode; children: ReactNode; defaultOpen?: boolean; open?:boolean;onOpen?:(open:boolean)=>void;mountWhenOpen?:boolean;
}) {
  const [uncontrolled, setOpen] = useState(defaultOpen);
  const open=controlled??uncontrolled;
  const id = useId();
  return <div className="v7-disclosure">
    <button type="button" className="v7-disclosure-trigger" aria-expanded={open} aria-controls={id}
      onClick={() => {setOpen(!open);onOpen?.(!open);}}>
      <span>{label}</span><ChevronDown size={16} aria-hidden="true"/>
    </button>
    <div id={id} hidden={!open}>{(open||!mountWhenOpen)&&children}</div>
  </div>;
}
