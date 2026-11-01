import {SectionHeading} from '../../ui/SectionHeading';
import {useEffect,useMemo,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {getApi} from '../../data/index';
import {groupReviewSessions,shouldFetchReviewSessions} from './session-demand';
import {notificationRoundCap} from './notification-limit';
import {useLocation,useNavigate} from 'react-router';
import {ChevronDown,ChevronRight,Clock3,Play,Search,Shuffle} from 'lucide-react';
import {useDeckTree,useHome,useReviewItems,useSettings,useUpdateSettings,useInsightData} from '../../data/hooks';
import type {DeckNode,ReviewItem,QueueFilter} from '../../data/types';
import {estimatedReviewMinutes} from '../../lib/insights';
import {Screen} from '../../ui/Screen';
import {Slab} from '../../ui/Slab';
import {Button} from '../../ui/Button';
import {Check} from '../../ui/Check';
import {Glyph} from '../../ui/Glyph';
import {IconButton} from '../../ui/IconButton';
import {Orb} from '../../ui/Orb';
import {Switch} from '../../ui/Switch';
import {Chip} from '../../ui/Chip';
import {Skeleton} from '../../ui/Skeleton';
import {EmptyState} from '../../ui/EmptyState';
import {useToast} from '../../ui/Toast';
import {useReviewSession} from '../review-run/store';

const allFilter:QueueFilter={decks:[],sessionId:null,conceptSlug:null,includeNew:true,newOnly:false};

function reviewEligible(items:ReviewItem[],nodes:DeckNode[],selected:Set<string>):ReviewItem[]{
 return items.filter(item=>{
  const project=nodes.find(n=>n.key==='project:'+item.projectSlug);
  if(!project)return false;
  const children=project.children.filter(c=>c.due>0);
  if(!children.length)return selected.has(project.key);
  if(item.checkpointCode){
   return selected.has('cp:'+item.projectSlug+':'+item.checkpointCode);
  }
  return selected.has(project.key);
 });
}

export default function Page(){
 const navigate=useNavigate(),location=useLocation(),notify=useToast();
 const handledNotificationLink=useRef<string|null>(null);
 const decks=useDeckTree(),home=useHome(),settings=useSettings(),cards=useReviewItems(allFilter),insights=useInsightData(30);
 // The session chips are optional: only cards tied to a session can use
 // them. The extreme demo otherwise materializes and sorts 60,000 virtual
 // session summaries on cold Review for a section that renders nothing.
 // Retain the existing session-query cache key and query defaults.
 const sessions=useQuery({
  queryKey:['sessions','all'],
  queryFn:()=>getApi().listSessions(),
  enabled:shouldFetchReviewSessions(cards.data),
  staleTime:30_000,
  refetchOnWindowFocus:true,
 });
 const update=useUpdateSettings();
 const [catchUpUntil,setCatchUpUntil]=useState(()=>Number(localStorage.getItem('lemma.catch-up-until')||0));
 const activeCatchUp=catchUpUntil>Date.now();
 useEffect(()=>{
  if(!catchUpUntil||catchUpUntil>Date.now()||!settings.data)return;
  const previous=Number(localStorage.getItem('lemma.catch-up-original')||200);
  localStorage.removeItem('lemma.catch-up-until');localStorage.removeItem('lemma.catch-up-original');
  setCatchUpUntil(0);
  if(settings.data.reviewsPerDay!==previous)update.mutate({reviewsPerDay:previous});
 },[catchUpUntil,settings.data?.reviewsPerDay]);
 function enableCatchUp(totalDue:number){
  if(!settings.data||activeCatchUp)return;
  const prior=settings.data.reviewsPerDay||200;
  const target=Math.max(prior,Math.ceil(totalDue/7));
  localStorage.setItem('lemma.catch-up-original',String(prior));
  const until=Date.now()+7*86400000;
  localStorage.setItem('lemma.catch-up-until',String(until));
  setCatchUpUntil(until);
  update.mutate({reviewsPerDay:target},{
   onSuccess:()=>{void cards.refetch();notify('Catch-up target set for seven days')},
   onError:()=>{localStorage.removeItem('lemma.catch-up-until');localStorage.removeItem('lemma.catch-up-original');setCatchUpUntil(0);notify('Could not set catch-up target',{tone:'danger'})}
  });
 }
 const [selected,setSelected]=useState<Set<string>|null>(null);
 const [expandedProjects,setExpandedProjects]=useState<Set<string>>(()=>new Set());
 const [showAll,setShowAll]=useState<Set<string>>(()=>new Set());
 const [deckSearch,setDeckSearch]=useState('');
 const toggle=(key:string,more=false)=>{
  const setter=more?setShowAll:setExpandedProjects;
  setter(previous=>{const next=new Set(previous);if(next.has(key))next.delete(key);else next.add(key);return next});
 };
 const enabled=useMemo(()=>selected??new Set([
  ...(decks.data??[]).filter(n=>n.due>0).map(n=>n.key),
  ...(decks.data??[]).flatMap(n=>n.children.filter(c=>c.due>0).map(c=>c.key))
 ]),[decks.data,selected]);
 const nodes=(decks.data??[]).filter(n=>n.due>0||n.children.some(c=>c.due>0));
 const visibleNodes=nodes.filter(n=>!deckSearch||n.label.toLowerCase().includes(deckSearch.toLowerCase())||
   n.children.some(c=>c.label.toLowerCase().includes(deckSearch.toLowerCase())));
 const dueItems=useMemo(()=>reviewEligible(cards.data??[],nodes,enabled),[cards.data,nodes,enabled]);
 const selectedCount=dueItems.length;
 const totalDue=nodes.reduce((sum,project)=>{
  const children=project.children.filter(c=>c.due>0);
  const counted=children.reduce((n,c)=>n+c.due,0);
  return sum+(enabled.has(project.key)?Math.max(0,project.due-counted):0)
   +children.reduce((n,c)=>n+(enabled.has(c.key)?c.due:0),0);
 },0);
 const todayShare=Math.min(selectedCount,Math.max(1,settings.data?.reviewsPerDay??200));
 const overdue=Math.max(0,totalDue-todayShare);
 const spreadDays=Math.ceil(overdue/Math.max(1,settings.data?.reviewsPerDay??200));
 // Without reliable timed review history, estimate 4.5 seconds per quick recall.
 const history=insights.data?.reviews??[];
 const estimated=history.length?estimatedReviewMinutes(todayShare,history):Math.max(1,Math.ceil(todayShare*4.5/60));
 const groupedSessions=useMemo(()=>{
  // A disabled query may still expose a previously cached 60k-session list.
  // No session-backed due card means this section is necessarily empty.
  if(!shouldFetchReviewSessions(cards.data))return [];
  return groupReviewSessions(sessions.data??[],dueItems);
 },[sessions.data,dueItems,cards.data]);
 const setProject=(node:DeckNode,value:boolean)=>{
  const changed=new Set(enabled),keys=[node.key,...node.children.map(c=>c.key)];
  for(const key of keys)value?changed.add(key):changed.delete(key);
  setSelected(changed);
 };
 const setCheckpoint=(project:DeckNode,child:DeckNode,value:boolean)=>{
  const changed=new Set(enabled);
  value?changed.add(child.key):changed.delete(child.key);
  // Project key represents orphan cards; do not allow an unchecked child to be
  // accidentally re-included by a broad project filter.
  const children=project.children.filter(c=>c.due>0);
  if(children.every(c=>changed.has(c.key)))changed.add(project.key);
  else changed.delete(project.key);
  setSelected(changed);
 };
 function start(sessionId:string|null=null,onlyNew=false,notificationLimit?:number){
  if(!settings.data || !cards.data || !decks.data)return;
  const filter:QueueFilter={...allFilter,sessionId,includeNew:true,newOnly:onlyNew,
   decks:[]};
  const fromSession=groupedSessions.find(s=>s.id===sessionId);
  const selection=sessionId?
   dueItems.filter(c=>c.projectSlug===fromSession?.projectSlug&&c.sessionNumber===fromSession?.number):
   dueItems;
  const chosen=(onlyNew?selection.filter(c=>c.state.state===0):selection)
   .slice(0,notificationRoundCap(settings.data.reviewsPerDay,notificationLimit));
  if(!chosen.length)return notify(notificationLimit===undefined?'No cards due in this selection':'All clear');
  const target=home.data?.resume;
  useReviewSession.getState().initialize(chosen,settings.data,filter,
   target?{projectSlug:target.projectSlug,checkpointCode:target.checkpointCode}:undefined);
  const qs=new URLSearchParams();
  if(sessionId)qs.set('session',sessionId);
  if(onlyNew)qs.set('new','1');
  navigate('/review/run'+(qs.size?'?'+qs.toString():''),{replace:notificationLimit!==undefined});
 }
 // A notification is an explicit one-shot request, not a persistent Review
 // preference. Wait for the same loaded deck/filter state as the Start button.
 // React StrictMode may replay effects: the route key prevents double starts.
 useEffect(()=>{
  const raw=new URLSearchParams(location.search).get('start');
  if(raw===null||handledNotificationLink.current===location.key)return;
  if(!settings.data||!cards.data||!decks.data||cards.error||decks.error)return;
  handledNotificationLink.current=location.key;
  const numeric=/^[0-9]+$/.test(raw)?Number(raw):1;
  const count=Number.isFinite(numeric)?Math.min(50,Math.max(1,numeric)):1;
  if(!dueItems.length){
   notify('All clear');
   navigate('/review',{replace:true});
   return;
  }
  start(null,false,count);
 },[location.key,location.search,settings.data,cards.data,decks.data,cards.error,decks.error,dueItems,home.data,enabled,navigate,notify]);
 useEffect(()=>{
  if(cards.error||decks.error)notify("Couldn't load your review decks.",{tone:'danger'});
 },[cards.error,decks.error,notify]);
 if(decks.isPending||settings.isPending||cards.isPending)return <Screen title="Review" tabBar actions={<IconButton icon={Search} label="Search cards" to="/cards"/>}>
  <Slab className="flex flex-col gap-4 p-6"><Skeleton h={75} w="55%"/><Skeleton h={50}/></Slab><Skeleton h={52}/><Skeleton h={56}/></Screen>;
 return <Screen title="Review" tabBar actions={<IconButton icon={Search} label="Search cards" to="/cards"/>}>
  {decks.error||cards.error||settings.error?
   <EmptyState art="plug" title="Your decks could not load" body="Check your connection and try again."
    action={{label:'Try again',onClick:()=>{void decks.refetch();void cards.refetch();void settings.refetch()}}}/>:
   <>
   <Slab as="section" aria-label="Review summary" lamp className="p-[22px]">
    <div className="flex items-center justify-between gap-4">
     <div>
      <div className="flex items-baseline gap-2">
       <strong className="font-[var(--font-display)] text-num-xl font-semibold leading-none tracking-tight tabular-nums">{totalDue.toLocaleString()}</strong>
       <span className="text-answer text-ink-2">due</span>
      </div>
      <p className="mt-2 flex items-center gap-2 text-label text-ink-3"><Clock3 size={16} aria-hidden="true"/>
       {selectedCount>0?'Today: '+todayShare+' · about '+estimated+' min':'All clear for today'}</p>
     </div>
     <Button aria-label="Start review" icon={Play} disabled={!todayShare} onClick={()=>start()}>Start {todayShare}</Button>
    </div>
    {overdue>0&&<div className="mt-4 text-label text-ink-2">
      <p>{overdue.toLocaleString()} overdue · spread over {spreadDays} {spreadDays===1?'day':'days'}</p>
      <button type="button" className="mt-2 min-h-11 text-label font-semibold text-amber"
       onClick={()=>enableCatchUp(totalDue)} disabled={activeCatchUp||update.isPending}>
       {activeCatchUp?'Catch-up active · restores your target after seven days':'Catch-up plan · raise daily share for a week'}
      </button>
     </div>}
    <div className="mt-5 border-t border-edge pt-3">
     <div className="flex items-center gap-2"><Shuffle size={18} aria-hidden="true" className="text-amber"/>
      <div className="flex-1">
       <Switch checked={settings.data?.mixDecks??true} label="Mix decks" onChange={checked=>{
        update.mutate({mixDecks:checked},{onError:()=>notify('Could not update review settings',{tone:'danger'})});
       }}/>
      </div>
     </div>
    </div>
   </Slab>
   <section aria-label="Decks" className="flex flex-col gap-1">
    <SectionHeading className="mb-2 text-ink">Decks</SectionHeading>
    {nodes.length>8&&<label className="mb-2 flex min-h-11 items-center gap-2 rounded-ctl border border-edge bg-well px-3 text-ink-3">
     <Search size={17}/><span className="sr-only">Search decks</span>
     <input value={deckSearch} onChange={e=>setDeckSearch(e.target.value)} placeholder="Find project or checkpoint"
      className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none"/>
    </label>}
    {visibleNodes.map(node=>{
     const children=node.children.filter(c=>c.due>0);
     const opened=expandedProjects.has(node.key)||!!deckSearch;
     const candidates=deckSearch?children.filter(c=>node.label.toLowerCase().includes(deckSearch.toLowerCase())||c.label.toLowerCase().includes(deckSearch.toLowerCase())):children;
     const shown=showAll.has(node.key)?candidates:candidates.slice(0,5);
     const selection=children.length?children.map(c=>enabled.has(c.key)):[enabled.has(node.key)];
     const checked=selection.every(Boolean)?true:selection.some(Boolean)?'mixed':false;
     return <div key={node.key} className="border-b border-edge/70 pb-2">
      <div className="flex min-h-12 items-center gap-3">
       <span className="[&>label]:text-[length:var(--type-hidden)]"><Check checked={node.due===0?false:checked} disabled={node.due===0} label={'Include '+node.label}
        onChange={value=>setProject(node,value)}/></span>
       <Glyph size={32} subject={node.glyph}/>
       <button type="button" aria-label={(opened?'Collapse ':'Expand ')+node.label} aria-expanded={opened}
        className="flex min-h-11 min-w-11 flex-1 items-center gap-2 text-left"
        onClick={()=>toggle(node.key)}>
        <span className="min-w-0 flex-1 truncate text-headline font-medium">{node.label}</span>
        {opened?<ChevronDown className="shrink-0" size={18}/>:<ChevronRight className="shrink-0" size={18}/>}
       </button>
       <span className={'text-body-l tabular-nums '+(node.due?'text-amber':'text-ink-3')}>{node.due}</span>
      </div>
      {opened&&shown.map(child=><div key={child.key} className="ml-7 flex min-h-11 items-center gap-2">
       <span className="[&>label]:text-[length:var(--type-hidden)]"><Check size={20} checked={enabled.has(child.key)} label={'Include '+child.label}
        onChange={v=>setCheckpoint(node,child,v)}/></span>
       <span className="shrink-0 text-label font-semibold text-ink-3">{child.key.split(':').at(-1)}</span>
       <span className="min-w-0 flex-1 truncate text-body text-ink-soft">{child.label}</span>
       <span className="text-body tabular-nums text-amber">{child.due}</span>
      </div>)}
      {opened&&candidates.length>5&&<button type="button" className="ml-7 min-h-11 text-label font-semibold text-amber" onClick={()=>toggle(node.key,true)}>
       {showAll.has(node.key)?'Show first 5':(candidates.length-5)+' more checkpoints'}
      </button>}
     </div>;
    })}
   </section>
   {groupedSessions.length>0&&<section aria-label="From sessions" className="flex flex-col gap-3">
    <SectionHeading className="text-ink">From sessions</SectionHeading>
    <div className="flex flex-wrap gap-2">{groupedSessions.map(s=><Chip key={s.id} tone="quiet" size={40} className="max-w-full min-w-0"
     onClick={()=>start(s.id)}>
     <span className="min-w-0 max-w-[min(16rem,60vw)] truncate">{'S'+s.number+' · '+s.goal}</span><span className="tabular-nums text-ink-3">{s.count}</span></Chip>)}</div>
   </section>}
   {selectedCount===0&&<p className="text-label text-ink-3">No cards due in these decks. Choose another deck or return tomorrow.</p>}
   </>
  }
 </Screen>;
}
