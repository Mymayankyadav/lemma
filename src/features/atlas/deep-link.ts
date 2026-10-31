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
 // Insights supplies a derived (lossy) slug, not a verified stored slug.
 // If two subjects share the name, even one apparent slug match is unsafe.
 if(link.name){
  const named=real.filter(node=>node.name===link.name);
  if(named.length===1)return {kind:'found',id:named[0].id};
  if(named.length>1)return {kind:'ambiguous',ids:named.map(node=>node.id)};
  return {kind:'missing'};
 }
 const exact=link.slug?real.filter(node=>node.slug===link.slug):[];
 if(exact.length===1)return {kind:'found',id:exact[0].id};
 if(exact.length>1)return {kind:'ambiguous',ids:exact.map(node=>node.id)};
 return {kind:'missing'};
}
