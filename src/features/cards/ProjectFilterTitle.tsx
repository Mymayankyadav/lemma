import {Tex} from '../../ui/Tex';
import {plainMath} from '../../lib/plain-math';

/** Native <option> cannot contain KaTeX markup; use a readable text fallback. */
export function projectFilterOptionLabel(title:string):string{
 return plainMath(title);
}

/**
 * The extreme library has 60 ordinary project names. Sending every label
 * through Markdown, KaTeX and DOMPurify delays the first usable Cards list.
 * React escapes plain text itself; retain Tex for any math or Markdown syntax.
 */
function needsRichTitle(title:string):boolean{
 return /[\\$*_`\[\]<>~#!\n]/.test(title);
}

/** Visible project chips keep mathematical names typeset at >=16px. */
export function ProjectFilterTitle({title}:{title:string}){
 return <span className="whitespace-nowrap text-base">{needsRichTitle(title)?<Tex source={title}/>:title}</span>;
}
