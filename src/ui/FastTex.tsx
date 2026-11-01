import {lazy,Suspense} from 'react';

// Eager Today, Paths and Atlas must not load the full Markdown/KaTeX renderer
// merely to display ordinary names. JSX escapes the safe literal path.
// Everything ambiguous retains the exact rich Tex implementation, including
// GFM autolinks, mathematical delimiters, entities and Markdown formatting.
const RichTex=lazy(()=>import('./Tex').then(module=>({default:module.Tex})));
 // A real server render must synchronously produce mathematical HTML, not a
 // Suspense placeholder. Vite statically removes this SSR-only import from
 // client builds, preserving the cold-entry split without weakening SSR.
const SsrRichTex=import.meta.env.SSR?(await import('./Tex')).Tex:null;
const markupCharacters=new Set(['\\','$','`','*','_','~','[',']','<','>','!','#','|','&','{','}','\r','\n']);
const domain=/(?:^|[\s(])(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?=$|[\s),.!?;:/#])/i;
const email=/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/;
const protocol=/(?:https?|ftp):\/\//i;

export function canRenderPlainFastTex(source:string):boolean{
 if(!source.trim())return false;
 for(const character of source)if(markupCharacters.has(character))return false;
 return !domain.test(source)&&!email.test(source)&&!protocol.test(source);
}

export function FastTex({source,className=''}:{source:string;className?:string}){
 const classes=`lemma-math lemma-tex-inline ${className}`;
 if(canRenderPlainFastTex(source))return <span className={classes}>{source}</span>;
 if(SsrRichTex)return <SsrRichTex source={source} className={className}/>;
 return <Suspense fallback={<span role="status" aria-label="Rendering mathematical text" className={classes}>…</span>}>
  <RichTex source={source} className={className}/>
 </Suspense>;
}
