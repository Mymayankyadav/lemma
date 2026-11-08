import {p as useQuery,t as dataApi} from "@lemma/data-HD2KrcdX.js";
import {rt as useDecks,Ct as useSettings} from "@lemma/index-DcUkykC4.js";
import {t as Tex} from "@lemma/Tex-kn8bVMsW.js";
import {t as jsxRuntime} from "@lemma/jsx-runtime-DApVmHJR.js";
const React=jsxRuntime();
const number=(value)=>new Intl.NumberFormat().format(Math.max(0,Math.floor(Number(value)||0)));
const count=(value)=>Number.isFinite(+value)?Math.max(0,Math.floor(+value)):0;
// A YYYY-MM-DD calendar date is not a UTC *instant*. Noon UTC is used only to
// create a neutral formatting container. Format in UTC to preserve its date.
function calendarDate(key){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(key)))return null;
 const [year,month,day]=key.split(`-`).map(Number);
 const date=new Date(Date.UTC(year,month-1,day,12));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
 return date;
}
function dateLabel(key,options={weekday:`short`,day:`numeric`,month:`short`}){
 const date=calendarDate(key);
 return date?new Intl.DateTimeFormat(undefined,{...options,timeZone:`UTC`}).format(date):`Date unavailable`;
}
function ReviewOutlook(){
 const decks=useDecks(),forecast=useQuery({queryKey:[`review-forecast`],queryFn:()=>dataApi().getReviewForecast(),staleTime:30000});
 const settings=useSettings();
 const groups=[...(decks.data??[])].filter(d=>count(d.due)>0).sort((a,b)=>count(b.due)-count(a.due));
 const dueTotal=groups.reduce((n,g)=>n+count(g.due),0);
 const first=groups.slice(0,4).map(({key,label,due})=>({key,label,due:count(due)}));
 const rest=groups.slice(4);
 const breakdown=rest.length?[...first,{key:`other`,label:`Other (${rest.length} decks)`,due:rest.reduce((n,g)=>n+count(g.due),0)}]:first;
 const raw=Array.isArray(forecast.data)?forecast.data:[];
 const days=raw.slice(0,7);
 const max=Math.max(1,...days.map(d=>count(d.due)));
 const flat=days.length===7&&days.slice(1).every(d=>count(d.due)===0);
 const range=days.length===7?`${dateLabel(days[0].day)}–${dateLabel(days[6].day)}`:null;
 const totalFuture=days.slice(1).reduce((n,d)=>n+count(d.due),0);
 const timeZone=settings.data?.timeZone||Intl.DateTimeFormat().resolvedOptions().timeZone||`UTC`;
 return (0,React.jsxs)(`div`,{className:`flex min-w-0 flex-col gap-3`,children:[
  decks.isPending&&(0,React.jsx)(`p`,{role:`status`,className:`text-label text-ink-2`,children:`Loading due decks…`}),
  decks.isError&&(0,React.jsxs)(`div`,{role:`alert`,className:`text-label text-ink-2`,children:[`Due-by-deck breakdown unavailable. `,(0,React.jsx)(`button`,{type:`button`,className:`min-h-11 underline`,onClick:()=>void decks.refetch(),children:`Retry`})]}),
  !decks.isPending&&!decks.isError&&(0,React.jsxs)(`div`,{className:`min-w-0`,"aria-label":`Due cards by deck`,children:[
    (0,React.jsx)(`p`,{className:`mb-2 text-label text-ink-2`,children:`${number(dueTotal)} due now across ${number(groups.length)} decks`}),
    (0,React.jsx)(`div`,{className:`flex h-2 w-full overflow-hidden rounded-[1px] bg-fill-2`,role:`img`,"aria-label":breakdown.map(d=>`${d.label}: ${number(d.due)} due`).join(`; `),children:breakdown.map((g,i)=>(0,React.jsx)(`span`,{
      style:{width:(100*g.due/Math.max(1,dueTotal))+`%`,background:`var(--accent)`,opacity:Math.max(.35,1-i*.14)},title:`${g.label}: ${number(g.due)} due`},g.key))}),
    (0,React.jsx)(`div`,{className:`mt-2 flex flex-wrap gap-x-3 gap-y-2`,children:breakdown.map((g,i)=>(0,React.jsxs)(`span`,{className:`inline-flex max-w-full items-center gap-1.5 text-label text-ink-2`,children:[
       (0,React.jsx)(`span`,{"aria-hidden":`true`,className:`size-2 shrink-0 rounded-[1px]`,style:{background:`var(--accent)`,opacity:Math.max(.35,1-i*.14)}}),
       (0,React.jsx)(`span`,{className:`min-w-0`,children:(0,React.jsx)(Tex,{source:g.label})}),
       (0,React.jsx)(`span`,{className:`tabular-nums text-ink-2`,children:number(g.due)})
    ]},g.key))}),
    groups.length>4&&(0,React.jsxs)(`details`,{className:`mt-2 text-label text-ink-2`,children:[
      (0,React.jsx)(`summary`,{className:`min-h-11 cursor-pointer font-semibold`,children:`See all ${number(groups.length)} decks and counts`}),
      (0,React.jsx)(`ol`,{className:`flex min-w-0 flex-col gap-1 py-2`,children:groups.map(g=>(0,React.jsxs)(`li`,{className:`flex min-w-0 items-start justify-between gap-3 border-b border-edge py-2`,children:[
         (0,React.jsx)(`span`,{className:`min-w-0 flex-1`,children:(0,React.jsx)(Tex,{source:g.label})}),
         (0,React.jsx)(`span`,{className:`shrink-0 tabular-nums`,children:`${number(g.due)} due`})
       ]},g.key))})
    ]})
  ]}),
  forecast.isPending?(0,React.jsx)(`p`,{role:`status`,className:`text-label text-ink-2`,children:`Loading seven-day outlook…`}):
  forecast.isError?(0,React.jsxs)(`p`,{role:`alert`,className:`text-label text-ink-2`,children:[`Seven-day outlook unavailable. `,(0,React.jsx)(`button`,{type:`button`,className:`min-h-11 underline`,onClick:()=>void forecast.refetch(),children:`Retry`})]}):
  days.length!==7?(0,React.jsx)(`p`,{role:`status`,className:`text-label text-ink-2`,children:`Complete seven-day forecast unavailable; no days have been filled with invented values.`}):
  (0,React.jsxs)(`div`,{"aria-label":`Seven-day review forecast`,className:`min-w-0`,children:[
    (0,React.jsx)(`p`,{className:`mb-1 text-label text-ink-2`,children:`Today and the following six study days · ${range}`}),
    (0,React.jsx)(`p`,{className:`mb-2 text-label text-ink-3`,children:`Calendar dates supplied by the scheduler · ${timeZone}`}),
    (0,React.jsx)(`div`,{className:`grid grid-cols-7 gap-1.5`,children:days.map((d,i)=>{
      const n=count(d.due),dayLabel=i===0?`Today`:dateLabel(d.day,{weekday:`short`});
      return (0,React.jsxs)(`div`,{className:`flex min-w-0 flex-col items-center gap-1`,"aria-label":`${dateLabel(d.day)}: ${number(n)} due`,children:[
        (0,React.jsx)(`span`,{className:`text-label tabular-nums text-ink-2`,children:number(n)}),
        (0,React.jsx)(`div`,{className:`flex w-full items-end justify-center bg-fill-1`,style:{height:`40px`},children:(0,React.jsx)(`span`,{"aria-hidden":`true`,className:`block w-full bg-amber`,style:{height:n?Math.max(6,n/max*40)+`px`:`0`}})}),
        (0,React.jsx)(`span`,{className:`text-label tabular-nums text-ink-2`,title:dateLabel(d.day),children:dayLabel})
      ]},d.day||i);
    })}),
    (0,React.jsx)(`p`,{className:`mt-2 text-label text-ink-2`,children:flat?`${number(count(days[0].due))} due now · 0 due over the following 6 days`:
       `${number(count(days[0].due))} due today · ${number(totalFuture)} due over the following 6 days`})
  ]})
 ]});
}
export{ReviewOutlook};
