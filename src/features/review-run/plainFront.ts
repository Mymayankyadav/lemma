import type {ReviewItem} from '../../data/types';

/** Keep ordinary question text off the heavyweight Markdown/KaTeX path.
 * Only BASIC, single-line, markup-free fronts qualify; every mathematical,
 * cloze, reverse, HTML-entity, link or Markdown case keeps MathText.
 */
export function isPlainReviewFront(source:string,type:ReviewItem['type']):boolean{
 if(type!=='basic')return false;
 if(/[\\$*_\x60\[\]<>#~&|\n]/.test(source))return false;
 if(/^\s*(?:[-+]\s|\d+\.\s)/.test(source))return false;
 if(/https?:\/\/|www\./i.test(source))return false;
 return true;
}
