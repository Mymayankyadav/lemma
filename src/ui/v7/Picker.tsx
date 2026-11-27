import {useId, useRef, useState} from 'react';
import {Check, ChevronDown} from 'lucide-react';
import {ChoiceSurface, useWideSurface} from './ChoiceSurface';

export function Picker({label,value,options,onChange,disabled=false,disabledReason,optional=false,containFocus=false}: {
  label:string; value:string; options:string[]; onChange:(v:string)=>void; disabled?:boolean;
  disabledReason?:string; optional?:boolean; containFocus?:boolean;
}) {
  const [open,setOpen] = useState(false), [query,setQuery] = useState('');
  const trigger = useRef<HTMLButtonElement>(null), id = useId(), wide = useWideSurface();
  const searchable = options.length > 8;
  const shown = searchable && query.trim() ? options.filter(option=>option.toLowerCase().includes(query.trim().toLowerCase())) : options;
  function close() { setOpen(false); setQuery(''); }
  function choose(option:string) { onChange(option); close(); }
  return <div className="v7-field-group v7-menu-anchor">
    <span>{label}{optional && <span className="v7-field-optional"> · Optional</span>}</span>
    <button type="button" ref={trigger} disabled={disabled||!!disabledReason} title={disabledReason} aria-label={label+': '+value}
      aria-haspopup={wide ? 'listbox':'dialog'} aria-expanded={open} className="v7-field v7-picker"
      onClick={()=>open ? close() : setOpen(true)} onKeyDown={event=>{
        if (['ArrowUp','ArrowDown'].includes(event.key)) {event.preventDefault(); setOpen(true);}
      }}>{value}<ChevronDown aria-hidden="true"/></button>
    {disabledReason && <p className="v7-disabled-reason">{disabledReason}</p>}
    <ChoiceSurface open={open} anchor={()=>trigger.current} title={label} role="listbox" onClose={close} containFocus={containFocus}>
      {searchable && <input type="search" className="v7-field v7-picker-search" placeholder={'Search '+label.toLowerCase()}
        aria-label={'Search '+label.toLowerCase()} value={query} onChange={event=>setQuery(event.target.value)}/>}
      {!shown.length && <p className="v7-meta">No matches.</p>}
      {wide ? shown.map(option=><button type="button" role="option" aria-selected={value===option} key={option}
        onClick={()=>choose(option)}><Check aria-hidden="true" className={value===option?'':'v7-hidden-label'}/>{option}</button>)
        : <div role="radiogroup" aria-label={label}>{shown.map(option=><label className="v7-radio-row" key={option}>
          <input type="radio" name={id} data-v7-autofocus={value===option?'true':undefined} checked={value===option} onChange={()=>choose(option)} onClick={()=>{if(value===option) close();}}/>{option}
        </label>)}</div>}
    </ChoiceSurface>
  </div>;
}
