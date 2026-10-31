import {useEffect,useState} from 'react';
import type {UiPreferences} from '../../data/types';
import {getMode} from '../../data/mode';
import {applyAppearance,readAppearance} from '../../styles/appearance';

type Mode='auto'|'day'|'night';
interface Props {
 ui:UiPreferences|null|undefined;
 busy:boolean;
 onChange:(patch:Partial<UiPreferences>)=>Promise<boolean>;
}
const modes:readonly {id:Mode;label:string;detail:string}[]=[
 {id:'auto',label:'Automatic',detail:'Follow your device'},
 {id:'day',label:'Day',detail:'Graph paper'},
 {id:'night',label:'Night',detail:'Graph paper at night'},
];
const valid=(value:unknown):value is Mode=>value==='auto'||value==='day'||value==='night';
function initialMode(ui:UiPreferences|null|undefined):Mode {
 if(valid(ui?.mode))return ui.mode;
 return readAppearance().mode;
}
/** The v3 appearance choice is the only editable visual preference. */
export function EuclidAppearance({ui,busy,onChange}:Props){
 const [mode,setMode]=useState<Mode>(()=>initialMode(ui));
 useEffect(()=>{
  if(getMode()==='demo'||!valid(ui?.mode))return;
  setMode(ui.mode);
  applyAppearance({mode:ui.mode});
 },[ui?.mode]);
 const choose=async(next:Mode)=>{
  if(busy||next===mode)return;
  const previous=mode;
  setMode(next);
  applyAppearance({mode:next});
  if(getMode()==='demo')return;
  if(!await onChange({mode:next})){
   setMode(previous);
   applyAppearance({mode:previous});
  }
 };
 return <section aria-label="Appearance" className="space-y-3">
  <h2 className="text-title-s font-semibold">Appearance</h2>
  <p className="text-label text-ink-2">Two graph-paper worlds. Text is compact and motion stays calm.</p>
  <div role="radiogroup" aria-label="Appearance mode" className="grid grid-cols-3 gap-2">
   {modes.map(item=><button key={item.id} type="button" role="radio" aria-checked={mode===item.id}
    disabled={busy} onClick={()=>void choose(item.id)}
    className={'min-h-16 rounded-ctl border px-2 py-3 text-center '+(mode===item.id?'border-amber bg-amber-tint text-ink':'border-edge bg-well text-ink-2')}>
    <span className="block text-label font-semibold">{item.label}</span>
    <span className="mt-1 block text-caption">{item.detail}</span>
   </button>)}
  </div>
 </section>;
}
