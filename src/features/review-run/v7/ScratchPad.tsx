import {useEffect,useState} from 'react';
import {InkCanvas} from '../../../ui/v7/ink/InkCanvas';
import {clearPadInk,initializePadInk,undoPadInk} from '../../../ui/v7/ink/ink';

export function ScratchPad({cardKey}: {cardKey: string}) {
  const [open,setOpen] = useState(false), [typed,setTyped] = useState('');
  const [ink,setInk] = useState(()=>initializePadInk()!);
  useEffect(()=>{setInk(initializePadInk()!);setTyped('');},[cardKey]);
  if (!open) return <button type="button" className="v7-scratch-open" onClick={()=>setOpen(true)}>Scratch paper</button>;
  return <section className="v7-scratch" aria-label="Scratch paper">
    <InkCanvas history={ink} onChange={setInk} className="v7-scratch-sheet"
      label={ink.strokes.length?'Your working, drawn':'Graph paper: draw with a finger or stylus'}/>
    <label className="v7-sr-only" htmlFor={'v7-scratch-'+cardKey}>Type an attempt</label>
    <textarea id={'v7-scratch-'+cardKey} className="v7-field v7-scratch-typed" placeholder="Or type an attempt…"
      value={typed} onChange={event=>setTyped(event.target.value)}/>
    <div className="v7-scratch-actions">
      <button type="button" className="v7-scratch-link" onClick={()=>{setInk(clearPadInk(ink));setTyped('');}}>Clear</button>
      {ink.undo.length>0&&<button type="button" className="v7-scratch-link" onClick={()=>setInk(undoPadInk(ink))}>Undo</button>}
      <button type="button" className="v7-scratch-link" onClick={()=>setOpen(false)}>Put away</button>
      <span className="v7-meta">Not saved</span>
    </div>
  </section>;
}
