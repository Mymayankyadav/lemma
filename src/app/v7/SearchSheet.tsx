import {useEffect,useMemo,useState} from 'react';
import {useNavigate} from 'react-router';
import {getApi} from '../../data';
import {useAtlas,useHome} from '../../data/hooks';
import {getTaskApi} from '../../data/tasks';
import {Sheet} from '../../ui/v7/components';
import {FastTex} from '../../ui/FastTex';
import {search,type Matched,type SearchGroupName,type SearchItem} from './searchModel';
import {searchActionIcon,searchGroupIcon} from './searchIcons';

const recentKey='lemma.v7.recent';
const readRecent=():SearchItem[]=>{try{return (JSON.parse(localStorage.getItem(recentKey)??'[]') as SearchItem[]).slice(0,5);}catch{return [];}};
const writeRecent=(item:SearchItem)=>{try{localStorage.setItem(recentKey,JSON.stringify([item,...readRecent().filter(entry=>entry.id!==item.id)].slice(0,5)));}catch{/* recents are a convenience */}};
/** PLAN §6.1 G: search or jump to a path, checkpoint, card, concept, task, setting or action from the data the screens already load. */
export default function SearchSheet({open,onClose}:{open:boolean;onClose:()=>void}){
 const home=useHome(),atlas=useAtlas(),navigate=useNavigate();
 const [query,setQuery]=useState(''),[active,setActive]=useState(0),[expanded,setExpanded]=useState<ReadonlySet<SearchGroupName>>(new Set());
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
  ...['Settings','Notifications','Appearance','Account'].map(name=>({id:'setting:'+name,group:'Settings' as const,title:name,to:'/settings'})),
  ...actions(home.data?.due??0),
 ],[projects,checkpoints,cards,atlas.data,tasks,home.data]);
 const results=useMemo(()=>search(items,query,expanded),[items,query,expanded]);
 const recent=useMemo(()=>open?readRecent():[],[open]);
 const idle=!query.trim(),list:SearchItem[]=idle?[...recent,...items.filter(item=>item.group==='Actions')]:results.flat;
 useEffect(()=>setActive(0),[query]);
 function reset(){setQuery('');setExpanded(new Set());setActive(0);}
 function close(){reset();onClose();}
 function openItem(item:SearchItem){writeRecent({id:item.id,group:item.group,title:item.title,parent:item.parent,to:item.to});close();navigate(item.to);}
 const row=(item:SearchItem,index:number,hit?:Matched)=>{const Icon=(item.group==='Actions'?searchActionIcon[item.id]:undefined)??searchGroupIcon[item.group];
  return <li key={item.id+index} role="presentation"><button type="button" role="option" id={'v7-search-'+index} aria-selected={index===active} data-active={index===active?'true':'false'} className="v7-search-row"
   onClick={()=>openItem(item)} onMouseEnter={()=>setActive(index)}>
   <Icon aria-hidden="true"/>
   <span>{hit?<>{hit.before}<mark>{hit.match}</mark><span data-rest="">{hit.after}</span></>:item.group==='Cards'?<FastTex source={item.title}/>:item.title}</span>
   {item.parent&&<small>{item.parent}</small>}
  </button></li>;};
 let cursor=0;
 return <Sheet open={open} onClose={close} title="Search" full hideTitle>
  <input data-v7-autofocus="true" className="v7-search-field" type="search" role="combobox" aria-expanded="true" aria-controls="v7-search-results" aria-activedescendant={list.length?'v7-search-'+active:undefined}
   aria-label="Search" placeholder="Search or jump to…" value={query} onChange={event=>setQuery(event.target.value)}
   onKeyDown={event=>{
    if(event.key==='ArrowDown'){event.preventDefault();setActive(value=>Math.min(list.length-1,value+1));}
    else if(event.key==='ArrowUp'){event.preventDefault();setActive(value=>Math.max(0,value-1));}
    else if(event.key==='Enter'&&list[active]){event.preventDefault();openItem(list[active]);}
   }}/>
  <div id="v7-search-results" role="listbox" aria-label="Results" className="v7-search-groups">
   {idle?<>
    {recent.length>0&&<section className="v7-search-group" aria-label="Recent"><h2 className="v7-eyebrow">Recent</h2><ul>{recent.map(item=>row(item,cursor++))}</ul></section>}
    <section className="v7-search-group" aria-label="Actions"><h2 className="v7-eyebrow">Actions</h2><ul>{items.filter(item=>item.group==='Actions').map(item=>row(item,cursor++))}</ul></section>
   </>:results.groups.length?results.groups.map(group=><section key={group.name} className="v7-search-group" aria-label={group.name}>
    <h2 className="v7-eyebrow">{group.name}</h2><ul>{group.items.map(item=>row(item,cursor++,item))}</ul>
    {group.total>group.items.length&&<button type="button" className="v7-button v7-ghost v7-small" onClick={()=>setExpanded(new Set([...expanded,group.name]))}><span>Show all {group.total}</span></button>}
   </section>):<p className="v7-meta" role="status">No results for “{query.trim()}”.</p>}
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
