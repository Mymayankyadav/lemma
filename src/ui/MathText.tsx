import './math.css';
import {useMemo} from 'react';
import {renderMarkdown} from '../lib/render';
export interface MathTextProps{source:string;variant?:'card'|'answer'|'body';cloze?:{ord:number;revealed:boolean};className?:string}
const variants={card:'font-math text-[27px] leading-[1.3] text-ink',answer:'font-math text-[23px] leading-[1.45] text-ink-soft',body:'text-[15px] leading-relaxed text-ink'};
export function MathText({source,variant='body',cloze,className=''}:MathTextProps){
 const html=useMemo(()=>renderMarkdown(source,{cloze}),[source,cloze?.ord,cloze?.revealed]);
 return <div className={`lemma-math prose-invert max-w-none wrap-break-word ${variants[variant]} ${className}`} dangerouslySetInnerHTML={{__html:html}}/>;
}
export default MathText;
