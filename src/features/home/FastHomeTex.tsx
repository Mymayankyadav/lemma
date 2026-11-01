import {lazy,Suspense} from 'react'

// Loading the Markdown/KaTeX renderer just to print a plain project title
// dominates cold 4x-CPU Today startup. Ambiguous text always uses the full
// renderer; only strings with no Markdown, HTML, entity or TeX syntax use
// React's escaped text node. The rich module is still loaded on demand.
const RichTex=lazy(()=>import('../../ui/Tex').then(module=>({default:module.Tex})))
const markupCharacters=new Set(['\\','$','`','*','_','~','[',']','<','>','!','#','|','&','\r','\n'])
export function canRenderPlainHomeTex(source:string):boolean{
 if(!source.length)return false
 for(const character of source)if(markupCharacters.has(character))return false
 return true
}
export function FastHomeTex({source,className=''}:{source:string;className?:string}){
 const classes=`lemma-math lemma-tex-inline ${className}`
 if(canRenderPlainHomeTex(source))return <span className={classes}>{source}</span>
 return <Suspense fallback={<span role="status" aria-label="Rendering mathematical text" className={classes}>…</span>}>
  <RichTex source={source} className={className}/>
 </Suspense>
}
