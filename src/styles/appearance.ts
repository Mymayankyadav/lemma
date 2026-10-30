import { themes, type ThemeId } from './themes';
export type Density = 'compact' | 'cozy' | 'comfortable';
export type Effects = 'calm' | 'rich';
export interface Appearance { theme: ThemeId; density: Density; effects: Effects; }
export const DEFAULT_APPEARANCE: Appearance = { theme: 'obsidian', density: 'compact', effects: 'calm' };
const densities: Density[] = ['compact', 'cozy', 'comfortable'];
const effects: Effects[] = ['calm', 'rich'];
function normalize(value: Partial<Appearance>): Appearance {
 return {
  theme: themes.some(t => t.id === value.theme) ? value.theme! : DEFAULT_APPEARANCE.theme,
  density: densities.includes(value.density as Density) ? value.density! : DEFAULT_APPEARANCE.density,
  effects: effects.includes(value.effects as Effects) ? value.effects! : DEFAULT_APPEARANCE.effects,
 };
}
export function readAppearance(): Appearance {
 if (typeof document !== 'undefined' && document.documentElement.dataset.theme) {
  const d=document.documentElement.dataset;
  return normalize({ theme: d.theme as ThemeId, density: d.density as Density, effects: d.effects as Effects });
 }
 try { return normalize(JSON.parse(localStorage.getItem('lemma.ui') || '{}') as Partial<Appearance>); }
 catch { return DEFAULT_APPEARANCE; }
}
export function applyAppearance(patch: Partial<Appearance>): Appearance {
 const next=normalize({ ...readAppearance(), ...patch });
 document.documentElement.dataset.theme=next.theme;
 document.documentElement.dataset.density=next.density;
 document.documentElement.dataset.effects=next.effects;
 const meta=document.querySelector('meta[name="theme-color"]');
 const chosen=themes.find(t => t.id === next.theme);
 if (chosen) meta?.setAttribute('content',chosen.c.bg);
 try { localStorage.setItem('lemma.ui',JSON.stringify(next)); } catch { /* Storage may be blocked. */ }
 window.dispatchEvent(new Event('lemma-ui-change'));
 return next;
}
export function labEnabled(): boolean {
 try { return localStorage.getItem('lemma.lab') !== 'off'; } catch { return true; }
}
export function setLabEnabled(enabled: boolean): void {
 try { localStorage.setItem('lemma.lab',enabled ? 'on' : 'off'); } catch { /* no persistence */ }
 window.dispatchEvent(new Event('lemma-ui-change'));
}
