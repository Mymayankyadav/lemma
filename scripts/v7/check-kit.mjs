// Blocking v7 design lint, semantic contrast and colour-blind separation.
import {readFileSync} from "node:fs";
import {spawnSync} from "node:child_process";
const doc=JSON.parse(readFileSync("src/ui/v7/design-tokens.json","utf8"));
const fail=[];const assert=(ok,msg)=>{if(!ok)fail.push(msg);};
const raw=doc.raw;
const parse=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const lin=v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4;
function luminance(hex){const [r,g,b]=parse(hex).map(lin);return .2126*r+.7152*g+.0722*b;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const prot=[[.152286,1.052583,-.204868],[.114503,.786281,.099216],[-.003882,-.048116,1.051998]];
const deut=[[.367322,.860646,-.227968],[.280085,.672501,.047413],[-.01182,.04294,.968881]];
function simulate(hex,mat){
 const linear=parse(hex).map(lin);
 return mat.map(row=>Math.min(1,Math.max(0,row.reduce((s,v,i)=>s+v*linear[i],0))));
}
function lab(rgb){
 const [r,g,b]=rgb,[l,m,s]=[
  .4122214708*r+.5363325363*g+.0514459929*b,
  .2119034982*r+.6806995451*g+.1073969566*b,
  .0883024619*r+.2817188376*g+.6299787005*b].map(Math.cbrt);
 return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
function distance(a,b,mode){const mat=mode==="protanopia"?prot:mode==="deuteranopia"?deut:null;
 const color=hex=>lab(mat?simulate(hex,mat):parse(hex).map(lin));const x=color(a),y=color(b);
 return Math.hypot(...x.map((v,i)=>v-y[i]))*100;
}
const modes=["day","night","day-hc","night-hc"],subjectNames=["analysis","algebra","topology","number-theory","geometry","logic","probability","combinatorics"];
const get=(mode,key)=>{
 const kind=mode.startsWith("day")?"day":"night";
 if(mode.endsWith("-hc")&&(key==="text.secondary"||key==="text.tertiary"))key="text.primary";
 if(mode.endsWith("-hc")&&key==="border.default")key="border.strong";
 return raw[kind][key].$value;
};
for(const mode of modes){
 const pair=(fg,bg,limit)=>assert(contrast(get(mode,fg),get(mode,bg))+.001>=limit,mode+" "+fg+" on "+bg+" <"+limit+": "+contrast(get(mode,fg),get(mode,bg)).toFixed(2));
 for(const fg of ["text.primary","text.secondary","text.tertiary"])
  for(const bg of ["surface.page","surface.raised","surface.sunken","surface.muted","surface.overlay"])pair(fg,bg,4.5);
 for(const bg of ["surface.page","surface.raised","surface.sunken","surface.muted","surface.overlay"])pair("border.default",bg,3);
 for(const bg of ["surface.page","surface.raised"])pair("focus.ring",bg,3);
 for(const level of ["success","warning","danger"]){
  pair("status."+level,"surface.page",4.5);
  pair("status."+level,"status."+level+"-subtle",4.5);
 }
 for(const name of subjectNames){
  pair("subject."+name,"surface.page",3);
  pair("subject."+name,"surface.raised",3);
  pair("subject."+name,"subject."+name+"-subtle",3);
 }
 for(const idx of [1,2,3,4])pair("viz.heat"+idx,"surface.page",3);
 for(const role of Object.values(doc.role))for(const declared of role.$extensions?.["lemma.contrastPairs"]??[])pair(declared.foreground,declared.background,declared.minimum);
 const colors=subjectNames.map(s=>get(mode,"subject."+s));
 const status=["success","warning","danger"].map(s=>get(mode,"status."+s));
 for(const [label,palette] of [["subject",colors],["status",status]]){
  for(let i=0;i<palette.length;i++)for(let j=i+1;j<palette.length;j++){
   for(const vision of ["normal","deuteranopia","protanopia"]){
    const limit=vision==="normal"?10:4;
    assert(distance(palette[i],palette[j],vision)+.001>=limit,mode+" "+label+" "+i+"/"+j+" "+vision+" ΔE <"+limit);
   }
  }
 }
}
for(const [role,v] of Object.entries(doc.role)){
 assert(v.$type==="color"&&v.$value==="{raw.day."+role+"}",role+" isn't a day role alias");
 assert(!!v.$description&&Array.isArray(v.$extensions?.["lemma.contrastWith"]),role+" lacks job/pairings");
 assert(v.$extensions?.["lemma.modes"]?.night==="{raw.night."+role+"}",role+" lacks Night value");
}
for(const [name,v] of Object.entries(doc.component))
 assert(/^\{role\.[a-z0-9.-]+\}$/.test(v.$value)&&!!doc.role[v.$value.slice(6,-1)],"component "+name+" bypasses a role token");
// K2/KA2 token lint (Night critique v2): the token file holds role tokens, used component tokens, layout, type and motion
// foundations and per-mode effects only; app code reads nothing else, and none of the retired aliases come back.
{
 const tokenCss=readFileSync("src/ui/v7/tokens.css","utf8");
 const defined=new Set([...tokenCss.matchAll(/(--v7-[a-z0-9-]+)\s*:/g)].map(m=>m[1]));
 const allowed=name=>name.startsWith("--v7-role-")||name.startsWith("--v7-component-")||Object.hasOwn(doc.foundation.role,name.slice(5))||Object.hasOwn(doc.foundation.effects.day,name.slice(5));
 for(const name of defined)assert(allowed(name),"tokens.css defines "+name+", which is not a role, component, foundation or effect token");
 for(const name of Object.keys(doc.component))assert(false,"component token "+name+" is defined but the component tier is not wired (K2)");
 const retired=/--v7-(glass|blur|hero-stop|cover-alpha|subject-alpha|meter-alpha|accent(-fill(-hi)?)?|wash(-strong)?|ink(-[23])?|subject-[1-8]|size-[1-9]|leading-[1-9]|art|bg(-raised|-overlay|-inset)?|line(-strong)?|white|good(-fill)?|warning|control-(border|track)|surface-border|disabled-(ink|bg)|focus-ring)(?![\w-])/;
 const listed=spawnSync("git",["ls-files","src"],{encoding:"utf8"}).stdout.split("\n").filter(f=>/\.(css|tsx?)$/.test(f)&&f!=="src/ui/v7/tokens.css");
 const sources=listed.map(f=>[f,readFileSync(f,"utf8")]).filter(([,text])=>text.includes("--v7-"));
 const local=new Set();
 for(const [,text] of sources)for(const m of text.matchAll(/['"]?(--v7-[a-z0-9-]+)['"]?\s*:/g))local.add(m[1]);
 for(const [file,text] of sources){
  const bad=text.match(retired);assert(!bad,file+" uses the retired alias "+(bad&&bad[0]));
  for(const m of text.matchAll(/var\((--v7-[a-z0-9-]+)/g))if(!/-$|heat$/.test(m[1]))assert(defined.has(m[1])||local.has(m[1]),file+" reads "+m[1]+", which no token or component defines");
 }
 // PA11 (static part): no native select, date or time input and no off-kit colour in v7 screens.
 for(const [file,text] of sources.filter(([f])=>/\/v7\/|V7|block-sheet/.test(f)&&f.endsWith(".tsx"))){
  assert(!/<select\b|type=["'](date|time|datetime-local)["']/.test(text),file+" renders a native select, date or time control (B7)");
 }
 for(const [file,text] of sources)assert(!/#(121212|FF7B6B|1A2028|202841)\b/i.test(text),file+" contains an off-kit colour from the Night critique");
}
for(const filename of ["src/ui/v7/KitPrimitives.tsx","src/ui/v7/kit-system.css","src/ui/v7/kit-page.css","src/ui/v7/components.css","src/ui/v7/states.css","src/features/atlas/v7/atlas.css","src/features/atlas/v7/AtlasV7.tsx","src/features/atlas/v7/scene.ts","src/app/v7/shell.css","src/features/home/v7/today.css","src/features/focus/v7/focus.css","src/features/review-run/v7/review.css","src/features/calendar/v7/calendar.css","src/features/project/v7/path.css","src/app/v7/V7Shell.tsx","src/features/home/v7/V7Today.tsx","src/features/focus/v7/FocusV7.tsx","src/features/review-run/v7/ReviewRoundV7.tsx","src/features/calendar/v7/V7CalendarDay.tsx","src/features/calendar/v7/DayGrid.tsx","src/features/calendar/v7/WeekGrid.tsx","src/features/calendar/v7/MonthGrid.tsx","src/features/calendar/v7/AgendaList.tsx","src/features/calendar/v7/QuickAddSheet.tsx","src/features/calendar/v7/OverdueSheetV7.tsx","src/features/calendar/v7/SuggestionsBanner.tsx","src/features/project/v7/V7Path.tsx","src/app/v7/CaptureSheet.tsx","src/app/v7/SearchSheet.tsx","src/features/review/v7/ReviewHubV7.tsx","src/features/review-done/v7/RoundCompleteV7.tsx","src/features/review/v7/review-hub.css","src/features/practice/v7/practice.css","src/features/practice/v7/PracticeV7.tsx","src/features/tasks/v7/TasksV7.tsx","src/features/tasks/v7/tasks.css","src/features/ritual/v7/CloseDayV7.tsx","src/features/ritual/v7/close.css"]){
 const source=readFileSync(filename,"utf8");
 assert(!/#[0-9a-f]{3,8}\b/i.test(source),filename+" contains a raw colour");
}
for(const filename of ["src/ui/v7/components.css","src/ui/v7/kit-system.css","src/ui/v7/kit-page.css","src/ui/v7/states.css","src/features/atlas/v7/atlas.css","src/app/v7/shell.css","src/features/home/v7/today.css","src/features/focus/v7/focus.css","src/features/review-run/v7/review.css","src/features/calendar/v7/calendar.css","src/features/project/v7/path.css","src/features/review/v7/review-hub.css","src/features/practice/v7/practice.css","src/features/tasks/v7/tasks.css","src/features/ritual/v7/close.css"]){
 const source=readFileSync(filename,"utf8");
 assert(!source.includes("html[data-v7][data-v7]"),filename+" repeats the scope selector");
 assert(!/--v7-(serious|critical|gold)\b|v7-chip-gold|repeating-linear-gradient|border-style:\s*dashed/.test(source),filename+" contains a retired style");
 assert(source.includes("@layer"),filename+" lacks a cascade layer");
}
const generated=spawnSync(process.execPath,["scripts/v7/generate-tokens.mjs","--check"],{encoding:"utf8"});
assert(generated.status===0,"generated tokens/Figma manifest are stale: "+generated.stderr);
if(fail.length){for(const line of fail)console.error("✗",line);process.exit(1);}
console.log("v7 tokens: 4 modes, contrast, categorical CVD, aliases, source and generated files pass");
