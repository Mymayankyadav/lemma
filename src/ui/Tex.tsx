import {useMemo} from 'react';
import {renderMarkdown} from '../lib/render';
import './math.css';

// Project titles, stage names and the current checkpoint often occur in
// several independent components during the same cold render. Rendering each
// copy through Markdown, KaTeX and DOMPurify is expensive on slower phones.
// Cache only the *already sanitized* HTML of short inline strings. The cache
// is memory-only, bounded and never contains card faces or long documents.
const INLINE_TEX_CACHE_LIMIT=128;
const INLINE_TEX_SOURCE_LIMIT=512;
const inlineTexCache=new Map<string,string>();

export function renderInlineTex(source:string):string {
 if(source.length>INLINE_TEX_SOURCE_LIMIT)return renderMarkdown(source,{inline:true});
 const hit=inlineTexCache.get(source);
 if(hit!==undefined){
  // LRU: a frequently repeated project/checkpoint title stays warm.
  inlineTexCache.delete(source);
  inlineTexCache.set(source,hit);
  return hit;
 }
 const html=renderMarkdown(source,{inline:true});
 inlineTexCache.set(source,html);
 if(inlineTexCache.size>INLINE_TEX_CACHE_LIMIT){
  const oldest=inlineTexCache.keys().next().value;
  if(oldest!==undefined)inlineTexCache.delete(oldest);
 }
 return html;
}

/** Inline tutor-authored Markdown/LaTeX. Used inside headings, chips and prose. */
export function Tex({source,className=''}:{source:string;className?:string}){
 const html=useMemo(()=>renderInlineTex(source),[source]);
 return <span className={`lemma-math lemma-tex-inline ${className}`} dangerouslySetInnerHTML={{__html:html}}/>;
}
export default Tex;
