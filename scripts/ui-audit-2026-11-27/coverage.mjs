// Static coverage gate: every route and every enumerated mode in src/ must have a scene in catalog.mjs.
//   node scripts/ui-audit-2026-11-27/coverage.mjs        (exit 1 and the list of gaps if a path has no scene)
// Routes are read from src/app/{App,routes,calendarRoute,tasksRoute,weekRoute}.tsx; settings sections, Progress tabs,
// Calendar views, inbox tabs and demo profiles from their own sources, so a new screen fails this check until it is added.
import {readFileSync} from 'node:fs';
import {scenes} from './catalog.mjs';
const read=f=>readFileSync(f,'utf8');
const routeFiles=['src/app/App.tsx','src/app/routes.tsx','src/app/calendarRoute.tsx','src/app/tasksRoute.tsx','src/app/weekRoute.tsx'];
const patterns=new Set();
for(const f of routeFiles)for(const m of read(f).matchAll(/['"`](\/[A-Za-z0-9:_\-\/?*]*)['"`]/g)){
 const p=m[1];if(p==='/lemma/'||p.startsWith('/lemma')||p.length>60||/\.(ts|tsx|css)$/.test(p))continue;patterns.add(p);
}
patterns.delete('/*');
const toRegex=p=>new RegExp('^'+p.replace(/\/:[A-Za-z]+\?/g,'(?:/[^/]+)?').replace(/:[A-Za-z]+/g,'[^/]+').replace('*','.*')+'$');
const hashes=scenes.map(s=>s.hash.split('?')[0]);
const missing=[];
for(const p of patterns){
 if(p==='*'){ if(!scenes.some(s=>s.id==='not-found'))missing.push('route * (not found)');continue;}
 const re=toRegex(p);if(!hashes.some(h=>re.test(h)))missing.push('route '+p);
}
// enumerations: [label, values, test(scene)]
const enums=[];
const sec=read('src/features/settings/v7/SettingsV7.tsx');
const sectionTitle=sec.match(/sectionTitle[^=]*=\s*\{([^}]*)\}/s)?.[1]??'';
const sections=[...sectionTitle.matchAll(/(\w+)\s*:/g)].map(m=>m[1]);
enums.push(['settings section',sections,(v)=>scenes.some(s=>s.hash.includes('section='+v))]);
enums.push(['calendar view',['day','week','month','agenda'],(v)=>scenes.some(s=>s.hash.includes('view='+v))]);
enums.push(['progress tab',[...read('src/features/insights/v7/ProgressV7.tsx').matchAll(/type Tab='([^;]*)';/g)].flatMap(m=>m[1].split("'|'")),(v)=>v==='overview'||scenes.some(s=>s.hash.includes('tab='+v))]);
enums.push(['inbox tab',['plan'],(v)=>scenes.some(s=>s.hash.includes('tab='+v))]);
enums.push(['demo profile',['first-use','stress','extreme'],(v)=>scenes.some(s=>s.demo===v)]);
for(const [label,values,has] of enums){if(!values.length)missing.push(label+': could not be read from source');for(const v of values)if(!has(v))missing.push(`${label} ${v}`);}
console.log(`${patterns.size} route patterns, ${scenes.length} scenes, ${new Set(scenes.map(s=>s.group)).size} groups`);
if(missing.length){console.error('NOT COVERED:\n  '+missing.join('\n  '));process.exit(1);}
console.log('coverage: every route and enumerated mode has a scene');
