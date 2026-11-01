import {Tex} from '../../ui/Tex';
import {plainMath} from '../../lib/plain-math';
import {canRenderPlainCardFront} from './plainCardFront';

/** Native <option> cannot contain KaTeX markup; use a readable text fallback. */
export function projectFilterOptionLabel(title:string):string{
 return plainMath(title);
}

/** Visible project chips must typeset mathematical names at >=16px. */
export function ProjectFilterTitle({title}:{title:string}){
 // Stress desks have 60 mostly plain project names. Avoid 60 full
 // Markdown/KaTeX parses on the first Cards paint; any possible markup still
 // uses the canonical Tex renderer and retains its >=16px maths typography.
 return <span className="whitespace-nowrap text-base">{canRenderPlainCardFront(title)?
  <span className="lemma-math lemma-tex-inline">{title}</span>:
  <Tex source={title}/>}</span>;
}
