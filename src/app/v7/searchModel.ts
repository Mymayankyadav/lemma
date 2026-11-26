/** PLAN §6.1 G. Pure ranking and grouping for search, so the order is testable without the data layer. */
export type SearchGroupName='Paths'|'Checkpoints'|'Sessions'|'Sources'|'Cards'|'Concepts'|'Tasks'|'Settings'|'Actions';
export const groupOrder:readonly SearchGroupName[]=['Paths','Checkpoints','Sessions','Sources','Cards','Concepts','Tasks','Settings','Actions'];
export interface SearchItem{id:string;group:SearchGroupName;title:string;parent?:string;to:string;glyph?:string;aliases?:readonly string[]}
export const settingResults:readonly SearchItem[]=[
 {id:'setting:Settings',group:'Settings',title:'Settings',to:'/settings'},
 {id:'setting:Reminders',group:'Settings',title:'Reminders',aliases:['Notifications'],to:'/settings?section=reminders'},
 {id:'setting:Beta testing',group:'Settings',title:'Beta testing',to:'/settings?section=advanced'},
 {id:'setting:Appearance',group:'Settings',title:'Appearance',to:'/settings?section=appearance'},
 {id:'setting:Data',group:'Settings',title:'Data and account',to:'/settings?section=data'},
];
/** Older device recents contained generic Settings URLs and the old labels. Keep them useful after an update. */
export function canonicalSearchItem(item:SearchItem):SearchItem{
 if(item.group!=='Settings')return item;
 const id=item.id==='setting:Notifications'?'setting:Reminders':item.id==='setting:Account'?'setting:Data':item.id;
 return settingResults.find(result=>result.id===id)??item;
}
export interface SearchSnapshot{query:string;activeId:string|null;expanded:readonly SearchGroupName[]}
export interface Matched extends SearchItem{before:string;match:string;after:string}
/** Title split around the first (case-insensitive) occurrence of the query; null when it does not occur. */
export function matchTitle(item:SearchItem,query:string):Matched|null{
 const needle=query.trim().toLowerCase();
 if(!needle)return null;
 const at=item.title.toLowerCase().indexOf(needle);
 if(at<0)return item.aliases?.some(alias=>alias.toLowerCase().includes(needle))
  ?{...item,before:'',match:'',after:item.title}:null;
 return {...item,before:item.title.slice(0,at),match:item.title.slice(at,at+needle.length),after:item.title.slice(at+needle.length)};
}
/** Whole words and prefixes first, then other occurrences, then alphabetical. */
export function rank(items:readonly Matched[]):Matched[]{
 const score=(item:Matched)=>item.before===''?0:/\s$|[-:·(]$/.test(item.before)?1:2;
 return [...items].sort((a,b)=>score(a)-score(b)||a.title.localeCompare(b.title,undefined,{numeric:true}));
}
export interface SearchResults{groups:{name:SearchGroupName;items:Matched[];total:number}[];flat:Matched[]}
/** Groups of at most `limit` rows unless the group is expanded; `flat` is the keyboard order. */
export function search(items:readonly SearchItem[],query:string,expanded:ReadonlySet<SearchGroupName>=new Set(),limit=4):SearchResults{
 const matched=items.flatMap(item=>{const hit=matchTitle(item,query);return hit?[hit]:[];});
 const groups=groupOrder.flatMap(name=>{
  const all=rank(matched.filter(item=>item.group===name));
  return all.length?[{name,items:expanded.has(name)?all:all.slice(0,limit),total:all.length}]:[];
 });
 return {groups,flat:groups.flatMap(group=>group.items)};
}
