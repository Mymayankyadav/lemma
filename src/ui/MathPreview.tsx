import {useMemo} from 'react';
import {MathText} from './MathText';

/** Non-blocking live preview for a text input containing LaTeX.
 * Invalid/unclosed delimiters are explained, but never prevent saving.
 */
function mathError(source:string):string|null{
 const dollars=(source.match(/(?<!\\)\$(?!\$)/g)||[]).length;
 if(dollars%2!==0) return 'Unclosed $';
 const displays=(source.match(/(?<!\\)\$\$/g)||[]).length;
 if(displays%2!==0) return 'Unclosed $$';
 if((source.match(/\\\(/g)||[]).length!==(source.match(/\\\)/g)||[]).length) return 'Unclosed \\(';
 if((source.match(/\\\[/g)||[]).length!==(source.match(/\\\]/g)||[]).length) return 'Unclosed \\[';
 return null;
}
export function MathPreview({source,className=''}:{source:string;className?:string}){
 const active=/(?<!\\)\$|\\\(|\\\[/.test(source);
 const error=useMemo(()=>mathError(source),[source]);
 if(!active) return null;
 return <div className={'mt-2 rounded-ctl border border-edge bg-fill-1 px-3 py-2 '+className}
   role={error?'alert':'region'} aria-label="Math preview">
   <span className="text-caption text-ink-3">{error||'Rendered preview'}</span>
   {!error&&<MathText source={source} variant="body" className="mt-1"/>}
 </div>;
}
export default MathPreview;
