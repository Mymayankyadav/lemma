import type {AtlasNode} from './tree';

export type AtlasDeepLink = {id:string|null;slug:string|null;name:string|null};
export type AtlasResolution =
 | {kind:'found';id:string}
 | {kind:'ambiguous';ids:string[]}
 | {kind:'missing'};

/** A concept slug is unique only within a subject. A name is not unique at all.
 * Never guess the first match when a cross-subject deep link is ambiguous.
 */
export function resolveAtlasDeepLink(
 nodes:Iterable<Pick<AtlasNode,'id'|'slug'|'name'|'synthetic'>>,
 link:AtlasDeepLink,
):AtlasResolution{
 const real=[...nodes].filter(node=>!node.synthetic);
 if(link.id){
  const node=real.find(candidate=>candidate.id===link.id);
  return node?{kind:'found',id:node.id}:{kind:'missing'};
 }
 const candidates=link.name?real.filter(node=>node.name===link.name):real;
 const exact=link.slug?candidates.filter(node=>node.slug===link.slug):[];
 const matching=exact.length?exact:link.name?candidates:[];
 if(matching.length===1)return {kind:'found',id:matching[0].id};
 if(matching.length>1)return {kind:'ambiguous',ids:matching.map(node=>node.id)};
 return {kind:'missing'};
}
