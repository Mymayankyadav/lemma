import {useEffect,useId,useRef,useSyncExternalStore,useState} from 'react';
import {Sheet} from '../../ui/v7/components';
import {ChevronDown,Eraser,Pencil} from 'lucide-react';
import {isIPadBrowser} from '../../platform/ipad';

const PENCIL_KEY='lemma.tutor.pencil-only';
const ERASER_KEY='lemma.tutor.eraser-kind';
const listeners=new Set<()=>void>();
const fallback=new Map<string,string>();
function subscribe(listener:()=>void) {
  listeners.add(listener);
  window.addEventListener('storage',listener);
  return ()=>{listeners.delete(listener);window.removeEventListener('storage',listener);};
}
function read(key:string) {
  if(fallback.has(key))return fallback.get(key);
  try {return window.localStorage.getItem(key)??undefined;}
  catch {return fallback.get(key);}
}
function write(key:string,value:string) {
  try {window.localStorage.setItem(key,value);fallback.delete(key);}
  catch {fallback.set(key,value);}
  for (const listener of listeners) listener();
}

export {isIPadBrowser};

export function usePaperInput() {
  const isIPad=typeof navigator!=='undefined' && isIPadBrowser(navigator);
  const enabled=useSyncExternalStore(subscribe,()=>read(PENCIL_KEY)!=='off',()=>true);
  const eraserKind=useSyncExternalStore<'stroke'|'pixel'>(subscribe,()=>read(ERASER_KEY)==='pixel'?'pixel':'stroke',()=> 'stroke');
  return {isIPad,enabled,eraserKind,
    toggle:()=>write(PENCIL_KEY,enabled?'off':'on'),
    setEraserKind:(kind:'stroke'|'pixel')=>write(ERASER_KEY,kind)};
}

export function PencilOnlyControl({enabled,onToggle}:{enabled:boolean;onToggle:()=>void}) {
  return <button type="button" className="tutor-paper-input-button" aria-label="Apple Pencil only" aria-pressed={enabled}
    title={enabled?'Apple Pencil only (tap to allow finger drawing)':'Finger drawing allowed (tap for Apple Pencil only)'}
    onClick={onToggle}><Pencil aria-hidden="true"/><span>Pencil only</span></button>;
}

export function PaperEraserControl({kind,active,disabled,onSelect,onKind}:{
  kind:'stroke'|'pixel';active:boolean;disabled:boolean;onSelect:()=>void;onKind:(kind:'stroke'|'pixel')=>void;
}) {
  const id=useId(), ref=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false);
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const held=useRef(false);
  const cancel=()=>clearTimeout(timer.current);
  useEffect(()=>()=>clearTimeout(timer.current),[]);
  return <div className="tutor-paper-eraser" ref={ref}>
    <button type="button" className="tutor-paper-input-button" aria-label="Eraser" aria-pressed={active}
      title="Eraser (hold to choose type)" disabled={disabled}
      onContextMenu={event=>{event.preventDefault();cancel();held.current=true;setOpen(true);}}
      onPointerDown={event=>{
        if(event.button!==0)return;
        held.current=false;
        cancel();
        timer.current=setTimeout(()=>{held.current=true;setOpen(true);},450);
      }}
      onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
      onClick={event=>{if(event.detail===0||!held.current){onSelect();setOpen(false);}held.current=false;}}>
      <Eraser aria-hidden="true"/>
    </button>
    <button type="button" className="tutor-paper-input-button tutor-paper-eraser-more" aria-label="Eraser type" title="Eraser type"
      aria-expanded={open} aria-controls={id} disabled={disabled} onClick={()=>setOpen(value=>!value)}><ChevronDown aria-hidden="true"/></button>
    <Sheet open={open} onClose={()=>setOpen(false)} title="Eraser types" containFocus>
    <div id={id} className="tutor-paper-eraser-choices" role="group" aria-label="Eraser choices">
      {(['stroke','pixel'] as const).map(option=><button key={option} type="button" aria-pressed={kind===option}
        onClick={()=>{onKind(option);onSelect();setOpen(false);ref.current?.querySelector<HTMLButtonElement>('[aria-expanded]')?.focus();}}>
        {option==='stroke'?'Whole stroke':'Pixel eraser'}
      </button>)}
    </div>
    </Sheet>
  </div>;
}
