import {useEffect,useMemo,useRef,useState} from 'react';
import {getApi} from '../../data';
import {useAtlas,useHome} from '../../data/hooks';
import {getTaskApi} from '../../data/tasks';
import {Sheet} from '../../ui/v7/components';
import {FastTex} from '../../ui/FastTex';
import {canonicalSearchItem,search,settingResults,type Matched,type SearchGroupName,type SearchItem,type SearchSnapshot} from './searchModel';
import {searchActionIcon,searchGroupIcon} from './searchIcons';
import {isFlagOn} from '../../flags';
import {readRoomRecent,rememberRoomItem} from '../../ui/v7/room';

const recentKey='lemma.v7.recent';
const readRecent=():SearchItem[]=>{try{
 const items=(JSON.parse(localStorage.getItem(recentKey)??'[]') as SearchItem[]).map(canonicalSearchItem);
 return [...new Map(items.map(item=>[item.id,item])).values()].slice(0,5);
}catch{return [];}};
const writeRecent=(item:SearchItem)=>{try{localStorage.setItem(recentKey,JSON.stringify([item,...readRecent().filter(entry=>entry.id!==item.id)].slice(0,5)));}catch{/* recents are a convenience */}};
/** PLAN §6.1 G: search or jump to a path, checkpoint, card, concept, task, setting or action from the data the screens already load. */
export default function SearchSheet({open,onClose,onPick,initial}:{open:boolean;onClose:()=>void;onPick:(item:SearchItem,snapshot:SearchSnapshot)=>void;initial?:SearchSnapshot}){
 const room=isFlagOn('v7Room');
 const home=useHome(),atlas=useAtlas();
 const [query,setQuery]=useState(initial?.query??''),[activeId,setActiveId]=useState(initial?.activeId??null);
 const [expanded,setExpanded]=useState<ReadonlySet<SearchGroupName>>(()=>new Set(initial?.expanded));
 const [checkpoints,setCheckpoints]=useState<SearchItem[]>([]),[tasks,setTasks]=useState<SearchItem[]>([]),[cards,setCards]=useState<SearchItem[]>([]);
 const projects=useMemo(()=>(home.data?.projects??[]).filter(project=>!project.system),[home.data]);
 // Checkpoints and tasks load once, when search first opens; cards are searched as the query grows.
 useEffect(()=>{
  if(!open)return;let live=true;
  void Promise.all(projects.slice(0,12).map(project=>getApi().getProject(project.slug).catch(()=>null))).then(details=>{
   if(!live)return;
   setCheckpoints(details.flatMap(detail=>detail?detail.checkpoints.map(cp=>({id:'cp:'+detail.project.slug+':'+cp.code,group:'Checkpoints' as const,title:cp.title,parent:detail.project.title,to:'/p/'+detail.project.slug+'/cp/'+cp.code})):[]));
  });
  void getTaskApi().listTasks({limit:50}).then(page=>{if(live)setTasks(page.items.map(task=>({id:'task:'+task.id,group:'Tasks' as const,title:task.title,to:'/tasks'})));}).catch(()=>{});
  return()=>{live=false;};
 },[open,projects]);
 useEffect(()=>{
  const text=query.trim();
  if(!open||text.length<2){setCards([]);return;}
  let live=true;
  const timer=window.setTimeout(()=>{void getApi().searchCards(text).then(rows=>{
   if(live)setCards(rows.slice(0,40).map(row=>({id:'card:'+row.noteNo,group:'Cards' as const,title:row.front,parent:projects.find(project=>project.slug===row.projectSlug)?.title??row.projectSlug,to:'/cards/'+row.noteNo})));
  }).catch(()=>{});},120);
  return()=>{live=false;window.clearTimeout(timer);};
 },[query,open,projects]);
 const items=useMemo<SearchItem[]>(()=>[
  ...projects.map(project=>({id:'path:'+project.slug,group:'Paths' as const,title:project.title,parent:project.subject.name,to:'/p/'+project.slug})),
  ...checkpoints,...cards,
  ...(atlas.data?.concepts??[]).map(concept=>({id:'concept:'+concept.id,group:'Concepts' as const,title:concept.name,to:'/atlas?id='+concept.id})),
  ...tasks,
  ...settingResults,
  ...actions(home.data?.due??0),
 ],[projects,checkpoints,cards,atlas.data,tasks,home.data]);
 const results=useMemo(()=>search(items,query,expanded),[items,query,expanded]);
 const recent=useMemo(()=>open?(room?readRoomRecent():readRecent()):[],[open,room]);
 const idle=!query.trim(),list:SearchItem[]=idle?[...recent,...items.filter(item=>item.group==='Actions')]:results.flat;
 // Use the result identity, not its index: asynchronous results can arrive before it after Back.
 const active=Math.max(0,list.findIndex(item=>item.id===activeId));
 const activeItem=list[active];
 const [keepActiveVisible,setKeepActiveVisible]=useState(Boolean(initial?.activeId));
 const fieldRef=useRef<HTMLInputElement>(null),resultsRef=useRef<HTMLDivElement>(null);
 // Checkpoint and card results can arrive above a restored selection, moving it after the modal opens.
 // Scroll the sheet body, not the page, and leave space for the sticky search field.
 useEffect(()=>{
  const field=fieldRef.current,results=resultsRef.current,body=results?.parentElement;
  if(!open||!keepActiveVisible||!activeItem||!field||!results||!body)return;
  let frame=0;
  const reveal=()=>{
   cancelAnimationFrame(frame);
   frame=requestAnimationFrame(()=>{
    if(document.activeElement!==field||!body.closest('dialog')?.open)return;
    const option=results.querySelector<HTMLElement>('#v7-search-'+active),bounds=option?.getBoundingClientRect();
    if(!bounds)return;
    const viewport=body.getBoundingClientRect();
    const top=getComputedStyle(field).position==='sticky'?Math.max(viewport.top,field.getBoundingClientRect().bottom):viewport.top;
    if(bounds.top<top)body.scrollTop+=bounds.top-top;
    else if(bounds.bottom>viewport.bottom)body.scrollTop+=bounds.bottom-viewport.bottom;
   });
  };
  reveal();
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(reveal):null;
  observer?.observe(results);
  observer?.observe(body);
  return()=>{observer?.disconnect();cancelAnimationFrame(frame);};
 },[open,keepActiveVisible,active,activeItem,results.flat]);
 function openItem(raw:SearchItem){
  const item=canonicalSearchItem(raw);
  if(room)rememberRoomItem(item);else writeRecent({id:item.id,group:item.group,title:item.title,parent:item.parent,to:item.to});
  onPick(item,{query,activeId:item.id,expanded:[...expanded]});
 }
 const row=(item:SearchItem,index:number,hit?:Matched)=>{const Icon=(item.group==='Actions'?searchActionIcon[item.id]:undefined)??searchGroupIcon[item.group];
  return <li key={item.id+index} role="presentation"><button type="button" role="option" tabIndex={-1} aria-label={item.group==='Settings'?item.title:undefined} id={'v7-search-'+index} aria-selected={index===active} data-active={index===active?'true':'false'} className="v7-search-row"
   onClick={()=>openItem(item)} onPointerMove={()=>{setKeepActiveVisible(false);setActiveId(item.id);}}>
   <Icon aria-hidden="true"/>
   <span>{hit?.match?<>{hit.before}<mark>{hit.match}</mark><span data-rest="">{hit.after}</span></>:item.group==='Cards'?<FastTex source={item.title}/>:item.title}</span>
   {item.parent&&<small>{item.parent}</small>}
  </button></li>;};
 let cursor=0;
 return <Sheet open={open} onClose={onClose} title="Search" full hideTitle>
  <input ref={fieldRef} data-v7-autofocus="true" className="v7-search-field" type="search" role="combobox" aria-expanded="true" aria-controls="v7-search-results" aria-activedescendant={list.length?'v7-search-'+active:undefined}
   aria-label="Search" placeholder="Search or jump to…" value={query} onChange={event=>{setQuery(event.target.value);setActiveId(null);setKeepActiveVisible(false);const body=resultsRef.current?.parentElement;if(body)body.scrollTop=0;}}
   onKeyDown={event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
     event.preventDefault();
     const next=Math.max(0,Math.min(list.length-1,active+(event.key==='ArrowDown'?1:-1)));
     setActiveId(list[next]?.id??null);
     setKeepActiveVisible(true);
    }
    else if(event.key==='Enter'&&activeItem){event.preventDefault();openItem(activeItem);}
   }}/>
  <div ref={resultsRef} id="v7-search-results" role="listbox" aria-label="Results" className="v7-search-groups">
   {idle?<>
    {recent.length>0&&<section className="v7-search-group" aria-label={room?'Jump back in':'Recent'}><h2 className="v7-eyebrow">{room?'Jump back in':'Recent'}</h2><ul>{recent.map(item=>row(item,cursor++))}</ul></section>}
    <section className="v7-search-group" aria-label="Actions"><h2 className="v7-eyebrow">Actions</h2><ul className={room?'v7-search-actions':undefined}>{items.filter(item=>item.group==='Actions').map(item=>row(item,cursor++))}</ul></section>
   </>:results.groups.length?results.groups.map(group=><section key={group.name} className="v7-search-group" aria-label={group.name}>
    <h2 className="v7-eyebrow">{group.name}</h2><ul>{group.items.map(item=>row(item,cursor++,item))}</ul>
    {group.total>group.items.length&&<button type="button" className="v7-button v7-ghost v7-small" onClick={()=>setExpanded(new Set([...expanded,group.name]))}><span>Show all {group.total}</span></button>}
   </section>):<p className="v7-meta" role="status">∅ Nothing matches “{query.trim()}”.</p>}
  </div>
  <span className="v7-sr-only" role="status">{idle?'':results.flat.length+' results in '+results.groups.length+' groups'}</span>
 </Sheet>;
}
function actions(due:number):SearchItem[]{
 return [
  {id:'action:focus',group:'Actions',title:'Quick focus',to:'/?quick=1'},
  {id:'action:review',group:'Actions',title:due>0?'Review '+due+' cards':'Review',to:'/review'},
  {id:'action:block',group:'Actions',title:'New time block',to:'/calendar?view=day&new=block'},
  {id:'action:close',group:'Actions',title:'Close the day',to:'/today/close'},
  {id:'action:day',group:'Actions',title:"Today's calendar",to:'/calendar?view=day'},
 ];
}
