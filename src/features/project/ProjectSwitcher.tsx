import {useState} from 'react';
import {Link,useNavigate} from 'react-router';
import {ChevronRight} from 'lucide-react';
import {useProjects} from '../../data/hooks';
import {Tex} from '../../ui/Tex';
import {Sheet} from '../../ui/Sheet';
import {Skeleton} from '../../ui/Skeleton';

// Loaded only when the owner opens the switcher; the default Project Route
// should not evaluate the modal, search, or project-library UI on cold entry.
export function ProjectSwitcher({open,onClose,current}:{open:boolean;onClose:()=>void;current:string}){
 const projects=useProjects(),navigate=useNavigate(),[search,setSearch]=useState('');
 const list=(projects.data??[]).filter(p=>!p.system&&p.status!=='archived')
  .filter(p=>!search.trim()||[p.title,p.subject?.name??'Unassigned'].some(v=>v.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())))
  .sort((a,b)=>(Date.parse(b.lastActivityAt??'')||0)-(Date.parse(a.lastActivityAt??'')||0))
  .slice(0,search.trim()?30:6);
 return <Sheet open={open} onClose={onClose} title="Switch project">
  <div className="space-y-3">
   <input aria-label="Find a project" type="search" value={search} onChange={event=>setSearch(event.target.value)}
    placeholder="Find a project" className="min-h-11 w-full rounded-ctl border border-edge bg-[var(--card)] px-3 text-body text-ink"/>
   {projects.isPending?<Skeleton h={120}/>:!list.length?<p className="py-6 text-center text-label text-ink-2">No projects match</p>:
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

