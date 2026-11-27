import {useLayoutEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router';
import {ChevronRight} from 'lucide-react';
import {useProjects} from '../../data/hooks';
import {Tex} from '../../ui/Tex';
import {Sheet} from '../../ui/Sheet';
import {Skeleton} from '../../ui/Skeleton';
import {isFlagOn} from '../../flags';
import {Button,Skeleton as V7Skeleton} from '../../ui/v7/components';
import {useReadingIntent} from '../../app/v7/readingIntent';

function useProjectChoices(){
 const projects=useProjects(),[search,setSearch]=useState('');
 const list=(projects.data??[]).filter(p=>!p.system&&p.status!=='archived')
  .filter(p=>!search.trim()||[p.title,p.subject?.name??'Unassigned'].some(v=>v.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
  .sort((a,b)=>(Date.parse(b.lastActivityAt??'')||0)-(Date.parse(a.lastActivityAt??'')||0))
  .slice(0,search.trim()?30:6);
 return {projects,list,search,setSearch};
}

/** V7 opens the dialog at the trigger, before these body controls are available. */
export default function SwitchPath({onClose,current}:{onClose:()=>void;current:string}){
 const {projects,list,search,setSearch}=useProjectChoices(),intent=useReadingIntent();
 const field=useRef<HTMLInputElement>(null);
 useLayoutEffect(()=>{field.current?.focus();},[]);
 return <div className="v7-form-stack">
  <label className="v7-field-group"><span>Find a path</span>
   <input ref={field} className="v7-field" type="search" value={search} onChange={event=>setSearch(event.target.value)}/>
  </label>
  {projects.isPending?<V7Skeleton/>:projects.isError?<p className="v7-alert" role="alert">Couldn’t load paths. <Button small onClick={()=>{void projects.refetch();}}>Retry</Button></p>:
   list.length?<ul className="v7-switch-path-list">{list.map(path=><li key={path.id}>
    <Link to={'/p/'+encodeURIComponent(path.slug)} aria-current={path.slug===current?'page':undefined}
      {...intent(path.slug)} onClick={onClose}><Tex source={path.title}/><ChevronRight size={16} aria-hidden="true"/></Link>
   </li>)}</ul>:<p className="v7-meta">No paths match</p>}
  <Link to="/projects" onClick={onClose} className="v7-button v7-secondary">All paths</Link>
 </div>;
}

export function ProjectSwitcher({open,onClose,current}:{open:boolean;onClose:()=>void;current:string}){
 const {projects,list,search,setSearch}=useProjectChoices(),navigate=useNavigate();
 const v6=isFlagOn('v6Shell');
 return <Sheet open={open} onClose={onClose} title={v6?'Switch path':'Switch project'}>
  <div className="space-y-3">
   <input aria-label={v6?'Find a path':'Find a project'} type="search" value={search} onChange={event=>setSearch(event.target.value)}
    placeholder={v6?'Find a path':'Find a project'} className="min-h-11 w-full rounded-ctl border border-edge bg-[var(--card)] px-3 text-body text-ink"/>
   {projects.isPending?<Skeleton h={120}/>:!list.length?<p className="py-6 text-center text-label text-ink-2">{v6?'No paths match':'No projects match'}</p>:
    <div className="space-y-1">{list.map(p=><button type="button" key={p.id}
     aria-current={p.slug===current?'page':undefined}
     onClick={()=>{onClose();navigate('/p/'+p.slug)}}
     className="flex min-h-12 w-full items-center gap-3 rounded-ctl border border-edge px-3 text-left">
     <span className="text-amber" aria-hidden="true">{p.subject?.glyph??'∫'}</span>
     <span className="min-w-0 flex-1 break-words text-body"><Tex source={p.title}/></span>
     <span className="text-caption text-ink-3">{p.done}/{p.total}</span>
     <ChevronRight size={16} className="text-ink-3" aria-hidden="true"/>
    </button>)}</div>}
   <Link to="/projects" onClick={onClose} className="flex min-h-11 items-center justify-center rounded-ctl border border-edge text-label text-amber">All paths</Link>
  </div>
 </Sheet>;
}

