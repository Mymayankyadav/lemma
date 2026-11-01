import {Tex} from '../../ui/Tex';
import {plainMath} from '../../lib/plain-math';

/** Preserve full mathematical layout in the visible Atlas details heading. */
export function AtlasDetailsTitle({name}:{name:string}){
 return <span className="block min-w-0 max-w-full overflow-x-auto"><Tex source={name}/></span>;
}

export function AtlasDetailsPath({names,onSelect}:{names:string[];onSelect?:(index:number)=>void}){
 return <p aria-label="Idea path" className="-mt-3 mb-2 flex min-w-0 max-w-full flex-wrap items-center gap-x-1 text-body text-ink-3">
  {names.map((name,i)=><span key={i} className="inline-flex min-w-0 max-w-full items-center gap-1">
   {i>0&&<span aria-hidden="true">›</span>}
   {onSelect?<button type="button" aria-label={'Open '+plainMath(name)} onClick={()=>onSelect(i)}
    className="flex min-h-11 min-w-11 max-w-full items-center overflow-x-auto rounded-ctl px-2 text-left underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-[var(--link)]">
    <Tex source={name}/>
   </button>:<span className="min-w-0 max-w-full overflow-x-auto"><Tex source={name}/></span>}
  </span>)}
 </p>;
}
