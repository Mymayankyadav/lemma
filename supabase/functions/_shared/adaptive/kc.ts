export const KINDS=['topic','definition','result','example','technique','heuristic','control','theme','notation'] as const;
export const FACETS=['recall','understand','use','select','execute','recognise','construct','transfer','perform'] as const;
export const STAGES=['U','S','E','C'] as const;
export type Kind=typeof KINDS[number];
export type Facet=typeof FACETS[number];
export type Stage=typeof STAGES[number];
export type Concept={id:string;name:string;kind?:Kind;parent_id?:string|null;family_id?:string|null;subject_id?:string|null;level?:string;blurb?:string|null;slug?:string};
export const FACETS_BY_KIND:Record<Kind,readonly Facet[]>={
 topic:['recall','understand','use','transfer'],definition:['recall','understand','recognise','use'],
 result:['recall','understand','select','execute','transfer'],example:['recognise','understand','construct','transfer'],
 technique:['select','execute','transfer'],heuristic:['select','use','transfer'],control:['perform','understand'],
 theme:['understand','recognise','transfer'],notation:['recall','recognise','use'],
};
export const facetsFor=(kind:Kind='topic')=>FACETS_BY_KIND[kind];
export const facetForLevel=(level:string):Facet=>FACETS.includes(level as Facet)?level as Facet:'use';
export const isSkill=(kind:Kind='topic')=>['technique','heuristic','control'].includes(kind);
export const countsUncued=(facet:Facet,concept:string,cued:readonly string[])=>!['select','transfer'].includes(facet)||!cued.includes(concept);
export function ancestors(id:string,concepts:ReadonlyMap<string,Concept>):string[]{
 const c=concepts.get(id),out:string[]=[],seen=new Set([id]);
 let next=isSkill(c?.kind)?c?.family_id:c?.parent_id;
 while(next&&!seen.has(next)){out.push(next);seen.add(next);const p=concepts.get(next);next=isSkill(c?.kind)?p?.family_id:p?.parent_id;}
 return out.reverse();
}
export function contextDistance(a:{home?:string;planet?:string;system?:string;subject?:string},b:typeof a):0|1|2|3{
 if(a.home&&a.home===b.home)return 0;if(a.planet&&a.planet===b.planet)return 1;if(a.system&&a.system===b.system)return 2;return 3;
}
export const transferOpportunity=(homeSubject:string|undefined,itemSubject:string|undefined,cued:boolean)=>!!homeSubject&&!!itemSubject&&homeSubject!==itemSubject&&!cued;
