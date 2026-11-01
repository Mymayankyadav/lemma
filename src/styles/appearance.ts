import {themes,type ThemeId} from './themes';
export type AppearanceMode='auto'|'day'|'night';
export interface Appearance {mode:AppearanceMode}
export const DEFAULT_APPEARANCE:Appearance={mode:'auto'};
const valid=(mode:unknown):mode is AppearanceMode=>mode==='auto'||mode==='day'||mode==='night';
function normalize(value:unknown):Appearance {
 const old=value&&typeof value==='object'?value as Record<string,unknown>:{};
 if(valid(old.mode))return {mode:old.mode};
 return {mode:old.theme==='graph'?'day':old.theme==='graph-night'?'night':'auto'};
}
export function resolveTheme(mode:AppearanceMode):ThemeId {
 return mode==='auto'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'graph-night':'graph'):mode==='day'?'graph':'graph-night';
}
export function readAppearance():Appearance {
 try{return normalize(JSON.parse(localStorage.getItem('lemma.ui')||'{}'))}catch{return DEFAULT_APPEARANCE}
}
function updateTheme(mode:AppearanceMode){
 const theme=resolveTheme(mode),root=document.documentElement;
 root.dataset.theme=theme;root.dataset.appearanceMode=mode;
 root.dataset.density='compact';root.dataset.effects='calm';
 delete root.dataset.themePreference;
 document.querySelectorAll('meta[name="theme-color"]').forEach(meta=>meta.setAttribute('content',themes.find(t=>t.id===theme)?.t.bg||'#FAFAF6'));
}
export function applyAppearance(patch:Partial<Appearance>):Appearance {
 const next=normalize({...readAppearance(),...patch});
 updateTheme(next.mode);
 try{localStorage.setItem('lemma.ui',JSON.stringify(next))}catch{/* optional */}
 window.dispatchEvent(new Event('lemma-ui-change'));
 return next;
}
if(typeof window!=='undefined'&&window.matchMedia){
 window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{
  if(readAppearance().mode==='auto'){updateTheme('auto');window.dispatchEvent(new Event('lemma-ui-change'))}
 });
}
