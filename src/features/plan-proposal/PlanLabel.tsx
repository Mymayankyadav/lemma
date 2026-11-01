import {renderMarkdown} from '../../lib/render';
import {isPlainAtlasLabel} from '../atlas/tree';

/** A bounded, sanitizer-backed label cache for large plan reviews.
 * StrictMode renders initial JSX twice. Tex's component-local useMemo cannot
 * share those render-phase parses, so cache only sanitized inline HTML here.
 * Plain prose stays escaped JSX; all maths, links and Markdown use the exact
 * same renderMarkdown pipeline as Tex.
 */
const renderedLabels=new Map<string,string>();
const MAX_LABELS=512;
export function PlanLabel({source}:{source:string}){
 if(isPlainAtlasLabel(source))
  return <span className="lemma-math lemma-tex-inline">{source}</span>;
 let html=renderedLabels.get(source);
 if(html===undefined){
  html=renderMarkdown(source,{inline:true});
  if(renderedLabels.size>=MAX_LABELS){
   const oldest=renderedLabels.keys().next().value;
   if(oldest!==undefined)renderedLabels.delete(oldest);
  }
  renderedLabels.set(source,html);
 }
 return <span className="lemma-math lemma-tex-inline" dangerouslySetInnerHTML={{__html:html}}/>;
}
