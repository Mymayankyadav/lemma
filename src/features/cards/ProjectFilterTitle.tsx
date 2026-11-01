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
 // Marked/GFM also linkifies bare domains and email addresses, while HTML
 // entities and cloze markup must be parsed rather than escaped twice.
 // Keep ordinary stress titles (including a standalone &) on the fast path.
 return /[\\$*_`\[\]<>~#!\r\n{}|]/.test(title)
  || /https?:\/\/|www\.|(?:^|[\s(])[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}(?=$|[\s),.!?;:])|[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(title)
  || /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(title);
}

/** Visible project chips keep mathematical names typeset at >=16px. */
export function ProjectFilterTitle({title}:{title:string}){
 return <span className="whitespace-nowrap text-base">{needsRichTitle(title)?<Tex source={title}/>:title}</span>;
}
