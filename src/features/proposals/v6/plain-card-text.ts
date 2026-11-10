import {plainMath} from '../../../lib/plain-math';

/** A stable text-only name for cards: no TeX delimiters or cloze syntax. */
export function plainCardText(source:string):string{
 return plainMath(source.replace(/\{\{c\d+::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g,'$1'))
  .replace(/\s+/g,' ').trim()||'Card proposal';
}
