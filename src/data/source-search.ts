import {LemmaError} from './api';

export interface SourceSearchRow{id:string;title:string;short:string;filename:string;projectSlug:string;projectTitle:string}
export const SOURCE_SEARCH_LIMIT=40;
export function sourceSearchTerm(query:string):string{
 const term=query.trim();
 if(term.length>160||/[\u0000-\u001f\u007f]/.test(term))throw new LemmaError('invalid','Use up to 160 characters to find a source.');
 return term.length<2?'':term;
}
/** Literal case-insensitive substring: quote both regex metacharacters and PostgREST grammar.
 * Unlike ILIKE, imatch does not reinterpret a source title's * as a % wildcard. */
export function sourceSearchFilter(term:string):string{
 const value=JSON.stringify(term.replace(/[\\^$.*+?()[\]{}|]/g,'\\$&'));
 return ['title','short','filename'].map(column=>column+'.imatch.'+value).join(',');
}
