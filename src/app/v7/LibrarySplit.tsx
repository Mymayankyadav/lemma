import {lazy,Suspense,useState,type ReactNode} from 'react';
import {useLocation} from 'react-router';
import {useProjects} from '../../data/hooks';
import {Skeleton} from '../../ui/v7/components';
import {useMinWidth} from './useMinWidth';
import './library-split.css';

const Paths=lazy(()=>import('../../features/projects/v7/PathsV7'));
const Cards=lazy(()=>import('../../features/cards/v7/CardsV7'));
const Path=lazy(()=>import('../../features/project/v7/V7Path'));
const Card=lazy(()=>import('../../features/card/v7/CardV7'));
export function libraryKind(path:string):'paths'|'cards'|null{
 if(/^\/projects(?:\/new)?$/.test(path)||/^\/p\/[^/]+$/.test(path))return 'paths';
 return /^\/cards(?:\/\d+)?$/.test(path)?'cards':null;
}
/** One router, one detail main. The list keeps its filters and scroll when a sibling detail opens. */
export default function LibrarySplit({children}:{children:ReactNode}){
 const {pathname}=useLocation(),wide=useMinWidth(600),kind=libraryKind(pathname);
 const projects=useProjects(),[firstCard,setFirstCard]=useState<number|null>(null);
 if(!wide||!kind)return children;
 const pathMatch=pathname.match(/^\/p\/([^/]+)$/),cardMatch=pathname.match(/^\/cards\/(\d+)$/);
 const slug=pathMatch?decodeURIComponent(pathMatch[1]):projects.data?.find(item=>!item.system&&item.status==='active')?.slug??projects.data?.find(item=>!item.system)?.slug;
 const noteNo=cardMatch?Number(cardMatch[1]):firstCard;
 const selected=kind==='paths'?slug:noteNo;
 return <div className="v7-library-split" data-library={kind}>
  <aside className="v7-library-list" aria-label={kind==='paths'?'Path library':'Card library'}>
   <Suspense fallback={<Skeleton/>}>{kind==='paths'?<Paths embedded selected={slug}/>:<Cards embedded selected={noteNo??undefined} onFirst={setFirstCard}/>}</Suspense>
  </aside>
  <div className="v7-library-detail" key={kind+':'+selected}>
   <Suspense fallback={<main id="main-content"><Skeleton/></main>}>{kind==='paths'&&slug?<Path selectedSlug={slug}/>:kind==='cards'&&noteNo!==null?<Card selectedNo={noteNo}/>:<main id="main-content" className="v7-page"><p>Select {kind==='paths'?'a path':'a card'} to read it here.</p></main>}</Suspense>
  </div>
 </div>;
}
