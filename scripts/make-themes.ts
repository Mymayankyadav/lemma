/* Regenerate the UI-5a world tokens from src/styles/themes.ts: npx tsx scripts/make-themes.ts. */
import {writeFileSync} from 'node:fs';
import {themes} from '../src/styles/themes';
const mix=(hex:string,percent:number)=>`color-mix(in srgb, ${hex} ${percent}%, transparent)`;
function css(w:(typeof themes)[number]):string {
 const t=w.t, radius=w.radius, e=w.id==='euclid'||w.id==='euclid-night';
 const vars:Record<string,string>={
 '--bg':t.bg,'--card':t.card,'--card-2':t.card2,'--line':t.line,'--ink':t.ink,'--ink-2':t.ink2,'--ink-3':t.ink3,'--accent':t.accent,'--on-accent':t.on,'--warn':t.warn,'--bad':t.bad,'--good':t.good,'--track':t.track,'--tab-bg':t.tab,'--card-border':w.border,'--card-shadow':w.shadow,'--blur':w.blur,'--bg-css':w.background,'--font-ui':w.fonts.ui,'--font-display':w.fonts.display,'--font-num':w.fonts.num,
 '--obsidian':t.bg,'--obsidian-deep':t.bg,'--slab':t.card,'--tile':t.card,'--raised':t.card,'--raised-2':t.card2,'--sheet':t.tab,'--well':t.card2,'--glass':t.card,'--glass-strong':t.tab,
 '--edge':t.line,'--edge-2':t.line,'--edge-3':t.line,'--fill-1':t.card2,'--fill-2':t.track,'--ink-soft':t.ink2,'--ink-4':t.ink3,
 '--amber':t.accent,'--amber-hi':t.accent,'--amber-glow':t.accent,'--amber-deep':t.accent,'--amber-ink':t.on,'--amber-tint':mix(t.accent,14),'--amber-tint-2':mix(t.accent,14),'--amber-line':mix(t.accent,25),'--amber-line-2':mix(t.accent,55),
 '--again':t.bad,'--hard':t.warn,'--easy':t.good,'--success-tint':mix(t.good,12),'--danger-tint':mix(t.bad,12),
 '--grad-lit':t.accent,'--grad-orb':t.accent,'--grad-rail':t.accent,'--grad-lamp':'none','--grad-sheen':'none',
 '--e-slab':w.shadow,'--e-card':w.shadow,'--e-float':w.shadow,'--e-lit':'none','--e-orb':'none','--blur-glass':w.blur,
 '--r-hero':radius+'px','--r-slab':radius+'px','--r-btn':(e?4:radius)+'px','--r-ctl':(e?4:radius)+'px','--r-chip':(e?4:radius)+'px','--r-s':(e?3:Math.min(radius,6))+'px','--r-sheet':(e?10:radius)+'px','--tab':e?'64px':'60px'
 };
 if(e) Object.assign(vars,{'--gutter':'16px','--pad':'16px','--pad-tile':'16px','--gap':'12px','--ctl':'44px','--type-body':'14px','--type-label':'12px','--type-caption':'11.5px','--type-title':'18.3px','--type-title-s':'18.3px','--type-headline':'18.3px','--type-num-xl':'36px','--type-card':'20px','--type-answer':'17px','--type-question':'15px','--font-math':`'STIX Two Text', 'Times New Roman', serif`});
 return `html[data-theme="${w.id}"] {\n  color-scheme: ${w.mode};\n${Object.entries(vars).map(([k,v])=>`  ${k}: ${v};`).join('\n')}\n}`;
}
writeFileSync('src/styles/themes.css','/* Generated from the eight Lemma Lab worlds; see scripts/make-themes.ts. */\n'+themes.map(css).join('\n\n')+'\n');
