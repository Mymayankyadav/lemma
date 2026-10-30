import {useState} from 'react';
import {Check, Star} from 'lucide-react';
import type {UiPreferences} from '../../data/types';
import {themes} from '../../styles/themes';
import {applyAppearance,readAppearance} from '../../styles/appearance';

interface Props {
 ui:UiPreferences|null|undefined;
 busy:boolean;
 onChange:(patch:Partial<UiPreferences>)=>Promise<boolean>;
}
const timelineOptions=['ascent','metro'] as const;
const atlasOptions=['orbits','branches','outline'] as const;
function chooseLabel(value:string){return value.charAt(0).toUpperCase()+value.slice(1)}
/** UI-5h preferences are owner data; appearance still applies immediately on this device. */
export function EuclidAppearance({ui,busy,onChange}:Props){
 const [preview,setPreview]=useState(false);
 const timeline=ui?.timeline==='metro'?'metro':'ascent';
 const atlas=ui?.atlas==='branches'||ui?.atlas==='outline'?ui.atlas:'orbits';
 const follow=ui?.follow??true;
 const kept=ui?.keep??themes.map(t=>t.id);
 const favorites=ui?.fav??[];
 const update=(patch:Partial<UiPreferences>)=>{void onChange(patch)};
 const toggle=(list:string[],id:string)=>list.includes(id)?list.filter(v=>v!==id):[...list,id];
 const setFollow=(next:boolean)=>{
  const current=readAppearance().theme;
  applyAppearance({theme:next?'system':current==='system'?'euclid':current});
  update({follow:next,day:ui?.day??'euclid',night:ui?.night??'euclid-night'});
 };
 return <section aria-label="Euclid preferences" className="space-y-5">
  <div className="space-y-2">
   <h2 className="text-title-s italic" style={{fontFamily:'var(--font-display)'}}>Study map</h2>
   <p className="text-label text-ink-2">Choose how checkpoints and concepts are arranged.</p>
   <fieldset className="space-y-2">
    <legend className="text-label font-semibold">Timeline style</legend>
    <div className="grid grid-cols-2 gap-2">
     {timelineOptions.map(value=><button key={value} type="button" disabled={busy} aria-pressed={timeline===value}
      onClick={()=>update({timeline:value})}
      className={'min-h-11 rounded-ctl border px-3 text-label '+(timeline===value?'border-amber bg-amber-tint text-ink':'border-edge bg-well text-ink-2')}>
      {chooseLabel(value)}</button>)}
    </div>
   </fieldset>
   <fieldset className="space-y-2">
    <legend className="text-label font-semibold">Atlas style</legend>
    <div className="grid grid-cols-3 gap-2">
     {atlasOptions.map(value=><button key={value} type="button" disabled={busy} aria-pressed={atlas===value}
      onClick={()=>update({atlas:value})}
      className={'min-h-11 rounded-ctl border px-2 text-label '+(atlas===value?'border-amber bg-amber-tint text-ink':'border-edge bg-well text-ink-2')}>
      {chooseLabel(value)}</button>)}
    </div>
   </fieldset>
  </div>
  <div className="flex items-center justify-between gap-3 border-t border-edge pt-4">
   <div className="min-w-0"><h2 className="text-title-s italic" style={{fontFamily:'var(--font-display)'}}>Day and night</h2>
    <p className="text-label text-ink-2">Follow your phone: Euclid by day, Euclid at night after dark.</p></div>
   <button type="button" role="switch" aria-label="Follow phone appearance" aria-checked={follow} disabled={busy}
    onClick={()=>setFollow(!follow)}
    className={'min-h-11 min-w-16 rounded-ctl border px-3 text-label '+(follow?'border-amber bg-amber-tint':'border-edge bg-well')}>
    {follow?'On':'Off'}</button>
  </div>
  <div className="space-y-2">
   <h2 className="text-title-s italic" style={{fontFamily:'var(--font-display)'}}>Your worlds</h2>
   <p className="text-label text-ink-2">Keep worlds for comparison and star your favourites. Tap a name to use it now.</p>
   <div className="space-y-1" role="list" aria-label="World collection">
    {themes.map(theme=><div key={theme.id} role="listitem" className="flex min-h-12 items-center gap-2 border-b border-edge py-1 last:border-0">
      <button type="button" disabled={busy} onClick={()=>{
       applyAppearance({theme:theme.id});
       update({world:theme.id,follow:false});
      }} className="min-h-11 min-w-0 flex-1 text-left text-body">
       {theme.name}
      </button>
      <button type="button" disabled={busy} aria-label={'Keep '+theme.name} aria-pressed={kept.includes(theme.id)}
       onClick={()=>update({keep:toggle(kept,theme.id)})}
       className={'flex min-h-11 min-w-11 items-center justify-center rounded-ctl border px-2 '+(kept.includes(theme.id)?'border-amber text-amber':'border-edge text-ink-3')}>
       <Check size={18}/></button>
      <button type="button" disabled={busy} aria-label={'Star '+theme.name} aria-pressed={favorites.includes(theme.id)}
       onClick={()=>update({fav:toggle(favorites,theme.id)})}
       className={'flex min-h-11 min-w-11 items-center justify-center rounded-ctl border px-2 '+(favorites.includes(theme.id)?'border-amber text-amber':'border-edge text-ink-3')}>
       <Star size={18} fill={favorites.includes(theme.id)?'currentColor':'none'}/></button>
     </div>)}
   </div>
  </div>
  <button type="button" aria-expanded={preview} onClick={()=>setPreview(v=>!v)}
   className="min-h-11 w-full rounded-ctl border border-edge bg-well px-3 text-left text-label font-semibold">
   {preview?'Hide':'Show'} demo preview
  </button>
  {preview&&<div role="region" aria-label="Appearance preview" className="rounded-slab border border-edge bg-raised p-4">
   <p className="text-label text-ink-3">Demo data · not your study history</p>
   <h3 className="mt-2 text-title-s italic" style={{fontFamily:'var(--font-display)'}}>Abstract Algebra</h3>
   <p className="mt-1 text-label text-ink-2">12 of 40 checkpoints · CP13 Group actions</p>
   <svg role="img" aria-label={chooseLabel(timeline)+' demo timeline'} viewBox="0 0 320 75" className="mt-3 w-full">
    <path d={timeline==='ascent'?'M12 60 L90 54 L170 40 L245 23 L306 12':'M12 43 L90 43 L170 43 L245 43 L306 43'} stroke="var(--line)" strokeWidth="2" fill="none"/>
    <path d={timeline==='ascent'?'M12 60 L90 54 L170 40':'M12 43 L90 43 L170 43'} stroke="var(--accent)" strokeWidth="2.5" fill="none"/>
    <circle cx="170" cy={timeline==='ascent'?40:43} r="5" fill="var(--accent)"/>
    <text x="170" y={timeline==='ascent'?26:28} fontSize="11" fill="var(--accent)" textAnchor="middle">CP13</text>
   </svg>
   <p className="mt-1 text-label text-ink-2">Atlas: {chooseLabel(atlas)} · 7 cards due</p>
  </div>}
 </section>;
