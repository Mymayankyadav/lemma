import {useMemo} from 'react';
import {renderMarkdown} from '../lib/render';
import './math.css';

/** Inline tutor-authored Markdown/LaTeX. Used inside headings, chips and prose. */
export function Tex({source,className=''}:{source:string;className?:string}){
 const html=useMemo(()=>renderMarkdown(source,{inline:true}),[source]);
 return <span className={`lemma-math lemma-tex-inline ${className}`} dangerouslySetInnerHTML={{__html:html}}/>;
}
export default Tex;
