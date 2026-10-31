import {Tex} from '../../ui/Tex';

/** Preserve full mathematical layout in the visible Atlas details heading. */
export function AtlasDetailsTitle({name}:{name:string}){
 return <span className="block min-w-0 max-w-full overflow-x-auto"><Tex source={name}/></span>;
}

export function AtlasDetailsPath({names}:{names:string[]}){
 return <p aria-label="Idea path" className="-mt-3 mb-2 flex min-w-0 max-w-full flex-wrap items-center gap-x-1 text-body text-ink-3">
  {names.map((name,i)=><span key={i} className="inline-flex min-w-0 max-w-full items-center gap-1">
   {i>0&&<span aria-hidden="true">›</span>}
   <span className="min-w-0 max-w-full overflow-x-auto"><Tex source={name}/></span>
  </span>)}
 </p>;
}
