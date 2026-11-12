import type {DeckNode,ProjectStatus,ProjectSummary} from '../../../data/types';

/** PLAN §6.8. Pure rules for the v7 Paths hub: filters, order, subject headings and the due count per path. */
export type PathFilter='active'|'paused'|'done'|'archived';
export const pathFilters:readonly PathFilter[]=['active','paused','done','archived'];
export const filterWord:Readonly<Record<PathFilter,string>>={active:'Active',paused:'Paused',done:'Done',archived:'Archived'};
const isActive=(status:ProjectStatus)=>status==='active'||status==='planning';
export const matchesFilter=(project:ProjectSummary,filter:PathFilter)=>filter==='active'?isActive(project.status):project.status===filter;
/** The user's own paths only: the system inbox project never appears as a path. */
export const ownPaths=(rows:readonly ProjectSummary[]|undefined)=>(rows??[]).filter(row=>!row.system);
export function countByFilter(rows:readonly ProjectSummary[]):Record<PathFilter,number>{
 const counts:Record<PathFilter,number>={active:0,paused:0,done:0,archived:0};
 for(const row of rows)for(const filter of pathFilters)if(matchesFilter(row,filter))counts[filter]++;
 return counts;
}
const normal=(value:string)=>value.toLocaleLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'');
/** Search covers the title, the subject, the current checkpoint and the source titles. */
export function matchesSearch(project:ProjectSummary,query:string):boolean{
 const needle=normal(query.trim());
 if(!needle)return true;
 return [project.title,project.subject?.name??'',project.current?.title??'',project.current?.code??'',...(project.sourceTitles??[])]
  .some(value=>normal(value).includes(needle));
}
/** Pinned first, then most recently studied, then by title. */
export function orderPaths(rows:readonly ProjectSummary[]):ProjectSummary[]{
 return [...rows].sort((a,b)=>Number(Boolean(b.pinned))-Number(Boolean(a.pinned))||
  (Date.parse(b.lastActivityAt??'')||0)-(Date.parse(a.lastActivityAt??'')||0)||a.title.localeCompare(b.title));
}
export interface PathGroup{key:string;subject:string;heading:boolean;items:ProjectSummary[]}
/** Paths grouped by subject in first-seen order. A heading appears only when a subject has two or more paths. */
export function groupBySubject(rows:readonly ProjectSummary[]):PathGroup[]{
 const groups=new Map<string,PathGroup>();
 for(const row of rows){
  const key=row.subject?.id??'unassigned';
  const group=groups.get(key)??{key,subject:row.subject?.name??'Unassigned',heading:false,items:[]};
  group.items.push(row);groups.set(key,group);
 }
 return [...groups.values()].map(group=>({...group,heading:group.items.length>1}));
}
/** Due cards per path slug from the deck tree (a project deck is keyed `project:<slug>`). */
export function dueBySlug(nodes:readonly DeckNode[]|undefined):Map<string,number>{
 const out=new Map<string,number>();
 for(const node of nodes??[]){
  const slug=node.key.startsWith('project:')?node.key.slice('project:'.length):node.key;
  const due=Math.max(node.due,node.children.reduce((sum,child)=>sum+Math.max(0,child.due),0));
  out.set(slug,(out.get(slug)??0)+due);
 }
 return out;
}
/** "Now: Compactness · step 3 of 4", or a plain status line when nothing is current. */
export function nowLine(project:ProjectSummary):string{
 const current=project.current;
 if(!current)return project.total===0?'Waiting for a plan from your tutor':project.done>=project.total?'Every checkpoint demonstrated':'No current checkpoint';
 const total=Math.max(0,current.stepsTotal),step=total?Math.min(Math.max(1,current.step),total):0;
 return 'Now: '+current.title+(total?' · step '+step+' of '+total:'');
}
/** The schedule chip only when the app has a forecast: "On track" is good, anything "behind" is a warning. */
export function scheduleTone(headline:string|null|undefined):{text:string;tone:'success'|'warning'|'info'}|null{
 const text=headline?.trim();
 if(!text)return null;
 if(/behind|late|overdue/i.test(text))return {text,tone:'warning'};
 if(/on track|ahead/i.test(text))return {text,tone:'success'};
 return {text,tone:'info'};
}
