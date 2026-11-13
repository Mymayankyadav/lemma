import {EmptyMoment} from '../../../ui/v7/EmptyMoment';
import {useEffect,useMemo,useRef,useState} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router';
import {useInfiniteQuery} from '@tanstack/react-query';
import {Pause} from 'lucide-react';
import {getApi} from '../../../data';
import {useCreateNote,useHome,useProject,useProjects,useSettings} from '../../../data/hooks';
import type {CardRow,ProjectSummary} from '../../../data/types';
import {HubHeader} from '../../../app/v7/V7Shell';
import {isFlagOn} from '../../../flags';
import {Button,Sheet,Skeleton} from '../../../ui/v7/components';
import {SubjectMark,subjectClass} from '../../../ui/v7/Subject';
import {MathText} from '../../../ui/MathText';
import {ownerZone} from '../../../lib/format';
import {useToast} from '../../../ui/Toast';
import {kitSubject} from '../../atlas/v7/model';
import {PathsTabs} from '../../projects/v7/PathsV7';
import type {EditorValue} from '../Editor';
import {CardEditorSheet} from './CardEditorSheet';
import {cardFilters,cardMeta,isDueToday,sortCards,stateWords,type CardSort,type CardStateFilter} from './cardsModel';
import './cards.css';

function Choice({title,open,onClose,options,value,onChange}:{title:string;open:boolean;onClose:()=>void;options:{value:string;label:string}[];value:string;onChange:(value:string)=>void}){
 return <Sheet open={open} onClose={onClose} title={title} footer={<Button variant="primary" onClick={onClose}>Done</Button>}>
  <div className="v7-cards-choices" role="radiogroup" aria-label={title}>{options.map(option=><button key={option.value||'all'} type="button" role="radio" aria-checked={value===option.value}
   className="v7-filter-chip" onClick={()=>{onChange(option.value);onClose();}}>{option.label}</button>)}</div>
 </Sheet>;
}
function CheckpointChoice({slug,value,onChange,open,onClose}:{slug:string;value:string;onChange:(code:string)=>void;open:boolean;onClose:()=>void}){
 const project=useProject(slug);
 return <Choice title="Checkpoint" open={open} onClose={onClose} value={value} onChange={onChange}
  options={[{value:'',label:'All checkpoints'},...(project.data?.checkpoints??[]).filter(cp=>cp.ui!=='proposed').map(cp=>({value:cp.code,label:cp.title}))]}/>;
}
function Row({row,project,now,zone}:{row:CardRow;project:ProjectSummary|undefined;now:Date;zone:string}){
 const subject=kitSubject(project?.subject.name??''),due=row.status!=='suspended'&&isDueToday(row,now,zone);
 return <li className={'v7-cards-row '+subjectClass(subject)}>
  <Link to={'/cards/'+row.noteNo}>
   <span className="v7-cards-glyph" aria-hidden="true"><SubjectMark subject={subject}/></span>
   <span className="v7-cards-text"><span className="v7-cards-front"><MathText source={row.front}/></span>
    <small>{cardMeta(row,now,zone,project?.title)}</small></span>
   {row.status==='suspended'?<Pause className="v7-cards-paused" aria-label="Paused"/>:due?<span className="v7-cards-due" role="img" aria-label="Due today"/>:<span/>}
  </Link>
 </li>;
}

/** PLAN §6.11 Cards (Paths › Cards): search, filter chips that open pickers, a sort, a count line, 72 px rows that load further
 *  pages as you scroll (with "Load more" as the keyboard path). Capture opens the editor for a new card. */
/**
 * R0 · F05: a card total is exact, never "50+". With no filter (or only a path) the total comes from the paths' card
 * counts, the same number the path's Cards tab shows; otherwise it is the rows loaded so far, said plainly.
 */
export function cardCountLabel({shown,more,exact}:{shown:number;more:boolean;exact:number|null}):string{
 const n=(value:number)=>value.toLocaleString('en-GB').replace(/,/g,'\u2009');
 const total=exact!==null&&exact>=shown&&(more||exact===shown)?exact:more?null:shown;
 if(total!==null)return n(total)+(total===1?' card':' cards');
 return n(shown)+' cards shown · more as you scroll';
}
export default function CardsV7(){
 const [params,setParams]=useSearchParams(),navigate=useNavigate(),notify=useToast();
 const projects=useProjects(),home=useHome(),settings=useSettings(),create=useCreateNote();
 const zone=ownerZone(settings.data),now=useMemo(()=>new Date(),[]);
 const [search,setSearch]=useState(params.get('q')??''),[query,setQuery]=useState(search);
 const [slug,setSlug]=useState(params.get('path')??''),[checkpoint,setCheckpoint]=useState('');
 const [state,setState]=useState<CardStateFilter>('all'),[comments,setComments]=useState(false),[sort,setSort]=useState<CardSort>('due');
 const [sheet,setSheet]=useState<'path'|'state'|'checkpoint'|'sort'|null>(null),[creating,setCreating]=useState(params.get('new')==='1');
 const sentinel=useRef<HTMLDivElement>(null);
 useEffect(()=>{const timer=setTimeout(()=>setQuery(search),250);return()=>clearTimeout(timer);},[search]);
 useEffect(()=>{const open=()=>setCreating(true);window.addEventListener('v7:new-card',open);return()=>window.removeEventListener('v7:new-card',open);},[]);
 const filters=cardFilters({query,slug,checkpoint,state,comments});
 const cards=useInfiniteQuery({
  queryKey:['v7-cards',filters],initialPageParam:0,staleTime:30_000,
  queryFn:({pageParam})=>getApi().searchCardsPage({...filters,offset:pageParam}),
  getNextPageParam:last=>last.nextOffset??undefined,
 });
 const loaded=useMemo(()=>cards.data?.pages.flatMap(page=>page.rows)??[],[cards.data]);
 const rows=useMemo(()=>sortCards(state==='due'?loaded.filter(row=>row.status!=='suspended'&&isDueToday(row,now,zone)):loaded,sort),[loaded,state,sort,now,zone]);
 const bySlug=useMemo(()=>new Map((projects.data??[]).map(row=>[row.slug,row])),[projects.data]);
 const paths=(projects.data??[]).filter(row=>!row.system);
 useEffect(()=>{
  const node=sentinel.current;if(!node||typeof IntersectionObserver==='undefined')return;
  const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)&&cards.hasNextPage&&!cards.isFetchingNextPage)void cards.fetchNextPage();},{rootMargin:'320px'});
  observer.observe(node);return()=>observer.disconnect();
 },[cards]);
 async function save(value:EditorValue){
  try{
   const result=await create.mutateAsync({front:value.front,back:value.back,type:value.type,kind:value.kind,projectSlug:value.projectSlug,checkpointCode:value.checkpointCode});
   setCreating(false);notify('Card created',{tone:'success'});navigate('/cards/'+result.noteNo);
  }catch{notify('Could not create the card.',{tone:'danger'});}
 }
 function closeEditor(){
  setCreating(false);
  if(params.has('new')){const next=new URLSearchParams(params);next.delete('new');setParams(next,{replace:true});}
 }
 const pathTitle=slug?bySlug.get(slug)?.title??slug:'';
 const active=!!(slug||checkpoint||state!=='all'||comments||search);
 const due=home.data?.due??0;
 return <main id="main-content" className="v7-page v7-cards" aria-label="Cards">
  <HubHeader title={isFlagOn('v7Room')?'Cards':'Paths'}><PathsTabs current="cards"/></HubHeader>
  <label className="v7-cards-search"><span className="v7-sr-only">Search cards</span>
   <input type="search" className="v7-search-field" placeholder="Search cards" value={search} onChange={event=>setSearch(event.target.value)}/></label>
  <div className="v7-cards-filters" role="group" aria-label="Card filters">
   <button type="button" className="v7-filter-chip" aria-pressed={!!slug} aria-haspopup="dialog" onClick={()=>setSheet('path')}>{pathTitle||'Path'}</button>
   <button type="button" className="v7-filter-chip" aria-pressed={state!=='all'} aria-haspopup="dialog" onClick={()=>setSheet('state')}>{state==='all'?'State':stateWords[state]}</button>
   {slug&&<button type="button" className="v7-filter-chip" aria-pressed={!!checkpoint} aria-haspopup="dialog" onClick={()=>setSheet('checkpoint')}>{checkpoint||'Checkpoint'}</button>}
   <button type="button" className="v7-filter-chip" aria-pressed={comments} onClick={()=>setComments(value=>!value)}>Has comments</button>
   <button type="button" className="v7-filter-chip v7-cards-sort" aria-haspopup="dialog" onClick={()=>setSheet('sort')}>{sort==='due'?'Due first':'Newest'}</button>
  </div>
  <div className="v7-cards-count">
   <span aria-live="polite">{cardCountLabel({shown:rows.length,more:!!cards.hasNextPage,exact:slug&&!checkpoint&&state==='all'&&!comments&&!search?bySlug.get(slug)?.cardsCount??null:!active?(projects.data??[]).reduce((sum,row)=>sum+row.cardsCount,0):null})}{due>0&&!active?' · '+due.toLocaleString('en-GB')+' due':''}</span>
   {active&&<Button variant="ghost" small onClick={()=>{setSlug('');setCheckpoint('');setState('all');setComments(false);setSearch('');}}>Clear filters</Button>}
  </div>
  {cards.isPending&&<><Skeleton/><Skeleton/></>}
  {cards.isError&&<div role="alert" className="v7-cards-empty"><p>Erratum: cards didn’t load. Try again.</p><Button onClick={()=>{void cards.refetch();}}>Try again</Button></div>}
  {cards.isSuccess&&(rows.length?<ul className="v7-cards-list" aria-label="Cards">{rows.map(row=><Row key={row.noteNo} row={row} project={bySlug.get(row.projectSlug)} now={now} zone={zone}/>)}</ul>
   :active?<EmptyMoment art="cards" title="∅ No cards match these filters" action={{label:'Clear filters',onClick:()=>{setSlug('');setCheckpoint('');setState('all');setComments(false);setSearch('');}}}/>
   :<EmptyMoment title="No cards yet">Your tutor proposes cards after each session, or use Capture to write one.</EmptyMoment>)}
  {cards.isFetchingNextPage&&<Skeleton/>}
  <div ref={sentinel} aria-hidden="true"/>
  {cards.hasNextPage&&<Button className="v7-cards-more" loading={cards.isFetchingNextPage} onClick={()=>{void cards.fetchNextPage();}}>Load more</Button>}
  <Choice title="Path" open={sheet==='path'} onClose={()=>setSheet(null)} value={slug} onChange={value=>{setSlug(value);setCheckpoint('');}}
   options={[{value:'',label:'All paths'},...paths.map(row=>({value:row.slug,label:row.title}))]}/>
  <Choice title="State" open={sheet==='state'} onClose={()=>setSheet(null)} value={state} onChange={value=>setState(value as CardStateFilter)}
   options={(Object.keys(stateWords) as CardStateFilter[]).map(value=>({value,label:stateWords[value]}))}/>
  {slug&&<CheckpointChoice slug={slug} value={checkpoint} onChange={setCheckpoint} open={sheet==='checkpoint'} onClose={()=>setSheet(null)}/>}
  <Choice title="Sort" open={sheet==='sort'} onClose={()=>setSheet(null)} value={sort} onChange={value=>setSort(value as CardSort)}
   options={[{value:'due',label:'Due first'},{value:'newest',label:'Newest'}]}/>
  {creating&&<CardEditorSheet open onClose={closeEditor} busy={create.isPending} onSubmit={value=>{void save(value);}}/>}
 </main>;
}
