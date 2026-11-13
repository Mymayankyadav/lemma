import {themes,type ThemeId} from './themes';
import {syncThemeColour} from '../app/shellRoot';
import {motionReduced} from '../ui/v7/effects';
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
 if(root.hasAttribute('data-v7'))syncThemeColour(root);
}
export const THEME_TURN_ATTR='data-v7-theme-turn';
/**
 * N131 · L-16 the theme transition (v7 UX plan r3: "a cross-fade"): when the learner switches Day and Night in v7 and
 * motion is allowed, the two themes cross-fade (240 ms, a View Transition). Without View Transitions, under reduced
 * motion or Reduce effects, or when the theme does not actually change, it switches at once.
 */
export function turnTheme(update:()=>void):boolean{
 const root=document.documentElement,start=(document as Document&{startViewTransition?:(callback:()=>void)=>{finished:Promise<unknown>}}).startViewTransition;
 if(!root.hasAttribute('data-v7')||typeof start!=='function'||motionReduced()){update();return false;}
 root.setAttribute(THEME_TURN_ATTR,'');
 try{
  const transition=start.call(document,update);
  void transition.finished.catch(()=>undefined).finally(()=>root.removeAttribute(THEME_TURN_ATTR));
  return true;
 }catch{root.removeAttribute(THEME_TURN_ATTR);update();return false;}
}
export function applyAppearance(patch:Partial<Appearance>):Appearance {
 const next=normalize({...readAppearance(),...patch});
 if(resolveTheme(next.mode)!==document.documentElement.dataset.theme)turnTheme(()=>updateTheme(next.mode));
 else updateTheme(next.mode);
 try{localStorage.setItem('lemma.ui',JSON.stringify(next))}catch{/* optional */}
 window.dispatchEvent(new Event('lemma-ui-change'));
 return next;
}
if(typeof window!=='undefined'&&window.matchMedia){
 window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{
  if(readAppearance().mode==='auto'){updateTheme('auto');window.dispatchEvent(new Event('lemma-ui-change'))}
 });
}
