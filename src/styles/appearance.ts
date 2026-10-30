import {themes,type ThemeId} from './themes';
export type Density='compact'|'cozy'|'comfortable';
export type Effects='calm'|'rich'; // "rich" is the persisted name for lively motion.
export type ThemePreference=ThemeId|'system';
export interface Appearance {theme:ThemePreference;density:Density;effects:Effects}
export const DEFAULT_APPEARANCE:Appearance={theme:'system',density:'compact',effects:'calm'};
const densities:Density[]=['compact','cozy','comfortable'],effects:Effects[]=['calm','rich'];
const valid=(value:unknown):value is ThemePreference=>value==='system'||themes.some(t=>t.id===value);
export function resolveTheme(preference:ThemePreference):ThemeId {
 return preference==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'graph-night':'graph'):preference;
}
function normalize(value:Partial<Appearance>):Appearance {
 return {theme:valid(value.theme)?value.theme:DEFAULT_APPEARANCE.theme,
 density:densities.includes(value.density as Density)?value.density!:DEFAULT_APPEARANCE.density,
 effects:effects.includes(value.effects as Effects)?value.effects!:DEFAULT_APPEARANCE.effects};
}
export function readAppearance():Appearance {
 if(typeof document!=='undefined'&&document.documentElement.dataset.theme){
 const d=document.documentElement.dataset;
 return normalize({theme:(d.themePreference||d.theme) as ThemePreference,density:d.density as Density,effects:d.effects as Effects});
 }
 try{return normalize(JSON.parse(localStorage.getItem('lemma.ui')||'{}') as Partial<Appearance>)}
 catch{return DEFAULT_APPEARANCE}
}
function updateTheme(pref:ThemePreference){
 const theme=resolveTheme(pref),root=document.documentElement;
 root.dataset.theme=theme;root.dataset.themePreference=pref;
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',themes.find(t=>t.id===theme)?.t.bg||'#F1E7D3');
}
export function applyAppearance(patch:Partial<Appearance>):Appearance {
 const next=normalize({...readAppearance(),...patch});
 updateTheme(next.theme);
 document.documentElement.dataset.density=next.density;
 document.documentElement.dataset.effects=next.effects;
 try{localStorage.setItem('lemma.ui',JSON.stringify(next))}catch{/* optional */}
 window.dispatchEvent(new Event('lemma-ui-change'));
 return next;
}
if(typeof window!=='undefined'&&window.matchMedia){
 window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{
 if(readAppearance().theme==='system'){updateTheme('system');window.dispatchEvent(new Event('lemma-ui-change'))}
 });
}
export function labEnabled():boolean {
 try{return localStorage.getItem('lemma.lab')!=='off'}catch{return false}
}
export function setLabEnabled(enabled:boolean):void {
 try{localStorage.setItem('lemma.lab',enabled?'on':'off')}catch{/* optional */}
 window.dispatchEvent(new Event('lemma-ui-change'));
}
