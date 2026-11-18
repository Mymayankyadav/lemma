/** 05 §Atlas filters: uncertain, gaps, certified, stale, and a KC kind. A pure predicate so the map, the list and the tests agree. */
export const ATLAS_FILTERS=['all','uncertain','gaps','certified','stale'] as const;
export type AtlasFilter=typeof ATLAS_FILTERS[number];
export type FilterNode={uncertainty?:number;gap?:number;certified?:boolean[];stale?:boolean;kind?:string};
/** sd above 0.6 cannot be "shown" (see `estimate`), so it counts as uncertain; a gap above 0.2 is a probe candidate (GapBadge). */
export const UNCERTAIN_SD=.6,GAP_PROBE=.2;
export function matchesFilter(node:FilterNode,filter:AtlasFilter,kind:string='any'):boolean{
 if(kind!=='any'&&node.kind!==kind)return false;
 switch(filter){
  case 'uncertain':return (node.uncertainty??0)>UNCERTAIN_SD;
  case 'gaps':return (node.gap??0)>GAP_PROBE;
  case 'certified':return !!node.certified?.some(Boolean);
  case 'stale':return node.stale===true;
  default:return true;
 }
}
