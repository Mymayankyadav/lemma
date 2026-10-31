import {Tex} from '../../ui/Tex';
import {plainMath} from '../../lib/plain-math';

/** Native <option> cannot contain KaTeX markup; use a readable text fallback. */
export function projectFilterOptionLabel(title:string):string{
 return plainMath(title);
}

/** Visible project chips must typeset mathematical names at >=16px. */
export function ProjectFilterTitle({title}:{title:string}){
 return <span className="whitespace-nowrap text-base"><Tex source={title}/></span>;
}
