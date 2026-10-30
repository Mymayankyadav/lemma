import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Palette} from 'lucide-react';
import {Sheet} from './Sheet';
import {themes} from '../styles/themes';
import {applyAppearance,labEnabled,readAppearance,setLabEnabled,type Appearance,type Density,type Effects} from '../styles/appearance';

function useUi() {
 const [ui,setUi]=useState<Appearance>(readAppearance);
 const [enabled,setEnabled]=useState(labEnabled);
 useEffect(()=>{
  const refresh=()=>{setUi(readAppearance());setEnabled(labEnabled());};
  window.addEventListener('lemma-ui-change',refresh);
  return()=>window.removeEventListener('lemma-ui-change',refresh);
 },[]);
 return {ui,enabled};
}
export function AppearanceControls() {
 const {ui,enabled}=useUi();
 return <section aria-label="Appearance" className="space-y-4">
  <div className="flex items-center justify-between gap-3">
   <h2 className="font-semibold text-title-s">Appearance</h2>
   <span className="text-caption text-ink-3">Stored on this device</span>
  </div>
  <div role="radiogroup" aria-label="Colour theme" className="grid grid-cols-2 gap-2">
   <button type="button" role="radio" aria-checked={ui.theme==='system'} onClick={()=>applyAppearance({theme:'system'})} className={`min-h-11 rounded-ctl border px-3 text-left text-label ${ui.theme==='system'?'border-amber':'border-edge'}`}>Day and night · Automatic</button>
   {themes.map(t=><button key={t.id} type="button" role="radio" aria-checked={ui.theme===t.id}
    onClick={()=>applyAppearance({theme:t.id})}
    className={`min-h-28 rounded-ctl border p-2 text-left transition-colors focus-visible:outline-amber ${ui.theme===t.id?'border-amber-line-2 ring-2 ring-amber-line':'border-edge'}`}>
    <div aria-hidden="true" className="flex items-center gap-1 pb-2">
     {[t.c.bg,t.c.accent,t.c.ink].map((color,i)=><span key={i} className="size-3 rounded-full border border-edge" style={{backgroundColor:color}}/>)}
    </div>
    <div aria-hidden="true" className="mb-2 flex h-10 items-center gap-1 rounded-lg p-1.5" style={{background:t.c.bg}}>
     <div className="h-5 w-1 rounded-full" style={{background:t.c.accent}}/>
     <div className="flex-1 rounded p-1" style={{background:t.c.surface}}>
      <div className="mb-1 h-1 w-4/5 rounded" style={{background:t.c.ink}}/>
      <div className="h-1 w-1/2 rounded" style={{background:t.c.ink3}}/>
     </div>
    </div>
    <span className="block text-caption font-semibold leading-tight">{t.name}</span>
   </button>)}
  </div>
  <fieldset>
   <legend className="mb-2 text-label font-semibold text-ink-soft">Density</legend>
   <div className="grid grid-cols-3 gap-1 rounded-ctl bg-well p-1" role="radiogroup" aria-label="Density">
    {(['compact','cozy','comfortable'] as Density[]).map(d=><button key={d} role="radio" aria-checked={ui.density===d} type="button" onClick={()=>applyAppearance({density:d})}
      className={`min-h-11 rounded-ctl px-1 text-caption font-semibold ${ui.density===d?'bg-raised-2 text-ink':'text-ink-2'}`}>{d[0].toUpperCase()+d.slice(1)}</button>)}
   </div>
  </fieldset>
  <div className="flex items-center justify-between gap-3">
   <div><p className="font-semibold">Effects</p><p className="text-label text-ink-3">Calm or lively motion</p></div>
   <button type="button" role="switch" aria-label="Lively motion" aria-checked={ui.effects==='rich'} onClick={()=>applyAppearance({effects:ui.effects==='rich'?'calm':'rich'})}
    className={`min-h-11 min-w-24 rounded-ctl border px-3 text-label font-semibold ${ui.effects==='rich'?'border-amber-line-2 bg-amber-tint':'border-edge bg-raised-2'}`}>
    {ui.effects==='rich'?'Lively':'Calm'}</button>
  </div>
  <div className="flex items-center justify-between gap-3">
   <div><p className="font-semibold">Floating theme lab</p><p className="text-label text-ink-3">Quickly compare the current screen</p></div>
   <button type="button" role="switch" aria-label="Show floating theme lab" aria-checked={enabled} onClick={()=>setLabEnabled(!enabled)}
    className={`min-h-11 min-w-16 rounded-ctl border px-3 text-label font-semibold ${enabled?'border-amber-line-2':'border-edge bg-raised-2'}`}>
    {enabled?'On':'Off'}</button>
  </div>
 </section>;
}
export function ThemeLabButton() {
 const {ui,enabled}=useUi();
 const [open,setOpen]=useState(false);
 const start=useRef<number|null>(null);
 const cycle=(direction:number)=>{
  const i=Math.max(0,themes.findIndex(t=>t.id===ui.theme));
  applyAppearance({theme:themes[(i+direction+themes.length)%themes.length].id});
 };
 if(!enabled)return null;
 return <>
  <button type="button" aria-label="Open theme lab" title="Theme lab" onClick={()=>setOpen(true)}
   className="lemma-lab-fab fixed bottom-6 left-4 z-30 flex size-11 items-center justify-center rounded-full border border-edge-2 bg-raised text-ink shadow-[var(--e-float)]">
   <Palette size={20}/></button>
  <Sheet title="Theme lab" open={open} onClose={()=>setOpen(false)}>
   <div className="mb-4 flex min-h-11 touch-pan-y items-center justify-between rounded-ctl bg-well px-2"
     onTouchStart={e=>{start.current=e.touches[0]?.clientX??null;}}
     onTouchEnd={e=>{const x=e.changedTouches[0]?.clientX;if(x!==undefined&&start.current!==null&&Math.abs(x-start.current)>40)cycle(x<start.current?1:-1);start.current=null;}}>
    <button type="button" className="flex size-11 items-center justify-center" aria-label="Previous theme" onClick={()=>cycle(-1)}><ChevronLeft size={20}/></button>
    <span className="text-label font-semibold">{ui.theme==='system'?'Automatic · Euclid':themes.find(t=>t.id===ui.theme)?.name}</span>
    <button type="button" className="flex size-11 items-center justify-center" aria-label="Next theme" onClick={()=>cycle(1)}><ChevronRight size={20}/></button>
   </div>
   <AppearanceControls/>
  </Sheet>
 </>;
}
