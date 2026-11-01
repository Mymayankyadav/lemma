import {lazy,Suspense} from 'react';
import './FastTex.css';

// Eager Today, Paths and Atlas must not load the full Markdown/KaTeX renderer
// merely to display ordinary names. JSX escapes the safe literal path.
// Everything ambiguous retains the exact rich Tex implementation, including
// GFM autolinks, mathematical delimiters, entities and Markdown formatting.
// Server-side static rendering cannot suspend for rich maths: its output
// must contain real KaTeX immediately. Vite replaces import.meta.env.SSR at
// build time, so the browser keeps only the lazy rich import and never eagerly
// evaluates Markdown/KaTeX on ordinary literal labels.
const ServerTex=import.meta.env.SSR?(await import('./Tex')).Tex:null;
const RichTex=lazy(()=>import('./Tex').then(module=>({default:module.Tex})));

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
 const Rich=ServerTex??RichTex;
 return <Suspense fallback={<span role="status" aria-label="Rendering mathematical text" className={classes}>…</span>}>
  <Rich source={source} className={className}/>
 </Suspense>;
}
