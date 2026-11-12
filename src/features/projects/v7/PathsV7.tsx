import {EmptyMoment} from '../../../ui/v7/EmptyMoment';
import {lazy,Suspense,useMemo,useState} from 'react';
import {Link,useLocation,useNavigate} from 'react-router';
import {Archive,Pause,Pin,PinOff,Play,Plus,RotateCcw,CircleCheck} from 'lucide-react';
import {useDeckTree,useProjects,useUpdateProject} from '../../../data/hooks';
import type {ProjectStatus,ProjectSummary} from '../../../data/types';
import {HubHeader} from '../../../app/v7/V7Shell';
import {Button,Skeleton} from '../../../ui/v7/components';
import {RowMenu} from '../../../ui/v7/RowMenu';
import {StatusBadge} from '../../../ui/v7/Status';
import {Emblem} from '../../../ui/v7/Emblem';
import {SubjectMark,subjectClass} from '../../../ui/v7/Subject';
import {useToast} from '../../../ui/Toast';
import {kitSubject} from '../../atlas/v7/model';
import {countByFilter,dueBySlug,filterWord,groupBySubject,matchesFilter,matchesSearch,nowLine,orderPaths,ownPaths,pathFilters,scheduleTone,type PathFilter} from './pathsModel';
import './paths.css';

const NewPathSheet=lazy(()=>import('./NewPathSheet'));
const PAGE=20;

/** The Paths · Cards · Atlas hub tabs (OD4): the library and the Atlas are one tap from Paths. */
export function PathsTabs({current}:{current:'paths'|'cards'|'atlas'}){
 return <nav className="v7-hub-tabs" aria-label="Paths sections">
  <Link to="/projects" aria-current={current==='paths'?'page':undefined}>Paths</Link>
  <Link to="/cards" aria-current={current==='cards'?'page':undefined}>Cards</Link>
  <Link to="/atlas" aria-current={current==='atlas'?'page':undefined}>Atlas</Link>
 </nav>;
}

function PathCard({project,due,pinnedCount}:{project:ProjectSummary;due:number;pinnedCount:number}){
 const subject=kitSubject(project.subject?.name??''),klass=subjectClass(subject),update=useUpdateProject(),notify=useToast();
 const schedule=scheduleTone(project.scheduleHeadline),href='/p/'+encodeURIComponent(project.slug);
 async function change(patch:{pinned?:boolean;status?:ProjectStatus},message:string,undo:{pinned?:boolean;status?:ProjectStatus}){
  if(patch.pinned&&pinnedCount>=4){notify('At most four paths can be pinned. Unpin one first.',{tone:'danger'});return;}
  try{
   await update.mutateAsync({id:project.id,patch});
   notify(message,{tone:'success',action:{label:'Undo',onClick:()=>{void update.mutateAsync({id:project.id,patch:undo}).catch(()=>notify('Could not undo',{tone:'danger'}));}}});
  }catch(error){notify(error instanceof Error?error.message:'Could not update this path',{tone:'danger'});}
 }
 const items=project.status==='archived'
  ?[{label:'Restore',icon:<RotateCcw aria-hidden="true"/>,onClick:()=>{void change({status:'active'},'Path restored',{status:'archived'});}}]
  :[
   {label:project.pinned?'Unpin':'Pin',icon:project.pinned?<PinOff aria-hidden="true"/>:<Pin aria-hidden="true"/>,onClick:()=>{void change({pinned:!project.pinned},project.pinned?'Path unpinned':'Path pinned',{pinned:!!project.pinned});}},
   project.status==='paused'
    ?{label:'Resume',icon:<Play aria-hidden="true"/>,onClick:()=>{void change({status:'active'},'Path resumed',{status:'paused'});}}
    :{label:'Pause',icon:<Pause aria-hidden="true"/>,onClick:()=>{void change({status:'paused'},'Path paused',{status:project.status});}},
   ...(project.status!=='done'?[{label:'Mark done',icon:<CircleCheck aria-hidden="true"/>,onClick:()=>{void change({status:'done'},'Path marked done',{status:project.status});}}]:[]),
   {label:'Archive',icon:<Archive aria-hidden="true"/>,onClick:()=>{void change({status:'archived'},'Path archived',{status:project.status});}},
  ];
 return <li className={'v7-paths-card '+klass} data-path={project.slug}>
  <Link className="v7-paths-cover" to={href} tabIndex={-1} aria-hidden="true"><Emblem subject={subject} seed={project.id} size={96} animate={false}/></Link>
  <div className="v7-paths-body">
   <div className="v7-paths-title-row">
    <Link className="v7-paths-title" to={href}>{project.title}</Link>
    <RowMenu label={'More for '+project.title} title={project.title} items={items}/>
   </div>
   <p className="v7-paths-subject"><SubjectMark subject={subject}/><span>{project.subject?.name??'Unassigned'}</span>{project.pinned&&<span className="v7-paths-pinned"> · Pinned</span>}</p>
   <p className="v7-paths-now">{nowLine(project)}</p>
   <div className="v7-paths-meter"><span role="meter" aria-label={project.title+' checkpoints demonstrated'} aria-valuemin={0} aria-valuemax={Math.max(1,project.total)} aria-valuenow={project.done}
    aria-valuetext={project.done+' of '+project.total}><span style={{width:(project.total?Math.min(100,project.done/project.total*100):0)+'%'}}/></span>
    <small>{project.done} of {project.total}</small></div>
   <div className="v7-paths-chips">
    {schedule&&<StatusBadge tone={schedule.tone}>{schedule.text}</StatusBadge>}
    {due>0&&<Link className="v7-paths-due" to={'/review?path='+encodeURIComponent(project.slug)} aria-label={'Review '+due+' due on '+project.title}>{due} due</Link>}
    {project.status==='paused'&&<StatusBadge tone="warning">Paused</StatusBadge>}
   </div>
  </div>
 </li>;
}

/** PLAN §6.8: the Paths hub. Search, status chips, path cards with cover, meter and chips, and "Start a new path". */
export default function PathsV7(){
 const projects=useProjects(),decks=useDeckTree(),location=useLocation(),navigate=useNavigate();
 const [filter,setFilter]=useState<PathFilter>('active'),[query,setQuery]=useState(''),[limit,setLimit]=useState(PAGE);
 const all=useMemo(()=>ownPaths(projects.data),[projects.data]);
 const counts=useMemo(()=>countByFilter(all),[all]);
 const due=useMemo(()=>dueBySlug(decks.data),[decks.data]);
 const visible=useMemo(()=>orderPaths(all.filter(row=>matchesFilter(row,filter)&&matchesSearch(row,query))),[all,filter,query]);
 const shown=visible.slice(0,limit),groups=groupBySubject(shown);
 const pinned=all.filter(row=>row.pinned&&row.status!=='archived').length;
 const creating=location.pathname==='/projects/new';
 return <main id="main-content" className="v7-page v7-paths" aria-label="Paths">
  <HubHeader title="Paths"><PathsTabs current="paths"/></HubHeader>
  <label className="v7-paths-search"><span className="v7-sr-only">Search paths and checkpoints</span>
   <input type="search" className="v7-search-field" placeholder="Search paths and checkpoints" value={query}
    onChange={event=>{setQuery(event.target.value);setLimit(PAGE);}}/></label>
  <div className="v7-paths-filters" role="radiogroup" aria-label="Path status">
   {pathFilters.map(item=><button key={item} type="button" role="radio" aria-checked={filter===item} className="v7-filter-chip"
    onClick={()=>{setFilter(item);setLimit(PAGE);}}>{filterWord[item]}{counts[item]>0?' '+counts[item]:''}</button>)}
  </div>
  {projects.isPending&&<><Skeleton/><Skeleton/></>}
  {projects.isError&&<div role="alert" className="v7-paths-empty"><p>Could not load your paths.</p><Button onClick={()=>{void projects.refetch();}}>Try again</Button></div>}
  {projects.isSuccess&&<>
   <p className="v7-sr-only" aria-live="polite">{visible.length} {visible.length===1?'path':'paths'} shown</p>
   {visible.length===0?(all.length===0
     ?<EmptyMoment art="paths" title="Every proof starts somewhere" action={{label:'Start a new path',to:'/projects/new'}}>Start a path and your tutor will plan it with you.</EmptyMoment>
     :query.trim()?<EmptyMoment title={'No paths match “'+query.trim()+'”'} action={{label:'Clear search',onClick:()=>setQuery('')}}/>
     :<EmptyMoment title={'No '+filterWord[filter].toLowerCase()+' paths'}>Paths you mark this way will gather here.</EmptyMoment>)
   :<div className="v7-paths-groups">{groups.map(group=><section key={group.key} className="v7-paths-group" aria-label={group.subject+' paths'}>
     {group.heading&&<h2 className={'v7-eyebrow v7-paths-heading '+subjectClass(kitSubject(group.subject))}><SubjectMark subject={kitSubject(group.subject)}/>{group.subject}</h2>}
     <ul className="v7-paths-list">{group.items.map(project=><PathCard key={project.id} project={project} due={due.get(project.slug)??0} pinnedCount={pinned}/>)}</ul>
    </section>)}</div>}
   {shown.length<visible.length&&<Button className="v7-paths-moreButton" onClick={()=>setLimit(value=>value+PAGE)}>Show {Math.min(PAGE,visible.length-shown.length)} more</Button>}
  </>}
  <Link className="v7-paths-new" to="/projects/new"><Plus aria-hidden="true"/><span>Start a new path</span></Link>
  {creating&&<Suspense fallback={null}><NewPathSheet onClose={()=>navigate('/projects')}/></Suspense>}
 </main>;
}
